"use client";
import Link from "next/link";
import { useState } from "react";

// スタッフごとの初期データ
const initialStaffs = [
  { id: "1", name: "看護 太郎", rank: "A", position: "師長", nightLimit: 4, weekendLimit: 2, isNightEqual: true, isWeekendEqual: true },
  { id: "2", name: "医療 花子", rank: "B", position: "副主任", nightLimit: 4, weekendLimit: 2, isNightEqual: true, isWeekendEqual: true },
  { id: "3", name: "岡崎 一郎", rank: "C", position: "一般", nightLimit: 5, weekendLimit: 3, isNightEqual: false, isWeekendEqual: false },
];

export default function SettingsPage() {
  const [staffs, setStaffs] = useState(initialStaffs);

  // チェックボックスや入力値が変わった時のハンドラー
  const updateStaff = (id: string, field: string, value: any) => {
    setStaffs(staffs.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen bg-white text-black">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理者設定</h1>
          <p className="text-sm text-gray-600">回数設定：チェックを入れると全体で均等に割り振ります</p>
        </div>
        <Link href="/" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded border border-gray-400 transition shadow-sm">
          ← 勤務表に戻る
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-300 overflow-hidden mb-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-sm">
              <th className="p-4 border-b border-gray-300 font-bold">職員名</th>
              <th className="p-4 border-b border-gray-300 font-bold">ランク/役職</th>
              <th className="p-4 border-b border-gray-300 font-bold text-center">夜勤回数</th>
              <th className="p-4 border-b border-gray-300 font-bold text-center">土日出勤</th>
              <th className="p-4 border-b border-gray-300 font-bold">NGペア</th>
            </tr>
          </thead>
          <tbody>
            {staffs.map((staff) => (
              <tr key={staff.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                <td className="p-4 text-gray-900 font-bold">{staff.name}</td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <span className="text-xs bg-blue-50 px-2 py-1 rounded border border-blue-200">{staff.rank}</span>
                    <span className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200">{staff.position}</span>
                  </div>
                </td>
                
                {/* 夜勤回数設定 */}
                <td className="p-4 border-x border-gray-100">
                  <div className="flex flex-col items-center gap-2">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={staff.isNightEqual} 
                        onChange={(e) => updateStaff(staff.id, "isNightEqual", e.target.checked)}
                      />
                      均等
                    </label>
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        value={staff.nightLimit}
                        onChange={(e) => updateStaff(staff.id, "nightLimit", e.target.value)}
                        disabled={staff.isNightEqual}
                        className={`border rounded p-1 w-14 text-center ${staff.isNightEqual ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-gray-900 border-gray-400'}`}
                      />
                      <span className={`text-xs ${staff.isNightEqual ? 'text-gray-300' : 'text-gray-500'}`}>回</span>
                    </div>
                  </div>
                </td>

                {/* 土日回数設定 */}
                <td className="p-4">
                  <div className="flex flex-col items-center gap-2">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={staff.isWeekendEqual} 
                        onChange={(e) => updateStaff(staff.id, "isWeekendEqual", e.target.checked)}
                      />
                      均等
                    </label>
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        value={staff.weekendLimit}
                        onChange={(e) => updateStaff(staff.id, "weekendLimit", e.target.value)}
                        disabled={staff.isWeekendEqual}
                        className={`border rounded p-1 w-14 text-center ${staff.isWeekendEqual ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-gray-900 border-gray-400'}`}
                      />
                      <span className={`text-xs ${staff.isWeekendEqual ? 'text-gray-300' : 'text-gray-500'}`}>回</span>
                    </div>
                  </div>
                </td>

                <td className="p-4 text-center">
                  <button className="text-xs bg-white text-blue-600 font-bold px-3 py-1 rounded border border-blue-400 hover:bg-blue-50">
                    設定
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-4">
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-10 rounded-lg shadow-xl transition-all">
          設定を保存して反映
        </button>
      </div>
    </div>
  );
}