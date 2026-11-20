import type { MarketStatus } from "@zernama/shared";

const faInt = new Intl.NumberFormat("fa-IR");
const faTwo = new Intl.NumberFormat("fa-IR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function faNum(n: number): string {
  return faInt.format(Math.round(n));
}

export function faNum2(n: number): string {
  return faTwo.format(n);
}

export function fmtPrice(value: number | null, unit: "TOMAN" | "USD"): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return unit === "TOMAN" ? faInt.format(Math.round(value)) : faTwo.format(value);
}

export function fmtChange(value: number | null, unit: "TOMAN" | "USD"): string {
  if (value === null || !Number.isFinite(value) || value === 0) return "—";
  const abs = unit === "TOMAN" ? faInt.format(Math.abs(Math.round(value))) : faTwo.format(Math.abs(value));
  return `${value > 0 ? "+" : "−"}${abs}`;
}

export function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${faTwo.format(Math.abs(value))}٪`;
}

export function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}

export function fmtDateTime(ts: number | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}

export function fmtClock(date = new Date()): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function fmtAge(ts: number | null, now = Date.now()): string {
  if (!ts) return "—";
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 45) return "همین حالا";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${faInt.format(min)} دقیقه پیش`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${faInt.format(hour)} ساعت پیش`;
  const day = Math.floor(hour / 24);
  return `${faInt.format(day)} روز پیش`;
}

export const STATUS_LABEL: Record<MarketStatus, string> = {
  LIVE: "زنده",
  DELAYED: "تأخیری",
  STALE: "کهنه",
  UNAVAILABLE: "ناموجود",
  DISPUTED: "اختلاف منابع"
};

export const STATUS_HINT: Record<MarketStatus, string> = {
  LIVE: "دریافت‌شده در بازه به‌روزرسانی منبع",
  DELAYED: "قیمت منبع روزانه/با تأخیر به‌روز می‌شود",
  STALE: "آخرین مقدار معتبر؛ به‌روزرسانی جدید نرسیده",
  UNAVAILABLE: "منبع معتبری برای این مورد در دسترس نیست",
  DISPUTED: "اختلاف بین منابع بیش از حد مجاز است"
};

export function trendClass(changePct: number | null): "up" | "down" | "flat" {
  if (changePct === null || !Number.isFinite(changePct) || changePct === 0) return "flat";
  return changePct > 0 ? "up" : "down";
}
