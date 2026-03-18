"use client";
import Link from "next/link";
import { useState } from "react";

// 将来的にはDBや共通のStateから取得しますが、まずは表示用のダミーデータ
const initialStaffs = [
  { id: "1", name: "看護 太郎", rank: "A", position: "師長", ngPairs: [] },
  { id: "2", name: "医療 花子", rank: "B", position: "副主任", ngPairs: [] },
  { id: "3", name: "岡崎 一郎", rank: "C", position: "一般", ngPairs: [] },
];

export default function SettingsPage() {
  const [staffs, setStaffs] = useState(initialStaffs);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">管理者設定</h1>
          <p className="text-sm text-gray-500">職員の属性や制約条件を編集します</p>
        </div>
        <Link href="/" className="bg-white border border-gray-300 px-4 py-2 rounded shadow-sm hover:bg-gray-50 transition">
          ← 勤務表に戻る
        </Link>
      </div>

      {/* 職員一覧テーブル */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-semibold">👥 職員属性・ルール設定</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-sm">
                <th className="p-3 border-b font-bold w-1/4">職員名</th>
                <th className="p-3 border-b font-bold w-1/5">ランク</th>
                <th className="p-3 border-b font-bold w-1/5">役職</th>
                <th className="p-3 border-b font-bold">NGペア設定</th>
              </tr>
            </thead>
            <tbody>
              {staffs.map((staff) => (
                <tr key={staff.id} className="hover:bg-gray-50 transition">
                  <td className="p-3 border-b font-medium">{staff.name}</td>
                  <td className="p-3 border-b">
                    <select className="border rounded p-1 w-full bg-white">
                      <option value="A">ランクA</option>
                      <option value="B">ランクB</option>
                      <option value="C">ランクC</option>
                    </select>
                  </td>
                  <td className="p-3 border-b">
                    <select className="border rounded p-1 w-full bg-white">
                      <option value="師長">師長</option>
                      <option value="副主任">副主任</option>
                      <option value="一般">一般</option>
                    </select>
                  </td>
                  <td className="p-3 border-b">
                    <button className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100">
                      ＋ ペアを追加
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 保存ボタン（フッター固定などのイメージ） */}
      <div className="flex justify-end">
        <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-blue-700 transition">
          設定を保存する
        </button>
      </div>
    </div>
  );
}