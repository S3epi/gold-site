import { describe, expect, it } from "vitest";
import {
  epochFromTehran,
  parseTimeIrHtml,
  tehranClock
} from "../../shared/src/index.js";

describe("tehran clock", () => {
  it("converts a Tehran wall clock to UTC epoch", () => {
    const epoch = epochFromTehran({
      year: 2026,
      month: 11,
      day: 20,
      hour: 18,
      minute: 19,
      second: 8
    });
    expect(epoch).toBe(Date.UTC(2026, 10, 20, 14, 49, 8));
  });

  it("renders Tehran wall-clock parts for a UTC instant", () => {
    const clock = tehranClock(Date.UTC(2026, 10, 20, 14, 49, 8));
    expect(clock).toEqual({
      year: 2026,
      month: 11,
      day: 20,
      hour: 18,
      minute: 19,
      second: 8
    });
  });

  it("round-trips across midnight", () => {
    const epoch = Date.UTC(2026, 10, 20, 21, 5, 30);
    expect(epochFromTehran(tehranClock(epoch))).toBe(epoch);
  });
});

describe("parseTimeIrHtml", () => {
  it("reads the embedded created_date clock", () => {
    const html = String.raw`...{\"created_date\":\"2026-11-20T18:19:08\",\"time\":{...}}...`;
    expect(parseTimeIrHtml(html)).toBe(Date.UTC(2026, 10, 20, 14, 49, 8));
  });

  it("returns null when the payload has no clock", () => {
    expect(parseTimeIrHtml("<html><body>maintenance</body></html>")).toBeNull();
  });

  it("rejects implausible years", () => {
    expect(parseTimeIrHtml('{"created_date":"0202-11-20T18:19:08"}')).toBeNull();
  });
});
