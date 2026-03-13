/**
 * シフト自動作成アルゴリズム（Phase1）を純粋計算としてクラス化。  
 * React の State は含めず、計算結果のみを返す。
 */
import { StaffManager, type StaffMasterProfile } from "./StaffManager";
import type { ShiftRecordV2 } from "@/lib/ShiftRepository";

export type GeneratePhase1Input = {
  members: StaffMasterProfile[];
  year: number;
  month: number;
  existedShifts: ShiftRecordV2[];
  nightPatternId: number | undefined;
  nightPatternKey: string;
  akePatternKey: string;
  restPatternKey: string;
  earlyPatternId: number | undefined;
  earlyPatternKey: string;
  latePatternId: number | undefined;
  latePatternKey: string;
  dayPatternKey: string;
  updatedBy: string | null;
};

export type GeneratePhase1Result = {
  upsertRows: ShiftRecordV2[];
  existedShifts: ShiftRecordV2[];
  readonlyShiftMap: { [staffName: string]: { [date: string]: string | null } };
};

export class ShiftEngine {
  /**
   * Phase1: 夜勤配置 → 公休配置 を行い、保存用 upsert 行と補助データを返す。
   * DB アクセス・setState は行わない。
   */
  static generateShiftPhase1(input: GeneratePhase1Input): GeneratePhase1Result | null {
    const {
      members,
      year,
      month,
      existedShifts,
      nightPatternId,
      nightPatternKey,
      akePatternKey,
      restPatternKey,
      earlyPatternId,
      earlyPatternKey,
      latePatternId,
      latePatternKey,
      dayPatternKey,
      updatedBy,
    } = input;

    const _members = [...members];
    if (!_members.length) return null;

    const yearStr = year;
    const monthStr = month.toString().padStart(2, "0");
    const daysCount = new Date(year, month, 0).getDate();
    const dayList = Array.from({ length: daysCount }, (_, i) => i + 1);

    const isWeekendDay = (d: number) => {
      const dow = new Date(year, month - 1, d).getDay(); // 0=日,6=土
      return dow === 0 || dow === 6;
    };

    const isAdminStaff = (m: StaffMasterProfile) =>
      StaffManager.getJobTitleString(m.job_title).includes("システム管理者");

    const shuffle = <T,>(arr: T[]): T[] => arr.slice().sort(() => Math.random() - 0.5);

    const pickLeast = <T,>(params: { candidates: T[]; count: number; score: (t: T) => number }): T[] => {
      const { candidates, count, score } = params;
      if (candidates.length <= count) return candidates;
      const scored = candidates.map((c) => ({ c, s: score(c), r: Math.random() }));
      scored.sort((a, b) => (a.s !== b.s ? a.s - b.s : a.r - b.r));
      return scored.slice(0, count).map((x) => x.c);
    };

    // 事前入力のセルは残す: staff_name, date でマッピング
    const readonlyShiftMap: { [staffName: string]: { [date: string]: string | null } } = {};
    existedShifts.forEach(({ staff_name, date, shift_type }) => {
      if (!readonlyShiftMap[staff_name]) readonlyShiftMap[staff_name] = {};
      readonlyShiftMap[staff_name][date] = shift_type;
    });

    // シフト割当配列（既存入力優先）
    const assign: { [staffName: string]: { [date: string]: string } } = {};
    _members.forEach((m) => {
      assign[m.staff_name] = {};
      for (let d = 1; d <= daysCount; ++d) {
        const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
        if (readonlyShiftMap[m.staff_name]?.[dateStr]) {
          assign[m.staff_name][dateStr] = readonlyShiftMap[m.staff_name][dateStr]!;
        }
      }
    });

    // なるべく均一化のためのカウント（既存入力分も含めて初期化）
    const nightCount: Record<string, number> = {};
    const weekendWorkCount: Record<string, number> = {};
    _members.forEach((m) => {
      nightCount[m.staff_name] = 0;
      weekendWorkCount[m.staff_name] = 0;
    });
    for (const m of _members) {
      for (const d of dayList) {
        const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
        const v = assign[m.staff_name]?.[dateStr];
        if (!v) continue;
        if (v === nightPatternKey) nightCount[m.staff_name] += 1;
        if (isWeekendDay(d) && !StaffManager.isRestishValue(v)) weekendWorkCount[m.staff_name] += 1;
      }
    }

    const applyAssign = (m: StaffMasterProfile, dateStr: string, dayNum: number, v: string) => {
      assign[m.staff_name][dateStr] = v;
      if (v === nightPatternKey) nightCount[m.staff_name] += 1;
      if (isWeekendDay(dayNum) && !StaffManager.isRestishValue(v)) weekendWorkCount[m.staff_name] += 1;
    };

    // ステップ1: 夜勤配置（空セルのみ割当）
    for (const day of dayList) {
      const dateStr = `${yearStr}-${monthStr}-${day.toString().padStart(2, "0")}`;
      const prevDate = new Date(year, month - 1, day);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, "0")}-${prevDate.getDate().toString().padStart(2, "0")}`;

      // 看護師(2名)割当 空セルのみ
      const candidatesNurse = _members.filter((m) => {
        const jt = StaffManager.getJobTitleString(m.job_title);
        if (!jt.includes("看護師")) return false;
        if (!(Array.isArray(m.work_patterns) && nightPatternId && m.work_patterns.includes(nightPatternId))) return false;
        if (assign[m.staff_name]?.[prevDateStr] === nightPatternKey) return false;
        if (assign[m.staff_name]?.[dateStr] === nightPatternKey) return false;
        if (assign[m.staff_name]?.[dateStr]) return false;
        // システム管理者は夜勤なし
        if (isAdminStaff(m)) return false;
        return true;
      });

      const pickNurse = pickLeast({
        candidates: candidatesNurse,
        count: 2,
        score: (m) => nightCount[m.staff_name] ?? 0,
      });
      for (const m of pickNurse) {
        applyAssign(m, dateStr, day, nightPatternKey);
        const nextDate = new Date(year, month - 1, day);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, "0")}-${nextDate.getDate().toString().padStart(2, "0")}`;
        if (!assign[m.staff_name][nextDateStr]) {
          // 明け（翌日が表示月外の場合はそのままキーで保存されうるが、既存挙動維持）
          const nextDayNum = day + 1;
          if (nextDayNum >= 1 && nextDayNum <= daysCount) {
            applyAssign(m, nextDateStr, nextDayNum, akePatternKey);
          } else {
            assign[m.staff_name][nextDateStr] = akePatternKey;
          }
        }
      }

      // 介護士(1名)割当 空セルのみ
      const candidatesCare = _members.filter((m) => {
        const jt = StaffManager.getJobTitleString(m.job_title);
        if (!(jt.includes("介護") || jt.includes("助手"))) return false;
        if (!(Array.isArray(m.work_patterns) && nightPatternId && m.work_patterns.includes(nightPatternId))) return false;
        if (assign[m.staff_name]?.[prevDateStr] === nightPatternKey) return false;
        if (assign[m.staff_name]?.[dateStr] === nightPatternKey) return false;
        if (assign[m.staff_name]?.[dateStr]) return false;
        if (isAdminStaff(m)) return false;
        return true;
      });

      const pickCare = pickLeast({
        candidates: candidatesCare,
        count: 1,
        score: (m) => nightCount[m.staff_name] ?? 0,
      });
      for (const m of pickCare) {
        applyAssign(m, dateStr, day, nightPatternKey);
        const nextDate = new Date(year, month - 1, day);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, "0")}-${nextDate.getDate().toString().padStart(2, "0")}`;
        if (!assign[m.staff_name][nextDateStr]) {
          const nextDayNum = day + 1;
          if (nextDayNum >= 1 && nextDayNum <= daysCount) {
            applyAssign(m, nextDateStr, nextDayNum, akePatternKey);
          } else {
            assign[m.staff_name][nextDateStr] = akePatternKey;
          }
        }
      }
    }

    // ステップ2: 公休配置 空セルのみ
    for (const m of _members) {
      if (m.employment_status !== "常勤") continue;
      // システム管理者は「平日日勤・土日休み」固定のため、公休のランダム配置対象外
      if (isAdminStaff(m)) continue;
      const quota = StaffManager.getHolidayQuota(year, month);

      // 既に割り当て済み（事前入力＋夜勤/明け等）の公休数をカウントし、不足分だけ追加する
      let currentRestCount = 0;
      dayList.forEach((d) => {
        const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
        const shiftType = assign[m.staff_name]?.[dateStr];
        if (shiftType === restPatternKey) currentRestCount++;
      });
      const remainingQuota = Math.max(0, quota - currentRestCount);
      if (remainingQuota === 0) continue;

      const availableDays: string[] = [];
      dayList.forEach((d) => {
        const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
        const shiftType = assign[m.staff_name]?.[dateStr];
        if (shiftType === nightPatternKey || shiftType === akePatternKey || shiftType) return;
        availableDays.push(dateStr);
      });

      const restAssignDays = availableDays.sort(() => Math.random() - 0.5).slice(0, remainingQuota);
      for (const dateStr of restAssignDays) {
        assign[m.staff_name][dateStr] = restPatternKey;
      }
    }

    const canDoPattern = (m: StaffMasterProfile, patternId: number | undefined) => {
      if (!patternId) return true; // IDが解決できない場合は制限しない
      return Array.isArray(m.work_patterns) && m.work_patterns.includes(patternId);
    };

    // ステップ3: 早番(2名) → 遅番(2名) を割当（空セルのみ）
    for (const day of dayList) {
      const dateStr = `${yearStr}-${monthStr}-${day.toString().padStart(2, "0")}`;

      const isAlreadyFilled = (m: StaffMasterProfile) => !!assign[m.staff_name]?.[dateStr];

      const weekend = isWeekendDay(day);

      const earlyCandidates = _members.filter((m) => {
        if (isAlreadyFilled(m)) return false;
        if (!canDoPattern(m, earlyPatternId)) return false;
        if (isAdminStaff(m)) return false; // 管理者は早番なし
        return true;
      });

      for (const m of pickLeast({
        candidates: earlyCandidates,
        count: 2,
        score: (m) => (weekend ? (weekendWorkCount[m.staff_name] ?? 0) : 0),
      })) {
        applyAssign(m, dateStr, day, earlyPatternKey);
      }

      // 早番割当後に再評価
      const lateCandidatesAfterEarly = _members.filter((m) => {
        if (isAlreadyFilled(m)) return false;
        if (!canDoPattern(m, latePatternId)) return false;
        if (isAdminStaff(m)) return false; // 管理者は遅番なし
        return true;
      });

      for (const m of pickLeast({
        candidates: lateCandidatesAfterEarly,
        count: 2,
        score: (m) => (weekend ? (weekendWorkCount[m.staff_name] ?? 0) : 0),
      })) {
        applyAssign(m, dateStr, day, latePatternKey);
      }
    }

    // ステップ4: 残りの未入力セルをすべて「日勤」で埋める（既存入力は維持）
    for (const m of _members) {
      for (const day of dayList) {
        const dateStr = `${yearStr}-${monthStr}-${day.toString().padStart(2, "0")}`;
        if (assign[m.staff_name]?.[dateStr]) continue;
        // 管理者は土日勤務なし（空欄なら休にする）
        if (isWeekendDay(day) && isAdminStaff(m)) {
          applyAssign(m, dateStr, day, restPatternKey);
          continue;
        }
        applyAssign(m, dateStr, day, dayPatternKey);
      }
    }

    // 保存用行（既存入力と同じならスキップ）
    const upsertRows: ShiftRecordV2[] = [];
    for (const staff_name in assign) {
      for (const date in assign[staff_name]) {
        const shift_type = assign[staff_name][date];
        if (readonlyShiftMap[staff_name]?.[date] === shift_type) continue;
        if (!shift_type) continue;
        upsertRows.push({
          staff_name,
          date,
          is_actual: false,
          shift_type,
          updated_by: updatedBy,
        });
      }
    }

    return {
      upsertRows,
      existedShifts,
      readonlyShiftMap,
    };
  }
}
