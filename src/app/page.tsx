"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 型定義修正
type StaffMasterProfile = {
  id: string;
  staff_name: string;
  access_token: string;
  job_title: string | object | null;
  department_id: number | string | null;
  work_patterns: number[] | null; // 修正: number[] | null
  paid_leave_remaining: number | null;
};

type ShiftRecord = {
  id: number;
  staff_id: string;
  date: string;
  shift_type: string | null; // pattern_key が入る
  mode: string;
};

type ShiftPattern = {
  id: number; // INTEGER
  pattern_name: string;
  pattern_key: string;
  work_hours: number;
};

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);

  // ログイン/自身のプロファイル
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffMasterProfile | null>(null);
  const [departmentId, setDepartmentId] = useState<number | string | null>(null);

  // メンバ一覧
  const [members, setMembers] = useState<StaffMasterProfile[]>([]);

  // パターン: allPatterns = shift_patternsから全件を保持
  const [allPatterns, setAllPatterns] = useState<ShiftPattern[]>([]);

  // shift_patterns マスタ 一度だけ取得
  useEffect(() => {
    const fetchShiftPatterns = async () => {
      const { data, error } = await supabase
        .from("shift_patterns")
        .select("*")
        .order("id", { ascending: true });
      if (!error && Array.isArray(data)) {
        setAllPatterns(
          data.map((row: any) => ({
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
      setStaffProfile({
        ...data,
        work_patterns: safeParseIntArray(data.work_patterns),
      });
      setDepartmentId(data.department_id ?? null);
    };
    if (accessToken) {
      fetchStaffMaster(accessToken);
    } else {
      setStaffProfile(null);
      setDepartmentId(null);
    }
    // eslint-disable-next-line
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
          let membersArr = [...data].map((row: any) => ({
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
    // eslint-disable-next-line
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
    // eslint-disable-next-line
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

  // 編集シフト選択状態
  const [editingShift, setEditingShift] = useState<{
    staff_id: string;
    date: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // 「編集」開始（セルをクリックで編集状態に）
  const handleCellEdit = (staff_id: string, date: string) => {
    setEditingShift({
      staff_id,
      date,
    });
  };

  // セル保存: 選択を確定したときのみ handleSave を走らせ、保存・表示更新・計算まで統合
  const handleSave = async (staff_id: string, date: string, value: string) => {
    // 安全: planのみ、departmentIdありのみ
    if (viewMode !== "plan" || !departmentId) return;
    setIsSaving(true);

    // ↓ pattern_key チェック
    const isValidPatternKey =
      value === "" || allPatterns.some(pt => pt.pattern_key === value);
    if (!isValidPatternKey) {
      setIsSaving(false);
      setEditingShift(null);
      return;
    }

    try {
      let changedRecords: ShiftRecord[] = [...shiftRecords];
      const idx = changedRecords.findIndex(
        s => s.staff_id === staff_id && s.date === date && s.mode === "plan"
      );
      if (idx >= 0) {
        // 既存: update
        const { data, error } = await supabase
          .from("shifts")
          .update({ shift_type: value === "" ? null : value })
          .eq("id", changedRecords[idx].id)
          .single();
        if (!error && data) {
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
      // 保存＆編集解除
      setShiftRecords(changedRecords);
      setEditingShift(null);
      // isSavingは finally
    } catch {
      setEditingShift(null);
    }
    setIsSaving(false);
  };

  // 外部クリックで編集解除（選択UIでは出さないのでほぼ不要）
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

  // パターン名の文字列化（右上表示用）
  const loggedInPatterns = useMemo(() => {
    if (!staffProfile?.work_patterns || !Array.isArray(staffProfile.work_patterns)) return "";
    const patterns = allPatterns.filter(pt =>
      staffProfile.work_patterns!.includes(pt.id)
    );
    return patterns.map(pt => pt.pattern_name).join(",");
  }, [staffProfile?.work_patterns, allPatterns]);

  const paidLeave = staffProfile?.paid_leave_remaining;

  // work_patternsが配列で返らない場合用 セーフパース
  function safeParseIntArray(wp: any): number[] | null {
    if (!wp) return null;
    if (Array.isArray(wp)) {
      return wp.map(Number).filter(v => !isNaN(v));
    }
    if (typeof wp === "string") {
      // パターン: '{1,2,3}'、'[1,2,3]'、"1,2,3"
      if (wp.startsWith('{') && wp.endsWith('}')) {
        // '{1,2,3}'
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
      // カンマ区切り: "1,2,3"
      if (wp.includes(',')) {
        return wp
          .split(',')
          .map(s => Number(s.trim()))
          .filter(v => !isNaN(v));
      }
      // 数値1つだけ
      if (!isNaN(Number(wp))) {
        return [Number(wp)];
      }
    }
    return null;
  }

  // パターン絞り込み: 各ユーザごとに使える勤務パターンを返す
  function getAvailablePatterns(profile: StaffMasterProfile): ShiftPattern[] {
    const ids = profile?.work_patterns;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
    return allPatterns.filter(pt => ids.includes(pt.id));
  }

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

                // 勤務パターン - 指定ID一覧のみ
                const availablePatterns = getAvailablePatterns(profile);

                // 合計勤務時間
                let totalHours = 0;

                // 右端合計用: 各日ごとの pattern_key で合算
                days.forEach(d => {
                  const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                  const shiftKey = shiftMap?.[profile.id]?.[dayStr];
                  if (!shiftKey) return;
                  const pat = allPatterns.find(p => p.pattern_key === shiftKey);
                  if (pat) totalHours += pat.work_hours;
                });

                return (
                  <tr key={profile.id || profile.staff_name} className="h-11">
                    <td className={`sticky left-0 z-[90] p-2 border-b border-r border-slate-200 !bg-white font-bold transition-all text-slate-800 min-w-[140px] w-[140px]`}>
                      <div className="flex flex-col">
                        <span className="truncate ml-1">{profile.staff_name}</span>
                        <span className="text-[10px] text-gray-500 font-normal ml-1">
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
                              // onChange：プルダウンの選択を確定・保存できる形に修正
                              onChange={async (e) => {
                                const v = e.target.value;
                                // 保存する値が pattern_key であることを確認し、保存
                                await handleSave(profile.id, dayStr, v);
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{ minWidth: 80 }}
                            >
                              <option value="">-</option>
                              {availablePatterns.map(pt => (
                                <option key={pt.id} value={pt.pattern_key}>{pt.pattern_name}</option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      // 編集モードのトリガー: セルクリックで必ず編集状態になる
                      return (
                        <td
                          key={d}
                          className={`border-r border-b border-slate-100 text-center cursor-pointer ${info.bgColor} transition hover:bg-blue-100 relative`}
                          tabIndex={0}
                          onClick={e => {
                            e.stopPropagation();
                            if (editable) handleCellEdit(profile.id, dayStr);
                          }}
                        >
                          {
                            shiftValue
                              ? (allPatterns.find(p => p.pattern_key === shiftValue)?.pattern_name || shiftValue)
                              : "-"
                          }
                        </td>
                      );
                    })}
                    {/* 合計欄：合計勤務時間 */}
                    <td className="border-b border-slate-200 text-center font-bold bg-slate-50 text-[10px]">
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
                      {/* パターンキー x 人の合計数を表示。必要なら勤務時間合計なども可 */}
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