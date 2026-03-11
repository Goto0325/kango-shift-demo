"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type StaffMasterProfile = {
  id: string;
  staff_name: string;
  access_token: string;
  job_title: string | object | null;
  department_id: number | string | null;
  work_patterns: number[] | null;
  paid_leave_remaining: number | null;
  employment_status?: string; // 追加: 雇用区分 (例：「常勤」/「非常勤」など)
};

type ShiftRecordV2 = {
  id?: number;
  staff_name: string;
  date: string;
  is_actual: boolean;
  shift_type: string | null;
  updated_by?: string | null;
};

type ShiftPattern = {
  id: number;
  pattern_name: string;
  pattern_key: string;
  work_hours: number;
};

const MONTH_NAMES = [
  "", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"
];

// ==== 職種取得・職種分類 ====
function getJobTitleString(jobTitle: StaffMasterProfile["job_title"]) {
  if (!jobTitle) return "";
  if (typeof jobTitle === "string") {
    try {
      const parsed = JSON.parse(jobTitle);
      if (parsed && typeof parsed === "object" && (parsed.name || parsed.label)) {
        return parsed.name || parsed.label || "";
      }
    } catch {}
    return jobTitle;
  } else if (typeof jobTitle === "object" && jobTitle !== null) {
    if ((jobTitle as any).name) return (jobTitle as any).name;
    if ((jobTitle as any).label) return (jobTitle as any).label;
    return JSON.stringify(jobTitle);
  }
  return "";
}

function isRestishValue(value: string): boolean {
  if (!value) return false;
  return value.includes("休") || value.includes("有");
}

function isRestPattern(pattern: ShiftPattern | undefined): boolean {
  if (!pattern) return false;
  const restKeywords = ["休", "有給", "休日", "有休", "代休"];
  return restKeywords.some(
    k => (pattern.pattern_name && pattern.pattern_name.includes(k)) ||
         (pattern.pattern_key && pattern.pattern_key.includes(k))
  );
}

function isAdminUser(jobTitle: StaffMasterProfile["job_title"]) {
  if (!jobTitle) {
    console.log("[ADMIN判定] jobTitle undefined/null:", jobTitle);
    return false;
  }
  let targetStr = "";
  if (typeof jobTitle === "object" && jobTitle !== null) {
    if ((jobTitle as any).name) targetStr = (jobTitle as any).name;
    if (!targetStr && (jobTitle as any).label) targetStr = (jobTitle as any).label;
  } else if (typeof jobTitle === "string") {
    try {
      const parsed = JSON.parse(jobTitle);
      if (parsed && typeof parsed === "object") {
        if (parsed.name) targetStr = parsed.name;
        else if (parsed.label) targetStr = parsed.label;
      }
      if (!targetStr) targetStr = jobTitle;
    } catch {
      targetStr = jobTitle;
    }
  }
  console.log("[ADMIN判定] jobTitle解釈:", jobTitle, "→", targetStr);
  return typeof targetStr === "string" && targetStr.includes("システム管理者");
}

// 職種（job_title）を分類
function jobTitleCategory(jobTitle: StaffMasterProfile["job_title"]): number {
  // 0: システム管理者, 1: 看護師, 2: 介護士など, 9: その他
  const title = getJobTitleString(jobTitle);
  if (title.includes("システム管理者")) return 0;
  if (title.includes("看護師")) return 1;
  if (title.includes("介護") || title.includes("助手")) return 2;
  return 9;
}
function jobTitleKey(jobTitle: StaffMasterProfile["job_title"]): string {
  // 並べ替え時に同値ソートで使う(なるべく五十音順)
  const t = getJobTitleString(jobTitle);
  return t || "";
}

