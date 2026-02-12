"use client";
import React, { useState, useEffect } from 'react';
import { useShiftManager, ViewMode } from './useShiftManager';

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [newStaffName, setNewStaffName] = useState("");
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
      isSun: dayOfWeek === 0,
      isSat: dayOfWeek === 6,
      bgColor: dayOfWeek === 0 ? "bg-red-50" : dayOfWeek === 6 ? "bg-blue-50" : "bg-white",
      headerColor: dayOfWeek === 0 ? "bg-red-500" : dayOfWeek === 6 ? "bg-blue-500" : "bg-slate-800"
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-black font-sans">
      {currentUser && (
        <div className="bg-yellow-100 p-3 mb-4 rounded-lg border border-yellow-300 text-center font-bold text-yellow-800 shadow-sm flex justify-center items-center gap-4">
          <span>📱 {currentUser} さんの希望入力画面</span>
          <button onClick={() => window.location.href = window.location.pathname} className="text-xs bg-white px-2 py-1 rounded shadow-sm border border-yellow-400">管理者に戻る</button>
        </div>
      )}

      <header className="mb-6 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-blue-900 tracking-tighter">勤務表システム</h1>
            {!currentUser && (
              <button onClick={() => resetMonth(viewMode, daysInMonth)} className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200">全リセット</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setViewMode("plan")} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${viewMode === "plan" ? "bg-blue-600 text-white shadow" : "bg-white border"}`}>予定</button>
            {!currentUser && (
              <button onClick={() => setViewMode("actual")} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${viewMode === "actual" ? "bg-orange-600 text-white shadow" : "bg-white border"}`}>実績</button>
            )}
          </div>
        </div>

        {!currentUser && (
          <div className="flex flex-wrap justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200 gap-4">
            <div className="flex gap-2 items-center">
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="font-bold border rounded p-1 bg-slate-50">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              {viewMode === "plan" && (
                <>
                  <button onClick={() => autoGenerate(daysInMonth)} className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-600">自動作成</button>
                  <button onClick={copyToActual} className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-green-700">実績へ反映</button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400">デモURL:</span>
              <div className="flex gap-1">
                {staffMembers.map(name => (
                  <a key={name} href={`?user=${name}`} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 transition hover:bg-blue-100">{name}</a>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
      <div className="w-screen overflow-hidden px-1">
        
        <div className="overflow-auto border rounded-lg shadow-sm max-h-[75vh]">
          <table className="border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px]">
                <th className="sticky left-0 top-0 z-50 bg-slate-900 p-3 min-w-[100px] border-b border-r border-slate-700">職員名</th>
                {days.map(d => (
                  <th key={d} className="p-2 sticky top-0 z-10 border-b border-r border-slate-700 min-w-[40px] bg-slate-800 text-center">{d}</th>
                ))}
                {shiftTypes.map(t => (
                  <th key={t.key} className="p-1 sticky top-0 z-10 min-w-[32px] bg-slate-900 border-b border-r border-slate-700 text-[8px]">{t.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffMembers.map(name => {
                const isDisabled = currentUser !== null && currentUser !== name;
                return (
                  <tr key={name} className="h-12 text-[11px]">
                    <td className={`sticky left-0 z-40 p-2 border-b border-r border-slate-200 font-bold ${isDisabled ? "bg-slate-100 text-slate-400" : "bg-white text-slate-800"}`}>
                      {name}
                    </td>
                    {days.map(d => (
                      <td key={d} className="border-b border-r border-slate-100 p-0 text-center">
                        <select 
                          value={currentData[getShiftKey(name, d)] || ""} 
                          disabled={isDisabled}
                          onChange={(e) => saveShift(name, d, e.target.value, viewMode, currentUser !== null)}
                          className="w-full h-10 bg-transparent text-center outline-none appearance-none"
                        >
                          <option value="">-</option>
                          {shiftTypes.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                        </select>
                      </td>
                    ))}
                    {/* 右側の合計列を復活 */}
                    {shiftTypes.map(t => (
                      <td key={t.key} className={`border-b border-r border-slate-200 text-center font-bold bg-slate-50 text-[10px] ${t.color}`}>
                        {days.filter(d => currentData[getShiftKey(name, d)] === t.key).length}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {/* 合計行 */}
            <tfoot className="sticky bottom-0 z-30 bg-slate-900 text-white text-[9px]">
              <tr>
                <td className="sticky left-0 z-50 bg-slate-900 p-2 border-r border-slate-700 font-bold text-center">合計</td>
                {days.map(d => (
                  <td key={d} className="p-1 text-center border-r border-slate-700">
                    {shiftTypes.map(t => {
                      const count = staffMembers.filter(n => currentData[getShiftKey(n, d)] === t.key).length;
                      return count > 0 ? <div key={t.key} className={t.color}>{t.key}:{count}</div> : null;
                    })}
                  </td>
                ))}
                <td colSpan={shiftTypes.length} className="bg-slate-800 border-l border-slate-700"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}