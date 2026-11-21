import { useEffect } from "react";

type Sentinel = {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

/**
 * Keeps the screen awake while the board is open. Browsers drop the lock when
 * the tab is hidden, so it is requested again when the page becomes visible.
 */
export function useWakeLock(): void {
  useEffect(() => {
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!api?.request) return;

    let sentinel: Sentinel | null = null;
    let disposed = false;

    const acquire = async (): Promise<void> => {
      if (disposed || document.visibilityState !== "visible" || sentinel) return;
      try {
        const lock = await api.request("screen");
        if (disposed) {
          void lock.release().catch(() => undefined);
          return;
        }
        sentinel = lock;
      } catch {
        // Permission denied or unsupported on this browser; the site still works.
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        void acquire();
      } else if (sentinel) {
        const lock = sentinel;
        sentinel = null;
        void lock.release().catch(() => undefined);
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, []);
}
