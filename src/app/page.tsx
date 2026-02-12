"use client";
import React, { useState, useEffect } from 'react';
import { useShiftManager, ViewMode } from './useShiftManager';

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [newStaffName, setNewStaffName] = useState(""); // 追加機能を復活
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCurrentUser(params.get('user'));
  }, []);

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

  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden text-black font-sans">
      {/* 1. ヘッダー：追加機能などを集約 */}
      <div className="flex-none p-4 md:p-6 pb-2">
        <header className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-black text-blue-900 tracking-tight">勤務表 Pro v2</h1>
            <div className="flex gap-2">
              <button onClick={() => setViewMode("plan")} className={`px-4 py-1.5 rounded-lg font-bold text-xs transition ${viewMode === "plan" ? "bg-blue-600 text-white shadow-lg" : "bg-white border"}`}>予定入力</button>
              {!currentUser && (
                <button onClick={() => setViewMode("actual")} className={`px-4 py-1.5 rounded-lg font-bold text-xs transition ${viewMode === "actual" ? "bg-orange-600 text-white shadow-lg" : "bg-white border"}`}>実績確定</button>
              )}
            </div>
          </div>

          {!currentUser && (
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
      <div className="flex-1 overflow-hidden px-2 md:px-6 pb-4">
        <div className="h-full w-full overflow-auto border rounded-xl shadow-2xl bg-white border-separate">
          <table className="border-separate border-spacing-0 min-w-full">
          <thead className="sticky top-0 z-50">
            <tr className="text-white text-[10px] text-center font-bold">
              <th className="sticky left-0 top-0 z-50 bg-slate-900 p-3 min-w-[100px] border-b border-r border-slate-700">職員名</th>
              {days.map(d => {
                const info = getDayInfo(d);
                // その日の各シフトの合計を計算
                const getCount = (type: string) => staffMembers.filter(n => currentData[getShiftKey(n, d)] === type).length;
                
                return (
                  <th key={d} className={`p-1 min-w-[42px] border-b border-r border-slate-700 ${info.headerColor}`}>
                    <div className="mb-1">{d}</div>
                    {/* 合計行の代わりに、ヘッダー内にコンパクトに表示 */}
                    <div className="flex flex-col gap-0.5 text-[7px] leading-tight bg-black/20 rounded py-0.5">
                      {getCount("日") > 0 && <span>日:{getCount("日")}</span>}
                      {getCount("早") > 0 && <span>早:{getCount("早")}</span>}
                      {getCount("遅") > 0 && <span>遅:{getCount("遅")}</span>}
                      {getCount("夜") > 0 && <span>夜:{getCount("夜")}</span>}
                    </div>
                  </th>
                );
              })}
              {shiftTypes.map(t => (
                <th key={t.key} className="p-1 min-w-[32px] bg-slate-900 border-b border-slate-700 text-[8px]">{t.key}</th>
              ))}
            </tr>
          </thead>
            <tbody>
              {staffMembers.map(name => {
                const isDisabled = currentUser !== null && currentUser !== name;
                return (
                  <tr key={name} className="h-11 group">
                    <td className={`sticky left-0 z-40 p-2 border-b border-r border-slate-200 flex items-center justify-between !bg-white font-bold transition ${isDisabled ? "text-slate-300" : "text-slate-800"}`}>
                      <button onClick={() => !isDisabled && removeStaff(name)} className={`text-red-300 hover:text-red-500 transition ${isDisabled ? "invisible" : ""}`}>✕</button>
                      <span className="truncate ml-1">{name}</span>
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      const isHope = currentData[getHopeKey(name, d)] === "true";
                      return (
                        <td key={d} className={`border-r border-b border-slate-100 text-center ${info.bgColor} ${isHope && viewMode === "plan" ? "!bg-yellow-100" : ""}`}>
                          <select 
                            value={currentData[getShiftKey(name, d)] || ""} 
                            disabled={isDisabled}
                            onChange={(e) => saveShift(name, d, e.target.value, viewMode, currentUser !== null)} 
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
            {/* 修正：独立した tfoot を使い、bottom-0 で固定 */}
            <tfoot className="sticky -bottom-[1px] z-50">
              <tr className="bg-slate-900 text-white font-bold h-14 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                <td className="sticky left-0 z-50 !bg-slate-900 p-2 border-r border-slate-700 text-center text-xs uppercase tracking-tighter">
                  合計
                </td>
                {days.map(d => (
                  <td key={d} className="p-1 text-center border-r border-slate-700 !bg-slate-900 min-w-[45px]">
                    {/* 文字を大きく(text-[11px])、行間を詰めて読みやすくしました */}
                    <div className="flex flex-col justify-center items-center h-full gap-0">
                      {[
                        { key: "日", color: "text-white" },
                        { key: "早", color: "text-orange-400" },
                        { key: "遅", color: "text-purple-400" },
                        { key: "夜", color: "text-blue-400" }
                      ].map(t => {
                        const count = staffMembers.filter(n => currentData[getShiftKey(n, d)] === t.key).length;
                        return count > 0 ? (
                          <span key={t.key} className={`${t.color} text-[11px] leading-tight flex items-center gap-0.5`}>
                            {t.key}<span className="text-[10px]">:</span>{count}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </td>
                ))}
                {/* 右端の集計列の下を埋める */}
                {shiftTypes.map(t => (
                  <td key={t.key} className="!bg-slate-900 border-slate-700"></td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}