"use client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">管理者設定（師長用）</h1>
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => router.back()}
        >
          ← 勤務表に戻る
        </button>
      </div>

      <div className="grid gap-6">
        {/* 職員属性の設定 */}
        <section className="border p-4 rounded-lg shadow-sm bg-white">
          <h2 className="text-lg font-semibold mb-3 border-b pb-2">👥 職員ランク・役職設定</h2>
          <p className="text-sm text-gray-500 mb-4">各職員のランク（A/B/C）や役職を設定します。</p>
          <div className="h-20 bg-gray-50 flex items-center justify-center border-dashed border-2 rounded">
             ここに職員一覧リストが入る予定
          </div>
        </section>

        {/* NGペアの設定 */}
        <section className="border p-4 rounded-lg shadow-sm bg-white">
          <h2 className="text-lg font-semibold mb-3 border-b pb-2">🚫 NGペア設定</h2>
          <p className="text-sm text-gray-500 mb-4">同じ日に配置したくない組み合わせを指定します。</p>
          <div className="h-20 bg-gray-50 flex items-center justify-center border-dashed border-2 rounded">
             ここにペア選択UIが入る予定
          </div>
        </section>

        {/* 勤務ルールの設定 */}
        <section className="border p-4 rounded-lg shadow-sm bg-white">
          <h2 className="text-lg font-semibold mb-3 border-b pb-2">📅 勤務ルール・回数設定</h2>
          <p className="text-sm text-gray-500 mb-4">夜勤回数や土日の出勤ルールの重みを設定します。</p>
          <div className="h-20 bg-gray-50 flex items-center justify-center border-dashed border-2 rounded">
             ここに数値設定項目が入る予定
          </div>
        </section>
      </div>
    </div>
  );
}