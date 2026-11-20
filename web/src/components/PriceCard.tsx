import type { PriceItem } from "@mesghalyar/shared";
import {
  STATUS_HINT,
  STATUS_LABEL,
  bubbleClass,
  bubbleWord,
  faNum,
  fmtChange,
  fmtPct,
  fmtPrice,
  fmtTime,
  trendClass
} from "../format";

interface Props {
  item: PriceItem;
  featured?: boolean;
  onSelect?: (id: string) => void;
}

export function PriceCard({ item, featured = false, onSelect }: Props) {
  const trend = trendClass(item.changePct);
  const bubble = item.calc?.kind === "theoretical-bubble" ? item.calc : null;
  const reference = item.calc?.kind === "platform-reference" ? item.calc : null;
  const interactive = Boolean(onSelect);
  const showBadge = item.status === "LIVE" || item.status === "UNAVAILABLE";

  return (
    <article
      className={[
        "card",
        featured ? "card--featured" : "",
        interactive ? "card--interactive" : "",
        item.status === "UNAVAILABLE" ? "card--muted" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={interactive ? () => onSelect?.(item.id) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(item.id);
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `نمایش نمودار ${item.title}` : item.title}
    >
      <header className="card__head">
        <h3 className="card__title">{item.title}</h3>
        {showBadge ? (
          <span
            className={`badge badge--${item.status.toLowerCase()}`}
            title={STATUS_HINT[item.status]}
          >
            {STATUS_LABEL[item.status]}
          </span>
        ) : null}
      </header>

      <div className="card__price">
        <span className="card__value">{fmtPrice(item.price, item.unit)}</span>
        <span className="card__unit">{item.unit === "TOMAN" ? "تومان" : "دلار"}</span>
      </div>

      {item.price === null && item.note ? (
        <p className="card__note">{item.note}</p>
      ) : (
        <div
          className={`card__change ${trend}`}
          title="تغییر قیمت در ۲۴ ساعت گذشته بر پایه قیمت‌های پایانی ثبت‌شده"
        >
          <span className="card__pct">
            <bdi>{fmtPct(item.changePct)}</bdi>
            <small className="card__pct-period">۲۴ ساعته</small>
          </span>
          <span className="card__delta">
            <bdi>{fmtChange(item.change, item.unit)}</bdi>
          </span>
        </div>
      )}

      {bubble ? (
        <div
          className="card__calc"
          title={`ارزش ذاتی: ${faNum(bubble.intrinsicToman ?? 0)} تومان — حباب = مظنه − ارزش ذاتی`}
        >
          <span>{bubbleWord(bubble.bubblePct ?? null)}</span>
          <span className="card__calc-val">
            <b className={bubbleClass(bubble.bubblePct ?? null)}>
              <bdi>{fmtPct(bubble.bubblePct ?? null)}</bdi>
            </b>
            <span className="muted">
              <bdi>
                {fmtChange(bubble.bubbleToman ?? null, "TOMAN")}
                {" ت"}
              </bdi>
            </span>
          </span>
        </div>
      ) : reference ? (
        <div
          className="card__calc"
          title={`قیمت مرجع (انس × دلار × عیار): ${faNum(reference.referenceToman ?? 0)} تومان — حباب = بازار − مرجع`}
        >
          <span>{bubbleWord(reference.premiumPct ?? null)}</span>
          <span className="card__calc-val">
            <b className={bubbleClass(reference.premiumPct ?? null)}>
              <bdi>{fmtPct(reference.premiumPct ?? null)}</bdi>
            </b>
            <span className="muted">
              <bdi>
                {fmtChange(reference.premiumToman ?? null, "TOMAN")}
                {" ت"}
              </bdi>
            </span>
          </span>
        </div>
      ) : null}

      <footer className="card__foot">
        <time>{fmtTime(item.ts)}</time>
      </footer>
    </article>
  );
}
