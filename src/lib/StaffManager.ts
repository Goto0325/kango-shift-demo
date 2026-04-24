/**
 * 職員判定・職種分類ロジックを集約するクラス（50人規模運用対応）
 */
export type StaffMasterProfile = {
  id: string;
  staff_name: string;
  access_token: string;
  job_title: string | object | null;
  department_id: number | string | null;
  work_patterns: number[] | null;
  work_config?: import("./WorkConfig").StaffWorkConfig | null;
  paid_leave_remaining: number | null;
  employment_status?: string;
};

export type ShiftPattern = {
  id: number;
  pattern_name: string;
  pattern_key: string;
  work_hours: number;
};

export class StaffManager {
  /** job_title から表示用文字列を取得 */
  static getJobTitleString(jobTitle: StaffMasterProfile["job_title"]): string {
    if (!jobTitle) return "";
    if (typeof jobTitle === "string") {
      try {
        const parsed = JSON.parse(jobTitle);
        if (parsed && typeof parsed === "object" && (parsed.name || parsed.label)) {
          return parsed.name || parsed.label || "";
        }
      } catch {}
      return jobTitle;
    } else if (typeof jobTitle === "object" && jobTitle !== null) {
      if ((jobTitle as { name?: string }).name) return (jobTitle as { name: string }).name;
      if ((jobTitle as { label?: string }).label) return (jobTitle as { label: string }).label;
      return JSON.stringify(jobTitle);
    }
    return "";
  }

  /** 値が「休」系かどうか */
  static isRestishValue(value: string): boolean {
    if (!value) return false;
    return value.includes("休") || value.includes("有");
  }

  /** パターンが休み系かどうか */
  static isRestPattern(pattern: ShiftPattern | undefined): boolean {
    if (!pattern) return false;
    const restKeywords = ["休", "有給", "休日", "有休", "代休"];
    return restKeywords.some(
      (k) =>
        (pattern.pattern_name && pattern.pattern_name.includes(k)) ||
        (pattern.pattern_key && pattern.pattern_key.includes(k))
    );
  }

  /** システム管理者かどうか */
  static isAdminUser(jobTitle: StaffMasterProfile["job_title"]): boolean {
    if (!jobTitle) {
      console.log("[ADMIN判定] jobTitle undefined/null:", jobTitle);
      return false;
    }
    let targetStr = "";
    if (typeof jobTitle === "object" && jobTitle !== null) {
      const o = jobTitle as { name?: string; label?: string };
      if (o.name) targetStr = o.name;
      if (!targetStr && o.label) targetStr = o.label;
    } else if (typeof jobTitle === "string") {
      try {
        const parsed = JSON.parse(jobTitle);
        if (parsed && typeof parsed === "object") {
          if (parsed.name) targetStr = parsed.name;
          else if (parsed.label) targetStr = parsed.label;
        }
        if (!targetStr) targetStr = jobTitle;
      } catch {
        targetStr = jobTitle;
      }
    }
    console.log("[ADMIN判定] jobTitle解釈:", jobTitle, "→", targetStr);
    return typeof targetStr === "string" && targetStr.includes("システム管理者");
  }

  /** 職種カテゴリ: 0=システム管理者, 1=看護師, 2=介護士など, 9=その他 */
  static jobTitleCategory(jobTitle: StaffMasterProfile["job_title"]): number {
    const title = StaffManager.getJobTitleString(jobTitle);
    if (title.includes("システム管理者")) return 0;
    if (title.includes("看護師")) return 1;
    if (title.includes("介護") || title.includes("助手")) return 2;
    return 9;
  }

  /** 並べ替え用キー（同値ソート・五十音順） */
  static jobTitleKey(jobTitle: StaffMasterProfile["job_title"]): string {
    const t = StaffManager.getJobTitleString(jobTitle);
    return t || "";
  }

  /** 公休ノルマ日数（8月・12月・1月=10日、他=9日） */
  static getHolidayQuota(theYear: number, theMonth: number): number {
    if (theMonth === 8 || theMonth === 12 || theMonth === 1) {
      return 10;
    }
    return 9;
  }
}
