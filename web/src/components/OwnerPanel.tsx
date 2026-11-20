import { useEffect, useState } from "react";
import { channelUsername, normalizeChannel, readChannel, writeChannel } from "../channel";
import { checkOwnerPassword } from "../ownerAuth";

interface Props {
  onClose: () => void;
  onChannelChange: (url: string | null) => void;
}

export function OwnerPanel({ onClose, onChannelChange }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
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

  const unlock = async (): Promise<void> => {
    if (checking) return;
    setChecking(true);
    setAuthError(null);
    const ok = await checkOwnerPassword(password);
    setChecking(false);
    if (!ok) {
      setAuthError("رمز عبور درست نیست.");
      return;
    }
    setUnlocked(true);
    setPassword("");
  };

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

  const lock = (): void => {
    setUnlocked(false);
    setPassword("");
    setAuthError(null);
    setMessage(null);
  };

  return (
    <div className="owner" role="dialog" aria-modal="true" aria-label="پنل مدیریت">
      <div className="owner__panel">
        <h3>{unlocked ? "پنل مدیریت" : "ورود مدیر"}</h3>

        {unlocked ? (
          <>
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
              <button type="button" className="btn btn--ghost" onClick={lock}>
                قفل کردن
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
              اگر کانال یوزرنیم ندارد، لینک کامل کانال یا لینک دعوت (t.me/…) را وارد کنید. این مقدار
              در همین مرورگر ذخیره می‌شود؛ برای باز کردن دوبارهٔ پنل، پنج ضربهٔ سریع روی نشان سایت
              بزنید.
            </p>
          </>
        ) : (
          <>
            <p className="owner__sub">
              برای تغییر تنظیمات کانال، رمز مدیریت را وارد کنید. این پنل برای بازدیدکنندهٔ عادی در
              دسترس نیست.
            </p>

            <label className="owner__field">
              <span>رمز عبور</span>
              <input
                type="password"
                dir="ltr"
                value={password}
                autoComplete="current-password"
                autoFocus
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlock();
                }}
              />
            </label>

            <div className="owner__actions">
              <button type="button" className="btn" onClick={() => void unlock()} disabled={checking}>
                {checking ? "بررسی…" : "ورود"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                بستن
              </button>
            </div>

            {authError ? (
              <p className="owner__msg owner__msg--error" role="alert">
                {authError}
              </p>
            ) : null}

            <p className="owner__hint">رمز ورود فقط برای مالک سایت است.</p>
          </>
        )}
      </div>
    </div>
  );
}
