import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_TITLE, type PriceItem } from "@mesghalyar/shared";
import { useMarket } from "./useMarket";
import { useClock } from "./useClock";
import { ChartPanel } from "./components/ChartPanel";
import { FlashNumber } from "./components/FlashNumber";
import { OwnerPanel } from "./components/OwnerPanel";
import { PriceCard } from "./components/PriceCard";
import { SiteMenu } from "./components/SiteMenu";
import { PriceImageModal } from "./components/PriceImageModal";
import { AnnouncementBanner } from "./components/AnnouncementBanner";
import {
  bubbleClass,
  faNum,
  fmtAge,
  fmtChange,
  fmtClock,
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtPrice,
  trendClass
} from "./format";
import { referenceNow } from "./serverClock";
import { readChannel } from "./channel";
import { useFlash } from "./useFlash";
import { useTickerMarquee } from "./useTickerMarquee";
import { useWakeLock } from "./useWakeLock";
import { applyTheme, readTheme, type Theme } from "./theme";
import { BRAND } from "./brand";

const TICKER_IDS = [
  "gold18",
  "melted",
  "mithqal",
  "gold24",
  "emami",
  "bahar",
  "usd",
  "eur",
  "xau"
];

// The marquee wraps after one group, so the remaining copies only have to keep
// wide screens covered (4 × ~1800px).
const TICKER_COPIES = [0, 1, 2, 3];

