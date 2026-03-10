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

      setShiftRecords((prev) => {
        const keyMatch = (rec: ShiftRecordV2) =>
          rec.staff_name === staff_name && rec.date === date && rec.is_actual === is_actual;
        let replaced = [...prev];
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
        return [...replaced];
      });

      const upsertRows = [
        {
          staff_name,
          date,
          is_actual,
          shift_type: newShiftType,
          updated_by: loggedInName,
        }
      ];

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
            return [...replaced];
          });
        }
      } finally {
        setIsSaving(false);
      }
      setEditingShift(null);
    },
    [viewMode, departmentId, allPatterns, canEdit, members, staffProfile?.staff_name]
  );

  const loggedInName = staffProfile?.staff_name;

  const loggedInJob = useMemo(() => {
    return getJobTitleString(staffProfile?.job_title ?? null);
  }, [staffProfile?.job_title]);

  const loggedInPatterns = useMemo(() => {
    if (!staffProfile?.work_patterns || !Array.isArray(staffProfile.work_patterns)) return "";
    const patterns = allPatterns.filter(pt =>
      staffProfile.work_patterns!.includes(pt.id)
    );
    return patterns.map(pt => pt.pattern_name).join(",");
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
          <option key={pt.id} value={pt.pattern_key}>{pt.pattern_name}</option>
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
              ? (allPatterns.find(p => p.pattern_key === shiftValue)?.pattern_name || shiftValue)
              : "-"
          }
        </td>
      );
    },
    [isSaving, handleSave, allPatterns, handleCellEdit, canEdit, isAdmin, viewMode, staffProfile?.job_title, staffProfile?.staff_name, shiftMap]
  );

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
          <table className="border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-[100]">
              <tr className="text-white text-[10px] text-center font-bold">
                <th className="sticky left-0 top-0 z-[110] bg-slate-900 p-3 min-w-[140px] border-b border-r border-slate-700">
                  職員名 / 職種
                </th>
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
                            ? ` (${availablePatterns.map(x => x.pattern_name).join(",")})`
                            : ""}
                        </span>
                      </div>
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                      let mapEntry = shiftMap?.[profile.staff_name]?.[dayStr];
                      let shiftValue = mapEntry?.value ?? "";
                      const editable = (viewMode === "plan") && !!loggedInName && canEdit(profile.id);
                      const isEditing = editingShift && editingShift.staff_name === profile.staff_name && editingShift.date === dayStr;
                      const cellKey = `${profile.staff_name}_${dayStr}`;
                      // セル分けについてはそのまま
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