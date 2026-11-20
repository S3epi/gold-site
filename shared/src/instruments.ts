export type Category = "gold" | "coin" | "currency" | "ounce";
export type Unit = "IRR" | "USD";

export interface Instrument {
  id: string;
  title: string;
  short: string;
  category: Category;
  unit: Unit;
  tgjuKey?: string;
  tgjuSlug?: string;
  fallbackTgjuKeys?: string[];
  spec?: { weightG: number; purity: number };
  reference?: { kind: "gold"; purity: number } | { kind: "mithqal" };
  bounds: { min: number; max: number };
  note?: string;
}

export const TROY_OUNCE_G = 31.1034768;
export const MITHQAL_G = 4.6083;
export const MITHQAL_PURITY = 0.705;

export const INSTRUMENTS: Instrument[] = [
  {
    id: "gold18",
    title: "طلای ۱۸ عیار (گرمی)",
    short: "۱۸ عیار",
    category: "gold",
    unit: "IRR",
    tgjuKey: "geram18",
    tgjuSlug: "geram18",
    reference: { kind: "gold", purity: 0.75 },
    bounds: { min: 10_000_000, max: 5_000_000_000 }
  },
  {
    id: "gold24",
    title: "طلای ۲۴ عیار (گرمی)",
    short: "۲۴ عیار",
    category: "gold",
    unit: "IRR",
    tgjuKey: "geram24",
    tgjuSlug: "geram24",
    reference: { kind: "gold", purity: 0.999 },
    bounds: { min: 10_000_000, max: 5_000_000_000 }
  },
  {
    id: "gold740",
    title: "طلای دست‌دوم (۷۴۰)",
    short: "۷۴۰",
    category: "gold",
    unit: "IRR",
    tgjuKey: "gold_740k",
    tgjuSlug: "gold_740k",
    reference: { kind: "gold", purity: 0.74 },
    bounds: { min: 10_000_000, max: 5_000_000_000 }
  },
  {
    id: "melted",
    title: "طلای آب‌شده (عمده)",
    short: "آب‌شده",
    category: "gold",
    unit: "IRR",
    tgjuKey: "gold_melted_wholesale",
    tgjuSlug: "gold_melted_wholesale",
    bounds: { min: 10_000_000, max: 5_000_000_000 }
  },
  {
    id: "mithqal",
    title: "مثقال طلا",
    short: "مثقال",
    category: "gold",
    unit: "IRR",
    tgjuKey: "gerami",
    tgjuSlug: "gerami",
    reference: { kind: "mithqal" },
    bounds: { min: 10_000_000, max: 5_000_000_000 }
  },
  {
    id: "emami",
    title: "سکه امامی",
    short: "امامی",
    category: "coin",
    unit: "IRR",
    tgjuKey: "sekee",
    tgjuSlug: "sekee",
    spec: { weightG: 8.133, purity: 0.9 },
    bounds: { min: 50_000_000, max: 20_000_000_000 }
  },
  {
    id: "bahar",
    title: "سکه بهار آزادی",
    short: "بهار",
    category: "coin",
    unit: "IRR",
    tgjuKey: "sekeb",
    tgjuSlug: "sekeb",
    spec: { weightG: 8.133, purity: 0.9 },
    bounds: { min: 50_000_000, max: 20_000_000_000 }
  },
  {
    id: "half",
    title: "نیم سکه",
    short: "نیم",
    category: "coin",
    unit: "IRR",
    tgjuKey: "nim",
    tgjuSlug: "nim",
    spec: { weightG: 4.0665, purity: 0.9 },
    bounds: { min: 20_000_000, max: 10_000_000_000 }
  },
  {
    id: "quarter",
    title: "ربع سکه",
    short: "ربع",
    category: "coin",
    unit: "IRR",
    tgjuKey: "rob",
    tgjuSlug: "rob",
    spec: { weightG: 2.03325, purity: 0.9 },
    bounds: { min: 10_000_000, max: 5_000_000_000 }
  },
  {
    id: "coin1g",
    title: "سکه یک گرمی",
    short: "یک گرمی",
    category: "coin",
    unit: "IRR",
    bounds: { min: 1_000_000, max: 1_000_000_000 },
    note: "منبع قیمت معتبر برای این مورد در دسترس نیست"
  },
  {
    id: "usd",
    title: "دلار آمریکا (بازار آزاد)",
    short: "دلار",
    category: "currency",
    unit: "IRR",
    tgjuKey: "price_dollar_rl",
    tgjuSlug: "price_dollar_rl",
    bounds: { min: 100_000, max: 100_000_000 }
  },
  {
    id: "eur",
    title: "یورو (بازار آزاد)",
    short: "یورو",
    category: "currency",
    unit: "IRR",
    tgjuKey: "price_eur",
    tgjuSlug: "price_eur",
    bounds: { min: 100_000, max: 100_000_000 }
  },
  {
    id: "aed",
    title: "درهم امارات",
    short: "درهم",
    category: "currency",
    unit: "IRR",
    tgjuKey: "price_aed",
    tgjuSlug: "price_aed",
    bounds: { min: 10_000, max: 20_000_000 }
  },
  {
    id: "gbp",
    title: "پوند بریتانیا",
    short: "پوند",
    category: "currency",
    unit: "IRR",
    tgjuKey: "price_gbp",
    tgjuSlug: "price_gbp",
    bounds: { min: 100_000, max: 100_000_000 }
  },
  {
    id: "try",
    title: "لیر ترکیه",
    short: "لیر",
    category: "currency",
    unit: "IRR",
    tgjuKey: "price_try",
    tgjuSlug: "price_try",
    bounds: { min: 1_000, max: 10_000_000 }
  },
  {
    id: "xau",
    title: "انس جهانی طلا (XAU/USD)",
    short: "انس",
    category: "ounce",
    unit: "USD",
    tgjuSlug: "ons",
    fallbackTgjuKeys: ["tether_gold_xaut", "ons"],
    bounds: { min: 100, max: 100_000 },
    note: "عیار ۹۹۹؛ واحد دلار آمریکا"
  }
];

export const INSTRUMENT_BY_ID: Map<string, Instrument> = new Map(
  INSTRUMENTS.map((i) => [i.id, i])
);

export const TGJU_KEY_TO_INSTRUMENT: Map<string, Instrument> = new Map(
  INSTRUMENTS.filter((i) => i.tgjuKey).map((i) => [i.tgjuKey as string, i])
);

export const CATEGORY_TITLE: Record<Category, string> = {
  gold: "طلا",
  coin: "سکه",
  currency: "ارز",
  ounce: "بازار جهانی"
};