export default function App() {
  const { data, error, mode, transport } = useMarket();
  const clockNow = useClock();
  const [selectedId, setSelectedId] = useState("gold18");
  const [refreshKey, setRefreshKey] = useState(0);
  const [channel, setChannel] = useState<string | null>(() => readChannel());
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [board, setBoard] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const brandTaps = useRef<number[]>([]);
  const tickerTrackRef = useRef<HTMLDivElement | null>(null);

  useWakeLock();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (location.hash === "#owner") {
      setOwnerOpen(true);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);

  useEffect(() => {
    const sync = (): void => {
      if (!document.fullscreenElement) setBoard(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleBoard = (): void => {
    if (board) {
      setBoard(false);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }
    setBoard(true);
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  };

  const tapBrand = (): void => {
    const now = Date.now();
    brandTaps.current = [...brandTaps.current.filter((t) => now - t < 2500), now];
    if (brandTaps.current.length >= 5) {
      brandTaps.current = [];
      setOwnerOpen(true);
    }
  };

  const items = data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const gold = items.filter((item) => item.category === "gold");
  const coins = items.filter((item) => item.category === "coin");
  const currencies = items.filter((item) => item.category === "currency");
  const calculations = data?.calculations ?? null;
  const featured = byId.get("gold18") ?? byId.get("melted18") ?? null;
  const selected = byId.get(selectedId) ?? null;
  const ticker = TICKER_IDS.map((id) => byId.get(id)).filter(
    (item): item is NonNullable<typeof item> => Boolean(item && item.price !== null)
  );

  useTickerMarquee(tickerTrackRef, ticker.length > 0);

  // scrollIntoView alone leaves the target under the sticky header, so subtract
  // its real height (which includes the price ticker) before scrolling.
  const scrollToSection = (id: string): void => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector<HTMLElement>(".header");
    const offset = (header?.offsetHeight ?? 0) + 12;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  };

  const openChart = (id: string): void => {
    setSelectedId(id);
    scrollToSection("chart");
  };

  const freshness = (item: PriceItem | null | undefined): string => {
    if (!item || !item.ts) return "در دسترس نیست";
    return fmtAge(item.ts, clockNow ?? referenceNow());
  };

  const networkWarning =
    data && data.network.overall === "ALL_PROVIDERS_UNAVAILABLE"
      ? "در حال حاضر دادهٔ زنده‌ای از بازار دریافت نشد؛ اعداد نمایش‌داده‌شده مربوط به آخرین دریافت موفق هستند."
      : null;

  return (
    <div className={`app${board ? " app--board" : ""}`}>
      <header className="header">
        <div className="wrap header__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true" onClick={tapBrand}>
              <svg viewBox="0 0 40 40" role="img">
                <path d={BRAND.iconOuter} fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d={BRAND.iconInner} fill="currentColor" opacity="0.85" />
              </svg>
            </span>
            <span className="brand__text">
              <strong>{BRAND.name}</strong>
              <small>{BRAND.tagline}</small>
            </span>
          </div>

          <div className="header__meta">
            <div className="clock" title="ساعت رسمی تهران">
              <span className="clock__label">تهران</span>
              <span className="clock__time" aria-live="off">
                {clockNow === null ? "—" : fmtClock(new Date(clockNow))}
              </span>
              <span className="clock__date" aria-live="off">
                {clockNow === null ? "" : fmtDate(new Date(clockNow))}
              </span>
            </div>
            <button
              type="button"
              className="menu__btn theme-btn"
              aria-label={theme === "dark" ? "روشن کردن تم" : "تیره کردن تم"}
              title={theme === "dark" ? "تم روشن" : "تم تیره"}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5" />
                  <path
                    d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path
                    d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 1 0 10.7 10.7Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <SiteMenu
              channel={channel}
              calculations={calculations}
              items={items}
              board={board}
              onChart={() => scrollToSection("chart")}
              onReference={() => scrollToSection("reference")}
              onToggleBoard={toggleBoard}
              onImage={() => setImageOpen(true)}
            />
          </div>
        </div>

        {ticker.length > 0 ? (
          <div className="ticker" aria-label="نوار قیمت‌ها">
            <div className="ticker__track" ref={tickerTrackRef}>
              {TICKER_COPIES.map((copy) => (
                <div className="ticker__group" key={copy} aria-hidden={copy > 0}>
                  {ticker.map((item) => (
                    <button
                      key={`${copy}-${item.id}`}
                      type="button"
                      className="ticker__item"
                      onClick={() => openChart(item.id)}
                      tabIndex={copy > 0 ? -1 : 0}
                    >
                      <span className="ticker__name">{item.short}</span>
                      <FlashNumber className="ticker__price" value={item.price} unit={item.unit} />
                      <span
                        className={`ticker__pct ${trendClass(item.changePct)}`}
                        title="تغییر در ۲۴ ساعت گذشته"
                      >
                        <bdi>{fmtPct(item.changePct)}</bdi>
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

        <section className="hero" aria-label="خلاصه بازار">
          <div className="hero__main">
            {featured ? (
              <PriceCard item={featured} featured onSelect={openChart} />
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
              flashValue={data?.usd?.price ?? null}
              onClick={() => openChart("usd")}
            />
            <StatTile
              title="انس جهانی طلا"
              value={data?.ounce ? fmtPrice(data.ounce.price, "USD") : "—"}
              sub={data?.ounce ? `دلار · ${freshness(data.ounce)}` : "در دسترس نیست"}
              tone={trendClass(data?.ounce?.changePct ?? null)}
              flashValue={data?.ounce?.price ?? null}
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
          hint="قیمت‌ها به تومان؛ ۱۸ عیار بازار زنده است، آبشدهٔ آنلاین با تأخیر چنددقیقه‌ای"
          items={gold}
          onSelect={openChart}
          loading={!data && !error}
        />

        <BoardSection
          title={CATEGORY_TITLE.coin}
          hint="مظنه‌های بازار؛ کارت را برای نمودار انتخاب کنید"
          items={coins}
          onSelect={openChart}
          loading={!data && !error}
        />

        <section className="panel currency-panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">{CATEGORY_TITLE.currency}</h2>
              <p className="panel__sub">قیمت‌ها به تومان</p>
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
                    <FlashNumber className="currency-row__price" value={item.price} unit={item.unit} />
                    <span
                      className={`currency-row__pct ${trendClass(item.changePct)}`}
                      title="تغییر در ۲۴ ساعت گذشته"
                    >
                      <bdi>{fmtPct(item.changePct)}</bdi>
                    </span>
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
          theme={theme}
          instrumentId={selectedId}
          onInstrumentChange={setSelectedId}
          liveItem={selected}
          refreshKey={refreshKey}
        />

        <section className="panel calc-panel" id="reference">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">مرجع محاسباتی {BRAND.name}</h2>
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
                    <th>مظنه بازار (تومان)</th>
                    <th>ارزش ذاتی (تومان)</th>
                    <th>حباب (تومان)</th>
                    <th>حباب (٪)</th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.coins.map((coin) => (
                    <tr key={coin.id}>
                      <td>{coin.title}</td>
                      <td>{faNum(coin.marketToman)}</td>
                      <td>{faNum(coin.intrinsicToman)}</td>
                      <td className={bubbleClass(coin.bubblePct)}>
                        {fmtChange(coin.bubbleToman, "TOMAN")}
                      </td>
                      <td className={bubbleClass(coin.bubblePct)}>{fmtPct(coin.bubblePct)}</td>
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
          <p className="footer__disclaimer">
            <strong>هشدار معامله:</strong> قیمت‌های این سایت صرفاً برای اطلاع و محاسبه است و نباید مبنای
            هیچ معامله‌ای قرار گیرد. {BRAND.name} تابلو و ابزار محاسبه است، نه کارگزاری یا مشاور مالی، و
            هیچ مسئولیتی در قبال تصمیم‌ها، معاملات یا زیان‌های ناشی از استفاده از این اطلاعات نمی‌پذیرد.
          </p>
        </div>
      </footer>

      {ownerOpen ? (
        <OwnerPanel onClose={() => setOwnerOpen(false)} onChannelChange={setChannel} />
      ) : null}

      {imageOpen ? <PriceImageModal onClose={() => setImageOpen(false)} items={items} /> : null}

      <AnnouncementBanner />

      {board ? (
        <button type="button" className="board-exit" onClick={toggleBoard}>
          خروج از تابلو
        </button>
      ) : null}
    </div>
  );
}

const PLACEHOLDER_ROWS = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];

function BoardSection({
  title,
  hint,
  items,
  onSelect,
  loading
}: {
  title: string;
  hint: string;
  items: PriceItem[];
  onSelect: (id: string) => void;
  loading: boolean;
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
          <PriceCard key={item.id} item={item} onSelect={onSelect} />
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
  flashValue,
  onClick
}: {
  title: string;
  value: string;
  sub: string;
  tone: "up" | "down" | "flat";
  flashValue?: number | null;
  onClick?: () => void;
}) {
  const flash = useFlash(flashValue ?? null);
  const body = (
    <>
      <span className="tile__title">{title}</span>
      <span className={`tile__value ${tone}${flash ? ` flash flash--${flash}` : ""}`}>{value}</span>
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
