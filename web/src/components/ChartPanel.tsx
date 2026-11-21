import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IPriceLine,
  type ISeriesApi,
  type IChartApi,
  type UTCTimestamp
} from "lightweight-charts";
import {
  INSTRUMENTS,
  PERIODS,
  PERIOD_LABELS,
  type HistoryPayload,
  type Period,
  type PriceItem
} from "@mesghalyar/shared";
import type { MarketTransport } from "../transport";
import { faNum, faNum2, fmtDateTime, fmtPct, fmtPrice, fmtTime } from "../format";
import { FlashNumber } from "./FlashNumber";

// Times are shifted so the chart's UTC axis reads as Tehran local time.
const TEHRAN_OFFSET_SEC = 12_600;
// Five Fibonacci retracement supports across the visible range (S1 nearest the high).
const SUPPORT_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];

interface Props {
  transport: React.MutableRefObject<MarketTransport | null>;
  mode: "server" | "static" | null;
  instrumentId: string;
  onInstrumentChange: (id: string) => void;
  liveItem: PriceItem | null;
  refreshKey: number;
}

export function ChartPanel({
  transport,
  mode,
  instrumentId,
  onInstrumentChange,
  liveItem,
  refreshKey
}: Props) {
  const [period, setPeriod] = useState<Period>("1m");
  const [payload, setPayload] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const dataKeyRef = useRef<string>("");
  const precisionRef = useRef<0 | 2>(0);
  const lastTimeRef = useRef<number>(-Infinity);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8f97ac",
        fontFamily: "'Vazirmatn Variable', Tahoma, sans-serif",
        fontSize: 12,
        attributionLogo: false
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.045)" },
        horzLines: { color: "rgba(255,255,255,0.045)" }
      },
      rightPriceScale: {
        borderColor: "rgba(233,196,106,0.22)",
        scaleMargins: { top: 0.12, bottom: 0.12 }
      },
      timeScale: {
        borderColor: "rgba(233,196,106,0.22)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(246,223,160,0.45)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#8a6414"
        },
        horzLine: {
          color: "rgba(246,223,160,0.45)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#8a6414"
        }
      },
      localization: {
        locale: "fa-IR",
        priceFormatter: (value: number) =>
          precisionRef.current ? faNum2(value) : faNum(Math.round(value))
      }
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#f0c75e",
      topColor: "rgba(240,199,94,0.30)",
      bottomColor: "rgba(240,199,94,0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "price", precision: 0, minMove: 1 }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.hidden = true;
    el.appendChild(tooltip);
    tooltipRef.current = tooltip;

    chart.subscribeCrosshairMove((param) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      if (
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        param.point.x > el.clientWidth ||
        param.point.y > el.clientHeight
      ) {
        tip.hidden = true;
        return;
      }
      const data = param.seriesData.get(series) as { value?: number } | undefined;
      if (!data || data.value === undefined) {
        tip.hidden = true;
        return;
      }
      const realMs = ((param.time as number) - TEHRAN_OFFSET_SEC) * 1000;
      const shown = precisionRef.current ? faNum2(data.value) : faNum(Math.round(data.value));
      tip.innerHTML = `
        <div class="chart-tooltip__time">${fmtDateTime(realMs)}</div>
        <div class="chart-tooltip__price">${shown}</div>
      `;
      tip.hidden = false;
      const width = 168;
      const left = Math.min(Math.max(param.point.x - width / 2, 6), el.clientWidth - width - 6);
      const top = Math.min(Math.max(param.point.y - 74, 6), el.clientHeight - 74);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      tooltipRef.current = null;
      dataKeyRef.current = "";
      lastTimeRef.current = -Infinity;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Drop the previous instrument's series so stale values cannot be read
    // under the newly selected chip while the history request is in flight.
    setPayload(null);

    const load = async (): Promise<void> => {
      try {
        if (!transport.current) return;
        const result = await transport.current.history(instrumentId, period);
        if (!cancelled) {
          setPayload(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "دریافت تاریخچه ناموفق بود");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [instrumentId, period, mode, transport, refreshKey]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !payload) return;

    const key = `${payload.instrument.id}:${payload.period}`;
    const sameSelection = dataKeyRef.current === key;
    const range = sameSelection ? chart.timeScale().getVisibleLogicalRange() : null;

    const nextPrecision: 0 | 2 = payload.instrument.unit === "USD" ? 2 : 0;
    if (precisionRef.current !== nextPrecision) {
      precisionRef.current = nextPrecision;
      series.applyOptions({
        priceFormat: {
          type: "price",
          precision: nextPrecision,
          minMove: nextPrecision === 2 ? 0.01 : 1
        }
      });
    }

    series.setData(
      payload.points.map((p) => ({
        time: (p.t + TEHRAN_OFFSET_SEC) as UTCTimestamp,
        value: p.p
      }))
    );
    lastTimeRef.current = payload.points.length
      ? payload.points[payload.points.length - 1].t
      : -Infinity;

    if (range) {
      chart.timeScale().setVisibleLogicalRange(range);
    } else {
      chart.timeScale().fitContent();
    }
    dataKeyRef.current = key;
  }, [payload]);

  // The board polls every 20 seconds; push each new real observation onto the
  // series so the chart moves with the prices instead of waiting a minute.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !payload || !liveItem) return;
    if (liveItem.id !== payload.instrument.id) return;
    if (liveItem.price === null || !liveItem.ts) return;
    const t = Math.floor(liveItem.ts / 1000);
    if (t <= lastTimeRef.current) return;
    series.update({ time: (t + TEHRAN_OFFSET_SEC) as UTCTimestamp, value: liveItem.price });
    lastTimeRef.current = t;
  }, [liveItem, payload]);

  const resetView = (): void => {
    chartRef.current?.timeScale().fitContent();
  };

  const points = payload?.points ?? [];
  const values = points.map((p) => p.p);
  const high = values.length ? Math.max(...values) : null;
  const low = values.length ? Math.min(...values) : null;
  const open = values.length ? values[0] : null;
  const last = values.length ? values[values.length - 1] : null;
  const unit = payload?.instrument.unit ?? "TOMAN";

  const supports = useMemo(() => {
    const supportsEnabled = payload?.instrument.id === "gold18" || payload?.instrument.id === "usd";
    if (!supportsEnabled || payload.points.length < 2) return null;
    const prices = payload.points.map((p) => p.p);
    const top = Math.max(...prices);
    const bottom = Math.min(...prices);
    const range = top - bottom;
    if (range <= 0) return null;
    return SUPPORT_RATIOS.map((ratio, index) => ({
      level: top - range * ratio,
      label: `حمایت ${faNum(index + 1)}`
    }));
  }, [payload]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // chart was already recreated
      }
    }
    priceLinesRef.current = [];
    if (!supports) return;
    priceLinesRef.current = supports.map((support, index) =>
      series.createPriceLine({
        price: support.level,
        color: `rgba(233,196,106,${0.5 - index * 0.06})`,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: support.label
      })
    );
  }, [supports]);

  const lastSeen = Math.max(
    payload?.meta.lastTs ?? 0,
    points.length ? points[points.length - 1].t * 1000 : 0,
    liveItem?.id === payload?.instrument.id ? liveItem?.ts ?? 0 : 0
  );
  const todayHigh = liveItem && liveItem.id === payload?.instrument.id ? liveItem.high ?? null : null;
  const todayLow = liveItem && liveItem.id === payload?.instrument.id ? liveItem.low ?? null : null;

  return (
    <section className="panel chart-panel" id="chart">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">نمودار قیمت</h2>
          <p className="panel__sub">
            تاریخچه واقعی ثبت‌شده؛ بازه‌هایی که داده کافی ندارند غیرفعال‌اند
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={resetView}>
          بازنشانی نمایش
        </button>
      </div>

      <div className="chips" role="tablist" aria-label="انتخاب کالا">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst.id}
            type="button"
            role="tab"
            aria-selected={inst.id === instrumentId}
            className={`chip ${inst.id === instrumentId ? "chip--active" : ""}`}
            onClick={() => onInstrumentChange(inst.id)}
          >
            {inst.short}
          </button>
        ))}
      </div>

      <div className="periods" role="group" aria-label="انتخاب بازه زمانی">
        {PERIODS.map((p) => {
          const availability = payload?.periods?.[p];
          const disabled = availability ? !availability.available : false;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={p === period}
              disabled={disabled}
              title={disabled ? "داده کافی برای این بازه ثبت نشده است" : undefined}
              className={`period ${p === period ? "period--active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          );
        })}
      </div>

      <div className="chart-wrap">
        <div
          ref={containerRef}
          className="chart"
          role="img"
          aria-label={`نمودار قیمت ${payload?.instrument.title ?? ""}`}
        />
        {loading && !payload ? <div className="chart-loading">در حال دریافت تاریخچه…</div> : null}
        {!loading && payload && payload.points.length === 0 ? (
          <div className="chart-empty">برای این بازه تاریخچهٔ ثبت‌شده‌ای موجود نیست</div>
        ) : null}
        {error ? <div className="chart-error">{error}</div> : null}
      </div>

      <dl className="chart-stats">
        <div>
          <dt>قیمت فعلی</dt>
          <dd>
            <FlashNumber value={liveItem?.price ?? last} unit={unit} />
          </dd>
        </div>
        <div>
          <dt>تغییر ۲۴ ساعته</dt>
          <dd className={liveItem?.changePct ? (liveItem.changePct > 0 ? "up" : "down") : ""}>
            <bdi>{fmtPct(liveItem?.changePct ?? null)}</bdi>
          </dd>
        </div>
        <div>
          <dt>بیشترین بازه</dt>
          <dd>{fmtPrice(high, unit)}</dd>
        </div>
        <div>
          <dt>کمترین بازه</dt>
          <dd>{fmtPrice(low, unit)}</dd>
        </div>
        {todayHigh !== null ? (
          <div>
            <dt>بیشترین امروز</dt>
            <dd>{fmtPrice(todayHigh, unit)}</dd>
          </div>
        ) : null}
        {todayLow !== null ? (
          <div>
            <dt>کمترین امروز</dt>
            <dd>{fmtPrice(todayLow, unit)}</dd>
          </div>
        ) : null}
        <div>
          <dt>ابتدای بازه</dt>
          <dd>{fmtPrice(open, unit)}</dd>
        </div>
        <div>
          <dt>واحد</dt>
          <dd>{unit === "TOMAN" ? "تومان" : "دلار"}</dd>
        </div>
      </dl>

      {supports ? (
        <div className="chart-supports" aria-label="سطوح حمایتی بازار">
          <span className="chart-supports__title">سطوح حمایت ({unit === "TOMAN" ? "تومان" : "دلار"})</span>
          <div className="chart-supports__list">
            {supports.map((support) => (
              <span key={support.label} className="chart-supports__item">
                <i>{support.label}</i>
                <b>
                  <bdi>{fmtPrice(support.level, unit)}</bdi>
                </b>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="chart-meta">
        <span>آخرین مشاهده: {fmtTime(lastSeen || null)}</span>
        <span>
          بازه: {payload ? `${fmtDateTime(payload.range.from)} تا ${fmtDateTime(payload.range.to)}` : "—"}
        </span>
        <span>{payload ? `${faNum2(payload.points.length)} نقطه` : ""}</span>
      </div>
    </section>
  );
}
