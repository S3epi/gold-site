import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PriceItem } from "@mesghalyar/shared";
import {
  buildPriceImage,
  imageFileName,
  IMAGE_CATEGORY_LABEL,
  type ImageCategory
} from "../priceImage";

const CATEGORIES: ImageCategory[] = ["gold", "currency", "all"];

export function PriceImageModal({ onClose, items }: { onClose: () => void; items: PriceItem[] }) {
  const [category, setCategory] = useState<ImageCategory>("gold");
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setMessage(null);
    setFailed(false);

    buildPriceImage(items, category)
      .then((next) => {
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const nextUrl = URL.createObjectURL(next);
        urlRef.current = nextUrl;
        setBlob(next);
        setUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setMessage("ساخت تصویر در این مرورگر ممکن نشد. مرورگر را به‌روز کنید و دوباره امتحان کنید.");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [items, category]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const download = (): void => {
    if (!blob) return;
    try {
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      if (typeof a.download !== "string") {
        throw new Error("download-unsupported");
      }
      a.href = href;
      a.download = imageFileName();
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4_000);
      setFailed(false);
      setMessage("دانلود شروع شد. اگر فایلی ذخیره نشد، مجوز دانلود مرورگر را بررسی کنید.");
    } catch {
      setFailed(true);
      setMessage(
        "مرورگر اجازهٔ دانلود نداد. مجوز دانلود (Downloads) را در تنظیمات مرورگر فعال کنید یا از دکمهٔ «ارسال تصویر» استفاده کنید."
      );
    }
  };

  const share = async (): Promise<void> => {
    if (!blob) return;
    try {
      const file = new File([blob], imageFileName(), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "قیمت‌های نرخینو" });
        setMessage("پنجرهٔ ارسال تصویر باز شد.");
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setMessage("تصویر در حافظه کپی شد؛ می‌توانید آن را در پیام‌رسان جای‌گذاری کنید.");
    } catch {
      setFailed(true);
      setMessage(
        "ارسال یا کپی تصویر ممکن نشد. دسترسی مرورگر به کلیپ‌بورد یا اشتراک‌گذاری را اجازه دهید."
      );
    }
  };

  return createPortal(
    <div
      className="img-modal"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="img-modal__panel" role="dialog" aria-modal="true" aria-label="خروجی عکس قیمت‌ها">
        <header className="img-modal__head">
          <div>
            <strong>خروجی عکس قیمت‌ها</strong>
            <small>تصویر با نشان و نام نرخینو ساخته می‌شود</small>
          </div>
          <button type="button" className="menu__close" aria-label="بستن" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="img-modal__cats" role="group" aria-label="دستهٔ قیمت">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`seg__btn ${cat === category ? "seg__btn--active" : ""}`}
              aria-pressed={cat === category}
              onClick={() => setCategory(cat)}
            >
              {IMAGE_CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        <div className="img-modal__preview">
          {busy ? <span className="img-modal__busy">در حال ساخت تصویر…</span> : null}
          {url ? <img src={url} alt="پیش‌نمایش تصویر قیمت‌ها" /> : null}
        </div>

        {message ? (
          <p className={`img-modal__msg ${failed ? "is-error" : ""}`} role="status">
            {message}
          </p>
        ) : null}

        <div className="img-modal__actions">
          <button type="button" className="btn btn--gold" disabled={!blob || busy} onClick={download}>
            دانلود تصویر
          </button>
          <button type="button" className="btn btn--ghost" disabled={!blob || busy} onClick={() => void share()}>
            ارسال یا کپی تصویر
          </button>
        </div>

        <p className="img-modal__note">
          اگر مرورگر یا دستگاه اجازهٔ دانلود ندهد، پیام خطای فارسی نمایش داده می‌شود و می‌توانید تصویر
          را از راه کپی یا اشتراک‌گذاری ذخیره کنید.
        </p>
      </div>
    </div>,
    document.body
  );
}
