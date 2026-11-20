import { useEffect, useMemo, useState } from "react";
import { CATEGORY_TITLE, type PriceItem } from "@zernama/shared";
import { useMarket } from "./useMarket";
import { ChartPanel } from "./components/ChartPanel";
import { PriceCard } from "./components/PriceCard";
import {
  faNum,
  fmtAge,
  fmtClock,
  fmtDateTime,
  fmtPct,
  fmtPrice,
  trendClass
} from "./format";

const TICKER_IDS = ["gold18", "gold24", "emami", "bahar", "usd", "eur", "xau"];

export default function App() {
  const { data, error, mode, transport } = useMarket();
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState("gold18");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const items = data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const gold = items.filter((item) => item.category === "gold");
  const coins = items.filter((item) => item.category === "coin");
  const currencies = items.filter((item) => item.category === "currency");
  const calculations = data?.calculations ?? null;
  const featured = byId.get("gold18") ?? null;
  const selected = byId.get(selectedId) ?? null;
  const ticker = TICKER_IDS.map((id) => byId.get(id)).filter(
    (item): item is NonNullable<typeof item> => Boolean(item && item.price !== null)
  );

  const openChart = (id: string): void => {
    setSelectedId(id);
    document.getElementById("chart")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const freshness = (item: PriceItem | null | undefined): string => {
    if (!item || !item.ts) return "در دسترس نیست";
    if (mode === "static" && item.status === "DELAYED") return "مظنه روزانه منبع";
    return fmtAge(item.ts, now.getTime());
  };

  const networkWarning =
    data && data.network.overall !== "ALL_CONNECTED"
      ? data.network.overall === "ALL_PROVIDERS_UNAVAILABLE"
        ? "هیچ منبع قیمتی در حال حاضر پاسخ نمی‌دهد؛ آخرین مقادیر معتبر (در صورت وجود) با وضعیت کهنه نمایش داده می‌شوند."
        : "بخشی از منابع در دسترس نیست؛ برخی اقلام با آخرین مقدار معتبر یا وضعیت تأخیری نمایش داده می‌شوند."
      : null;

  return (
    <div className="app">
      <header className="header">
        <div className="wrap header__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" role="img">
                <path
                  d="M20 3 33 11.5v17L20 37 7 28.5v-17L20 3Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M20 12.5 26.5 20 20 27.5 13.5 20 20 12.5Z"
                  fill="currentColor"
                  opacity="0.85"
                />
              </svg>
            </span>
            <span className="brand__text">
              <strong>زرنما</strong>
              <small>تابلوی قیمت طلا، سکه و ارز</small>
            </span>
          </div>

          <div className="header__meta">
            <div className="clock" title="ساعت به وقت تهران">
              <span className="clock__label">تهران</span>
              <span className="clock__time" aria-live="off">
                {fmtClock(now)}
              </span>
            </div>
            <span
              className={`mode-pill mode-pill--${mode ?? "none"}`}
              title="منبع اتصال داده‌ها"
            >
              {mode === "server"
                ? "سرور اختصاصی"
                : mode === "static"
                  ? "نسخه استاتیک"
                  : "در حال اتصال…"}
            </span>
          </div>
        </div>

        {ticker.length > 0 ? (
          <div className="ticker" aria-label="نوار قیمت‌ها">
            <div className="ticker__track">
              {[0, 1].map((copy) => (
                <div className="ticker__group" key={copy} aria-hidden={copy === 1}>
                  {ticker.map((item) => (
                    <button
                      key={`${copy}-${item.id}`}
                      type="button"
                      className="ticker__item"
                      onClick={() => openChart(item.id)}
                      tabIndex={copy === 1 ? -1 : 0}
                    >
                      <span className="ticker__name">{item.short}</span>
                      <span className="ticker__price">{fmtPrice(item.price, item.unit)}</span>
                      <span className={`ticker__pct ${trendClass(item.changePct)}`}>
                        {fmtPct(item.changePct)}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main className="wrap main">
        {error && !data ? (
          <div className="alert alert--error" role="alert">
            <strong>دریافت داده ناموفق بود.</strong>
            <span>{error}</span>
            <button type="button" className="btn btn--ghost" onClick={() => location.reload()}>
              تلاش دوباره
            </button>
          </div>
        ) : null}

        {networkWarning ? (
          <div className="alert alert--warn" role="status">
            {networkWarning}
          </div>
        ) : null}

        {mode === "static" ? (
          <div className="alert alert--info" role="note">
            این نسخه روی GitHub Pages اجرا می‌شود و داده‌ها را مستقیم از منابع عمومی با CORS
            دریافت می‌کند. به‌دلیل نبود زمان دقیق مظنه در برخی سرویس‌ها، مقادیر داخلی با وضعیت
            «تأخیری» نمایش داده می‌شوند و به‌عنوان زنده برچسب‌گذاری نمی‌شوند.
          </div>
        ) : null}

        <section className="hero" aria-label="خلاصه بازار">
          <div className="hero__main">
            {featured ? (
              <PriceCard item={featured} featured staticMode={mode === "static"} onSelect={openChart} />
            ) : (
              <div className="card card--featured card--skeleton" aria-hidden="true">
                <div className="skel skel--sm" />
                <div className="skel skel--lg" />
                <div className="skel skel--md" />
              </div>
            )}
          </div>
          <div className="hero__stats">
            <StatTile
              title="دلار آمریکا"
              value={data?.usd ? fmtPrice(data.usd.price, "TOMAN") : "—"}
              sub={data?.usd ? `تومان · ${freshness(data.usd)}` : "در دسترس نیست"}
              tone={trendClass(data?.usd?.changePct ?? null)}
              onClick={() => openChart("usd")}
            />
            <StatTile
              title="انس جهانی طلا"
              value={data?.ounce ? fmtPrice(data.ounce.price, "USD") : "—"}
              sub={data?.ounce ? `دلار · ${freshness(data.ounce)}` : "در دسترس نیست"}
              tone={trendClass(data?.ounce?.changePct ?? null)}
              onClick={() => openChart("xau")}
            />
            <StatTile
              title="گرم طلای خالص (مرجع)"
              value={fmtPrice(calculations?.pureGramToman ?? null, "TOMAN")}
              sub="تومان · محاسبه از انس و دلار"
              tone="flat"
            />
            <StatTile
              title="مثقال طلا (مرجع)"
              value={fmtPrice(calculations?.mithqalReferenceToman ?? null, "TOMAN")}
              sub="تومان · عیار ۷۰۵"
              tone="flat"
            />
          </div>
        </section>

        <BoardSection
          title={CATEGORY_TITLE.gold}
          hint="قیمت هر گرم به تومان"
          items={gold}
          onSelect={openChart}
          loading={!data && !error}
          staticMode={mode === "static"}
        />

        <BoardSection
          title={CATEGORY_TITLE.coin}
          hint="مظنه‌های بازار؛ کارت را برای نمودار انتخاب کنید"
          items={coins}
          onSelect={openChart}
          loading={!data && !error}
          staticMode={mode === "static"}
        />

        <section className="panel currency-panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">{CATEGORY_TITLE.currency}</h2>
              <p className="panel__sub">قیمت‌ها به تومان، از منبع داخلی</p>
            </div>
            <span className="panel__stamp">
              آخرین به‌روزرسانی: {data ? fmtDateTime(data.generatedAt) : "—"}
            </span>
          </div>
          <ul className="currency-list">
            {(currencies.length ? currencies : PLACEHOLDER_ROWS).map((item) =>
              "id" in item ? (
                <li key={item.id}>
                  <button type="button" className="currency-row" onClick={() => openChart(item.id)}>
                    <span className="currency-row__name">{item.title}</span>
                    <span className="currency-row__price">{fmtPrice(item.price, item.unit)}</span>
                    <span className={`currency-row__pct ${trendClass(item.changePct)}`}>
                      {fmtPct(item.changePct)}
                    </span>
                    <span className={`dot dot--${item.status.toLowerCase()}`} title={item.status} />
                  </button>
                </li>
              ) : (
                <li key={item.key} className="currency-row currency-row--ghost" aria-hidden="true">
                  <span className="skel skel--line" />
                </li>
              )
            )}
          </ul>
        </section>

        <ChartPanel
          transport={transport}
          mode={mode}
          instrumentId={selectedId}
          onInstrumentChange={setSelectedId}
          liveItem={selected}
          refreshKey={refreshKey}
        />

        <section className="panel calc-panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">مرجع محاسباتی زرنما</h2>
              <p className="panel__sub">
                مقادیر نظری از انس جهانی، دلار و عیار محاسبه می‌شوند؛ مظنه بازار نیستند
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              به‌روزرسانی نمودار
            </button>
          </div>

          <div className="calc-grid">
            <CalcItem label="طلای ۱۸ عیار (مرجع)" value={calculations?.gold18ReferenceToman} />
            <CalcItem label="طلای ۲۴ عیار (مرجع)" value={calculations?.gold24ReferenceToman} />
            <CalcItem label="طلای ۷۴۰ (مرجع)" value={calculations?.gold740ReferenceToman} />
            <CalcItem label="مثقال طلا (مرجع)" value={calculations?.mithqalReferenceToman} />
            <CalcItem label="گرم خالص" value={calculations?.pureGramToman} />
            <CalcItem label="دلار مبنا" value={calculations?.usdToman} />
          </div>

          {calculations && calculations.coins.length > 0 ? (
            <div className="bubble-table">
              <h3>حباب سکه</h3>
              <table>
                <thead>
                  <tr>
                    <th>سکه</th>
                    <th>مظنه بازار</th>
                    <th>ارزش ذاتی</th>
                    <th>حباب</th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.coins.map((coin) => (
                    <tr key={coin.id}>
                      <td>{coin.title}</td>
                      <td>{faNum(coin.marketToman)}</td>
                      <td>{faNum(coin.intrinsicToman)}</td>
                      <td className={trendClass(coin.bubblePct)}>{fmtPct(coin.bubblePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="calc-note">{calculations?.disclaimer ?? "—"}</p>
          <p className="calc-basis">
            مبنا: انس {calculations?.ounceUsd ? `$${fmtPrice(calculations.ounceUsd, "USD")}` : "—"} ·
            دلار {calculations?.usdToman ? `${fmtPrice(calculations.usdToman, "TOMAN")} تومان` : "—"}
          </p>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer__inner">
          <p>
            زرنما فقط تابلوی قیمت است و معامله یا مشاوره مالی ارائه نمی‌کند. داده‌ها از منابع
            عمومی بازار خوانده می‌شوند و ممکن است با تأخیر یا قطعی منبع منتشر شوند.
          </p>
          <p className="footer__meta">
            <a href="https://github.com/S3epi/gold-site" target="_blank" rel="noreferrer">
              مخزن پروژه در GitHub
            </a>
            <span>·</span>
            <span>وضعیت شبکه: {networkLabel(data?.network.overall)}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

const PLACEHOLDER_ROWS = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];

function networkLabel(value: string | undefined): string {
  if (value === "ALL_CONNECTED") return "همه منابع متصل";
  if (value === "PARTIAL_CONNECTIVITY") return "اتصال جزئی";
  if (value === "ALL_PROVIDERS_UNAVAILABLE") return "بدون منبع در دسترس";
  return "در حال بررسی";
}

function BoardSection({
  title,
  hint,
  items,
  onSelect,
  loading,
  staticMode
}: {
  title: string;
  hint: string;
  items: PriceItem[];
  onSelect: (id: string) => void;
  loading: boolean;
  staticMode: boolean;
}) {
  if (loading) {
    return (
      <section className="board">
        <div className="board__head">
          <h2 className="board__title">{title}</h2>
        </div>
        <div className="board__grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="card card--skeleton" aria-hidden="true">
              <div className="skel skel--sm" />
              <div className="skel skel--lg" />
              <div className="skel skel--md" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="board">
      <div className="board__head">
        <h2 className="board__title">{title}</h2>
        <p className="board__hint">{hint}</p>
      </div>
      <div className="board__grid">
        {items.map((item) => (
          <PriceCard
            key={item.id}
            item={item}
            onSelect={onSelect}
            staticMode={staticMode}
          />
        ))}
      </div>
    </section>
  );
}

function StatTile({
  title,
  value,
  sub,
  tone,
  onClick
}: {
  title: string;
  value: string;
  sub: string;
  tone: "up" | "down" | "flat";
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="tile__title">{title}</span>
      <span className={`tile__value ${tone}`}>{value}</span>
      <span className="tile__sub">{sub}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="tile tile--interactive" onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className="tile">{body}</div>;
}

function CalcItem({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="calc-item">
      <span className="calc-item__label">{label}</span>
      <span className="calc-item__value">{fmtPrice(value ?? null, "TOMAN")}</span>
      <span className="calc-item__unit">تومان</span>
    </div>
  );
}
