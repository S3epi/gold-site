import { useEffect, useRef, useState } from "react";

export type FlashDir = "up" | "down";

/** Flashes "up"/"down" for a moment whenever the observed number changes. */
export function useFlash(value: number | null): FlashDir | null {
  const prev = useRef<number | null>(null);
  const [dir, setDir] = useState<FlashDir | null>(null);

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) {
      prev.current = value;
      return;
    }
    const before = prev.current;
    prev.current = value;
    if (before === null || before === value) return;
    setDir(value > before ? "up" : "down");
    const timer = setTimeout(() => setDir(null), 1100);
    return () => clearTimeout(timer);
  }, [value]);

  return dir;
}
