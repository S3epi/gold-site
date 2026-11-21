import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CalculationsPayload, PriceItem } from "@mesghalyar/shared";
import { Calculator } from "./Calculator";
import { channelUsername } from "../channel";
import { BRAND } from "../brand";

interface Props {
  channel: string | null;
  calculations: CalculationsPayload | null;
  items: PriceItem[];
  board: boolean;
  onChart: () => void;
  onReference: () => void;
  onToggleBoard: () => void;
  onImage: () => void;
}

export function SiteMenu({
  channel,
  calculations,
  items,
  board,
  onChart,
  onReference,
  onToggleBoard,
  onImage
}: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const close = (): void => {
    setOpen(false);
    btnRef.current?.focus();
  };

  const navigate = (fn: () => void): void => {
    setOpen(false);
    fn();
  };

  return (
    <div className="menu">
      <button
        ref={btnRef}
        type="button"
        className="menu__btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="منوی سایت"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {open
        ? createPortal(
            <div
              className="menu__overlay"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <div
                ref={panelRef}
                className="menu__panel"
                role="dialog"
                aria-modal="true"
                aria-label="منوی سایت"
                tabIndex={-1}
              >
                <header className="menu__head">
                  <div className="menu__head-text">
                    <strong>منوی {BRAND.name}</strong>
                    <small>ابزارها و کانال اطلاع‌رسانی</small>
                  </div>
                  <button type="button" className="menu__close" aria-label="بستن منو" onClick={close}>
                    ×
                  </button>
                </header>

                <nav className="menu__links" aria-label="لینک‌های منو">
                  <button type="button" className="menu__link" onClick={() => navigate(onChart)}>
                    <span className="menu__link-main">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M4 4v16h16" strokeLinecap="round" />
                        <path d="m7.5 15 4-5 2.5 2.5 4.5-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>نمودار قیمت</span>
                    </span>
                    <small>روند قیمت‌ها</small>
                  </button>

                  <button type="button" className="menu__link" onClick={() => navigate(onReference)}>
                    <span className="menu__link-main">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
                        <path d="M8.5 8h7" strokeLinecap="round" />
                        <path
                          d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>مرجع محاسباتی</span>
                    </span>
                    <small>مقادیر نظری</small>
                  </button>

                  <button type="button" className="menu__link" onClick={() => navigate(onImage)}>
                    <span className="menu__link-main">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                        <path d="m6.5 16 4.2-4.8 3 3.2 2-2.2 1.8 1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="9" cy="9.2" r="1.1" />
                      </svg>
                      <span>خروجی عکس قیمت‌ها</span>
                    </span>
                    <small>دانلود تصویر PNG</small>
                  </button>

                  <button
                    type="button"
                    className={`menu__link ${board ? "menu__link--board-on" : ""}`}
                    onClick={() => navigate(onToggleBoard)}
                  >
                    <span className="menu__link-main">
                      {board ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                          <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" strokeLinecap="round" />
                          <path d="M9 12h6" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                          <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" strokeLinecap="round" />
                        </svg>
                      )}
                      <span>{board ? "خروج از تابلو" : "تابلو"}</span>
                    </span>
                    <small>{board ? "بازگشت به حالت صفحه کامل" : "نمایش تمام‌صفحهٔ قیمت‌ها"}</small>
                  </button>

                  {channel ? (
                    <a
                      className="menu__link"
                      href={channel}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                    >
                      <span className="menu__link-main">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                          <path d="M21.5 3.5 2.8 10.6l6.1 2.3 2.2 6.2 3.2-4.3 4.4 3.1 2.8-14.4Z" strokeLinejoin="round" />
                          <path d="m8.9 12.9 5.4-4.6" strokeLinecap="round" />
                        </svg>
                        <span>کانال قیمت</span>
                      </span>
                      <small>
                        <bdi>{channelUsername(channel)}</bdi>
                      </small>
                    </a>
                  ) : (
                    <span className="menu__link is-off" aria-disabled="true">
                      <span className="menu__link-main">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                          <path d="M21.5 3.5 2.8 10.6l6.1 2.3 2.2 6.2 3.2-4.3 4.4 3.1 2.8-14.4Z" strokeLinejoin="round" />
                          <path d="m8.9 12.9 5.4-4.6" strokeLinecap="round" />
                        </svg>
                        <span>کانال قیمت</span>
                      </span>
                      <small>به‌زودی</small>
                    </span>
                  )}
                </nav>

                <div className="menu__calc">
                  <Calculator calculations={calculations} items={items} />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
