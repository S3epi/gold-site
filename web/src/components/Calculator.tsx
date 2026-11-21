import { useMemo, useState } from "react";
import {
  INSTRUMENT_BY_ID,
  coinIntrinsicToman,
  goldReferenceToman,
  type CalculationsPayload,
  type PriceItem
} from "@mesghalyar/shared";
import {
  bubbleClass,
  bubbleWord,
  faNum,
  faNum2,
  fmtChange,
  fmtPct,
  fmtPrice,
  groupDigits,
  parseNum
} from "../format";

interface Karat {
  id: string;
  label: string;
  sub: string;
  purity: number;
  marketId: string | null;
}

const KARATS: Karat[] = [
  { id: "750", label: "۱۸ عیار", sub: "۷۵۰", purity: 0.75, marketId: "gold18" },
  { id: "740", label: "دست دوم", sub: "۷۴۰", purity: 0.74, marketId: "gold740" },
  { id: "875", label: "۲۱ عیار", sub: "۸۷۵", purity: 0.875, marketId: null },
  { id: "900", label: "سکه", sub: "۹۰۰", purity: 0.9, marketId: null },
  { id: "995", label: "۲۴ عیار", sub: "۹۹۵", purity: 0.995, marketId: "gold24" }
];

const COIN_OPTIONS = ["emami", "bahar", "half", "quarter"].map((id) => ({
  id,
  label: INSTRUMENT_BY_ID.get(id)?.title ?? id
}));

type Tab = "trade" | "value" | "intrinsic";
type Mode = "gold" | "coin";

interface TradeFields {
  weight: string;
  price: string;
  wagePct: string;
  profitPct: string;
  taxPct: string;
  sellPrice: string;
}

interface ValueFields {
  weight: string;
  price: string;
  profitPct: string;
}

function gold18Price(items: PriceItem[]): number | null {
  return items.find((i) => i.id === "gold18" && i.price !== null)?.price ?? null;
}

/** Market price per gram for a karat: direct instrument when available, otherwise scaled from 750. */
function karatPrice(items: PriceItem[], karat: Karat): number | null {
  if (karat.marketId) {
    const direct = items.find((i) => i.id === karat.marketId && i.price !== null)?.price;
    if (direct) return direct;
  }
  const base = gold18Price(items);
  return base === null ? null : (base * karat.purity) / 0.75;
}

export function Calculator({
  calculations,
  items
}: {
  calculations: CalculationsPayload | null;
  items: PriceItem[];
}) {
  const [tab, setTab] = useState<Tab>("trade");
  const [trade, setTrade] = useState<TradeFields>({
    weight: "1",
    price: "",
    wagePct: "",
    profitPct: "",
    taxPct: "",
    sellPrice: ""
  });
  const [value, setValue] = useState<ValueFields>({ weight: "1", price: "", profitPct: "" });
  const [karatId, setKaratId] = useState("750");

  const setTradeField = (key: keyof TradeFields) => (raw: string) =>
    setTrade((prev) => ({
      ...prev,
      [key]: key === "wagePct" || key === "profitPct" || key === "taxPct" || key === "weight"
        ? groupDigits(raw, 3)
        : groupDigits(raw)
    }));
  const setValueField = (key: keyof ValueFields) => (raw: string) =>
    setValue((prev) => ({
      ...prev,
      [key]: key === "profitPct" ? groupDigits(raw, 2) : groupDigits(raw, 3)
    }));

  const karat = KARATS.find((k) => k.id === karatId) ?? KARATS[0];

  return (
    <div className="calc-tool">
      <h3 className="calc-title">ماشین‌حساب طلا</h3>
      <p className="calc-sub">
        خرید با اجرت، سود فروشنده و مالیات؛ یا ارزش واقعی طلای خودتان را ببینید
      </p>

      <div className="calc-tabs" role="tablist" aria-label="نوع محاسبه">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "trade"}
          className={`calc-tab ${tab === "trade" ? "calc-tab--active" : ""}`}
          onClick={() => setTab("trade")}
        >
          خرید و فروش
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "value"}
          className={`calc-tab ${tab === "value" ? "calc-tab--active" : ""}`}
          onClick={() => setTab("value")}
        >
          ارزش طلای شما
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "intrinsic"}
          className={`calc-tab ${tab === "intrinsic" ? "calc-tab--active" : ""}`}
          onClick={() => setTab("intrinsic")}
        >
          حباب
        </button>
      </div>

      <KaratPicker karatId={karatId} onSelect={setKaratId} />

      {tab === "trade" ? (
        <TradeTab
          items={items}
          karat={karat}
          fields={trade}
          setField={setTradeField}
        />
      ) : tab === "value" ? (
        <ValueTab
          items={items}
          calculations={calculations}
          karat={karat}
          fields={value}
          setField={setValueField}
        />
      ) : (
        <IntrinsicTab calculations={calculations} items={items} karat={karat} />
      )}
    </div>
  );
}

