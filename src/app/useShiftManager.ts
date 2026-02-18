"use client";
import { useState, useEffect } from 'react';

export type ViewMode = "plan" | "actual";
export type ShiftData = { [key: string]: string };

export const useShiftManager = (year: number, month: number) => {
  const [staffMembers, setStaffMembers] = useState<string[]>(["看護師A", "看護師B", "看護師C"]);
  const [shifts, setShifts] = useState<ShiftData>({});
  const [actualShifts, setActualShifts] = useState<ShiftData>({});

  useEffect(() => {
    const savedShifts = localStorage.getItem('kango-shifts');
    const savedActual = localStorage.getItem('kango-actual');
    const savedStaff = localStorage.getItem('kango-staff');
    if (savedShifts) setShifts(JSON.parse(savedShifts));
    if (savedActual) setActualShifts(JSON.parse(savedActual));
    if (savedStaff) setStaffMembers(JSON.parse(savedStaff));
  }, []);

  const getShiftKey = (staff: string, day: number) => `${year}-${month}-${staff}-${day}`;
  // 希望かどうかを判定するためのキー
  const getHopeKey = (staff: string, day: number) => `${getShiftKey(staff, day)}-isHope`;

  const saveShift = (staff: string, day: number, value: string, mode: ViewMode, isHope: boolean = false) => {
    if (mode === "plan") {
      const newShifts = { 
        ...shifts, 
        [getShiftKey(staff, day)]: value,
        [getHopeKey(staff, day)]: isHope ? "true" : (shifts[getHopeKey(staff, day)] || "false")
      };
      setShifts(newShifts);
      localStorage.setItem('kango-shifts', JSON.stringify(newShifts));
    } else {
      const newActual = { ...actualShifts, [getShiftKey(staff, day)]: value };
      setActualShifts(newActual);
      localStorage.setItem('kango-actual', JSON.stringify(newActual));
    }
  };

  // --- 中略（addStaff, removeStaffなどはそのまま） ---
  const addStaff = (name: string) => {
    const updated = [...staffMembers, name];
    setStaffMembers(updated);
    localStorage.setItem('kango-staff', JSON.stringify(updated));
  };

  const removeStaff = (name: string) => {
    if (!window.confirm(`${name}さんを削除しますか？`)) return;
    const updated = staffMembers.filter(n => n !== name);
    setStaffMembers(updated);
    localStorage.setItem('kango-staff', JSON.stringify(updated));
  };

  const resetMonth = (mode: ViewMode, daysInMonth: number) => {
    const label = mode === "plan" ? "予定" : "実績";
    if (!window.confirm(`${year}年${month}月の【${label}】をすべて消去しますか？`)) return;
    const targetData = mode === "plan" ? { ...shifts } : { ...actualShifts };
    staffMembers.forEach(name => {
      for (let d = 1; d <= daysInMonth; d++) {
        delete targetData[getShiftKey(name, d)];
        delete targetData[getHopeKey(name, d)];
      }
    });
    if (mode === "plan") {
      setShifts(targetData);
      localStorage.setItem('kango-shifts', JSON.stringify(targetData));
    } else {
      setActualShifts(targetData);
      localStorage.setItem('kango-actual', JSON.stringify(targetData));
    }
  };

  const autoGenerate = (daysInMonth: number) => {
    const newShifts = { ...shifts };
    const pool = ["日", "早", "遅", "夜", "休"];
    staffMembers.forEach(name => {
      for (let d = 1; d <= daysInMonth; d++) {
        const key = getShiftKey(name, d);
        if (newShifts[key]) continue; // すでに希望が入っている場合は上書きしない
        if (d > 1 && newShifts[getShiftKey(name, d - 1)] === "夜") {
          newShifts[key] = "明";
        } else {
          newShifts[key] = pool[Math.floor(Math.random() * pool.length)];
        }
      }
    });
    setShifts(newShifts);
    localStorage.setItem('kango-shifts', JSON.stringify(newShifts));
  };

// useShiftManager.ts の中
const copyToActual = () => {
  if (typeof window !== "undefined") {
    if (!window.confirm("現在の予定を実績にコピーしますか？\n（既存の実績データは上書きされます）")) {
      return false; // ← 1. キャンセルされたら false を返すように追加
    }
    
    setActualShifts({ ...shifts });
    return true; // ← 2. 成功したら true を返すように追加
  }
  return false; // ← ここも一応 false
};

  return {
    staffMembers, shifts, actualShifts, addStaff, removeStaff, 
    saveShift, autoGenerate, copyToActual, resetMonth, getShiftKey, getHopeKey
  };
};