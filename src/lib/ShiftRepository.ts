/**
 * Supabase を用いたシフト・DB通信を集約するクラス（50人規模運用対応・チャンク処理含む）
 */
import { supabase } from "../../lib/supabase";

export type ShiftRecordV2 = {
  id?: number;
  staff_name: string;
  date: string;
  is_actual: boolean;
  shift_type: string | null;
  updated_by?: string | null;
};

export type ShiftPatternRow = {
  id: number;
  pattern_name: string;
  pattern_key: string;
  work_hours: number;
};

const CHUNK_SIZE = 50;

function mapRowToShiftRecord(rec: {
  id?: number;
  staff_name: string;
  date: string;
  is_actual: boolean;
  shift_type: string | null;
  updated_by?: string | null;
}): ShiftRecordV2 {
  return {
    id: rec.id,
    staff_name: rec.staff_name,
    date: rec.date,
    is_actual: !!rec.is_actual,
    shift_type: rec.shift_type,
    updated_by: rec.updated_by ?? null,
  };
}

export class ShiftRepository {
  /**
   * 指定条件でシフト一覧を取得
   */
  static async fetchShifts(params: {
    year: number;
    month: number;
    staffNames: string[];
    isActual: boolean;
  }): Promise<ShiftRecordV2[]> {
    const { year, month, staffNames, isActual } = params;
    if (!staffNames.length) return [];

    const d1 = new Date(year, month - 1, 1);
    const d2 = new Date(year, month, 0);
    const startDate = d1.toISOString().slice(0, 10);
    const endDate = d2.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .in("staff_name", staffNames)
      .gte("date", startDate)
      .lte("date", endDate)
      .eq("is_actual", isActual);

    if (error || !Array.isArray(data)) return [];
    return data.map((rec: Record<string, unknown>) =>
      mapRowToShiftRecord(rec as Parameters<typeof mapRowToShiftRecord>[0])
    );
  }

  /**
   * 今月の plan シフトのみ取得（自動作成用）
   */
  static async fetchShiftsForMonth(params: {
    year: number;
    month: number;
    staffNames: string[];
  }): Promise<ShiftRecordV2[]> {
    const { year, month, staffNames } = params;
    if (!staffNames.length) return [];

    const daysCount = new Date(year, month, 0).getDate();
    const monthStr = month.toString().padStart(2, "0");
    const d1 = `${year}-${monthStr}-01`;
    const d2 = `${year}-${monthStr}-${daysCount.toString().padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .in("staff_name", staffNames)
      .eq("is_actual", false)
      .gte("date", d1)
      .lte("date", d2);

    if (!data || !Array.isArray(data)) return [];
    return data.map((rec: Record<string, unknown>) =>
      mapRowToShiftRecord(rec as Parameters<typeof mapRowToShiftRecord>[0])
    );
  }

  /**
   * シフトを upsert（50件ずつチャンク処理）
   */
  static async upsertShifts(rows: ShiftRecordV2[]): Promise<void> {
    if (rows.length === 0) return;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      await supabase.from("shifts").upsert(chunk, { onConflict: "staff_name,date,is_actual" });
    }
  }

  /**
   * シフトを upsert し、返却データでマージしたレコード配列を返す（1件〜数件用）
   */
  static async upsertShiftsAndSelect(rows: ShiftRecordV2[]): Promise<ShiftRecordV2[]> {
    const { data, error } = await supabase
      .from("shifts")
      .upsert(rows, { onConflict: "staff_name,date,is_actual" })
      .select();

    if (error || !data || !Array.isArray(data)) return [];
    return data.map((rec: Record<string, unknown>) =>
      mapRowToShiftRecord(rec as Parameters<typeof mapRowToShiftRecord>[0])
    );
  }

  /**
   * 勤務パターン一覧を取得
   */
  static async fetchShiftPatterns(): Promise<ShiftPatternRow[]> {
    const { data, error } = await supabase
      .from("shift_patterns")
      .select("*")
      .order("id", { ascending: true });

    if (error || !Array.isArray(data)) return [];
    return (data as ShiftPatternRow[]).map((row) => ({
      id: row.id,
      pattern_name: row.pattern_name,
      pattern_key: row.pattern_key,
      work_hours: row.work_hours,
    }));
  }
}