function getHolidayQuota(theYear: number, theMonth: number): number {
  // 8月(8), 12月(12), 1月(1) => 10, 他は9
  if (theMonth === 8 || theMonth === 12 || theMonth === 1) {
    return 10;
  }
  return 9;
}

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);

  const handlePrevMonth = useCallback(() => {
    setMonth(prevMonth => {
      if (prevMonth === 1) {
        setYear(prevYear => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth(prevMonth => {
      if (prevMonth === 12) {
        setYear(prevYear => prevYear + 1);
        return 1;
      }
      return prevMonth + 1;
    });
  }, []);

  const handleMonthSelect = (newMonth: number) => {
    setMonth(newMonth);
  };

  const getYearOptions = () => {
    const center = year;
    const ys: number[] = [];
    for (let d = -2; d <= 2; ++d) {
      ys.push(center + d);
    }
    return ys;
  };

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffMasterProfile | null>(null);
  const [departmentId, setDepartmentId] = useState<number | string | null>(null);
  const [members, setMembers] = useState<StaffMasterProfile[]>([]);
  const [allPatterns, setAllPatterns] = useState<ShiftPattern[]>([]);

  // ローディング状態：自動作成処理用
  const [isGeneratingShifts, setIsGeneratingShifts] = useState(false);

  useEffect(() => {
    const fetchShiftPatterns = async () => {
      const { data, error } = await supabase
        .from("shift_patterns")
        .select("*")
        .order("id", { ascending: true });

      if (!error && Array.isArray(data)) {
        setAllPatterns(
          (data as any[]).map((row: any) => ({
            id: row.id,
            pattern_name: row.pattern_name,
            pattern_key: row.pattern_key,
            work_hours: row.work_hours,
          }))
        );
      }
    };
    fetchShiftPatterns();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    setAccessToken(key ?? null);
  }, []);

  useEffect(() => {
    const fetchStaffMaster = async (token: string) => {
      const { data, error } = await supabase
        .from("staff_master")
        .select("*")
        .eq("access_token", token)
        .maybeSingle();

      if (error || !data) {
        setStaffProfile(null);
        setDepartmentId(null);
        return;
      }
      setStaffProfile({
        ...data,
        work_patterns: safeParseIntArray((data as any).work_patterns),
      });
      setDepartmentId((data as any).department_id ?? null);
    };
    if (accessToken) {
      fetchStaffMaster(accessToken);
    } else {
      setStaffProfile(null);
      setDepartmentId(null);
    }
  }, [accessToken]);

  useEffect(() => {
    const fetchMembers = async () => {
      const validDep =
        departmentId !== null &&
        departmentId !== undefined &&
        departmentId !== "" &&
        !(typeof departmentId === "number" && isNaN(departmentId)) &&
        !(typeof departmentId === "number" && departmentId === 0) &&
        !(typeof departmentId === "string" && (departmentId === "0" || departmentId.trim() === ""));
      if (validDep) {
        const { data, error } = await supabase
          .from("staff_master")
          .select("*")
          .eq("department_id", departmentId)
          .order("staff_name", { ascending: true });
        if (!error && Array.isArray(data)) {
          let membersArr = [...(data as any[])].map((row: any) => ({
            ...row,
            work_patterns: safeParseIntArray(row.work_patterns),
            employment_status: (row as any).employment_status ?? undefined,
          }));
          if (staffProfile) {
            const idx = membersArr.findIndex((s: any) => s.id === staffProfile.id);
            if (idx >= 0) {
              const [me] = membersArr.splice(idx, 1);
              membersArr = [me, ...membersArr];
            }
          }
          if (membersArr.length === 0 && staffProfile) {
            setMembers([staffProfile]);
          } else if (membersArr.length > 0) {
            setMembers(membersArr as StaffMasterProfile[]);
          } else if (staffProfile) {
            setMembers([staffProfile]);
          } else {
            setMembers([]);
          }
        } else {
          if (staffProfile) {
            setMembers([staffProfile]);
          } else {
            setMembers([]);
          }
        }
      } else {
        if (staffProfile) {
          setMembers([staffProfile]);
        } else {
          setMembers([]);
        }
      }
    };
    fetchMembers();
  }, [departmentId, staffProfile]);

  const [shiftRecords, setShiftRecords] = useState<ShiftRecordV2[]>([]);
  const [viewMode, setViewMode] = useState<'plan' | 'actual'>("plan");
  useEffect(() => {
    const fetchShifts = async () => {
      const validDep =
        departmentId !== null &&
        departmentId !== undefined &&
        departmentId !== "" &&
        !(typeof departmentId === "number" && isNaN(departmentId)) &&
        !(typeof departmentId === "number" && departmentId === 0) &&
        !(typeof departmentId === "string" && (departmentId === "0" || departmentId.trim() === ""));
      if (!validDep) {
        setShiftRecords([]);
        return;
      }
      const d1 = new Date(year, month - 1, 1);
      const d2 = new Date(year, month, 0);
      const startDate = d1.toISOString().slice(0, 10);
      const endDate = d2.toISOString().slice(0, 10);
      let staffNames = members.map((s) => s.staff_name);
      if (staffNames.length === 0 && staffProfile?.staff_name) {
        staffNames = [staffProfile.staff_name];
      }
      if (staffNames.length === 0) {
        setShiftRecords([]);
        return;
      }
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .in("staff_name", staffNames)
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("is_actual", viewMode === "actual");
      if (!error && Array.isArray(data)) {
        setShiftRecords(
          data.map((rec: any) => ({
            id: rec.id,
            staff_name: rec.staff_name,
            date: rec.date,
            is_actual: !!rec.is_actual,
            shift_type: rec.shift_type,
            updated_by: rec.updated_by ?? null,
          }))
        );
      } else {
        setShiftRecords([]);
      }
    };
    fetchShifts();
  }, [departmentId, viewMode, year, month, members, staffProfile?.staff_name]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayInfo = (day: number) => {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const labels = ["日", "月", "火", "水", "木", "金", "土"];
    return {
      label: labels[dayOfWeek],
      headerColor: dayOfWeek === 0 ? "bg-red-500" : dayOfWeek === 6 ? "bg-blue-500" : "bg-slate-800",
      bgColor: dayOfWeek === 0 ? "bg-red-50" : dayOfWeek === 6 ? "bg-blue-50" : "bg-white"
    };
  };

  const shiftMap: { [staffName: string]: { [date: string]: { value: string | null, updated_by: string | null | undefined } } } = useMemo(() => {
    const map: { [staffName: string]: { [date: string]: { value: string | null, updated_by: string | null | undefined } } } = {};
    shiftRecords.forEach((rec) => {
      if (!map[rec.staff_name]) map[rec.staff_name] = {};
      map[rec.staff_name][rec.date] = { value: rec.shift_type, updated_by: rec.updated_by ?? null };
    });
    return map;
  }, [shiftRecords]);

  const [editingShift, setEditingShift] = useState<{
    staff_name: string;
    date: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  const canEdit = useCallback(
    (targetStaffId: string): boolean => {
      if (!staffProfile) return false;
      const jobTitleString = getJobTitleString(staffProfile.job_title);
      if (typeof jobTitleString === "string" && jobTitleString.includes("システム管理者")) {
        return true;
      }
      return staffProfile.id === targetStaffId;
    },
    [staffProfile]
  );

  const isAdmin = useMemo(() => {
    return isAdminUser(staffProfile?.job_title ?? "");
  }, [staffProfile?.job_title]);

  const handleCellEdit = useCallback((staff_name: string, date: string) => {
    setEditingShift({
      staff_name,
      date,
    });
  }, []);

  // ======== Night-shift auto 明連動保存ロジック追加 ========
  const handleSave = useCallback(
    async (staff_id: string, date: string, value: string) => {
      if (!departmentId) return;
      const profile = members.find(m => m.id === staff_id);
      if (!profile) return;
      const staff_name = profile.staff_name;
      const loggedInName = staffProfile?.staff_name ?? null;
      if (!canEdit(staff_id)) {
        setIsSaving(false);
        setEditingShift(null);
        return;
      }
      setIsSaving(true);
      const isValidPatternKey = value === "" || allPatterns.some(pt => pt.pattern_key === value);
      if (!isValidPatternKey) {
        setIsSaving(false);
        setEditingShift(null);
        return;
      }
      const newShiftType = value === "" ? null : value;
      const is_actual = viewMode === "actual";

      // --- 夜勤＆明け パターンキー特定 ---
      const nightPatternKey = (() => {
        // パターン名に「夜」または「夜勤」, またはpattern_key==="夜"
        const byKey = allPatterns.find(pt => pt.pattern_key === "夜");
        if (byKey) return byKey.pattern_key;
        const byLabel = allPatterns.find(pt =>
          pt.pattern_name.includes("夜勤") || pt.pattern_name === "夜" || pt.pattern_key === "夜"
        );
        if (byLabel) return byLabel.pattern_key;
        return "夜"; // fallback
      })();
      const akePatternKey = (() => {
        // 明け: pattern_key === "明" 優先, なければpattern_nameに「明け」が含まれるもの
        const byKey = allPatterns.find(pt => pt.pattern_key === "明");
        if (byKey) return byKey.pattern_key;
        const byLabel = allPatterns.find(pt => pt.pattern_name.includes("明け"));
        if (byLabel) return byLabel.pattern_key;
        return "明"; // fallback
      })();

      // 保存用配列
      const upsertRows: ShiftRecordV2[] = [
        {
          staff_name,
          date,
          is_actual,
          shift_type: newShiftType,
          updated_by: loggedInName,
        }
      ];

      // 夜勤→明け自動入力: valueが夜の場合、翌日分「明」も保存
      let nextDayRow: ShiftRecordV2 | null = null;
      let nextDayISO = '';
      if (value === nightPatternKey) {
        // 翌日計算
        const [yyyy, mm, dd] = date.split('-').map(Number);
        const currentDate = new Date(yyyy, mm - 1, dd);
        currentDate.setDate(currentDate.getDate() + 1);
        const yyyy2 = currentDate.getFullYear();
        const mm2 = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const dd2 = currentDate.getDate().toString().padStart(2, "0");
        nextDayISO = `${yyyy2}-${mm2}-${dd2}`;
        // Save for "明"
        upsertRows.push({
          staff_name,
          date: nextDayISO,
          is_actual,
          shift_type: akePatternKey,
          updated_by: loggedInName,
        });
        nextDayRow = {
          staff_name,
          date: nextDayISO,
          is_actual,
          shift_type: akePatternKey,
          updated_by: loggedInName,
        };
      }

      // ステート即時反映
      setShiftRecords((prev) => {
        let replaced = [...prev];
        // 当日分
        const keyMatch = (rec: ShiftRecordV2) =>
          rec.staff_name === staff_name && rec.date === date && rec.is_actual === is_actual;
        const ix = replaced.findIndex(keyMatch);
        if (ix >= 0) {
          replaced[ix] = { ...replaced[ix], shift_type: newShiftType, updated_by: loggedInName };
        } else {
          replaced.push({
            staff_name,
            date,
            is_actual,
            shift_type: newShiftType,
            updated_by: loggedInName,
          });
        }
        // 翌日明け分
        if (nextDayRow) {
          const keyMatchNext = (rec: ShiftRecordV2) =>
            rec.staff_name === staff_name && rec.date === nextDayRow!.date && rec.is_actual === is_actual;
          const ix2 = replaced.findIndex(keyMatchNext);
          if (ix2 >= 0) {
            replaced[ix2] = { ...replaced[ix2], shift_type: nextDayRow.shift_type, updated_by: loggedInName };
          } else {
            replaced.push(nextDayRow);
          }
        }
        return replaced;
      });

      try {
        const { data, error } = await supabase
          .from("shifts")
          .upsert(upsertRows, { onConflict: 'staff_name,date,is_actual' })
          .select();

        if (error) {
          console.error("Shift upsert error:", error);
          alert('保存に失敗しました: ' + error.message);
        } else if (data && Array.isArray(data)) {
          setShiftRecords((prev) => {
            // 本日・翌日分をmerge
            const keyMatch = (r: ShiftRecordV2, n: any) =>
              r.staff_name === n.staff_name && r.date === n.date && r.is_actual === !!n.is_actual;
            let replaced = [...prev];
            data.forEach((newRec: any) => {
              const ix = replaced.findIndex(r => keyMatch(r, newRec));
              const cleaned = {
                id: newRec.id,
                staff_name: newRec.staff_name,
                date: newRec.date,
                is_actual: !!newRec.is_actual,
                shift_type: newRec.shift_type,
                updated_by: newRec.updated_by ?? null,
              };
              if (ix >= 0) {
                replaced[ix] = cleaned;
              } else {
                replaced.push(cleaned);
              }
            });
            return replaced;
          });
        }
      } finally {
        setIsSaving(false);
      }
      setEditingShift(null);
    },
    [viewMode, departmentId, allPatterns, canEdit, members, staffProfile?.staff_name]
  );

  // ==== 追加: 自動シフト生成ロジック ====
  // --- ナイトパターンIDと明パターンIDを決定
  const nightPattern = useMemo(() => {
    return allPatterns.find(pt =>
      pt.pattern_key === "夜" ||
      pt.pattern_name === "夜" ||
      pt.pattern_name.includes("夜勤")
    );
  }, [allPatterns]);
  const nightPatternKey = nightPattern?.pattern_key ?? "夜";
  const nightPatternId = nightPattern?.id;

  const akePattern = useMemo(() => {
    return allPatterns.find(pt =>
      pt.pattern_key === "明" ||
      pt.pattern_name.includes("明け")
    );
  }, [allPatterns]);
  const akePatternKey = akePattern?.pattern_key ?? "明";
  const akePatternId = akePattern?.id;

  const restPattern = useMemo(() => {
    // 「休」または「休日」「有給」「有休」などを優先
    return (
      allPatterns.find(pt => pt.pattern_key === "休") ||
      allPatterns.find(pt => pt.pattern_name.includes("休")) ||
      allPatterns.find(pt => pt.pattern_name.includes("休日")) ||
      allPatterns.find(pt => pt.pattern_name.includes("有給"))
    );
  }, [allPatterns]);
  const restPatternKey = restPattern?.pattern_key ?? "休";

  // --- 自動生成コア ---
  const generateShiftPhase1 = useCallback(async () => {
    // 処理中制御
    setIsGeneratingShifts(true);
    try {
      // メンバーlist
      const _members = [...members];
      const _patterns = [...allPatterns];
      if (!_members.length) {
        alert('メンバーが存在しません');
        setIsGeneratingShifts(false);
        return;
      }
      const yearStr = year;
      const monthStr = month.toString().padStart(2, '0');
      const daysCount = new Date(year, month, 0).getDate();
      const dayList = Array.from({ length: daysCount }, (_, i) => i + 1);

      // 既存のshift（"plan"のみ取得、今月のみ）
      const d1 = `${yearStr}-${monthStr}-01`;
      const d2 = `${yearStr}-${monthStr}-${daysCount.toString().padStart(2, '0')}`;
      let existedShifts: ShiftRecordV2[] = [];
      {
        const { data, error } = await supabase
          .from("shifts")
          .select("*")
          .in("staff_name", _members.map(s => s.staff_name))
          .eq("is_actual", false)
          .gte("date", d1)
          .lte("date", d2);

        if (data && Array.isArray(data)) {
          existedShifts = data.map((rec: any) => ({
            id: rec.id,
            staff_name: rec.staff_name,
            date: rec.date,
            is_actual: !!rec.is_actual,
            shift_type: rec.shift_type,
            updated_by: rec.updated_by ?? null,
          }));
        }
      }

      // 事前入力のセルは残す: staff_name, dateでマッピング
      const readonlyShiftMap: { [staffName: string]: { [date: string]: string | null } } = {};
      existedShifts.forEach(({ staff_name, date, shift_type }) => {
        if (!readonlyShiftMap[staff_name]) readonlyShiftMap[staff_name] = {};
        readonlyShiftMap[staff_name][date] = shift_type;
      });

      // シフト割当配列（既存入力優先）
      const assign: { [staffName: string]: { [date: string]: string } } = {};
      _members.forEach(m => {
        assign[m.staff_name] = {};
        for (let d = 1; d <= daysCount; ++d) {
          const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
          // 既存入力ありならそれをセット
          if (readonlyShiftMap[m.staff_name]?.[dateStr]) {
            assign[m.staff_name][dateStr] = readonlyShiftMap[m.staff_name][dateStr]!;
          }
        }
      });

      // ステップ1: 夜勤配置（空セルのみ割当）
      for (const day of dayList) {
        const dateStr = `${yearStr}-${monthStr}-${day.toString().padStart(2, "0")}`;
        // 前日
        const prevDate = new Date(year, month - 1, day);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, "0")}-${prevDate.getDate().toString().padStart(2, "0")}`;

        // --- 看護師(2名)割当 空セルのみ
        const candidatesNurse = _members.filter(m => {
          const jt = getJobTitleString(m.job_title);
          if (!jt.includes("看護師")) return false;
          if (!(Array.isArray(m.work_patterns) && nightPatternId && m.work_patterns.includes(nightPatternId))) return false;
          // 前日夜勤でない
          if (assign[m.staff_name]?.[prevDateStr] === nightPatternKey) return false;
          // 既にこの日夜勤していない
          if (assign[m.staff_name]?.[dateStr] === nightPatternKey) return false;
          // 既に入力ありならスキップ
          if (assign[m.staff_name]?.[dateStr]) return false;
          return true;
        });

        let pickNurse: typeof candidatesNurse = [];
        if (candidatesNurse.length > 2) {
          const shuffle = candidatesNurse.slice().sort(() => Math.random() - 0.5);
          pickNurse = shuffle.slice(0, 2);
        } else {
          pickNurse = candidatesNurse;
        }
        for (const m of pickNurse) {
          assign[m.staff_name][dateStr] = nightPatternKey;
          // 明けも空なら自動付与
          const nextDate = new Date(year, month - 1, day);
          nextDate.setDate(nextDate.getDate() + 1);
          const nextDateStr = `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, "0")}-${nextDate.getDate().toString().padStart(2, "0")}`;
          if (!assign[m.staff_name][nextDateStr]) {
            assign[m.staff_name][nextDateStr] = akePatternKey;
          }
        }

        // --- 介護士(1名)割当 空セルのみ
        const candidatesCare = _members.filter(m => {
          const jt = getJobTitleString(m.job_title);
          if (!(jt.includes("介護") || jt.includes("助手"))) return false;
          if (!(Array.isArray(m.work_patterns) && nightPatternId && m.work_patterns.includes(nightPatternId))) return false;
          if (assign[m.staff_name]?.[prevDateStr] === nightPatternKey) return false;
          if (assign[m.staff_name]?.[dateStr] === nightPatternKey) return false;
          if (assign[m.staff_name]?.[dateStr]) return false;
          return true;
        });

        let pickCare: typeof candidatesCare = [];
        if (candidatesCare.length > 1) {
          const shuffle = candidatesCare.slice().sort(() => Math.random() - 0.5);
          pickCare = shuffle.slice(0, 1);
        } else {
          pickCare = candidatesCare;
        }
        for (const m of pickCare) {
          assign[m.staff_name][dateStr] = nightPatternKey;
          // 明けも空なら自動付与
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
        const quota = getHolidayQuota(year, month);

        // 夜勤明けを除く未入力の日だけ
        const availableDays: string[] = [];
        dayList.forEach(d => {
          const dateStr = `${yearStr}-${monthStr}-${d.toString().padStart(2, "0")}`;
          const shiftType = assign[m.staff_name]?.[dateStr];
          // 既に割当・入力済・夜勤や明けの場合、対象外
          if (shiftType == nightPatternKey || shiftType == akePatternKey || shiftType) return;
          availableDays.push(dateStr);
        });

        let restAssignDays = availableDays.sort(() => Math.random() - 0.5).slice(0, quota);
        for (const dateStr of restAssignDays) {
          assign[m.staff_name][dateStr] = restPatternKey;
        }
      }

      // 最後にshifts登録用オブジェクトへ（空セルはスキップ、既存入力以外のみ保存する）
      const upsertRows: ShiftRecordV2[] = [];
      for (const staff_name in assign) {
        for (const date in assign[staff_name]) {
          const shift_type = assign[staff_name][date];
          // 既存入力と同じなら保存不要
          if (readonlyShiftMap[staff_name]?.[date] === shift_type) continue;
          if (!shift_type) continue;
          upsertRows.push({
            staff_name,
            date,
            is_actual: false,
            shift_type,
            updated_by: staffProfile?.staff_name ?? null,
          });
        }
      }
      // データベース保存
      if (upsertRows.length > 0) {
        for (let i = 0; i < upsertRows.length; i += 50) {
          const chunk = upsertRows.slice(i, i + 50);
          await supabase.from("shifts").upsert(chunk, { onConflict: 'staff_name,date,is_actual' });
        }
      }

      // ステートを更新
      setShiftRecords(prev => {
        // 既存planデータは上書き、actualや今月以外は保持
        const planMap: { [key: string]: ShiftRecordV2 } = {};
        for (const s of upsertRows) {
          planMap[`${s.staff_name}_${s.date}`] = s;
        }
        return prev
          .filter(x => x.is_actual || x.date.slice(0, 7) !== `${yearStr}-${monthStr}`)
          .concat(
            // 既存入力だったplanセル（実績false, 今月で、readonlyShiftMapに該当するもの）
            existedShifts.filter(x =>
              !x.is_actual &&
              x.date.slice(0, 7) === `${yearStr}-${monthStr}` &&
              readonlyShiftMap[x.staff_name]?.[x.date]
            ),
            upsertRows.map(r => ({ ...r }))
          );
      });

    } catch (e) {
      alert("自動作成に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsGeneratingShifts(false);
    }
  }, [members, allPatterns, year, month, staffProfile?.staff_name, nightPatternId, nightPatternKey, akePatternId, akePatternKey, restPatternKey]);

  const loggedInName = staffProfile?.staff_name;

  const loggedInJob = useMemo(() => {
    return getJobTitleString(staffProfile?.job_title ?? null);
  }, [staffProfile?.job_title]);

  const loggedInPatterns = useMemo(() => {
    if (!staffProfile?.work_patterns || !Array.isArray(staffProfile.work_patterns)) return "";
    const patterns = allPatterns.filter(pt =>
      staffProfile.work_patterns!.includes(pt.id)
    );
    return patterns.map(pt => pt.pattern_key).join(",");  // ← pattern_keyへ
  }, [staffProfile?.work_patterns, allPatterns]);

  const paidLeave = staffProfile?.paid_leave_remaining;

  function safeParseIntArray(wp: any): number[] | null {
    if (!wp) return null;
    if (Array.isArray(wp)) {
      return wp.map(Number).filter(v => !isNaN(v));
    }
    if (typeof wp === "string") {
      if (wp.startsWith('{') && wp.endsWith('}')) {
        return wp
          .slice(1, -1)
          .split(',')
          .map(s => Number(s.trim()))
          .filter(v => !isNaN(v));
      }
      if (wp.startsWith('[') && wp.endsWith(']')) {
        try {
          const arr = JSON.parse(wp);
          if (Array.isArray(arr)) {
            return arr.map(Number).filter(v => !isNaN(v));
          }
        } catch {}
      }
      if (wp.includes(',')) {
        return wp
          .split(',')
          .map(s => Number(s.trim()))
          .filter(v => !isNaN(v));
      }
      if (!isNaN(Number(wp))) {
        return [Number(wp)];
      }
    }
    return null;
  }

  function getAvailablePatterns(profile: StaffMasterProfile): ShiftPattern[] {
    const ids = profile?.work_patterns;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
    return allPatterns.filter(pt => ids.includes(pt.id));
  }

  type CellSelectProps = {
    value: string;
    options: ShiftPattern[];
    disabled: boolean;
    onChange: (v: string) => void;
    onBlur: (e: React.FocusEvent<HTMLSelectElement>) => void;
  };

  const CellSelect = React.memo((props: CellSelectProps) => {
    const { value, options, disabled, onChange, onBlur } = props;
    const selectRef = useRef<HTMLSelectElement | null>(null);

    useEffect(() => {
      if (selectRef.current) {
        selectRef.current.focus();
      }
    }, []);

    const handleBlurSafe = useCallback((e: React.FocusEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      if (
        e.relatedTarget &&
        (e.relatedTarget === selectRef.current ||
          (e.relatedTarget as HTMLElement).tagName === 'OPTION')
      ) {
        return;
      }
      onBlur(e);
    }, [onBlur]);

    return (
      <select
        ref={selectRef}
        className="border px-2 py-1 rounded bg-white text-xs w-full"
        value={value}
        disabled={disabled}
        tabIndex={0}
        style={{ minWidth: 80 }}
        autoFocus
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlurSafe}
      >
        <option value="">-</option>
        {options.map(pt => (
          <option key={pt.id} value={pt.pattern_key}>{pt.pattern_key}</option>
        ))}
      </select>
    );
  });
  CellSelect.displayName = "CellSelect";

  // ======== renderCell: 背景色条件分岐 ========
  const renderCell = useCallback(
    (
      profile: StaffMasterProfile,
      day: number,
      info: ReturnType<typeof getDayInfo>,
      dayStr: string,
      shiftValue: string,
      availablePatterns: ShiftPattern[],
      editable: boolean,
      isEditing: boolean,
      cellKey: string
    ) => {
      const allowEdit = editable && canEdit(profile.id);

      let highlightBg = "";

      const thisMap = shiftMap?.[profile.staff_name]?.[dayStr];

      if (shiftValue) {
        console.log("[renderCell] job_title値:", staffProfile?.job_title, "| 行profile:", profile.job_title, "| shiftValue:", shiftValue, "| updated_by:", thisMap?.updated_by);
      }

      if (isAdmin && viewMode === "plan" && shiftValue) {
        const selfName = staffProfile?.staff_name;
        if (thisMap) {
          const { updated_by } = thisMap;
          if (updated_by === selfName) {
            highlightBg = "";
          } else if (!updated_by) {
            highlightBg = " !bg-pink-100";
          } else {
            highlightBg = " !bg-pink-100";
          }
        } else {
          highlightBg = "";
        }
      }

      if (isEditing) {
        return (
          <td
            key={cellKey}
            className={`border-r border-b border-slate-100 text-center ${info.bgColor}${highlightBg} relative`}
          >
            <CellSelect
              value={shiftValue || ""}
              options={availablePatterns}
              disabled={isSaving}
              onChange={async (v) => {
                await handleSave(profile.id, dayStr, v);
                setEditingShift(null);
              }}
              onBlur={(e) => {
                setEditingShift(null);
              }}
            />
          </td>
        );
      }

      let cellClassBase =
        "border-r border-b border-slate-100 text-center relative transition";
      if (allowEdit) {
        cellClassBase += " cursor-pointer hover:bg-blue-100";
      } else {
        cellClassBase += " cursor-not-allowed";
      }
      cellClassBase += ` ${info.bgColor}${highlightBg}`;

      return (
        <td
          key={cellKey}
          className={cellClassBase}
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            if (allowEdit) handleCellEdit(profile.staff_name, dayStr);
          }}
          style={!allowEdit ? { pointerEvents: 'auto' } : undefined}
        >
          {
            shiftValue
              ? (allPatterns.find(p => p.pattern_key === shiftValue)?.pattern_key || shiftValue)
              : "-"
          }
        </td>
      );
    },
    [isSaving, handleSave, allPatterns, handleCellEdit, canEdit, isAdmin, viewMode, staffProfile?.job_title, staffProfile?.staff_name, shiftMap]
  );

  // ======== 公休ノルマ関連ロジック ========
  // employment_statusが"常勤"なら、(8月・12月・1月 = 10日, その他 = 9日)のノルマ
  // getHolidayQuotaは関数（上で定義済み）

  // シフト値が「休」と一致するものだけカウント
  const countRestDays = (profile: StaffMasterProfile) => {
    // この月の日付リスト
    let count = 0;
    for (let d = 1; d <= daysInMonth; ++d) {
      const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
      const shiftVal = shiftMap?.[profile.staff_name]?.[dayStr]?.value;
      // shift_type === '休'
      if (shiftVal === "休") count++;
    }
    return count;
  };

  // ======== 並び替え付き・職種間区切り付き members を計算 ========
  const sortedMembers = useMemo(() => {
    if (!members || members.length === 0) return [];
    let arr = [...members];

    // 1. 管理者かどうか
    const admin = isAdmin && staffProfile;
    // 2. 並び替え
    arr = arr.sort((a, b) => {
      // 0:システム管理者 1:看護師 2:介護士/助手 9:その他
      const catA = jobTitleCategory(a.job_title);
      const catB = jobTitleCategory(b.job_title);
      if (catA !== catB) return catA - catB;
      // 同じ職種カテゴリ内で staff_name 五十音順
      const keyA = (a.staff_name || "").localeCompare(b.staff_name || "", "ja");
      if (keyA !== 0) return keyA;
      // 更に表示名で微ソート（不要だが保険）
      return (jobTitleKey(a.job_title) || "").localeCompare(jobTitleKey(b.job_title) || "", "ja");
    });

    // 管理者の場合は自分の行を先頭にする
    if (admin) {
      const myIdx = arr.findIndex(x => x.id === staffProfile?.id);
      if (myIdx > 0) {
        const myRow = arr.splice(myIdx, 1)[0];
        arr.unshift(myRow);
      }
    }

    return arr;
  }, [members, staffProfile, isAdmin]);

  // ======== UI render ========
  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden text-black font-sans">
      {/* 1. ヘッダー */}
      <div className="flex-none p-4 md:p-6 pb-2">
        <header className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            {/* 左側：タイトルとカレンダーコントロール */}
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-black text-blue-900 tracking-tight">勤務表 Pro v2</h1>
              {/* ▼ ここが年月コントロール部 */}
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg shadow-sm">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 px-2 text-[15px] font-bold text-blue-800 hover:bg-blue-100 rounded disabled:opacity-40"
                  aria-label="前の月へ"
                >◀</button>
                <span className="ml-1 mr-2 text-[18px] font-bold select-none" data-testid="current-year">{year}</span>
                <select
                  className="px-2 py-1 border rounded text-[15px] font-bold bg-white mr-1"
                  value={month}
                  onChange={e => handleMonthSelect(Number(e.target.value))}
                  aria-label="月選択"
                  style={{ minWidth: "56px" }}
                >
                  {[...Array(12)].map((_, i) => {
                    const m = i + 1;
                    return <option key={m} value={m}>{MONTH_NAMES[m]}</option>;
                  })}
                </select>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 px-2 text-[15px] font-bold text-blue-800 hover:bg-blue-100 rounded disabled:opacity-40"
                  aria-label="次の月へ"
                >▶</button>
              </div>
              {/* ---------- 追加: 自動作成ボタン ---------- */}
              {isAdmin && (
                <button
                  type="button"
                  className="ml-3 px-4 py-1.5 rounded-lg font-bold text-xs bg-green-600 text-white hover:bg-green-700 shadow transition disabled:opacity-50"
                  disabled={isGeneratingShifts}
                  onClick={async () => {
                    if (isGeneratingShifts) return;
                    if (!window.confirm("未入力のセルのみ自動入力されます。よろしいですか？")) return;
                    await generateShiftPhase1();
                  }}
                >
                  {isGeneratingShifts ? (
                    <span className="flex items-center gap-1">
                      <svg className="inline-block animate-spin text-white" width="17" height="17" viewBox="0 0 50 50"><circle className="opacity-25" cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="5"></circle><circle className="opacity-75" cx="25" cy="25" r="20" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="31.4 100"></circle></svg>
                      作成中...
                    </span>
                  ) : (
                    <span>自動作成（未入力のみ）</span>
                  )}
                </button>
              )}
              {/* ---------- END: 自動作成ボタン ---------- */}
            </div>
            {/* 右側：ユーザー情報や「予定」「実績」切替など */}
            <div className="flex gap-2 items-center">
              {loggedInName && (
                <div className="flex flex-col items-end mr-2">
                  <span className="text-sm text-blue-700 font-bold" title={loggedInName}>
                    {loggedInName}さん
                    {staffProfile?.department_id && Number(staffProfile.department_id) > 0 && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        部署{staffProfile.department_id}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-700 font-normal">
                    {loggedInJob} {loggedInPatterns ? `(${loggedInPatterns})` : ""}
                  </span>
                  {typeof paidLeave === "number" && (
                    <span className="text-xs text-pink-600 font-bold">
                      有給残: {paidLeave}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => setViewMode("plan")}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs transition ${viewMode === "plan" ? "bg-blue-600 text-white shadow-lg" : "bg-white border"}`}
              >予定</button>
              <button
                onClick={() => setViewMode("actual")}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs transition ${viewMode === "actual" ? "bg-orange-600 text-white shadow-lg" : "bg-white border"}`}
              >実績</button>
            </div>
          </div>
        </header>
      </div>
      <div className="flex-1 overflow-hidden px-2 md:px-6 pb-4">
        <div className="h-full w-full overflow-auto border rounded-xl shadow-2xl bg-white relative border-separate">
          {/* ローディング表示 */}
          {isGeneratingShifts && (
            <div className="absolute inset-0 z-[120] bg-white/80 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <svg className="animate-spin text-green-700" width="36" height="36" viewBox="0 0 50 50"><circle className="opacity-25" cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="5"></circle><circle className="opacity-75" cx="25" cy="25" r="20" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="31.4 100"></circle></svg>
                <span className="text-green-700 font-bold">自動作成中...</span>
              </div>
            </div>
          )}
          <table className="border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-[100]">
              <tr className="text-white text-[10px] text-center font-bold">
                <th className="sticky left-0 top-0 z-[110] bg-slate-900 p-3 min-w-[140px] border-b border-r border-slate-700">
                  職員名 / 職種
                </th>
                <th className="bg-slate-900 border-b border-r border-slate-700 min-w-[50px] text-blue-200">公休</th>
                {days.map(d => {
                  const info = getDayInfo(d);
                  return (
                    <th key={d} className={`p-1 min-w-[42px] border-b border-r border-slate-700 ${info.headerColor}`}>
                      <div>{d}</div>
                    </th>
                  );
                })}
                <th className="p-1 min-w-[32px] bg-slate-900 border-b border-slate-700 text-[8px]">合計</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((profile, idx, arr) => {
                const rowCanEdit = !!loggedInName && canEdit(profile.id);

                let jobTitle = "";
                if (profile.job_title) {
                  if (typeof profile.job_title === "string") {
                    try {
                      const parsed = JSON.parse(profile.job_title);
                      jobTitle = parsed?.name || parsed?.label || String(profile.job_title);
                    } catch {
                      jobTitle = String(profile.job_title);
                    }
                  } else if (typeof profile.job_title === "object" && profile.job_title !== null) {
                    jobTitle =
                      (profile.job_title as any).name ||
                      (profile.job_title as any).label ||
                      JSON.stringify(profile.job_title);
                  } else {
                    jobTitle = String(profile.job_title);
                  }
                }

                const availablePatterns = getAvailablePatterns(profile);

                let totalHours = 0;
                days.forEach(d => {
                  const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                  const shiftKey = shiftMap?.[profile.staff_name]?.[dayStr]?.value;
                  if (!shiftKey) return;
                  const pat = allPatterns.find(p => p.pattern_key === shiftKey);
                  if (pat) totalHours += pat.work_hours;
                });

                // ==== 公休数/ノルマ判定 ====
                const restCount = countRestDays(profile);

                // employment_statusプロパティ取り出し
                let empStatus = profile.employment_status;
                // サーバー上でデータが存在しない既存データの場合、employment_status未定義も考慮するので、"常勤"として判定したい場合等は対応
                if (typeof empStatus !== "string") empStatus = undefined;

                const quota = empStatus === "常勤" ? getHolidayQuota(year, month) : undefined;

                // 色判定
                let quotaColor = "";
                if (quota !== undefined) {
                  if (restCount < quota) {
                    quotaColor = "text-orange-500 font-bold";
                  } else if (restCount === quota) {
                    quotaColor = "text-blue-700 font-bold";
                  } else if (restCount > quota) {
                    quotaColor = "text-red-600 font-bold";
                  }
                }

                // 職種間のボーダー判定: この行と次の行で職種カテゴリが違えば強い枠線
                let borderClass = "";
                const thisCategory = jobTitleCategory(profile.job_title);
                const nextCategory = arr[idx + 1] ? jobTitleCategory(arr[idx + 1].job_title) : null;
                if (nextCategory !== null && nextCategory !== undefined && thisCategory !== nextCategory) {
                  borderClass = " border-b-4 border-gray-400";
                }

                const trClassName =
                  "h-11" +
                  (!rowCanEdit
                    ? " bg-slate-50 text-gray-400"
                    : "") +
                  borderClass;

                const staffNameTextClass = 'truncate ml-1' + (!rowCanEdit ? ' text-gray-400' : '');
                const jobTitleClass = 'text-[10px] font-normal ml-1' +
                  (rowCanEdit ? ' text-gray-500' : ' text-gray-400');

                return (
                  <tr key={profile.id || profile.staff_name} className={trClassName}>
                    <td className={`sticky left-0 z-[90] p-2 border-b border-r border-slate-200 !bg-white font-bold transition-all text-slate-800 min-w-[140px] w-[140px]${!rowCanEdit ? ' bg-slate-50 text-gray-400' : ''}${borderClass}`}>
                      <div className="flex flex-col">
                        <span className={staffNameTextClass}>{profile.staff_name}</span>
                        <span className={jobTitleClass}>
                          {jobTitle}
                          {availablePatterns.length > 0
                            ? ` (${availablePatterns.map(x => x.pattern_key).join(",")})`
                            : ""}
                        </span>
                      </div>
                    </td>
                    {/* 新列: 公休状況 */}
                    <td className={`border-b border-r border-slate-200 text-center text-[12px] bg-slate-50 select-none ${quotaColor} ${borderClass}`} style={{ minWidth: 46, fontWeight: 'bold' }}>
                      {quota !== undefined
                        ? (
                          <>
                            {restCount} / {quota}
                          </>
                        )
                        : (
                          <>{restCount}</>
                        )
                      }
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                      let mapEntry = shiftMap?.[profile.staff_name]?.[dayStr];
                      let shiftValue = mapEntry?.value ?? "";
                      const editable = (viewMode === "plan") && !!loggedInName && canEdit(profile.id);
                      const isEditing = editingShift && editingShift.staff_name === profile.staff_name && editingShift.date === dayStr;
                      const cellKey = `${profile.staff_name}_${dayStr}`;
                      return renderCell(
                        profile,
                        d,
                        info,
                        dayStr,
                        shiftValue,
                        availablePatterns,
                        editable,
                        !!isEditing,
                        cellKey
                      );
                    })}
                    <td className={`border-b border-slate-200 text-center font-bold bg-slate-50 text-[10px]${!rowCanEdit ? ' text-gray-400' : ''}${borderClass}`}>
                      {totalHours}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-[100]">
              <tr className="bg-slate-900 text-white font-bold h-14 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                <td className="sticky left-0 z-[110] !bg-slate-900 p-2 border-r border-slate-700 text-center text-xs uppercase tracking-tighter min-w-[140px]">
                  合計
                </td>
                {/* 公休 合計列は空/非表示 */}
                <td className="!bg-slate-900 border-r border-slate-700"></td>
                {days.map(d => (
                  <td key={d} className="p-1 text-center border-r border-slate-700 !bg-slate-900 min-w-[45px]">
                    <div className="flex flex-col justify-center items-center h-full gap-0">
                      {allPatterns.map(pt => {
                        const count = sortedMembers.filter(n => {
                          const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                          return shiftMap?.[n.staff_name]?.[dayStr]?.value === pt.pattern_key;
                        }).length;
                        return count > 0 ? (
                          <span
                            key={pt.pattern_key}
                            className="text-[11px] leading-tight text-white"
                          >
                            {pt.pattern_key}:{count}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </td>
                ))}
                <td className="!bg-slate-900 border-slate-700"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}