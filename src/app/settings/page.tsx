"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { StaffManager, type StaffMasterProfile } from "@/lib/StaffManager";

type SettingsStaff = {
  id: string;
  name: string;
  rank: string;
  position: string;
  nightLimit: number;
  weekendLimit: number;
  isNightEqual: boolean;
  isWeekendEqual: boolean;
};

function isValidDepartmentId(departmentId: number | string | null | undefined): boolean {
  return (
    departmentId !== null &&
    departmentId !== undefined &&
    departmentId !== "" &&
    !(typeof departmentId === "number" && Number.isNaN(departmentId)) &&
    !(typeof departmentId === "number" && departmentId === 0) &&
    !(typeof departmentId === "string" && (departmentId === "0" || departmentId.trim() === ""))
  );
}

function toSettingsStaff(row: StaffMasterProfile): SettingsStaff {
  return {
    id: String(row.id),
    name: row.staff_name,
    rank: row.employment_status ?? "",
    position: StaffManager.getJobTitleString(row.job_title),
    nightLimit: 4,
    weekendLimit: 2,
    isNightEqual: true,
    isWeekendEqual: true,
  };
}

export default function SettingsPage() {
  const [staffs, setStaffs] = useState<SettingsStaff[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [keyReady, setKeyReady] = useState(false);
  const [departmentId, setDepartmentId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAccessToken(params.get("key"));
    setKeyReady(true);
  }, []);

  useEffect(() => {
    if (!keyReady) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (!accessToken) {
        setStaffs([]);
        setDepartmentId(null);
        setError("ログイン情報（key）がありません。勤務表から設定を開いてください。");
        setLoading(false);
        return;
      }

      const { data: me, error: meError } = await supabase
        .from("staff_master")
        .select("*")
        .eq("access_token", accessToken)
        .maybeSingle();

      if (cancelled) return;
      if (meError || !me) {
        setStaffs([]);
        setDepartmentId(null);
        setError("職員情報を取得できませんでした。");
        setLoading(false);
        return;
      }

      const profile = me as StaffMasterProfile;
      const dep = profile.department_id ?? null;
      setDepartmentId(dep);

      if (!isValidDepartmentId(dep)) {
        setStaffs([toSettingsStaff(profile)]);
        setLoading(false);
        return;
      }

      const { data, error: membersError } = await supabase
        .from("staff_master")
        .select("*")
        .eq("department_id", dep)
        .order("staff_name", { ascending: true });

      if (cancelled) return;
      if (membersError || !Array.isArray(data)) {
        setStaffs([toSettingsStaff(profile)]);
        setError("同じ部署の職員一覧を取得できませんでした。");
        setLoading(false);
        return;
      }

      const meId = String(profile.id);
      const rows = (data as StaffMasterProfile[])
        .map(toSettingsStaff)
        .sort((a, b) => {
          if (a.id === meId) return -1;
          if (b.id === meId) return 1;
          return a.name.localeCompare(b.name, "ja");
        });
      setStaffs(rows.length > 0 ? rows : [toSettingsStaff(profile)]);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, keyReady]);

  const updateStaff = (id: string, field: string, value: string | boolean) => {
    setStaffs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const backHref = accessToken ? `/?key=${encodeURIComponent(accessToken)}` : "/";
  const departmentLabel = isValidDepartmentId(departmentId) ? `部署${departmentId}` : null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen bg-white text-black">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理者設定</h1>
          <p className="text-sm text-gray-600">
            {departmentLabel
              ? `${departmentLabel}の職員を表示しています。回数設定：チェックを入れると全体で均等に割り振ります`
              : "回数設定：チェックを入れると全体で均等に割り振ります"}
          </p>
        </div>
        <Link href={backHref} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded border border-gray-400 transition shadow-sm">
          ← 勤務表に戻る
        </Link>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

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
            {loading && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={5}>読み込み中...</td>
              </tr>
            )}
            {!loading && staffs.length === 0 && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={5}>表示できる職員がいません。</td>
              </tr>
            )}
            {!loading && staffs.map((staff) => (
              <tr key={staff.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                <td className="p-4 text-gray-900 font-bold">{staff.name}</td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {staff.rank && (
                      <span className="text-xs bg-blue-50 px-2 py-1 rounded border border-blue-200">{staff.rank}</span>
                    )}
                    <span className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200">{staff.position || "—"}</span>
                  </div>
                </td>

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
                        className={`border rounded p-1 w-14 text-center ${staff.isNightEqual ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-white text-gray-900 border-gray-400"}`}
                      />
                      <span className={`text-xs ${staff.isNightEqual ? "text-gray-300" : "text-gray-500"}`}>回</span>
                    </div>
                  </div>
                </td>

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
                        className={`border rounded p-1 w-14 text-center ${staff.isWeekendEqual ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-white text-gray-900 border-gray-400"}`}
                      />
                      <span className={`text-xs ${staff.isWeekendEqual ? "text-gray-300" : "text-gray-500"}`}>回</span>
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
