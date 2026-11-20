import { useMemo, useState } from "react";
import {
  INSTRUMENT_BY_ID,
  coinIntrinsicToman,
  goldReferenceToman,
  type CalculationsPayload,
  type PriceItem
} from "@mesghalyar/shared";
import { bubbleClass, bubbleWord, faNum, faNum2, fmtChange, fmtPct, fmtPrice, parseNum } from "../format";

const GOLD_OPTIONS = [
  { id: "gold18", label: "طلای ۱۸ عیار", purity: 0.75 },
  { id: "gold24", label: "طلای ۲۴ عیار", purity: 0.999 },
  { id: "gold740", label: "طلای ۷۴۰", purity: 0.74 }
];

const COIN_OPTIONS = ["emami", "bahar", "half", "quarter"].map((id) => ({
  id,
  label: INSTRUMENT_BY_ID.get(id)?.title ?? id
}));

type Tab = "trade" | "intrinsic";
type Mode = "gold" | "coin";

export function Calculator({
  calculations,
  items
}: {
  calculations: CalculationsPayload | null;
  items: PriceItem[];
}) {
  const [tab, setTab] = useState<Tab>("trade");

  return (
    <div className="calc-tool">
      <h3 className="calc-title">ماشین‌حساب طلا</h3>
      <p className="calc-sub">
        هزینهٔ خرید و فروش را با اجرت و مالیات حساب کنید، یا ارزش ذاتی و حباب را ببینید
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
          aria-selected={tab === "intrinsic"}
          className={`calc-tab ${tab === "intrinsic" ? "calc-tab--active" : ""}`}
          onClick={() => setTab("intrinsic")}
        >
          ارزش ذاتی و حباب
        </button>
      </div>

      {tab === "trade" ? (
        <TradeTab items={items} />
      ) : (
        <IntrinsicTab calculations={calculations} items={items} />
      )}
    </div>
  );
}

