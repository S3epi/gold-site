import type { PriceItem } from "@zernama/shared";
import {
  STATUS_HINT,
  STATUS_LABEL,
  fmtChange,
  fmtPct,
  fmtPrice,
  fmtTime,
  trendClass
} from "../format";

interface Props {
  item: PriceItem;
  featured?: boolean;
  staticMode?: boolean;
  onSelect?: (id: string) => void;
}

export function PriceCard({ item, featured = false, staticMode = false, onSelect }: Props) {
  const trend = trendClass(item.changePct);
  const bubble = item.calc?.kind === "theoretical-bubble" ? item.calc : null;
  const reference = item.calc?.kind === "platform-reference" ? item.calc : null;
  const interactive = Boolean(onSelect);

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
        <span
          className={`badge badge--${item.status.toLowerCase()}`}
          title={STATUS_HINT[item.status]}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </header>

      <div className="card__price">
        <span className="card__value">{fmtPrice(item.price, item.unit)}</span>
        <span className="card__unit">{item.unit === "TOMAN" ? "تومان" : "دلار"}</span>
      </div>

      {item.price === null && item.note ? (
        <p className="card__note">{item.note}</p>
      ) : (
        <div className={`card__change ${trend}`}>
          <span className="card__pct">{fmtPct(item.changePct)}</span>
          <span className="card__delta">{fmtChange(item.change, item.unit)}</span>
        </div>
      )}

      {bubble ? (
        <div className="card__calc">
          <span>حباب نظری</span>
          <b className={trendClass(bubble.bubblePct ?? null)}>
            {fmtPct(bubble.bubblePct ?? null)}
          </b>
        </div>
      ) : reference ? (
        <div className="card__calc">
          <span>مرجع محاسباتی</span>
          <b>{fmtPrice(reference.referenceToman ?? null, "TOMAN")}</b>
        </div>
      ) : null}

      <footer className="card__foot">
        <span className="card__source">{item.source ?? "منبع نامشخص"}</span>
        <time>
          {staticMode && item.status === "DELAYED" ? "مظنه روزانه منبع" : fmtTime(item.ts)}
        </time>
      </footer>
    </article>
  );
}
