import { useMemo, useState } from "react";
import {
  INSTRUMENT_BY_ID,
  coinIntrinsicToman,
  goldReferenceToman,
  type CalculationsPayload,
  type PriceItem
} from "@mesghalyar/shared";
import { bubbleClass, bubbleWord, fmtChange, fmtPct, fmtPrice } from "../format";

const GOLD_OPTIONS = [
  { id: "gold18", label: "طلای ۱۸ عیار", purity: 0.75 },
  { id: "gold24", label: "طلای ۲۴ عیار", purity: 0.999 },
  { id: "gold740", label: "طلای ۷۴۰", purity: 0.74 }
];

const COIN_OPTIONS = ["emami", "bahar", "half", "quarter"].map((id) => ({
  id,
  label: INSTRUMENT_BY_ID.get(id)?.title ?? id
}));

type Mode = "gold" | "coin";

export function Calculator({
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
    <section className="panel calc-tool" id="calculator">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">ماشین‌حساب طلا و سکه</h2>
          <p className="panel__sub">
            ارزش ذاتی را از انس جهانی و نرخ دلار حساب می‌کند و حباب مثبت یا منفی را نسبت به مظنهٔ
            بازار نشان می‌دهد
          </p>
        </div>
      </div>

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
    </section>
  );
}
