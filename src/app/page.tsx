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
  job_title: string | null;
  department_id: number | null;
  work_patterns: string | null;
  paid_leave_remaining: number | null;
};

type ShiftRecord = {
  id: number;
  staff_id: string; // staff_master.id
  date: string; // e.g. '2026-02-01'
  shift_type: string | null;
  mode: string; // 'plan' or 'actual'
};

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);

  // パラメータ取得とログイン者確認
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffMasterProfile | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);

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
        .single();
      if (error || !data) {
        setStaffProfile(null);
        setDepartmentId(null);
        return;
      }
      setStaffProfile(data);
      setDepartmentId(data.department_id ?? null);
    };
    if (accessToken) {
      fetchStaffMaster(accessToken);
    } else {
      setStaffProfile(null);
      setDepartmentId(null);
    }
  }, [accessToken]);

  // 部署内全職員取得
  const [departmentStaffProfiles, setDepartmentStaffProfiles] = useState<StaffMasterProfile[]>([]);
  useEffect(() => {
    const fetchDepartmentStaffProfiles = async () => {
      if (departmentId && departmentId > 0) {
        const { data, error } = await supabase
          .from("staff_master")
          .select("*")
          .eq("department_id", departmentId)
          .order("staff_name", { ascending: true });
        setDepartmentStaffProfiles(!error && data ? data : []);
      } else {
        setDepartmentStaffProfiles([]);
      }
    };
    fetchDepartmentStaffProfiles();
  }, [departmentId]);

  // シフト実績取得（ログインしていれば部署全員分を取得する）
  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>([]);
  const [viewMode, setViewMode] = useState<'plan' | 'actual'>("plan");
  useEffect(() => {
    const fetchShifts = async () => {
      if (!departmentId || departmentId <= 0) {
        setShiftRecords([]);
        return;
      }
      // 該当月の日付範囲を作成
      const d1 = new Date(year, month - 1, 1);
      const d2 = new Date(year, month, 0);
      const startDate = d1.toISOString().slice(0, 10);
      const endDate = d2.toISOString().slice(0, 10);

      // 対象staff_idだけを抽出
      const staffIds = departmentStaffProfiles.map((s) => s.id);
      if (staffIds.length === 0) {
        setShiftRecords([]);
        return;
      }

      // supabaseクエリ
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
    // departmentStaffProfiles を依存に含めると staffIdリストをさらに早く反映
  }, [departmentId, viewMode, year, month, departmentStaffProfiles]);

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

  // シフト表示テーブルを部署モードのみ（ログイン時のみ）に限定
  const displayStaffProfiles = useMemo(() => {
    if (departmentId && departmentId > 0) {
      return departmentStaffProfiles;
    }
    // 未ログイン時は空配列表示
    return [];
  }, [departmentId, departmentStaffProfiles]);

  // シフトデータへ高速アクセス用Map（staff_id->date->shift_type）
  const shiftMap: { [staffId: string]: { [date: string]: string | null } } = {};
  shiftRecords.forEach((rec) => {
    if (!shiftMap[rec.staff_id]) shiftMap[rec.staff_id] = {};
    shiftMap[rec.staff_id][rec.date] = rec.shift_type;
  });

  // シフトタイプ選択state
  // 各セルごとに入力値を管理（staff_id, date => 選択値）. 編集時以外はCRUDしない
  const [editingShift, setEditingShift] = useState<{
    staff_id: string;
    date: string;
    shift_type: string | null;
  } | null>(null);

  // 編集中の値(選択)
  const [editValue, setEditValue] = useState<string | null>(null);
  // 編集セル用保存中フラグ
  const [isSaving, setIsSaving] = useState(false);

  // 編集開始
  const handleCellEdit = (staff_id: string, date: string, current: string | null) => {
    setEditingShift({
      staff_id,
      date,
      shift_type: current,
    });
    setEditValue(current);
  };

  // 編集確定
  const saveShift = async () => {
    if (
      !editingShift ||
      viewMode !== "plan" || // 編集は予定モードのみ
      !departmentId ||
      !editValue // 必須
    ) return;
    setIsSaving(true);
    try {
      // 既存レコード判定
      const existing = shiftRecords.find(
        s => s.staff_id === editingShift.staff_id && s.date === editingShift.date && s.mode === "plan"
      );
      let result;
      if (existing) {
        // update
        const { data, error } = await supabase
          .from("shifts")
          .update({ shift_type: editValue })
          .eq("id", existing.id)
          .single();
        if (!error && data) {
          result = data;
        }
      } else {
        // insert
        const { data, error } = await supabase
          .from("shifts")
          .insert([
            {
              staff_id: editingShift.staff_id,
              date: editingShift.date,
              shift_type: editValue,
              mode: "plan",
            }
          ])
          .single();
        if (!error && data) {
          result = data;
        }
      }
      // 正常時：再取得
      setEditingShift(null);
      setEditValue(null);
      // saveが終わったあと全体再ロード
      const d1 = new Date(year, month - 1, 1);
      const d2 = new Date(year, month, 0);
      const startDate = d1.toISOString().slice(0, 10);
      const endDate = d2.toISOString().slice(0, 10);
      const staffIds = departmentStaffProfiles.map((s) => s.id);
      const { data: refreshed, error: refError } = await supabase
        .from("shifts")
        .select("*")
        .in("staff_id", staffIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("mode", viewMode);
      setShiftRecords(!refError && refreshed ? refreshed : []);
    } catch {
      // エラー時は何もしない
    }
    setIsSaving(false);
  };

  // 他箇所クリックでキャンセル
  const handleCancel = () => {
    setEditingShift(null);
    setEditValue(null);
  };

  // 画面外クリック等で編集キャンセル
  useEffect(() => {
    if (!editingShift) return;
    const handler = (e: MouseEvent) => {
      // 編集要素内の場合は消さない（target.classList.contains）
      // ここでは楽なので全キャンセル
      setEditingShift(null);
      setEditValue(null);
    };
    window.addEventListener("click", handler, { capture: true });
    return () => window.removeEventListener("click", handler, { capture: true });
    // eslint-disable-next-line
  }, [editingShift]);

  // ログイン情報（右上）
  const loggedInName = staffProfile?.staff_name;
  // 職種解釈
  const loggedInJob = React.useMemo(() => {
    if (!staffProfile?.job_title) return "";
    try {
      const parsed = JSON.parse(staffProfile.job_title);
      if (parsed && (parsed.name || parsed.label)) {
        return parsed.name || parsed.label;
      }
    } catch {
      return staffProfile.job_title;
    }
    return staffProfile.job_title;
  }, [staffProfile?.job_title]);
  // パターン解釈：JSON配列を正しく解釈し、[object Object]の回避
  const loggedInPatterns = React.useMemo(() => {
    if (!staffProfile?.work_patterns) return "";
    try {
      const parsed = JSON.parse(staffProfile.work_patterns);
      if (Array.isArray(parsed)) {
        return parsed.map((x: any) => x?.name || x?.label).filter(Boolean).join(",");
      }
      if (parsed && (parsed.name || parsed.label)) {
        return parsed.name || parsed.label;
      }
    } catch {
      return staffProfile.work_patterns;
    }
    return staffProfile.work_patterns;
  }, [staffProfile?.work_patterns]);
  const paidLeave = staffProfile?.paid_leave_remaining;

  // 画面
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
                    {staffProfile?.department_id && staffProfile.department_id > 0 && (
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
                {/* 選択シフトタイプ欄は省略、work_patternsで */}
                <th className="p-1 min-w-[32px] bg-slate-900 border-b border-slate-700 text-[8px]">合計</th>
              </tr>
            </thead>
            <tbody>
              {displayStaffProfiles.map((profile) => {
                // 職種パース
                let jobTitle = "";
                if (profile.job_title) {
                  try {
                    const parsed = JSON.parse(profile.job_title);
                    jobTitle = parsed?.name || parsed?.label || String(profile.job_title);
                  } catch {
                    jobTitle = String(profile.job_title);
                  }
                }
                // パターン（work_patterns）はJSON配列
                let patterns: { key: string, name: string }[] = [];
                if (profile.work_patterns) {
                  try {
                    const parsed = JSON.parse(profile.work_patterns);
                    if (Array.isArray(parsed)) {
                      patterns = parsed
                        .map((x: any) => ({
                          key: (x?.key || x?.name || x?.label || '').toString(),
                          name: (x?.name || x?.label || x?.key || '').toString()
                        }))
                        .filter(x => x.key && x.name);
                    } else if (parsed && (parsed.name || parsed.label || parsed.key)) {
                      patterns = [{
                        key: (parsed.key || parsed.name || parsed.label).toString(),
                        name: (parsed.name || parsed.label || parsed.key).toString()
                      }];
                    }
                  } catch {
                    patterns = [];
                  }
                }

                return (
                  <tr key={profile.id || profile.staff_name} className="h-11">
                    <td className={`sticky left-0 z-[90] p-2 border-b border-r border-slate-200 !bg-white font-bold transition-all text-slate-800 min-w-[140px] w-[140px]`}>
                      <div className="flex flex-col">
                        <span className="truncate ml-1">{profile.staff_name}</span>
                        <span className="text-[10px] text-gray-500 font-normal ml-1">
                          {jobTitle}
                          {patterns.length > 0
                            ? ` (${patterns.map(x => x.name).join(",")})`
                            : ""}
                        </span>
                      </div>
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      // YYYY-MM-DD
                      const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                      let shiftValue = shiftMap?.[profile.id]?.[dayStr] ?? "";
                      // 編集可否: いまは予定モード && ログイン中のみ
                      const editable = viewMode === "plan" && !!loggedInName;

                      if (
                        editingShift &&
                        editingShift.staff_id === profile.id &&
                        editingShift.date === dayStr
                      ) {
                        // 編集セルを表示（勤務パターンのselect）
                        return (
                          <td
                            key={d}
                            className={`border-r border-b border-slate-100 text-center ${info.bgColor} relative`}
                          >
                            <form
                              onSubmit={e => {
                                e.preventDefault();
                                saveShift();
                              }}
                              className="flex items-center w-full h-full"
                              style={{ minWidth: 80 }}
                            >
                              <select
                                className="border px-2 py-1 rounded bg-white text-xs w-full"
                                value={editValue || ""}
                                autoFocus
                                disabled={isSaving}
                                onChange={e => setEditValue(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onBlur={saveShift}
                                style={{ minWidth: 50 }}
                              >
                                <option value="">-</option>
                                {patterns.map(pt => (
                                  <option key={pt.key} value={pt.key}>
                                    {pt.name}
                                  </option>
                                ))}
                              </select>
                              {isSaving && (
                                <span className="ml-2 text-xs text-blue-500 animate-pulse">保存中...</span>
                              )}
                            </form>
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
                          {shiftValue ? shiftValue : "-"}
                        </td>
                      );
                    })}
                    {/* 合計欄：既存勤務パターン毎の合計 */}
                    <td className="border-b border-slate-200 text-center font-bold bg-slate-50 text-[10px]">
                      {patterns.map(t => {
                        const count = days.filter(d => {
                          const dayStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
                          return shiftMap?.[profile.id]?.[dayStr] === t.key;
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
                      {/* 各職員の勤務種類を合算する。 ここは代表的なものだけ。 */}
                      {["日", "早", "遅", "夜"].map(type => {
                        const count = displayStaffProfiles.filter(n => {
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
                {/* 合計欄ダミー */}
                <td className="!bg-slate-900 border-slate-700"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}