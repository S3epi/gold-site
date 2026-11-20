import { useEffect, useRef, useState } from "react";
import type { PricesPayload } from "@mesghalyar/shared";
import { createTransport, type MarketTransport } from "./transport";

const POLL_MS = 20_000;
const HIDDEN_POLL_MS = 90_000;
const MAX_BACKOFF_MS = 120_000;

export interface MarketState {
  data: PricesPayload | null;
  error: string | null;
  mode: "server" | "static" | null;
  transport: React.MutableRefObject<MarketTransport | null>;
}

export function useMarket(): MarketState {
  const [data, setData] = useState<PricesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"server" | "static" | null>(null);
  const transport = useRef<MarketTransport | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_MS;
    let running = false;

    const tick = async (): Promise<void> => {
      if (cancelled || running) return;
      running = true;
      try {
        if (!transport.current) {
          transport.current = await createTransport();
          if (!cancelled) setMode(transport.current.mode);
        }
        const payload = await transport.current.prices();
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
        delay = POLL_MS;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "خطا در دریافت داده");
        }
        delay = Math.min(Math.max(delay * 2, POLL_MS), MAX_BACKOFF_MS);
      } finally {
        running = false;
        if (!cancelled) {
          timer = setTimeout(tick, document.hidden ? HIDDEN_POLL_MS : delay);
        }
      }
    };

    const onVisibility = (): void => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { data, error, mode, transport };
}
