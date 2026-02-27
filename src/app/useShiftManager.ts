"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export type ViewMode = "plan" | "actual";
export type ShiftData = { [key: string]: string };

export const useShiftManager = (year: number, month: number) => {
  const [staffMembers, setStaffMembers] = useState<string[]>(["看護師A", "看護師B", "看護師C"]); // 仮
  const [shifts, setShifts] = useState<ShiftData>({});
  const [actualShifts, setActualShifts] = useState<ShiftData>({});
  const [loading, setLoading] = useState<boolean>(true);

  const pad = (v: number) => v.toString().padStart(2, "0");

  // "YYYY-MM" を返す
  const getYearMonth = () => `${year}-${pad(month)}`;

  // "YYYY-MM-DD" を返す
  const getDate = (day: number) => `${year}-${pad(month)}-${pad(day)}`;

  const getShiftKey = (staff: string, day: number) => `${year}-${month}-${staff}-${day}`;
  // 希望かどうかを判定するためのキー
  const getHopeKey = (staff: string, day: number) => `${getShiftKey(staff, day)}-isHope`;

  // 初期ロード: 表示月のshifts取得 & 仮スタッフ名も取得できるよう拡張
  useEffect(() => {
    setLoading(true);
    // 表示月(YYYY-MM)のshiftsのみ取得
    (async () => {
      const fromDate = `${year}-${pad(month)}-01`;
      const toDate = `${year}-${pad(month)}-31`; // 31日までにしておけば十分
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate);

      if (data) {
        const newShifts: ShiftData = {};
        const newActuals: ShiftData = {};
        const staffSet = new Set(staffMembers);
        for (const row of data) {
          // date: string (YYYY-MM-DD)
          const d = parseInt(row.date.slice(-2), 10);
          const key = getShiftKey(row.staff_name, d);
          staffSet.add(row.staff_name);
          if (row.is_actual) {
            newActuals[key] = row.shift_type;
          } else {
            newShifts[key] = row.shift_type;
          }
        }
        setShifts(newShifts);
        setActualShifts(newActuals);
        setStaffMembers(Array.from(staffSet));
      }
      setLoading(false);
    })();
  }, [year, month]); // 表示年月が変わったら再読込

  // シフト更新時にSupabase Upsert
  const saveShift = async (
    staff: string,
    day: number,
    value: string,
    mode: ViewMode,
    isHope: boolean = false
  ) => {
    const date = getDate(day);
    const is_actual = mode === "actual";
    const key = getShiftKey(staff, day);

    // state更新
    if (mode === "plan") {
      const newShifts = {
        ...shifts,
        [key]: value,
        [getHopeKey(staff, day)]: isHope ? "true" : (shifts[getHopeKey(staff, day)] || "false"),
      };
      setShifts(newShifts);
    } else {
      const newActual = { ...actualShifts, [key]: value };
      setActualShifts(newActual);
    }

    // Supabaseへ upsert
    // 希望フラグ(isHope)はDB側に保存していない前提
    await supabase.from('shifts').upsert({
      staff_name: staff,
      date,
      shift_type: value,
      is_actual,
    }, { onConflict: 'staff_name,date,is_actual' });
  };

  // --- スタッフ追加・削除はlocalStorageからState管理のみ。将来はDBと同期するなら改修 ---
  const addStaff = (name: string) => {
    const updated = [...staffMembers, name];
    setStaffMembers(updated);
    // localStorage.setItem('kango-staff', JSON.stringify(updated)); // DB同期仕様により削除候補
  };

  const removeStaff = (name: string) => {
    if (!window.confirm(`${name}さんを削除しますか？`)) return;
    const updated = staffMembers.filter(n => n !== name);
    setStaffMembers(updated);
    // localStorage.setItem('kango-staff', JSON.stringify(updated)); // DB同期仕様により削除候補
    // shifts/actualShifts からも削除したい場合はここで処理追加
  };

  // 1ヶ月分一括消去（Supabase）
  const resetMonth = async (mode: ViewMode, daysInMonth: number) => {
    const label = mode === "plan" ? "予定" : "実績";
    if (!window.confirm(`${year}年${month}月の【${label}】をすべて消去しますか？`)) return;
    // Supabaseから該当月＆is_actual条件で Delete
    const fromDate = `${year}-${pad(month)}-01`;
    const toDate = `${year}-${pad(month)}-31`;
    const is_actual = mode === "actual";
    await supabase
      .from('shifts')
      .delete()
      .gte('date', fromDate)
      .lte('date', toDate)
      .eq('is_actual', is_actual);

    if (mode === "plan") {
      const updated = { ...shifts };
      staffMembers.forEach(name => {
        for (let d = 1; d <= daysInMonth; d++) {
          delete updated[getShiftKey(name, d)];
          delete updated[getHopeKey(name, d)];
        }
      });
      setShifts(updated);
    } else {
      const updated = { ...actualShifts };
      staffMembers.forEach(name => {
        for (let d = 1; d <= daysInMonth; d++) {
          delete updated[getShiftKey(name, d)];
        }
      });
      setActualShifts(updated);
    }
  };

  // 自動生成→各シフトをSupabaseにupsert & state上書き
  const autoGenerate = async (daysInMonth: number) => {
    const newShifts = { ...shifts };
    const pool = ["日", "早", "遅", "夜", "休"];
    const records: any[] = [];
    staffMembers.forEach(name => {
      for (let d = 1; d <= daysInMonth; d++) {
        const key = getShiftKey(name, d);
        if (newShifts[key]) continue; // すでに希望が入っている場合は上書きしない
        const value =
          d > 1 && newShifts[getShiftKey(name, d - 1)] === "夜"
            ? "明"
            : pool[Math.floor(Math.random() * pool.length)];
        newShifts[key] = value;

        // upsert対象をまとめる
        records.push({
          staff_name: name,
          date: getDate(d),
          shift_type: value,
          is_actual: false,
        });
      }
    });
    setShifts(newShifts);
    if (records.length > 0) {
      await supabase.from('shifts').upsert(records, { onConflict: 'staff_name,date,is_actual' });
    }
  };

  // 予定を全コピーして実績にする (Supabaseにも反映)
  const copyToActual = async () => {
    if (typeof window !== "undefined") {
      if (!window.confirm("現在の予定を実績にコピーしますか？\n（既存の実績データは上書きされます）")) {
        return false;
      }
      // 表示月のplanをactualに上書き
      const actuals: ShiftData = {};
      const upserts: any[] = [];
      for (const name of staffMembers) {
        for (let d = 1; d <= 31; d++) { // 最大31日まで処理するが出力該当日だけで充分
          const key = getShiftKey(name, d);
          if (shifts[key]) {
            actuals[key] = shifts[key];
            upserts.push({
              staff_name: name,
              date: getDate(d),
              shift_type: shifts[key],
              is_actual: true,
            });
          }
        }
      }
      setActualShifts(actuals);
      if (upserts.length > 0) {
        await supabase.from('shifts').upsert(upserts, { onConflict: 'staff_name,date,is_actual' });
      }
      return true;
    }
    return false;
  };

  return {
    staffMembers,
    shifts,
    actualShifts,
    addStaff,
    removeStaff,
    saveShift,
    autoGenerate,
    copyToActual,
    resetMonth,
    getShiftKey,
    getHopeKey,
    loading,
  };
};