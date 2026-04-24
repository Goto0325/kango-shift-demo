import { StaffManager } from "./StaffManager";

export type StaffWorkConfig = {
  max_consecutive?: number;
  fixed_days?: number[];
  work_days?: number[];
  weekly_limit?: number;
  monthly_limit?: number;
};

export type WorkConfigViolationCode =
  | "fixed_days"
  | "work_days"
  | "max_consecutive"
  | "weekly_limit"
  | "monthly_limit";

export type WorkConfigViolation = {
  code: WorkConfigViolationCode;
  message: string;
};

export function parseWorkConfig(raw: unknown): StaffWorkConfig | null {
  if (!raw) return null;
  let src: unknown = raw;
  if (typeof raw === "string") {
    try {
      src = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) return null;
  const obj = src as Record<string, unknown>;

  const toPositiveInt = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.trunc(v);
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
    return undefined;
  };

  const toDayArray = (v: unknown): number[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const days = Array.from(
      new Set(
        v
          .map((x) => (typeof x === "number" ? x : Number(x)))
          .filter((x) => Number.isFinite(x) && x >= 1 && x <= 7)
          .map((x) => Math.trunc(x))
      )
    );
    return days.length > 0 ? days : undefined;
  };

  const parsed: StaffWorkConfig = {};
  parsed.max_consecutive = toPositiveInt(obj.max_consecutive);
  parsed.fixed_days = toDayArray(obj.fixed_days);
  parsed.work_days = toDayArray(obj.work_days);
  parsed.weekly_limit = toPositiveInt(obj.weekly_limit);
  parsed.monthly_limit = toPositiveInt(obj.monthly_limit);

  if (
    parsed.max_consecutive === undefined &&
    !parsed.fixed_days &&
    !parsed.work_days &&
    parsed.weekly_limit === undefined &&
    parsed.monthly_limit === undefined
  ) {
    return null;
  }
  return parsed;
}

const toWorkConfigDow = (isoDate: string): number => {
  const dow = new Date(isoDate).getDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
};

const weekStartDate = (isoDate: string): string => {
  const d = new Date(isoDate);
  const dow = toWorkConfigDow(isoDate);
  d.setDate(d.getDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
};

const isWorkShift = (shiftType: string | null | undefined): boolean => {
  if (!shiftType) return false;
  return !StaffManager.isRestishValue(shiftType);
};

type ValidationArgs = {
  config?: StaffWorkConfig | null;
  date: string;
  nextShift: string | null;
  scheduleByDate: Record<string, string | null | undefined>;
};

export function validateWorkConfigForAssignment(args: ValidationArgs): WorkConfigViolation | null {
  const { config, date, nextShift, scheduleByDate } = args;
  if (!config || !nextShift) return null;
  if (!isWorkShift(nextShift)) return null;

  const dow = toWorkConfigDow(date);
  if (config.fixed_days && config.fixed_days.length > 0 && !config.fixed_days.includes(dow)) {
    return { code: "fixed_days", message: "固定勤務曜日の制約により、この曜日には勤務できません。" };
  }
  if (config.work_days && config.work_days.length > 0 && !config.work_days.includes(dow)) {
    return { code: "work_days", message: "勤務可能曜日の制約により、この曜日には勤務できません。" };
  }

  const merged: Record<string, string | null | undefined> = { ...scheduleByDate, [date]: nextShift };
  const targetDate = new Date(date);

  if (config.monthly_limit !== undefined) {
    const monthPrefix = date.slice(0, 7);
    let monthlyWork = 0;
    for (const [d, s] of Object.entries(merged)) {
      if (d.startsWith(monthPrefix) && isWorkShift(s)) monthlyWork += 1;
    }
    if (monthlyWork > config.monthly_limit) {
      return {
        code: "monthly_limit",
        message: `月間勤務日数の上限(${config.monthly_limit}日)を超えます。`,
      };
    }
  }

  if (config.weekly_limit !== undefined) {
    const start = weekStartDate(date);
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 6);
    const end = endDate.toISOString().slice(0, 10);
    let weeklyWork = 0;
    for (const [d, s] of Object.entries(merged)) {
      if (d >= start && d <= end && isWorkShift(s)) weeklyWork += 1;
    }
    if (weeklyWork > config.weekly_limit) {
      return {
        code: "weekly_limit",
        message: `週勤務日数の上限(${config.weekly_limit}日)を超えます。`,
      };
    }
  }

  if (config.max_consecutive !== undefined) {
    let streak = 1;
    const prev = new Date(targetDate);
    prev.setDate(prev.getDate() - 1);
    while (isWorkShift(merged[prev.toISOString().slice(0, 10)])) {
      streak += 1;
      prev.setDate(prev.getDate() - 1);
    }
    const next = new Date(targetDate);
    next.setDate(next.getDate() + 1);
    while (isWorkShift(merged[next.toISOString().slice(0, 10)])) {
      streak += 1;
      next.setDate(next.getDate() + 1);
    }
    if (streak > config.max_consecutive) {
      return {
        code: "max_consecutive",
        message: `最大連勤数(${config.max_consecutive}日)を超えます。`,
      };
    }
  }

  return null;
}
