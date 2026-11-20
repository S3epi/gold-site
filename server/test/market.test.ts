import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_BY_ID,
  MITHQAL_G,
  MITHQAL_PURITY,
  TROY_OUNCE_G,
  aggregateChartPoints,
  bubbleOf,
  buildPriceItems,
  coinIntrinsicToman,
  goldReferenceToman,
  mithqalReferenceToman,
  normalizeDigits,
  parseNumber,
  parseTehranTs,
  platformConsensus,
  pureGramToman,
  statusOf,
  type LiveEntry,
  type PlatformPrice,
  type Quality
} from "../../shared/src/index.js";

const quality: Quality = { staleAfterMs: 900_000, liveWithinMs: 180_000, disputePct: 2 };

describe("parseNumber", () => {
  it("parses separators and Persian digits", () => {
    expect(parseNumber("1,234,567")).toBe(1234567);
    expect(parseNumber(" 243,093,000 ")).toBe(243093000);
    expect(parseNumber("۳۵۵۸")).toBe(3558);
    expect(parseNumber("<span>0.71%</span>")).toBe(0.71);
  });

  it("rejects garbage", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it("normalizes Arabic-Indic digits", () => {
    expect(normalizeDigits("١٢٣٤")).toBe("1234");
  });
});

describe("parseTehranTs", () => {
  it("converts Tehran wall-clock to UTC", () => {
    const ts = parseTehranTs("2026-11-19 17:05:12");
    expect(ts).toBe(Date.UTC(2026, 10, 19, 13, 35, 12));
  });

  it("rejects invalid input", () => {
    expect(parseTehranTs("yesterday")).toBeNull();
    expect(parseTehranTs(123 as unknown as string)).toBeNull();
  });
});

describe("statusOf", () => {
  const now = 1_800_000_000_000;

  it("classifies by age", () => {
    expect(statusOf(null, now, quality)).toBe("UNAVAILABLE");
    expect(statusOf(now - 60_000, now, quality)).toBe("LIVE");
    expect(statusOf(now - 10 * 60_000, now, quality)).toBe("DELAYED");
    expect(statusOf(now - 20 * 60_000, now, quality)).toBe("STALE");
  });
});

describe("gold / coin formulas", () => {
  const ounce = 3568.67;
  const usd = 269_970;

  it("derives pure gram from troy ounce and USD", () => {
    const expected = (ounce * usd) / TROY_OUNCE_G;
    expect(pureGramToman(ounce, usd).toNumber()).toBeCloseTo(expected, 6);
  });

  it("applies purities", () => {
    expect(goldReferenceToman(ounce, usd, 0.75).toNumber()).toBeCloseTo(
      pureGramToman(ounce, usd).mul(0.75).toNumber(),
      6
    );
    expect(mithqalReferenceToman(ounce, usd).toNumber()).toBeCloseTo(
      pureGramToman(ounce, usd).mul(MITHQAL_PURITY).mul(MITHQAL_G).toNumber(),
      6
    );
  });

  it("computes coin intrinsic from weight and purity", () => {
    const emami = coinIntrinsicToman(ounce, usd, { weightG: 8.133, purity: 0.9 });
    expect(emami.toNumber()).toBeCloseTo(pureGramToman(ounce, usd).mul(8.133).mul(0.9).toNumber(), 6);
  });

  it("signs the bubble and keeps precision", () => {
    const intrinsic = pureGramToman(ounce, usd);
    const above = bubbleOf(Math.round(intrinsic.toNumber()) + 100_000, intrinsic);
    const below = bubbleOf(Math.round(intrinsic.toNumber()) - 100_000, intrinsic);
    expect(above.bubbleToman).toBeGreaterThan(0);
    expect(above.bubblePct).toBeGreaterThan(0);
    expect(below.bubbleToman).toBeLessThan(0);
    expect(below.bubblePct).toBeLessThan(0);
  });
});

describe("platformConsensus", () => {
  const at = 1_800_000_000_000;
  const p = (priceRial: number, changePct: number | null = null): PlatformPrice => ({
    id: "talasea",
    priceRial,
    changePct,
    fetchedAt: at
  });

  it("returns the exact middle for three sources", () => {
    const result = platformConsensus([p(236_100_000), p(236_420_000), p(236_600_000)])!;
    expect(result.priceRial).toBe(236_420_000);
    expect(result.disputed).toBe(false);
    expect(result.spreadPct).toBeCloseTo(0.21, 1);
  });

  it("averages the two middles for two sources", () => {
    const result = platformConsensus([p(236_100_000), p(236_500_000)])!;
    expect(result.priceRial).toBe(236_300_000);
    expect(result.sources).toHaveLength(2);
  });

  it("flags disagreement above the threshold", () => {
    const result = platformConsensus([p(230_000_000), p(240_000_000)])!;
    expect(result.disputed).toBe(true);
  });

  it("drops out-of-bounds values and returns null when nothing is valid", () => {
    expect(platformConsensus([p(0), p(5_000)])).toBeNull();
    const single = platformConsensus([p(5_000), p(236_420_000)])!;
    expect(single.sources).toHaveLength(1);
    expect(single.spreadPct).toBeNull();
  });

  it("takes the median change", () => {
    const result = platformConsensus([p(236_100_000, -2.4), p(236_420_000, -2), p(236_600_000, 3)])!;
    expect(result.changePct).toBe(-2);
  });
});

describe("instrument mapping", () => {
  it("uses the real mithqal key, not the 1g coin", () => {
    expect(INSTRUMENT_BY_ID.get("mithqal")?.tgjuKey).toBe("mesghal");
    expect(INSTRUMENT_BY_ID.get("coin1g")?.tgjuKey).toBe("gerami");
  });

  it("keeps the wholesale melted bar priced per mithqal", () => {
    const melted = INSTRUMENT_BY_ID.get("melted")!;
    expect(melted.reference).toEqual({ kind: "mithqal" });
    expect(melted.title).toContain("هر مثقال");
  });

  it("exposes the online melted 18k without a TGJU key", () => {
    const online = INSTRUMENT_BY_ID.get("melted18")!;
    expect(online.tgjuKey).toBeUndefined();
    expect(online.reference).toEqual({ kind: "gold", purity: 0.75 });
  });
});

describe("buildPriceItems", () => {
  const now = 1_800_000_000_000;

  it("forces status and applies dispute", () => {
    const entries = new Map<string, LiveEntry | null>([
      [
        "melted18",
        {
          price: 236_420_000,
          ts: now,
          receivedAt: now,
          source: "platforms",
          changePct: -2.4
        }
      ]
    ]);
    const items = buildPriceItems(entries, now, quality, {
      forcedStatus: { melted18: "DELAYED" }
    });
    expect(items.find((i) => i.id === "melted18")?.status).toBe("DELAYED");

    const disputed = buildPriceItems(entries, now, quality, { disputed: new Set(["melted18"]) });
    expect(disputed.find((i) => i.id === "melted18")?.status).toBe("DISPUTED");
  });

  it("marks missing instruments unavailable without inventing prices", () => {
    const items = buildPriceItems(new Map(), now, quality);
    for (const item of items) {
      expect(item.price).toBeNull();
      expect(item.status).toBe("UNAVAILABLE");
    }
  });
});

describe("aggregateChartPoints", () => {
  it("sorts, filters invalid points, and buckets above the cap", () => {
    const points = [
      { ts: 3_000, price: 30 },
      { ts: 1_000, price: 10 },
      { ts: 2_000, price: Number.NaN },
      { ts: 4_000, price: 0 }
    ];
    expect(aggregateChartPoints(points)).toEqual([
      { t: 1, p: 10 },
      { t: 3, p: 30 }
    ]);

    const many = Array.from({ length: 10 }, (_, i) => ({ ts: i * 1_000, price: i + 1 }));
    const bucketed = aggregateChartPoints(many, 3);
    expect(bucketed.length).toBeLessThanOrEqual(4);
    expect(bucketed[bucketed.length - 1]).toEqual({ t: 9, p: 10 });
  });
});
