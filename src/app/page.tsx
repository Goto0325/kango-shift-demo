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

      <div className={`bg-white rounded-xl shadow-xl overflow-hidden border-2 ${viewMode === "plan" ? "border-blue-500" : "border-orange-500"}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-white text-[10px] text-center font-bold">
                <th className="p-3 sticky left-0 bg-slate-800 z-20 min-w-[110px] border-b border-slate-700">職員名</th>
                {days.map(d => {
                  const info = getDayInfo(d);
                  return (
                    <th key={d} className={`p-1 min-w-[38px] border-b border-slate-700 ${info.headerColor}`}>
                      <div className="text-[8px] opacity-90">{info.label}</div>
                      <div>{d}</div>
                    </th>
                  );
                })}
                {shiftTypes.map(t => <th key={t.key} className="p-1 min-w-[32px] bg-slate-900 border-b border-slate-800">{t.key}</th>)}
              </tr>
            </thead>
            <tbody>
              {staffMembers.map(name => {
                const isDisabled = currentUser !== null && currentUser !== name;
                return (
                  <tr key={name} className={`hover:bg-slate-50 border-b border-slate-100 h-10 text-[11px] font-bold ${isDisabled ? "opacity-40 bg-slate-100" : ""}`}>
                    <td className="p-2 sticky left-0 bg-white border-r border-slate-200 z-10 flex items-center justify-between">
                      <button onClick={() => !isDisabled && removeStaff(name)} className={`text-red-400 ${isDisabled ? "invisible" : "hover:text-red-600"}`}>✕</button>
                      <span className="truncate ml-1">{name}</span>
                    </td>
                    {days.map(d => {
                      const info = getDayInfo(d);
                      // 予定データの中に「希望フラグ」があるか確認
                      const isHope = currentData[getHopeKey(name, d)] === "true";
                      
                      return (
                        <td 
                          key={d} 
                          className={`border-r border-slate-100 ${info.bgColor} 
                            ${isHope && viewMode === "plan" ? "!bg-yellow-200" : ""} 
                            ${isHope && viewMode === "plan" ? "border-2 border-yellow-400" : ""}`}
                        >
                          <select 
                            value={currentData[getShiftKey(name, d)] || ""} 
                            disabled={isDisabled}
                            onChange={(e) => {
                              // 管理者として入力する場合は希望フラグを立てない、職員モードなら立てる
                              saveShift(name, d, e.target.value, viewMode, currentUser !== null);
                            }} 
                            className="w-full text-center h-10 outline-none appearance-none bg-transparent cursor-pointer font-bold"
                          >
                            <option value="">-</option>
                            {shiftTypes.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                          </select>
                        </td>
                      );
                    })}
                    {shiftTypes.map(t => (
                      <td key={t.key} className={`bg-slate-50 text-center border-l border-slate-200 ${t.color}`}>
                        {days.filter(d => currentData[getShiftKey(name, d)] === t.key).length}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {/* 合計行：0を表示するように修正 */}
            <tfoot className="bg-slate-200 font-bold text-[10px]">
              {shiftTypes.map(type => (
                <tr key={type.key} className="border-t border-slate-300 text-slate-700">
                  <td className="p-2 sticky left-0 bg-slate-200 border-r border-slate-300 text-center">{type.label}</td>
                  {days.map(d => {
                    const info = getDayInfo(d);
                    const count = staffMembers.filter(name => currentData[getShiftKey(name, d)] === type.key).length;
                    return (
                      <td key={d} className={`text-center p-1 border-r border-slate-300 ${info.bgColor} ${count > 0 ? "text-slate-900" : "text-slate-400 opacity-50 font-normal"}`}>
                        {count}
                      </td>
                    );
                  })}
                  {shiftTypes.map(t => <td key={t.key} className="bg-slate-300 border-l border-slate-400"></td>)}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}