"use client";
import Link from "next/link";
import { useState } from "react";

const initialStaffs = [
  { id: "1", name: "看護 太郎", rank: "A", position: "師長", nightLimit: 4, weekendLimit: 2 },
  { id: "2", name: "医療 花子", rank: "B", position: "副主任", nightLimit: 4, weekendLimit: 2 },
  { id: "3", name: "岡崎 一郎", rank: "C", position: "一般", nightLimit: 5, weekendLimit: 3 },
];

export default function SettingsPage() {
  const [staffs] = useState(initialStaffs);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen bg-white text-black">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理者設定</h1>
          <p className="text-sm text-gray-600">職員の属性と勤務回数の上限を設定します</p>
        </div>
        <Link href="/" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded border border-gray-400 transition shadow-sm">
          ← 勤務表に戻る
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-300 overflow-hidden mb-8">
        <div className="p-4 border-b bg-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-800">👥 職員別・詳細ルール設定</h2>
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-200">
            ※ 回数は月間の上限目安
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-700 text-sm">
                <th className="p-4 border-b border-gray-300 font-bold">職員名</th>
                <th className="p-4 border-b border-gray-300 font-bold">ランク</th>
                <th className="p-4 border-b border-gray-300 font-bold">役職</th>
                <th className="p-4 border-b border-gray-300 font-bold w-24">夜勤上限</th>
                <th className="p-4 border-b border-gray-300 font-bold w-24">土日出勤</th>
                <th className="p-4 border-b border-gray-300 font-bold">NGペア</th>
              </tr>
            </thead>
            <tbody>
              {staffs.map((staff) => (
                <tr key={staff.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 text-gray-900 font-bold">{staff.name}</td>
                  <td className="p-4">
                    <select className="border border-gray-400 rounded p-1 w-full bg-white text-gray-900">
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <select className="border border-gray-400 rounded p-1 w-full bg-white text-gray-900">
                      <option value="師長">師長</option>
                      <option value="副主任">副主任</option>
                      <option value="一般">一般</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        defaultValue={staff.nightLimit}
                        className="border border-gray-400 rounded p-1 w-16 text-center bg-white text-gray-900"
                      />
                      <span className="text-xs text-gray-500">回</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        defaultValue={staff.weekendLimit}
                        className="border border-gray-400 rounded p-1 w-16 text-center bg-white text-gray-900"
                      />
                      <span className="text-xs text-gray-500">回</span>
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
      </div>

      <div className="flex justify-end gap-4">
        <button className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-8 rounded-lg border border-gray-300 transition">
          キャンセル
        </button>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-10 rounded-lg shadow-xl transition-all active:scale-95">
          設定を保存して反映
        </button>
      </div>
    </div>
  );
}