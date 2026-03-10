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

type ShiftRecord = {
  id: number;
  staff_id: string;
  date: string;
  shift_type: string | null;
  mode: string;
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

// ==== 編集権限ロジック ====
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

export default function Home() {
  // --- 「年」「月」のstate、初期値は2026年2月（既存のまま）
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);

  // 月切り替え補助
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

  // 月ドロップダウン選択用
  const handleMonthSelect = (newMonth: number) => {
    setMonth(newMonth);
  };

  // 年ドロップダウンを追加する時は下記も拡張できる
  // 保持する年の範囲を生成
  const getYearOptions = () => {
    // 通常は±5年くらい
    const center = year;
    const ys: number[] = [];
    for (let d = -2; d <= 2; ++d) {
      ys.push(center + d);
    }
    return ys;
  };

  // --- 既存
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

  // アクセストークンの保持: 月切り替えで消えないようstate依存なし、初回のみ取得
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

  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>([]);
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
      let staffIds = members.map((s) => s.id);
      if (staffIds.length === 0 && staffProfile?.id) {
        staffIds = [staffProfile.id];
      }
      if (staffIds.length === 0) {
        setShiftRecords([]);
        return;
      }
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .in("staff_id", staffIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("mode", viewMode);
      setShiftRecords(!error && data ? (data as ShiftRecord[]) : []);
    };
    // 年または月が変わるたびに自動で動作
    fetchShifts();
  }, [departmentId, viewMode, year, month, members, staffProfile?.id]);

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

  // シフトMap
  const shiftMap: { [staffId: string]: { [date: string]: string | null } } = {};
  shiftRecords.forEach((rec) => {
    if (!shiftMap[rec.staff_id]) shiftMap[rec.staff_id] = {};
    shiftMap[rec.staff_id][rec.date] = rec.shift_type;
  });

  const [editingShift, setEditingShift] = useState<{
    staff_id: string;
    date: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // ========== 権限ロジック: 編集可否判定 ==========
  // 管理者役職: job_title・その中身に「システム管理者」等(サブ文字列一致)であればOK
  const canEdit = useCallback(
    (targetStaffId: string): boolean => {
      if (!staffProfile) return false;
      // 管理者判定: job_titleを文字列化して、"システム管理者"が含まれているかで判定
      const jobTitleString = getJobTitleString(staffProfile.job_title);
      if (typeof jobTitleString === "string" && jobTitleString.includes("システム管理者")) {
        return true;
      }
      // 一般: 自分自身のみ可
      return staffProfile.id === targetStaffId;
    },
    [staffProfile]
  );

  // 編集開始
  const handleCellEdit = useCallback((staff_id: string, date: string) => {
    setEditingShift({
      staff_id,
      date,
    });
  }, []);

  // セル保存
  // Supabase upsert対応: [staff_id, date, mode]でユニーク性
  const handleSave = useCallback(
    async (staff_id: string, date: string, value: string) => {
      if (viewMode !== "plan" || !departmentId) return;

      setIsSaving(true);
      const isValidPatternKey = value === "" || allPatterns.some(pt => pt.pattern_key === value);
      if (!isValidPatternKey) {
        setIsSaving(false);
        setEditingShift(null);
        return;
      }

      const newShiftType = value === "" ? null : value;

      // 楽観的更新
      setShiftRecords(prevRecords => {
        const idx = prevRecords.findIndex(
          s => s.staff_id === staff_id && s.date === date && s.mode === "plan"
        );
        if (idx >= 0) {
          // 上書き
          return prevRecords.map((rec, i) =>
            i === idx ? { ...rec, shift_type: newShiftType } : rec
          );
        } else if (newShiftType !== null) {
          // 新規（idは仮で負数に）
          return [
            ...prevRecords,
            {
              id: Math.floor(Math.random() * -10000000),
              staff_id,
              date,
              shift_type: newShiftType,
              mode: "plan",
            },
          ];
        } else {
          // 空で新規指定時は変化なし（編集UIだけ閉じる）
          return prevRecords;
        }
      });
      setEditingShift(null);

      // 保存: upsert（unique: [staff_id, date, mode] で既存なら更新・無ければinsert）
      const upsertRows = [
        {
          staff_id,
          date,
          shift_type: newShiftType,
          mode: "plan",
        }
      ];
      try {
        const { data, error } = await supabase
          .from("shifts")
          .upsert(upsertRows, { onConflict: "staff_id,date,mode" }) // upsert by keys
          .select();
        if (error) {
          console.error("Shift upsert error:", error);
        } else {
          console.log("Shift upsert success:", data);
          // サーバー応答からid等補正！（idなど確定情報で上書き）
          if (data && Array.isArray(data)) {
            setShiftRecords(prev => {
              // 置換（[staff_id, date, mode]が一致するものをサーバーの値で上書き）
              let replaced = [...prev];
              data.forEach((newRec: ShiftRecord) => {
                const ix = replaced.findIndex(
                  r => r.staff_id === newRec.staff_id &&
                       r.date === newRec.date &&
                       r.mode === newRec.mode
                );
                if (ix >= 0) {
                  replaced[ix] = { ...newRec };
                } else {
                  replaced.push({ ...newRec });
                }
              });
              // またリロード時残ることを目視確認してください！
              return replaced;
            });
          }
        }
      } finally {
        setIsSaving(false);
      }
    },
    [viewMode, departmentId, allPatterns]
  );

  const loggedInName = staffProfile?.staff_name;

  // ===== 修正ここから =====
  // staffProfile?.job_title は undefined の可能性があるが getJobTitleString の引数は string | object | null 型で undefined 非許容
  // undefinedを防ぐには staffProfile?.job_title ?? null を渡す
  const loggedInJob = useMemo(() => {
    return getJobTitleString(staffProfile?.job_title ?? null);
  }, [staffProfile?.job_title]);
  // ===== 修正ここまで =====

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

  // renderCell: 権限対応+UI制限
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
      // 編集可否判定
      const allowEdit = editable && canEdit(profile.id);

      if (isEditing) {
        return (
          <td
            key={cellKey}
            className={`border-r border-b border-slate-100 text-center ${info.bgColor} relative`}
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

      // 権限なし→hover/bg/cursor UI厳密制御
      let cellClassBase =
        "border-r border-b border-slate-100 text-center relative transition";
      if (allowEdit) {
        cellClassBase += " cursor-pointer hover:bg-blue-100";
      } else {
        cellClassBase += " cursor-not-allowed";
      }
      cellClassBase += ` ${info.bgColor}`;

      return (
        <td
          key={cellKey}
          className={cellClassBase}
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            if (allowEdit) handleCellEdit(profile.id, dayStr);
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
    [isSaving, handleSave, allPatterns, handleCellEdit, canEdit]
  );

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
              {members.map((profile) => {
                // 追加: 行の編集権限を判定
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
                  const shiftKey = shiftMap?.[profile.id]?.[dayStr];
                  if (!shiftKey) return;
                  const pat = allPatterns.find(p => p.pattern_key === shiftKey);
                  if (pat) totalHours += pat.work_hours;
                });

                // ここで非編集行にグレーアウト("bg-slate-50", "text-gray-400")を追加
                const trClassName =
                  "h-11" +
                  (!rowCanEdit
                    ? " bg-slate-50 text-gray-400"
                    : "");

                const staffNameTextClass = 'truncate ml-1' + (!rowCanEdit ? ' text-gray-400' : '');
                const jobTitleClass = 'text-[10px] font-normal ml-1' +
                  (rowCanEdit ? ' text-gray-500' : ' text-gray-400');

                return (
                  <tr key={profile.id || profile.staff_name} className={trClassName}>
                    <td className={`sticky left-0 z-[90] p-2 border-b border-r border-slate-200 !bg-white font-bold transition-all text-slate-800 min-w-[140px] w-[140px]${!rowCanEdit ? ' bg-slate-50 text-gray-400' : ''}`}>
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
                      let shiftValue = shiftMap?.[profile.id]?.[dayStr] ?? "";
                      const editable = viewMode === "plan" && !!loggedInName && canEdit(profile.id);
                      const isEditing = editingShift && editingShift.staff_id === profile.id && editingShift.date === dayStr;
                      const cellKey = `${profile.id}_${dayStr}`;
                      // セルのグレーアウト: 行がグレーアウトの場合に、textの色を薄くする（追加するならこの中でclass追加）
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
                    <td className={`border-b border-slate-200 text-center font-bold bg-slate-50 text-[10px]${!rowCanEdit ? ' text-gray-400' : ''}`}>
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
                        const count = members.filter(n => {
                          const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                          return shiftMap?.[n.id]?.[dayStr] === pt.pattern_key;
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