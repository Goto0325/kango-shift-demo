"use client";
import React, { useState, useEffect, useMemo } from 'react';
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
  work_patterns: string | object | any[] | null;
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
  id: string;
  key: string;
  name: string;
};

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);

  // ログイン/自身のプロファイル
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffMasterProfile | null>(null);
  const [departmentId, setDepartmentId] = useState<number | string | null>(null);

  // メンバ一覧（表示の基礎とする）
  const [members, setMembers] = useState<StaffMasterProfile[]>([]);

  // 勤務パターン・マスタ
  const [shiftPatterns, setShiftPatterns] = useState<ShiftPattern[]>([]);

  // shift_patternsマスタ 一度だけ取得
  useEffect(() => {
    const fetchShiftPatterns = async () => {
      const { data, error } = await supabase
        .from("shift_patterns")
        .select("id,key,name");
      if (!error && Array.isArray(data)) {
        setShiftPatterns(data as ShiftPattern[]);
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
    // ログインユーザー認証・情報取得
    const fetchStaffMaster = async (token: string) => {
      const { data, error } = await supabase
        .from("staff_master")
        .select("*")
        .eq("access_token", token)
        .single();
      if (error || !data) {
        setStaffProfile(null);
        setDepartmentId(null);
        return;
      }
      setStaffProfile(data as StaffMasterProfile);
      setDepartmentId(data.department_id ?? null);
    };
    if (accessToken) {
      fetchStaffMaster(accessToken);
    } else {
      setStaffProfile(null);
      setDepartmentId(null);
    }
  }, [accessToken]);

  // 部署内全職員データ取得＋自分の行1行目ルール
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
          let membersArr = [...data];
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

  // シフト実績取得
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

      setShiftRecords(!error && data ? data : []);
    };
    fetchShifts();
  }, [departmentId, viewMode, year, month, members, staffProfile?.id]);

  // 日付配列
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

  // シフトタイプ選択state
  const [editingShift, setEditingShift] = useState<{
    staff_id: string;
    date: string;
    shift_type: string | null;
  } | null>(null);

  // 編集セル用保存中フラグ
  const [isSaving, setIsSaving] = useState(false);

  // 編集開始
  const handleCellEdit = (staff_id: string, date: string, current: string | null) => {
    setEditingShift({
      staff_id,
      date,
      shift_type: current,
    });
  };

  // セル保存（onChange発火専用：即保存 & 描画即反映）
  const saveShiftInstant = async (staff_id: string, date: string, value: string) => {
    if (
      viewMode !== "plan" ||
      !departmentId
    ) return;
    setIsSaving(true);
    try {
      // UI先に更新
      setEditingShift(null);

      let changedRecords = [...shiftRecords];
      const idx = changedRecords.findIndex(
        s => s.staff_id === staff_id && s.date === date && s.mode === "plan"
      );
      let result;
      // 空文字はnull保存
      if (idx >= 0) {
        // 既存: update
        const { data, error } = await supabase
          .from("shifts")
          .update({ shift_type: value === "" ? null : value })
          .eq("id", changedRecords[idx].id)
          .single();
        if (!error && data) {
          // Recordのstate即時更新
          changedRecords[idx] = { ...changedRecords[idx], shift_type: value === "" ? null : value };
        }
      } else if (value !== "") {
        // 新規: insert
        const { data, error } = await supabase
          .from("shifts")
          .insert([
            {
              staff_id: staff_id,
              date: date,
              shift_type: value,
              mode: "plan",
            }
          ])
          .single();
        if (!error && data) {
          changedRecords.push(data);
        }
      }
      setShiftRecords(changedRecords);
    } catch {}
    setIsSaving(false);
  };

  // 外部クリックで編集解除もOK（ただ選択UIでは出さないのでほぼ不要）
  useEffect(() => {
    if (!editingShift) return;
    const handler = (e: MouseEvent) => {
      setEditingShift(null);
    };
    window.addEventListener("click", handler, { capture: true });
    return () => window.removeEventListener("click", handler, { capture: true });
  }, [editingShift]);

  // ログイン情報（右上）
  const loggedInName = staffProfile?.staff_name;

  // 職種解釈（型の柔軟性確保）
  const loggedInJob = useMemo(() => {
    if (!staffProfile?.job_title) return "";
    if (typeof staffProfile.job_title === "string") {
      try {
        const parsed = JSON.parse(staffProfile.job_title);
        if (parsed && typeof parsed === "object" && (parsed.name || parsed.label)) {
          return parsed.name || parsed.label;
        }
      } catch {
        return staffProfile.job_title;
      }
      return staffProfile.job_title;
    }
    if (typeof staffProfile.job_title === "object" && staffProfile.job_title !== null) {
      if ((staffProfile.job_title as any).name) {
        return (staffProfile.job_title as any).name;
      }
      if ((staffProfile.job_title as any).label) {
        return (staffProfile.job_title as any).label;
      }
      return JSON.stringify(staffProfile.job_title);
    }
    return String(staffProfile.job_title);
  }, [staffProfile?.job_title]);

  // パターン解釈: 配列から name だけjoinして画面右上 [object Object] を防ぐ
  const loggedInPatterns = useMemo(() => {
    if (!staffProfile?.work_patterns) return "";
    if (typeof staffProfile.work_patterns === "string") {
      try {
        const parsed = JSON.parse(staffProfile.work_patterns);
        if (Array.isArray(parsed)) {
          return parsed.map((x: any) => x?.name || x?.label || x?.key).filter(Boolean).join(",");
        }
        if (parsed && typeof parsed === "object" && (parsed.name || parsed.label || parsed.key)) {
          return parsed.name || parsed.label || parsed.key;
        }
      } catch {
        return staffProfile.work_patterns;
      }
      return "";
    }
    if (Array.isArray(staffProfile.work_patterns)) {
      return staffProfile.work_patterns
        .map((x: any) => x?.name || x?.label || x?.key).filter(Boolean).join(",");
    }
    if (
      typeof staffProfile.work_patterns === "object" &&
      staffProfile.work_patterns !== null &&
      ((staffProfile.work_patterns as any).name || (staffProfile.work_patterns as any).label || (staffProfile.work_patterns as any).key)
    ) {
      return (
        (staffProfile.work_patterns as any).name ||
        (staffProfile.work_patterns as any).label ||
        (staffProfile.work_patterns as any).key
      );
    }
    return "";
  }, [staffProfile?.work_patterns]);

  const paidLeave = staffProfile?.paid_leave_remaining;

  // デバッグ
  useEffect(() => {
    if (members.length === 0) {
      // console.error("エラー: 表示する職員データが0件です。");
    } else {
      // console.log("表示する職員:", members);
    }
  }, [members]);

  // ユーザごとに使えるパターン（shift_patternsからwork_patterns.uuid参照でfilter）
  const getAvailablePatterns = (
    profile: StaffMasterProfile
  ): ShiftPattern[] => {
    let patternKeysOrUuids: string[] = [];
    if (profile?.work_patterns) {
      if (typeof profile.work_patterns === "string") {
        try {
          const parsed = JSON.parse(profile.work_patterns);
          if (Array.isArray(parsed)) {
            patternKeysOrUuids = parsed.map((x: any) => x?.key || x?.id || x).filter(Boolean);
          } else if (parsed && typeof parsed === "object") {
            if (parsed.key) patternKeysOrUuids = [parsed.key];
            else if (parsed.id) patternKeysOrUuids = [parsed.id];
          }
        } catch {
          patternKeysOrUuids = [];
        }
      } else if (Array.isArray(profile.work_patterns)) {
        patternKeysOrUuids = (profile.work_patterns as any[])
          .map((x: any) => x?.key || x?.id || x)
          .filter(Boolean);
      } else if (
        typeof profile.work_patterns === "object" &&
        profile.work_patterns !== null
      ) {
        if ((profile.work_patterns as any).key)
          patternKeysOrUuids = [(profile.work_patterns as any).key];
        else if ((profile.work_patterns as any).id)
          patternKeysOrUuids = [(profile.work_patterns as any).id];
      }
    }

    // IDかkey一致で抽出
    return shiftPatterns.filter(
      (sp) =>
        patternKeysOrUuids.some(
          (key) =>
            sp.key === key ||
            sp.id === key
        )
    );
  };

  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden text-black font-sans">
      {/* 1. ヘッダー */}
      <div className="flex-none p-4 md:p-6 pb-2">
        <header className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-black text-blue-900 tracking-tight">勤務表 Pro v2</h1>
            <div className="flex gap-2 items-center">
              {/* ログイン表示 */}
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

      {/* 2. テーブル本体 */}
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
                // 職種パース
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

                // 勤務パターン - shift_patterns x work_patterns(uuid or key or id)
                const availablePatterns = getAvailablePatterns(profile);

                return (
                  <tr key={profile.id || profile.staff_name} className="h-11">
                    <td className={`sticky left-0 z-[90] p-2 border-b border-r border-slate-200 !bg-white font-bold transition-all text-slate-800 min-w-[140px] w-[140px]`}>
                      <div className="flex flex-col">
                        <span className="truncate ml-1">{profile.staff_name}</span>
                        <span className="text-[10px] text-gray-500 font-normal ml-1">
                          {jobTitle}
                          {availablePatterns.length > 0
                            ? ` (${availablePatterns.map(x => x.name).join(",")})`
                            : ""}
                        </span>
                      </div>
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                      let shiftValue = shiftMap?.[profile.id]?.[dayStr] ?? "";
                      const editable = viewMode === "plan" && !!loggedInName;
                      const isEditing = editingShift && editingShift.staff_id === profile.id && editingShift.date === dayStr;

                      if (isEditing) {
                        return (
                          <td
                            key={d}
                            className={`border-r border-b border-slate-100 text-center ${info.bgColor} relative`}
                          >
                            <select
                              className="border px-2 py-1 rounded bg-white text-xs w-full"
                              value={shiftValue || ""}
                              autoFocus
                              disabled={isSaving}
                              onChange={async (e) => {
                                const v = e.target.value;
                                await saveShiftInstant(profile.id, dayStr, v);
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{ minWidth: 80 }}
                            >
                              <option value="">-</option>
                              {availablePatterns.map(pt => (
                                <option key={pt.key} value={pt.key}>
                                  {pt.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={d}
                          className={`border-r border-b border-slate-100 text-center cursor-pointer ${info.bgColor} transition hover:bg-blue-100 relative`}
                          tabIndex={0}
                          onClick={e => {
                            e.stopPropagation();
                            if (editable) handleCellEdit(profile.id, dayStr, shiftValue);
                          }}
                        >
                          {/* 表示最適化：登録があれば名称、なければ "-" */}
                          {
                            shiftValue
                              ? (availablePatterns.find(p => p.key === shiftValue || p.id === shiftValue)?.name || shiftValue)
                              : "-"
                          }
                        </td>
                      );
                    })}
                    {/* 合計欄：既存勤務パターン毎の合計 */}
                    <td className="border-b border-slate-200 text-center font-bold bg-slate-50 text-[10px]">
                      {availablePatterns.map(t => {
                        const count = days.filter(d => {
                          const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                          return shiftMap?.[profile.id]?.[dayStr] === t.key || shiftMap?.[profile.id]?.[dayStr] === t.id;
                        }).length;
                        return (
                          <span key={t.key} className="ml-1">
                            {t.key}:{count}&nbsp;
                          </span>
                        );
                      })}
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
                      {/* 合計は代表パターン種別名でサマリーされるべきだが、ここは例のまま */}
                      {["日", "早", "遅", "夜"].map(type => {
                        const count = members.filter(n => {
                          const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                          return shiftMap?.[n.id]?.[dayStr] === type;
                        }).length;
                        return count > 0 ? (
                          <span key={type} className={`text-[11px] leading-tight ${type === "早" ? "text-orange-400" : type === "遅" ? "text-purple-400" : type === "夜" ? "text-blue-400" : "text-white"}`}>
                            {type}:{count}
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