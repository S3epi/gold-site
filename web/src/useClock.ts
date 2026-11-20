import { useEffect, useState } from "react";
import { CLOCK_SYNC_MS, referenceNow, syncReferenceTime } from "./serverClock";

/** Ticks once per second from the time.ir-anchored reference clock. */
export function useClock(): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = (): void => {
      if (!cancelled) setNow(referenceNow());
    };

    const sync = (): void => {
      void syncReferenceTime(true).finally(tick);
    };

    const timer = setInterval(tick, 1_000);
    const resync = setInterval(() => void syncReferenceTime(), CLOCK_SYNC_MS);
    const onVisible = (): void => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", sync);
    sync();

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(resync);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", sync);
    };
  }, []);

  return now;
}
