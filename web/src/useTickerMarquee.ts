import { useEffect, type RefObject } from "react";

const SPEED = 42; // px per second

// CSS keyframe loops are unreliable here: in an RTL page the track hugs the
// right edge and translateX(50%) resolves differently across browsers, freezing
// the ticker on Windows. Drive the offset per frame instead, moving right so the
// duplicated groups wrap seamlessly, and pause while hovered or focused.
export function useTickerMarquee(
  trackRef: RefObject<HTMLDivElement | null>,
  active: boolean
): void {
  useEffect(() => {
    const track = trackRef.current;
    if (!active || !track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let groupWidth = 0;
    const measure = (): void => {
      const group = track.firstElementChild as HTMLElement | null;
      groupWidth = group?.offsetWidth ?? 0;
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(track);

    let offset = 0;
    let last = performance.now();
    let paused = false;
    let frame = 0;

    const step = (now: number): void => {
      const delta = Math.min(now - last, 100);
      last = now;
      // A group narrower than the viewport would leave a visible gap while it
      // wraps, so leave the strip static in that case.
      const viewport = track.parentElement?.clientWidth ?? 0;
      if (!paused && groupWidth > 0 && track.offsetWidth >= viewport) {
        offset = (offset + (SPEED * delta) / 1000) % groupWidth;
        track.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    const pause = (): void => {
      paused = true;
    };
    const resume = (): void => {
      paused = false;
      last = performance.now();
    };

    const ticker = track.parentElement;
    ticker?.addEventListener("mouseenter", pause);
    ticker?.addEventListener("mouseleave", resume);
    ticker?.addEventListener("focusin", pause);
    ticker?.addEventListener("focusout", resume);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      ticker?.removeEventListener("mouseenter", pause);
      ticker?.removeEventListener("mouseleave", resume);
      ticker?.removeEventListener("focusin", pause);
      ticker?.removeEventListener("focusout", resume);
      track.style.transform = "";
    };
  }, [trackRef, active]);
}
