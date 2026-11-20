import { useEffect, useState } from "react";
import { channelUsername, normalizeChannel, readChannel, writeChannel } from "../channel";

interface Props {
  onClose: () => void;
  onChannelChange: (url: string | null) => void;
}

export function OwnerPanel({ onClose, onChannelChange }: Props) {
  const [value, setValue] = useState(() => {
    const current = readChannel();
    return current ? channelUsername(current) : "";
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const save = (): void => {
    const url = normalizeChannel(value);
    if (!url) {
      setMessage("آدرس معتبر نیست؛ نمونه: @channel یا https://t.me/channel");
      return;
    }
    writeChannel(url);
    onChannelChange(url);
    setValue(channelUsername(url));
    setMessage(`ذخیره شد: ${channelUsername(url)}`);
  };

  const reset = (): void => {
    writeChannel(null);
    onChannelChange(readChannel());
    setValue("");
    setMessage("ذخیرهٔ محلی حذف شد؛ مقدار پیش‌فرض سایت استفاده می‌شود.");
  };

  return (
    <div className="owner" role="dialog" aria-modal="true" aria-label="پنل مدیریت">
      <div className="owner__panel">
        <h3>پنل مدیریت</h3>
        <p className="owner__sub">آدرس کانال تلگرام را برای گزینهٔ «کانال قیمت» در منو تنظیم کنید.</p>

        <label className="owner__field">
          <span>یوزرنیم یا لینک کانال</span>
          <input
            type="text"
            dir="ltr"
            value={value}
            placeholder="@channel or https://t.me/channel"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>

        <div className="owner__actions">
          <button type="button" className="btn" onClick={save}>
            ذخیره
          </button>
          <button type="button" className="btn btn--ghost" onClick={reset}>
            حذف ذخیرهٔ محلی
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            بستن
          </button>
        </div>

        {message ? (
          <p className="owner__msg" role="status">
            {message}
          </p>
        ) : null}

        <p className="owner__hint">
          این مقدار در همین مرورگر ذخیره می‌شود. برای باز کردن دوبارهٔ این پنل، پنج ضربهٔ سریع روی
          نشان سایت بزنید.
        </p>
      </div>
    </div>
  );
}
