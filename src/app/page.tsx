"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useShiftManager, ViewMode } from './useShiftManager';
// supabase のクライアントを import（自分のプロジェクトに合わせてください）
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type UserProfile = {
  id: string;
  name: string;
  department_id: number;
};

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [newStaffName, setNewStaffName] = useState(""); // 追加機能を復活
  // アクセストークンを state に持たせる
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);

  // URLパラメータの解析: ?key=... がある場合は access_token として扱う
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    const user = params.get('user'); // fallbackで未対応の人用

    if (key) {
      setAccessToken(key);
    } else if (user) {
      // fallback: 非ログイン制御(userクエリ)
      setCurrentUserProfile({
        id: '',
        name: user,
        department_id: -1,
      });
      setDepartmentId(null);
    }
  }, []);

  // access_tokenがセットされた場合にSupabase認証・プロファイル取得
  useEffect(() => {
    const fetchProfile = async (token: string) => {
      // 認証(userオブジェクト取得)
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        setCurrentUserProfile(null);
        setDepartmentId(null);
        return;
      }

      // profileテーブルなどから名前・部署を取得（usersテーブル前提。異なる場合は適宜修正）
      // 例: users テーブルに name, department_id があると仮定
      const { data: profile, error: pErr } = await supabase
        .from("users")
        .select("id, name, department_id")
        .eq("id", user.id)
        .single();
      if (profile && !pErr) {
        setCurrentUserProfile(profile);
        setDepartmentId(profile.department_id);
      } else {
        setCurrentUserProfile(null);
        setDepartmentId(null);
      }
    };

    if (accessToken) {
      fetchProfile(accessToken);
    }
  }, [accessToken]);

  // useShiftManager から値を取る
  const {
    staffMembers, shifts, actualShifts, addStaff, removeStaff, 
    saveShift, autoGenerate, copyToActual, resetMonth, getShiftKey, getHopeKey
  } = useShiftManager(year, month);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const currentData = viewMode === "plan" ? shifts : actualShifts;

  const shiftTypes = [
    { key: "日", label: "日勤", color: "text-slate-800" },
    { key: "早", label: "早番", color: "text-orange-600" },
    { key: "遅", label: "遅番", color: "text-purple-600" },
    { key: "夜", label: "夜勤", color: "text-blue-700" },
    { key: "明", label: "明け", color: "text-blue-400" },
    { key: "休", label: "休み", color: "text-green-700" },
    { key: "夏", label: "夏休み", color: "text-yellow-700" },
    { key: "冬", label: "冬休み", color: "text-blue-900" },
    { key: "有", label: "有給", color: "text-pink-700" },
  ];

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

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (newStaffName.trim()) {
      addStaff(newStaffName.trim());
      setNewStaffName("");
    }
  };

  // 部署で staffMembers をフィルタ
  // staffMembers 配列を department_id でフィルタリングするロジックが必要。
  // 現状 useShiftManager から配列取得だが、各staffのdepartment_idが必要。
  // 仮のサンプルとして「databaseから職員リスト取得」もやる例

  const [departmentStaffs, setDepartmentStaffs] = useState<string[]>([]);
  // departmentIdが決まったら、そのidのstaffのみ取得
  useEffect(() => {
    const fetchDepartmentStaffs = async () => {
      if (departmentId !== null && departmentId !== undefined && departmentId > 0) {
        // 例: usersテーブルの"department_id"が一致する staff_nameのみ抽出
        const { data, error } = await supabase
          .from("users")
          .select("name")
          .eq("department_id", departmentId);
        if (!error && data) {
          setDepartmentStaffs(data.map((x: { name: string }) => x.name));
        } else {
          setDepartmentStaffs([]);
        }
      } else {
        setDepartmentStaffs([]);
      }
    };
    fetchDepartmentStaffs();
  }, [departmentId]);

  // staffMembers を departmentStaffs で絞る
  const filteredStaffMembers = useMemo(() => {
    // ログインなし→すべて表示
    if (!departmentId || departmentId <= 0) return staffMembers;
    // ログインあり→部署のみ
    return staffMembers.filter(s => departmentStaffs.includes(s));
  }, [staffMembers, departmentStaffs, departmentId]);

  // 画面上で表示するユーザ名
  const loggedInName = currentUserProfile?.name;

  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden text-black font-sans">
      {/* 1. ヘッダー：追加機能などを集約 */}
      <div className="flex-none p-4 md:p-6 pb-2">
        <header className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-black text-blue-900 tracking-tight">勤務表 Pro v2</h1>
            <div className="flex gap-2 items-center">
              {/* ログイン時はログインユーザ名＋部署を表示 */}
              {loggedInName && (
                <span className="text-sm text-blue-700 font-bold mr-2" title={loggedInName}>
                  {loggedInName}さん
                  {departmentId && departmentId > 0 && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      部署{departmentId}
                    </span>
                  )}
                </span>
              )}
              {viewMode === "plan" && (
                <button 
                  onClick={async () => {
                    const success = await copyToActual();
                    if (success) {
                      alert("予定を実績にコピーしました。実績確定画面で確認してください。");
                    }
                  }} 
                  className="bg-green-600 text-white px-2 py-1.5 rounded text-[10px] font-bold shadow-sm"
                >
                  実績反映
                </button>
              )}
              <button onClick={() => setViewMode("plan")} className={`px-4 py-1.5 rounded-lg font-bold text-xs transition ${viewMode === "plan" ? "bg-blue-600 text-white shadow-lg" : "bg-white border"}`}>予定</button>
              {!loggedInName && (
                <button onClick={() => setViewMode("actual")} className={`px-4 py-1.5 rounded-lg font-bold text-xs transition ${viewMode === "actual" ? "bg-orange-600 text-white shadow-lg" : "bg-white border"}`}>実績</button>
              )}
            </div>
          </div>

          {!loggedInName && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
              <div className="flex gap-2 items-center">
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="font-bold border rounded-md p-1.5 bg-slate-50 text-sm">
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                </select>
                <form onSubmit={handleAddStaff} className="flex flex-1 gap-1">
                  <input 
                    type="text" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="職員名..." className="flex-1 border rounded-md px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="submit" className="bg-slate-800 text-white px-3 py-1.5 rounded-md text-xs font-bold shrink-0">追加</button>
                </form>
              </div>
              <div className="flex items-center gap-2 justify-between">
                <div className="flex gap-1 overflow-x-auto pb-1 max-w-[200px]">
                  {staffMembers.map(name => (
                    <a key={name} href={`?user=${name}`} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 shrink-0">{name}</a>
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => autoGenerate(daysInMonth)} className="bg-blue-500 text-white px-2 py-1.5 rounded text-[10px] font-bold">自動</button>
                  <button onClick={() => resetMonth(viewMode, daysInMonth)} className="bg-red-50 text-red-600 px-2 py-1.5 rounded border border-red-100 text-[10px]">消去</button>
                </div>
              </div>
            </div>
          )}
        </header>
      </div>

      {/* 2. テーブルエリア：ここが肝心 */}
      {/* 2. テーブルエリア：ここを「基準」として作り直しました */}
      <div className="flex-1 overflow-hidden px-2 md:px-6 pb-4">
        {/* 親要素に relative を付け、overflow-auto でスクロールの基準を明確にします */}
        <div className="h-full w-full overflow-auto border rounded-xl shadow-2xl bg-white relative border-separate">
          <table className="border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-[100]">
              <tr className="text-white text-[10px] text-center font-bold">
                {/* 1列目ヘッダー：ここも固定必須 */}
                <th className="sticky left-0 top-0 z-[110] bg-slate-900 p-3 min-w-[110px] border-b border-r border-slate-700">
                  職員名
                </th>
                {days.map(d => {
                  const info = getDayInfo(d);
                  return (
                    <th key={d} className={`p-1 min-w-[42px] border-b border-r border-slate-700 ${info.headerColor}`}>
                      <div>{d}</div>
                    </th>
                  );
                })}
                {shiftTypes.map(t => (
                  <th key={t.key} className="p-1 min-w-[32px] bg-slate-900 border-b border-slate-700 text-[8px]">{t.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStaffMembers.map(name => {
                const isDisabled = !!loggedInName && loggedInName !== name;
                return (
                  <tr key={name} className="h-11">
                    {/* 職員名セル：背景色を !bg-white で塗りつぶし、後ろを隠します */}
                    <td className={`sticky left-0 z-[90] p-2 border-b border-r border-slate-200 !bg-white font-bold transition-all ${isDisabled ? "text-slate-300" : "text-slate-800"} min-w-[110px] w-[110px]`}>
                      <div className="flex items-center justify-between">
                        <button 
                          onClick={() => { if (!isDisabled) removeStaff(name); }} 
                          className={`text-red-300 hover:text-red-500 transition-colors shrink-0 ${isDisabled ? "invisible" : ""}`}
                        >✕</button>
                        <span className="truncate ml-1">{name}</span>
                      </div>
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      const isHope = currentData[getHopeKey(name, d)] === "true";
                      return (
                        <td key={d} className={`border-r border-b border-slate-100 text-center ${info.bgColor} ${isHope && viewMode === "plan" ? "!bg-yellow-100" : ""}`}>
                          <select 
                            value={currentData[getShiftKey(name, d)] || ""} 
                            disabled={isDisabled}
                            onChange={(e) => saveShift(name, d, e.target.value, viewMode, !!loggedInName)} 
                            className="w-full text-center h-9 bg-transparent outline-none appearance-none cursor-pointer text-[11px]"
                          >
                            <option value="">-</option>
                            {shiftTypes.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                          </select>
                        </td>
                      );
                    })}
                    {shiftTypes.map(t => (
                      <td key={t.key} className={`border-b border-slate-200 text-center font-bold bg-slate-50 ${t.color} text-[10px]`}>
                        {days.filter(d => currentData[getShiftKey(name, d)] === t.key).length}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {/* 合計行も左端を固定 */}
            <tfoot className="sticky bottom-0 z-[100]">
              <tr className="bg-slate-900 text-white font-bold h-14 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                <td className="sticky left-0 z-[110] !bg-slate-900 p-2 border-r border-slate-700 text-center text-xs uppercase tracking-tighter min-w-[110px]">
                  合計
                </td>
                {days.map(d => (
                  <td key={d} className="p-1 text-center border-r border-slate-700 !bg-slate-900 min-w-[45px]">
                    <div className="flex flex-col justify-center items-center h-full gap-0">
                      {["日", "早", "遅", "夜"].map(type => {
                        const count = filteredStaffMembers.filter(n => currentData[getShiftKey(n, d)] === type).length;
                        return count > 0 ? (
                          <span key={type} className={`text-[11px] leading-tight ${type==="早"?"text-orange-400":type==="遅"?"text-purple-400":type==="夜"?"text-blue-400":"text-white"}`}>
                            {type}:{count}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </td>
                ))}
                {shiftTypes.map(t => <td key={t.key} className="!bg-slate-900 border-slate-700"></td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}