function TradeTab({ items }: { items: PriceItem[] }) {
  const [weight, setWeight] = useState("1");
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [wage, setWage] = useState("");
  const [taxRate, setTaxRate] = useState("");

  const liveGold = items.find((i) => i.id === "gold18" && i.price !== null)?.price ?? null;

  const trade = useMemo(() => {
    const w = parseNum(weight);
    const buyPrice = parseNum(buy);
    if (w <= 0 || buyPrice <= 0) return null;
    const sellPrice = parseNum(sell);
    const wageToman = parseNum(wage);
    const rate = Math.min(100, parseNum(taxRate));
    const taxToman = (wageToman * rate) / 100;
    const goldCost = w * buyPrice;
    const total = goldCost + wageToman + taxToman;
    const sale = sellPrice > 0 ? w * sellPrice : null;
    const profit = sale !== null ? sale - total : null;
    const profitPct = profit !== null && total > 0 ? (profit / total) * 100 : null;
    return { w, goldCost, wageToman, taxToman, total, sale, profit, profitPct };
  }, [weight, buy, sell, wage, taxRate]);

  return (
    <div role="tabpanel" aria-label="خرید و فروش">
      <div className="calc-form calc-form--trade">
        <label className="field">
          <span>وزن (گرم)</span>
          <input
            type="text"
            inputMode="decimal"
            value={weight}
            placeholder="۱"
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="field">
          <span>قیمت خرید هر گرم (تومان)</span>
          <input
            type="text"
            inputMode="decimal"
            value={buy}
            placeholder={liveGold !== null ? fmtPrice(liveGold, "TOMAN") : "مثلاً ۷٬۰۰۰٬۰۰۰"}
            onChange={(e) => setBuy(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            قیمت فروش هر گرم (تومان) <i className="field__opt">اختیاری</i>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={sell}
            placeholder={liveGold !== null ? fmtPrice(liveGold, "TOMAN") : "برای دیدن سود یا زیان"}
            onChange={(e) => setSell(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            اجرت (تومان) <i className="field__opt">اختیاری</i>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={wage}
            placeholder="مثلاً ۲۰۰٬۰۰۰"
            onChange={(e) => setWage(e.target.value)}
          />
        </label>
        <label className="field field--full">
          <span>
            مالیات (٪ از اجرت) <i className="field__opt">اختیاری</i>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={taxRate}
            placeholder="نرخ را خودتان وارد کنید؛ مثلاً ۹"
            onChange={(e) => setTaxRate(e.target.value)}
          />
        </label>
      </div>

      {trade ? (
        <ul className="calc-rows">
          <li>
            <span>
              بهای طلا ({Number.isInteger(trade.w) ? faNum(trade.w) : faNum2(trade.w)} گرم)
            </span>
            <b>
              <bdi>{fmtPrice(trade.goldCost, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          <li>
            <span>اجرت</span>
            <b>
              <bdi>{fmtPrice(trade.wageToman, "TOMAN")}</bdi> <i>تومان</i>
            </b>
          </li>
          <li>
            <span>مالیات</span>
            <b>
              <bdi>{fmtPrice(trade.taxToman, "TOMAN")}</bdi> <i>تومان</i>
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
              <li className={`is-profit ${trade.profit !== null && trade.profit >= 0 ? "up" : "down"}`}>
                <span>
                  {trade.profit !== null && trade.profit >= 0 ? "سود" : "زیان"}
                  {trade.profitPct !== null ? (
                    <i>
                      <bdi>{fmtPct(trade.profitPct)}</bdi>
                    </i>
                  ) : null}
                </span>
                <b>
                  <bdi>{fmtChange(trade.profit, "TOMAN")}</bdi> <i>تومان</i>
                </b>
              </li>
            </>
          ) : null}
        </ul>
      ) : (
        <p className="calc-empty">وزن و قیمت خرید هر گرم را وارد کنید.</p>
      )}

      <p className="calc-note">
        مالیات بر ارزش افزوده معمولاً روی اجرت حساب می‌شود؛ نرخ را خودتان وارد کنید. این محاسبهٔ
        تقریبی است و مبنای معامله نیست.
      </p>
    </div>
  );
}

function IntrinsicTab({
  calculations,
  items
}: {
  calculations: CalculationsPayload | null;
  items: PriceItem[];
}) {
  const [mode, setMode] = useState<Mode>("gold");
  const [goldId, setGoldId] = useState("gold18");
  const [coinId, setCoinId] = useState("emami");
  const [amount, setAmount] = useState("1");

  const basis = calculations?.basis ?? null;
  const instrumentId = mode === "gold" ? goldId : coinId;
  const marketItem = items.find((i) => i.id === instrumentId) ?? null;
  const qty = Math.max(0, Number(amount) || 0);

  const result = useMemo(() => {
    if (!basis || qty <= 0) return null;
    const inst = INSTRUMENT_BY_ID.get(instrumentId);
    if (!inst) return null;

    let intrinsic: number;
    if (mode === "gold") {
      const purity = GOLD_OPTIONS.find((g) => g.id === goldId)?.purity ?? 0.75;
      intrinsic = goldReferenceToman(basis.ounceUsd, basis.usdToman, purity)
        .mul(qty)
        .toNumber();
    } else if (inst.spec) {
      intrinsic = coinIntrinsicToman(basis.ounceUsd, basis.usdToman, inst.spec)
        .mul(qty)
        .toNumber();
    } else {
      return null;
    }

    const market = marketItem?.price != null ? marketItem.price * qty : null;
    const bubble = market != null ? market - intrinsic : null;
    const bubblePct = bubble != null && intrinsic > 0 ? (bubble / intrinsic) * 100 : null;

    return {
      intrinsic: Math.round(intrinsic),
      market: market != null ? Math.round(market) : null,
      bubble: bubble != null ? Math.round(bubble) : null,
      bubblePct
    };
  }, [basis, mode, goldId, coinId, instrumentId, qty, marketItem]);

  const switchMode = (next: Mode): void => {
    setMode(next);
    setAmount("1");
  };

  return (
    <div role="tabpanel" aria-label="ارزش ذاتی و حباب">
      <div className="calc-form">
        <div className="seg" role="group" aria-label="انتخاب طلا یا سکه">
          <button
            type="button"
            className={`seg__btn ${mode === "gold" ? "seg__btn--active" : ""}`}
            aria-pressed={mode === "gold"}
            onClick={() => switchMode("gold")}
          >
            طلا
          </button>
          <button
            type="button"
            className={`seg__btn ${mode === "coin" ? "seg__btn--active" : ""}`}
            aria-pressed={mode === "coin"}
            onClick={() => switchMode("coin")}
          >
            سکه
          </button>
        </div>

        <label className="field">
          <span>{mode === "gold" ? "عیار" : "نوع سکه"}</span>
          <select
            value={instrumentId}
            onChange={(e) => {
              if (mode === "gold") setGoldId(e.target.value);
              else setCoinId(e.target.value);
            }}
          >
            {(mode === "gold" ? GOLD_OPTIONS : COIN_OPTIONS).map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{mode === "gold" ? "وزن (گرم)" : "تعداد"}</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step={mode === "gold" ? "0.01" : "1"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
          {basis ? "وزن یا تعداد را وارد کنید." : "برای محاسبه، نرخ انس جهانی و دلار باید در دسترس باشد."}
        </p>
      )}

      <p className="calc-note">
        {calculations?.disclaimer ??
          "ارزش ذاتی، محاسبهٔ نظری بر پایهٔ انس جهانی و نرخ دلار است و قیمت معامله نیست."}
      </p>
    </div>
  );
}
