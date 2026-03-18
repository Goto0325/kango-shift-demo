"use client";
import Link from "next/link";
import { useState } from "react";

const initialStaffs = [
  { id: "1", name: "看護 太郎", rank: "A", position: "師長" },
  { id: "2", name: "医療 花子", rank: "B", position: "副主任" },
  { id: "3", name: "岡崎 一郎", rank: "C", position: "一般" },
];

export default function SettingsPage() {
  const [staffs] = useState(initialStaffs);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-white text-black">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理者設定</h1>
          <p className="text-sm text-gray-600">職員の属性や制約条件を編集します</p>
        </div>
        {/* 戻るボタン：背景をグレー、文字を黒にハッキリさせる */}
        <Link href="/" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded border border-gray-400 transition shadow-sm">
          ← 勤務表に戻る
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-300 overflow-hidden mb-8">
        <div className="p-4 border-b bg-gray-100">
          <h2 className="font-bold text-gray-800">👥 職員属性・ルール設定</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-700">
                <th className="p-4 border-b border-gray-300 font-bold">職員名</th>
                <th className="p-4 border-b border-gray-300 font-bold">ランク</th>
                <th className="p-4 border-b border-gray-300 font-bold">役職</th>
                <th className="p-4 border-b border-gray-300 font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {staffs.map((staff) => (
                <tr key={staff.id} className="border-b border-gray-200">
                  <td className="p-4 text-gray-900 font-medium">{staff.name}</td>
                  <td className="p-4">
                    <select className="border border-gray-400 rounded p-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500">
                      <option value="A">ランクA</option>
                      <option value="B">ランクB</option>
                      <option value="C">ランクC</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <select className="border border-gray-400 rounded p-2 w-full bg-white text-gray-900 focus:ring-2 focus:ring-blue-500">
                      <option value="師長">師長</option>
                      <option value="副主任">副主任</option>
                      <option value="一般">一般</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <button className="text-sm bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded border border-blue-300 hover:bg-blue-200">
                      ＋ ペア設定
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-10 rounded-lg shadow-xl transition-all active:scale-95">
          設定を保存する
        </button>
      </div>
    </div>
  );
}