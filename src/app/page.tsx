"use client";
import React, { useState, useEffect } from 'react';
import { useShiftManager, ViewMode } from './useShiftManager';

export default function Home() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCurrentUser(params.get('user'));
  }, []);

  const {
    staffMembers, shifts, actualShifts, removeStaff, 
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
      bgColor: dayOfWeek === 0 ? "bg-red-50" : dayOfWeek === 6 ? "bg-blue-50" : "bg-white",
      headerColor: dayOfWeek === 0 ? "bg-red-500" : dayOfWeek === 6 ? "bg-blue-500" : "bg-slate-800"
    };
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden text-black font-sans text-[11px]">
      {/* 1. ヘッダー部分 */}
      <div className="flex-none p-4 md:p-6 pb-2">
        {currentUser && (
          <div className="bg-yellow-100 p-2 mb-2 rounded-lg border border-yellow-300 text-center font-bold text-yellow-800 shadow-sm flex justify-center items-center gap-4">
            <span>📱 {currentUser} さんの希望入力</span>
            <button onClick={() => window.location.href = window.location.pathname} className="text-[10px] bg-white px-2 py-1 rounded shadow-sm border border-yellow-400">戻る</button>
          </div>
        )}

        <header className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-900">勤務表システム</h1>
            <div className="flex gap-2">
              <button onClick={() => setViewMode("plan")} className={`px-4 py-1.5 rounded-lg font-bold transition ${viewMode === "plan" ? "bg-blue-600 text-white shadow" : "bg-white border"}`}>予定</button>
              {!currentUser && (
                <button onClick={() => setViewMode("actual")} className={`px-4 py-1.5 rounded-lg font-bold transition ${viewMode === "actual" ? "bg-orange-600 text-white shadow" : "bg-white border"}`}>実績</button>
              )}
            </div>
          </div>

          {!currentUser && (
            <div className="flex flex-wrap justify-between items-center bg-white p-2 rounded-xl shadow-sm border border-slate-200 gap-2">
              <div className="flex gap-2 items-center">
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="font-bold border rounded px-1 py-1 bg-slate-50">
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                </select>
                {viewMode === "plan" && (
                  <button onClick={() => autoGenerate(daysInMonth)} className="bg-blue-500 text-white px-3 py-1 rounded font-bold text-[10px]">自動作成</button>
                )}
                <button onClick={() => resetMonth(viewMode, daysInMonth)} className="bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 text-[10px]">リセット</button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap max-w-[250px]">
                <span className="text-[9px] font-bold text-slate-400">デモ:</span>
                {staffMembers.map(name => (
                  <a key={name} href={`?user=${name}`} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">{name}</a>
                ))}
              </div>
            </div>
          )}
        </header>
      </div>

      {/* 2. テーブルエリア（画面の残りをすべて使う） */}
      <div className="flex-1 overflow-hidden px-2 pb-2">
        <div className="h-full w-full overflow-auto border rounded-lg shadow-sm bg-white relative">
          <table className="border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-50">
              <tr className="text-white text-[10px] text-center font-bold">
                <th className="sticky left-0 top-0 z-50 bg-slate-900 p-3 min-w-[100px] border-b border-r border-slate-700">職員名</th>
                {days.map(d => {
                  const info = getDayInfo(d);
                  return (
                    <th key={d} className={`p-1 min-w-[38px] border-b border-r border-slate-700 ${info.headerColor}`}>
                      <div>{d}</div>
                    </th>
                  );
                })}
                {shiftTypes.map(t => (
                  <th key={t.key} className="p-1 min-w-[32px] bg-slate-900 border-b border-r border-slate-700 text-[8px]">{t.key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffMembers.map(name => {
                const isDisabled = currentUser !== null && currentUser !== name;
                return (
                  <tr key={name} className="h-10">
                    <td className={`sticky left-0 z-40 p-2 border-b border-r border-slate-200 flex items-center justify-between !bg-white font-bold ${isDisabled ? "text-slate-300" : "text-slate-800"}`}>
                      <button onClick={() => !isDisabled && removeStaff(name)} className={`text-red-300 ${isDisabled ? "invisible" : ""}`}>✕</button>
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
                            className="w-full text-center h-8 bg-transparent outline-none appearance-none cursor-pointer"
                          >
                            <option value="">-</option>
                            {shiftTypes.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                          </select>
                        </td>
                      );
                    })}
                    {shiftTypes.map(t => (
                      <td key={t.key} className={`border-b border-r border-slate-100 text-center font-bold bg-slate-50 ${t.color}`}>
                        {days.filter(d => currentData[getShiftKey(name, d)] === t.key).length}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-50">
              <tr className="bg-slate-900 text-white text-[9px] font-bold">
                <td className="sticky left-0 z-50 !bg-slate-900 p-2 border-r border-slate-700 text-center">合計</td>
                {days.map(d => (
                  <td key={d} className="p-1 text-center border-r border-slate-700 !bg-slate-900">
                    {shiftTypes.map(t => {
                      const count = staffMembers.filter(n => currentData[getShiftKey(n, d)] === t.key).length;
                      return count > 0 ? (
                        <div key={t.key} className={t.color}>{t.key}:{count}</div>
                      ) : null;
                    })}
                  </td>
                ))}
                {shiftTypes.map(t => <td key={t.key} className="!bg-slate-900 border-r border-slate-700"></td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}