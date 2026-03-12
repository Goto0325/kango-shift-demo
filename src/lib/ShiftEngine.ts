/**
 * シフト自動作成アルゴリズム（Phase1）を純粋計算としてクラス化。
 * React の State は含めず、計算結果のみを返す。
 */
import { StaffManager, type StaffMasterProfile } from "./StaffManager";
import type { ShiftRecordV2 } from "./ShiftRepository";

export type GeneratePhase1Input = {
  members: StaffMasterProfile[];
  year: number;
  month: number;
  existedShifts: ShiftRecordV2[];
  nightPatternId: number | undefined;
  nightPatternKey: string;
  akePatternKey: string;
  restPatternKey: string;
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
      updatedBy,
    } = input;

    const _members = [...members];
    if (!_members.length) return null;

    const yearStr = year;
    const monthStr = month.toString().padStart(2, "0");
    const daysCount = new Date(year, month, 0).getDate();
    const dayList = Array.from({ length: daysCount }, (_, i) => i + 1);

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
        return true;
      });

      let pickNurse: typeof candidatesNurse;
      if (candidatesNurse.length > 2) {
        const shuffle = candidatesNurse.slice().sort(() => Math.random() - 0.5);
        pickNurse = shuffle.slice(0, 2);
      } else {
        pickNurse = candidatesNurse;
      }
      for (const m of pickNurse) {
        assign[m.staff_name][dateStr] = nightPatternKey;
        const nextDate = new Date(year, month - 1, day);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, "0")}-${nextDate.getDate().toString().padStart(2, "0")}`;
        if (!assign[m.staff_name][nextDateStr]) {
          assign[m.staff_name][nextDateStr] = akePatternKey;
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
        return true;
      });

      let pickCare: typeof candidatesCare;
      if (candidatesCare.length > 1) {
        const shuffle = candidatesCare.slice().sort(() => Math.random() - 0.5);
        pickCare = shuffle.slice(0, 1);
      } else {
        pickCare = candidatesCare;
      }
      for (const m of pickCare) {
        assign[m.staff_name][dateStr] = nightPatternKey;
        const nextDate = new Date(year, month - 1, day);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, "0")}-${nextDate.getDate().toString().padStart(2, "0")}`;
        if (!assign[m.staff_name][nextDateStr]) {
          assign[m.staff_name][nextDateStr] = akePatternKey;
        }
      }
    }

    // ステップ2: 公休配置 空セルのみ
    for (const m of _members) {
      if (m.employment_status !== "常勤") continue;
      const quota = StaffManager.getHolidayQuota(year, month);

      const availableDays: string[] = [];
      dayList.forEach((d) => {
        const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
        const shiftType = assign[m.staff_name]?.[dateStr];
        if (shiftType === nightPatternKey || shiftType === akePatternKey || shiftType) return;
        availableDays.push(dateStr);
      });

      const restAssignDays = availableDays.sort(() => Math.random() - 0.5).slice(0, quota);
      for (const dateStr of restAssignDays) {
        assign[m.staff_name][dateStr] = restPatternKey;
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