function KaratPicker({ karatId, onSelect }: { karatId: string; onSelect: (id: string) => void }) {
  return (
    <div className="karat-picker" role="group" aria-label="عیار طلا">
      {KARATS.map((k) => (
        <button
          key={k.id}
          type="button"
          className={`karat ${k.id === karatId ? "karat--active" : ""}`}
          aria-pressed={k.id === karatId}
          onClick={() => onSelect(k.id)}
        >
          <span>{k.label}</span>
          <small>{k.sub}</small>
        </button>
      ))}
    </div>
  );
}

function TradeTab({
  items,
  karat,
  fields,
  setField
}: {
  items: PriceItem[];
  karat: Karat;
  fields: TradeFields;
  setField: (key: keyof TradeFields) => (value: string) => void;
}) {
  const livePrice = karatPrice(items, karat);

  const trade = useMemo(() => {
    const w = parseNum(fields.weight);
    const entered = parseNum(fields.price);
    const pricePerGram = entered > 0 ? entered : livePrice ?? 0;
    if (w <= 0 || pricePerGram <= 0) return null;

    const wagePct = Math.min(100, parseNum(fields.wagePct));
    const profitPct = Math.min(100, parseNum(fields.profitPct));
    const taxPct = Math.min(100, parseNum(fields.taxPct));

    const goldValue = w * pricePerGram;
    const wage = (goldValue * wagePct) / 100;
    const profit = ((goldValue + wage) * profitPct) / 100;
    const tax = ((wage + profit) * taxPct) / 100;
    const total = goldValue + wage + profit + tax;

    const sellPerGram = parseNum(fields.sellPrice);
    const sale = sellPerGram > 0 ? w * sellPerGram : null;
    const profitLoss = sale !== null ? sale - total : null;
    const profitPctTotal = profitLoss !== null && total > 0 ? (profitLoss / total) * 100 : null;

    return {
      w,
      pricePerGram,
      goldValue,
      wage,
      profit,
      tax,
      total,
      sale,
      profitLoss,
      profitPctTotal
    };
  }, [fields, livePrice]);

  return (
    <div role="tabpanel" aria-label="خرید و فروش">
      <div className="calc-form calc-form--trade">
        <label className="field">
          <span>وزن (گرم)</span>
          <input
            type="text"
            inputMode="decimal"
            value={fields.weight}
            placeholder="۱"
            onChange={(e) => setField("weight")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            قیمت هر گرم (تومان) <i className="field__opt">خالی = قیمت بازار</i>
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={fields.price}
            placeholder={livePrice !== null ? fmtPrice(livePrice, "TOMAN") : "مثلاً ۷٬۰۰۰٬۰۰۰"}
            onChange={(e) => setField("price")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>اجرت ساخت (٪)</span>
          <input
            type="text"
            inputMode="decimal"
            value={fields.wagePct}
            placeholder="مثلاً ۱۵"
            onChange={(e) => setField("wagePct")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>سود فروشنده (٪)</span>
          <input
            type="text"
            inputMode="decimal"
            value={fields.profitPct}
            placeholder="مثلاً ۷"
            onChange={(e) => setField("profitPct")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            مالیات (٪ از اجرت و سود) <i className="field__opt">معمولاً ۹</i>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={fields.taxPct}
            placeholder="۹"
            onChange={(e) => setField("taxPct")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            قیمت فروش هر گرم (تومان) <i className="field__opt">اختیاری</i>
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={fields.sellPrice}
            placeholder="برای دیدن سود یا زیان"
            onChange={(e) => setField("sellPrice")(e.target.value)}
          />
        </label>
      </div>

      {trade ? (
        <ul className="calc-rows">
          <li>
            <span>
              بهای طلا ({Number.isInteger(trade.w) ? faNum(trade.w) : faNum2(trade.w)} گرم ×{" "}
              {fmtPrice(trade.pricePerGram, "TOMAN")})
            </span>
            <b>
              <bdi>{fmtPrice(trade.goldValue, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          <li>
            <span>اجرت ساخت</span>
            <b>
              <bdi>{fmtPrice(trade.wage, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          <li>
            <span>سود فروشنده</span>
            <b>
              <bdi>{fmtPrice(trade.profit, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          <li>
            <span>مالیات</span>
            <b>
              <bdi>{fmtPrice(trade.tax, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          <li className="is-total">
            <span>جمع خرید</span>
            <b>
              <bdi>{fmtPrice(trade.total, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          {trade.sale !== null ? (
            <>
              <li>
                <span>مبلغ فروش</span>
                <b>
                  <bdi>{fmtPrice(trade.sale, "TOMAN")}</bdi> <i>تومان</i>
                </b>
              </li>
              <li className={`is-profit ${(trade.profitLoss ?? 0) >= 0 ? "up" : "down"}`}>
                <span>
                  {(trade.profitLoss ?? 0) >= 0 ? "سود" : "زیان"}
                  {trade.profitPctTotal !== null ? (
                    <i>
                      <bdi>{fmtPct(trade.profitPctTotal)}</bdi>
                    </i>
                  ) : null}
                </span>
                <b>
                  <bdi>{fmtChange(trade.profitLoss, "TOMAN")}</bdi> <i>تومان</i>
                </b>
              </li>
            </>
          ) : null}
        </ul>
      ) : (
        <p className="calc-empty">وزن را وارد کنید؛ قیمت هر گرم از بازار همین عیار پر می‌شود.</p>
      )}

      <p className="calc-note">
        جمع خرید = بهای طلا + اجرت + سود فروشنده + مالیات؛ مالیات ارزش افزوده روی اجرت و سود
        فروشنده حساب می‌شود. نرخ‌ها را فروشنده اعلام می‌کند؛ این محاسبه مبنای معامله نیست.
      </p>
    </div>
  );
}

function ValueTab({
  items,
  calculations,
  karat,
  fields,
  setField
}: {
  items: PriceItem[];
  calculations: CalculationsPayload | null;
  karat: Karat;
  fields: ValueFields;
  setField: (key: keyof ValueFields) => (value: string) => void;
}) {
  const marketPerGram = karatPrice(items, karat);
  const basis = calculations?.basis ?? null;

  const result = useMemo(() => {
    const w = parseNum(fields.weight);
    if (w <= 0) return null;
    const entered = parseNum(fields.price);
    const perGram = entered > 0 ? entered : marketPerGram;
    if (perGram === null || perGram <= 0) return null;

    const market = perGram * w;
    const intrinsic =
      basis && basis.ounceUsd > 0 && basis.usdToman > 0
        ? goldReferenceToman(basis.ounceUsd, basis.usdToman, karat.purity).mul(w).toNumber()
        : null;
    const bubble = intrinsic !== null ? market - intrinsic : null;
    const bubblePct =
      bubble !== null && intrinsic !== null && intrinsic > 0 ? (bubble / intrinsic) * 100 : null;
    const sellerPct = Math.min(100, parseNum(fields.profitPct));
    const sellerPerGram = sellerPct > 0 ? perGram * (1 - sellerPct / 100) : null;
    return {
      w,
      perGram,
      market,
      intrinsic: intrinsic !== null ? Math.round(intrinsic) : null,
      bubble: bubble !== null ? Math.round(bubble) : null,
      bubblePct,
      sellerPct,
      sellerPerGram,
      sellerBuy: sellerPerGram !== null ? sellerPerGram * w : null
    };
  }, [fields, marketPerGram, basis, karat]);

  return (
    <div role="tabpanel" aria-label="ارزش طلای شما">
      <div className="calc-form">
        <label className="field">
          <span>وزن (گرم)</span>
          <input
            type="text"
            inputMode="decimal"
            value={fields.weight}
            placeholder="۱"
            onChange={(e) => setField("weight")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            قیمت هر گرم (تومان) <i className="field__opt">خالی = قیمت بازار</i>
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={fields.price}
            placeholder={marketPerGram !== null ? fmtPrice(marketPerGram, "TOMAN") : "قیمت بازار"}
            onChange={(e) => setField("price")(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            سود فروشنده (٪) <i className="field__opt">چند درصد زیر قیمت می‌خرد</i>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={fields.profitPct}
            placeholder="مثلاً ۵"
            onChange={(e) => setField("profitPct")(e.target.value)}
          />
        </label>
      </div>

      {result ? (
        <div className="calc-result calc-result--value">
          <div>
            <span>ارزش بازار شما</span>
            <strong>{fmtPrice(result.market, "TOMAN")}</strong>
            <i>
              تومان · هر گرم {fmtPrice(result.perGram, "TOMAN")}
            </i>
          </div>
          {result.intrinsic !== null ? (
            <div>
              <span>ارزش ذاتی (از انس و دلار)</span>
              <strong>{fmtPrice(result.intrinsic, "TOMAN")}</strong>
              <i>تومان</i>
            </div>
          ) : null}
          {result.bubble !== null ? (
            <div>
              <span>{bubbleWord(result.bubblePct)}</span>
              <strong className={bubbleClass(result.bubblePct)}>
                <bdi>{fmtChange(result.bubble, "TOMAN")}</bdi>
              </strong>
              <i>
                تومان · <bdi>{fmtPct(result.bubblePct)}</bdi>
              </i>
            </div>
          ) : null}
          {result.sellerBuy !== null && result.sellerPerGram !== null ? (
            <div>
              <span>خرید فروشنده از شما</span>
              <strong>{fmtPrice(result.sellerBuy, "TOMAN")}</strong>
              <i>
                تومان · <bdi>{fmtPct(-result.sellerPct)}</bdi> زیر بازار · هر گرم{" "}
                {fmtPrice(result.sellerPerGram, "TOMAN")}
              </i>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="calc-empty">وزن را وارد کنید تا ارزش طلا با عیار انتخاب‌شده حساب شود.</p>
      )}

      <p className="calc-note">
        ارزش ذاتی = انس جهانی × دلار ÷ ۳۱٫۱۰۳۴۷۶۸ × عیار × وزن؛ ارزش بازار از قیمت واقعی همین
        عیار در تابلو می‌آید. «خرید فروشنده» ارزش بازار منهای درصد سود فروشنده است؛ نرخ واقعی را
        فروشنده اعلام می‌کند.
      </p>
    </div>
  );
}

function IntrinsicTab({
  calculations,
  items,
  karat
}: {
  calculations: CalculationsPayload | null;
  items: PriceItem[];
  karat: Karat;
}) {
  const [mode, setMode] = useState<Mode>("gold");
  const [coinId, setCoinId] = useState("emami");
  const [amount, setAmount] = useState("1");

  const basis = calculations?.basis ?? null;
  const qty = parseNum(amount);
  const goldMarket = karatPrice(items, karat);

  const result = useMemo(() => {
    if (!basis || qty <= 0) return null;
    if (mode === "gold") {
      const intrinsic = goldReferenceToman(basis.ounceUsd, basis.usdToman, karat.purity)
        .mul(qty)
        .toNumber();
      const market = goldMarket !== null ? goldMarket * qty : null;
      const bubble = market !== null ? market - intrinsic : null;
      const bubblePct = bubble !== null && intrinsic > 0 ? (bubble / intrinsic) * 100 : null;
      return {
        intrinsic: Math.round(intrinsic),
        market: market !== null ? Math.round(market) : null,
        bubble: bubble !== null ? Math.round(bubble) : null,
        bubblePct
      };
    }

    const inst = INSTRUMENT_BY_ID.get(coinId);
    if (!inst?.spec) return null;
    const intrinsic = coinIntrinsicToman(basis.ounceUsd, basis.usdToman, inst.spec)
      .mul(qty)
      .toNumber();
    const marketItem = items.find((i) => i.id === coinId);
    const market = marketItem?.price != null ? marketItem.price * qty : null;
    const bubble = market != null ? market - intrinsic : null;
    const bubblePct = bubble != null && intrinsic > 0 ? (bubble / intrinsic) * 100 : null;
    return {
      intrinsic: Math.round(intrinsic),
      market: market != null ? Math.round(market) : null,
      bubble: bubble != null ? Math.round(bubble) : null,
      bubblePct
    };
  }, [basis, mode, coinId, qty, karat, goldMarket, items]);

  return (
    <div role="tabpanel" aria-label="ارزش ذاتی و حباب">
      <div className="calc-form">
        <div className="seg" role="group" aria-label="انتخاب طلا یا سکه">
          <button
            type="button"
            className={`seg__btn ${mode === "gold" ? "seg__btn--active" : ""}`}
            aria-pressed={mode === "gold"}
            onClick={() => {
              setMode("gold");
              setAmount("1");
            }}
          >
            طلا
          </button>
          <button
            type="button"
            className={`seg__btn ${mode === "coin" ? "seg__btn--active" : ""}`}
            aria-pressed={mode === "coin"}
            onClick={() => {
              setMode("coin");
              setAmount("1");
            }}
          >
            سکه
          </button>
        </div>

        {mode === "coin" ? (
          <label className="field">
            <span>نوع سکه</span>
            <select value={coinId} onChange={(e) => setCoinId(e.target.value)}>
              {COIN_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span>{mode === "gold" ? "وزن (گرم)" : "تعداد"}</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(groupDigits(e.target.value, 3))}
          />
        </label>
      </div>

      {result ? (
        <div className="calc-result">
          <div>
            <span>ارزش ذاتی</span>
            <strong>{fmtPrice(result.intrinsic, "TOMAN")}</strong>
            <i>تومان</i>
          </div>
          <div>
            <span>مظنهٔ بازار</span>
            <strong>{fmtPrice(result.market, "TOMAN")}</strong>
            <i>تومان</i>
          </div>
          <div>
            <span>{bubbleWord(result.bubblePct)}</span>
            <strong className={bubbleClass(result.bubblePct)}>
              <bdi>{fmtChange(result.bubble, "TOMAN")}</bdi>
            </strong>
            <i>
              تومان · <bdi>{fmtPct(result.bubblePct)}</bdi>
            </i>
          </div>
        </div>
      ) : (
        <p className="calc-empty">
          {basis
            ? "وزن یا تعداد را وارد کنید."
            : "برای محاسبه، نرخ انس جهانی و دلار باید در دسترس باشد."}
        </p>
      )}

      <p className="calc-note">
        {calculations?.disclaimer ??
          "ارزش ذاتی، محاسبهٔ نظری بر پایهٔ انس جهانی و نرخ دلار است و قیمت معامله نیست."}
      </p>
    </div>
  );
}
