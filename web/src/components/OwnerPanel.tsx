import { useCallback, useEffect, useState } from "react";
import { channelUsername, normalizeChannel, readChannel, writeChannel } from "../channel";
import { checkOwnerPassword } from "../ownerAuth";
import { ownerApi, type OwnerState, type TelegramCheck } from "../ownerApi";

interface Props {
  onClose: () => void;
  onChannelChange: (url: string | null) => void;
}

type Tab = "channel" | "announce" | "bot" | "api";
type ServerMode = "checking" | "server" | "local";

export function OwnerPanel({ onClose, onChannelChange }: Props) {
  const [serverMode, setServerMode] = useState<ServerMode>("checking");
  const [authenticated, setAuthenticated] = useState(false);
  const [state, setState] = useState<OwnerState | null>(null);
  const [tab, setTab] = useState<Tab>("channel");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const [channelValue, setChannelValue] = useState(() => {
    const current = readChannel();
    return current ? channelUsername(current) : "";
  });
  const [announceText, setAnnounceText] = useState("");
  const [token, setToken] = useState("");
  const [botChannel, setBotChannel] = useState("");
  const [botStatus, setBotStatus] = useState<TelegramCheck | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyDomain, setKeyDomain] = useState("");

  const say = (text: string, isError = false): void => {
    setMessage(text);
    setFailed(isError);
  };

  const loadState = useCallback(async (): Promise<void> => {
    try {
      const next = await ownerApi.state();
      setState(next);
      if (next.channel) {
        setChannelValue(channelUsername(next.channel));
        const normalized = normalizeChannel(next.channel);
        if (normalized) writeChannel(normalized);
        onChannelChange(normalizeChannel(next.channel));
      }
      setBotChannel(next.telegram.channel ?? "");
    } catch {
      say("دریافت تنظیمات از سرور ممکن نشد.", true);
    }
  }, [onChannelChange]);

  useEffect(() => {
    let cancelled = false;
    ownerApi
      .session()
      .then((session) => {
        if (cancelled) return;
        setServerMode("server");
        if (session.authenticated) {
          setAuthenticated(true);
          void loadState();
        }
      })
      .catch(() => {
        if (!cancelled) setServerMode("local");
      });
    return () => {
      cancelled = true;
    };
  }, [loadState]);

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
    try {
      if (serverMode === "server") {
        await ownerApi.login(password);
      } else {
        const ok = await checkOwnerPassword(password);
        if (!ok) {
          setAuthError("رمز عبور درست نیست.");
          return;
        }
      }
      setAuthenticated(true);
      setPassword("");
      if (serverMode === "server") await loadState();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "ورود انجام نشد.");
    } finally {
      setChecking(false);
    }
  };

  const saveChannel = async (): Promise<void> => {
    const url = normalizeChannel(channelValue);
    if (!url) {
      say("آدرس معتبر نیست؛ نمونه: @channel یا https://t.me/channel", true);
      return;
    }
    writeChannel(url);
    onChannelChange(url);
    setChannelValue(channelUsername(url));
    if (serverMode === "server") {
      try {
        await ownerApi.saveSettings({ channel: url });
        say(`کانال ذخیره شد: ${channelUsername(url)}`);
        return;
      } catch (err) {
        say(err instanceof Error ? err.message : "ذخیره روی سرور ممکن نشد.", true);
        return;
      }
    }
    say(`در این مرورگر ذخیره شد: ${channelUsername(url)}`);
  };

  const resetChannel = async (): Promise<void> => {
    writeChannel(null);
    onChannelChange(readChannel());
    setChannelValue("");
    if (serverMode === "server") {
      try {
        await ownerApi.saveSettings({ channel: "" });
      } catch {
        // local value is cleared regardless
      }
    }
    say("کانال پاک شد.");
  };

  const saveBot = async (): Promise<void> => {
    try {
      await ownerApi.saveSettings({
        telegramToken: token.trim() || undefined,
        telegramChannel: botChannel.trim()
      });
      setToken("");
      say("تنظیمات ربات ذخیره شد.");
      await loadState();
    } catch (err) {
      say(err instanceof Error ? err.message : "ذخیرهٔ تنظیمات ربات ممکن نشد.", true);
    }
  };

  const runBot = async (kind: "test" | "refresh" | "send"): Promise<void> => {
    try {
      const result =
        kind === "test"
          ? await ownerApi.testTelegram()
          : kind === "refresh"
            ? await ownerApi.refreshTelegram()
            : await ownerApi.sendTelegram();
      setBotStatus(result);
      say(result.message, !result.ok);
    } catch (err) {
      say(err instanceof Error ? err.message : "ارتباط با ربات ممکن نشد.", true);
    }
  };

  const addAnnouncement = async (): Promise<void> => {
    if (!announceText.trim()) {
      say("متن اعلان خالی است.", true);
      return;
    }
    try {
      await ownerApi.createAnnouncement(announceText.trim());
      setAnnounceText("");
      say("اعلان ثبت شد؛ هر بازدیدکننده یک بار آن را می‌بیند.");
      await loadState();
    } catch (err) {
      say(err instanceof Error ? err.message : "ثبت اعلان ممکن نشد.", true);
    }
  };

  const removeAnnouncement = async (id: number): Promise<void> => {
    try {
      await ownerApi.deleteAnnouncement(id);
      await loadState();
      say("اعلان حذف شد.");
    } catch (err) {
      say(err instanceof Error ? err.message : "حذف اعلان ممکن نشد.", true);
    }
  };

  const addKey = async (): Promise<void> => {
    try {
      const result = await ownerApi.createApiKey(
        keyLabel.trim() || "کلید سایت",
        keyDomain.trim()
      );
      setKeyLabel("");
      setKeyDomain("");
      await loadState();
      say(result.message ?? "کلید API ساخته شد.");
    } catch (err) {
      say(err instanceof Error ? err.message : "ساخت کلید ممکن نشد.", true);
    }
  };

  const removeKey = async (id: number): Promise<void> => {
    try {
      await ownerApi.deleteApiKey(id);
      await loadState();
      say("کلید API حذف شد.");
    } catch (err) {
      say(err instanceof Error ? err.message : "حذف کلید ممکن نشد.", true);
    }
  };

  const copyKey = async (key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(key);
      say("کلید کپی شد.");
    } catch {
      say("کپی خودکار ممکن نشد؛ کلید را دستی انتخاب کنید.", true);
    }
  };

  const lock = async (): Promise<void> => {
    if (serverMode === "server") {
      try {
        await ownerApi.logout();
      } catch {
        // the local state is cleared anyway
      }
    }
    setAuthenticated(false);
    setPassword("");
    setAuthError(null);
    setState(null);
    setMessage(null);
  };

  const showTabs = authenticated && serverMode === "server" && state !== null;

  return (
    <div className="owner" role="dialog" aria-modal="true" aria-label="پنل مدیریت">
      <div className="owner__panel">
        <header className="owner__head">
          <div>
            <h3>{authenticated ? "پنل مدیریت نرخینو" : "ورود مدیر"}</h3>
            <p className="owner__sub">
              {serverMode === "server"
                ? "تنظیمات روی هاست ذخیره می‌شوند"
                : serverMode === "checking"
                  ? "در حال بررسی سرور…"
                  : "حالت استاتیک: فقط تنظیم کانال در این مرورگر"}
            </p>
          </div>
          <button type="button" className="menu__close" aria-label="بستن" onClick={onClose}>
            ×
          </button>
        </header>

        {!authenticated ? (
          <>
            <label className="owner__field">
              <span>رمز عبور</span>
              <input
                type="password"
                dir="ltr"
                value={password}
                autoComplete="current-password"
                autoFocus
                disabled={serverMode === "checking"}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlock();
                }}
              />
            </label>

            <div className="owner__actions">
              <button
                type="button"
                className="btn btn--gold"
                onClick={() => void unlock()}
                disabled={checking || serverMode === "checking"}
              >
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
        ) : showTabs ? (
          <>
            <nav className="owner__tabs" role="tablist" aria-label="بخش‌های پنل">
              {(
                [
                  ["channel", "کانال"],
                  ["announce", "اعلان"],
                  ["bot", "ربات تلگرام"],
                  ["api", "API"]
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`owner__tab ${tab === id ? "owner__tab--active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === "channel" ? (
              <section className="owner__section">
                <label className="owner__field">
                  <span>یوزرنیم یا لینک کانال</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={channelValue}
                    placeholder="@channel or https://t.me/channel"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setChannelValue(e.target.value)}
                  />
                </label>
                <div className="owner__actions">
                  <button type="button" className="btn btn--gold" onClick={() => void saveChannel()}>
                    ذخیرهٔ کانال
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => void resetChannel()}>
                    پاک کردن
                  </button>
                </div>
              </section>
            ) : null}

            {tab === "announce" ? (
              <section className="owner__section">
                <label className="owner__field">
                  <span>متن اعلان (هر بازدیدکننده یک بار می‌بیند)</span>
                  <textarea
                    rows={4}
                    value={announceText}
                    placeholder="مثلاً: تا ساعت ۱۸ امروز تابلوی قیمت به‌روزرسانی می‌شود."
                    onChange={(e) => setAnnounceText(e.target.value)}
                  />
                </label>
                <div className="owner__actions">
                  <button
                    type="button"
                    className="btn btn--gold"
                    onClick={() => void addAnnouncement()}
                    disabled={!announceText.trim()}
                  >
                    ثبت اعلان
                  </button>
                </div>

                {state.announcements.length ? (
                  <ul className="owner__list">
                    {state.announcements.map((item) => (
                      <li key={item.id}>
                        <span>{item.text}</span>
                        <small>{item.reads} خوانده‌شده</small>
                        <button type="button" onClick={() => void removeAnnouncement(item.id)}>
                          حذف
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="owner__empty">اعلانی ثبت نشده است.</p>
                )}
              </section>
            ) : null}

            {tab === "bot" ? (
              <section className="owner__section">
                <label className="owner__field">
                  <span>توکن ربات تلگرام</span>
                  <input
                    type="password"
                    dir="ltr"
                    value={token}
                    placeholder={state.telegram.hasToken ? `ذخیره شده ${state.telegram.tokenHint}` : "123456:ABC…"}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </label>
                <label className="owner__field">
                  <span>لینک یا یوزرنیم کانال</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={botChannel}
                    placeholder="@mychannel or https://t.me/mychannel"
                    onChange={(e) => setBotChannel(e.target.value)}
                  />
                </label>
                <div className="owner__actions">
                  <button type="button" className="btn btn--gold" onClick={() => void saveBot()}>
                    ذخیرهٔ تنظیمات
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => void runBot("test")}>
                    تست اتصال و ادمین
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => void runBot("refresh")}>
                    رفرش بات
                  </button>
                  <button type="button" className="btn btn--gold" onClick={() => void runBot("send")}>
                    ارسال قیمت‌ها به کانال
                  </button>
                </div>

                <dl className="owner__botstate">
                  <div>
                    <dt>بات</dt>
                    <dd>{botStatus?.botUsername ?? state.telegram.botUsername ?? "بررسی نشده"}</dd>
                  </div>
                  <div>
                    <dt>ادمین کانال</dt>
                    <dd>
                      {botStatus?.isAdmin ?? state.telegram.isAdmin
                        ? "بله"
                        : botStatus?.isAdmin === false || state.telegram.isAdmin === false
                          ? "نه"
                          : "بررسی نشده"}
                    </dd>
                  </div>
                </dl>

                <p className="owner__hint">
                  بات را در کانال ادمین کنید و اجازهٔ ارسال پیام بدهید. اگر ادمین نباشید، پیام خطای
                  فارسی همین‌جا نشان داده می‌شود.
                </p>
              </section>
            ) : null}

            {tab === "api" ? (
              <section className="owner__section">
                <label className="owner__field">
                  <span>نام کلید تازه</span>
                  <input
                    type="text"
                    value={keyLabel}
                    placeholder="مثلاً سایت شریک"
                    onChange={(e) => setKeyLabel(e.target.value)}
                  />
                </label>
                <label className="owner__field">
                  <span>دامنهٔ مجاز (خالی = همهٔ دامنه‌ها)</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={keyDomain}
                    placeholder="partner.example.com"
                    onChange={(e) => setKeyDomain(e.target.value)}
                  />
                </label>
                <div className="owner__actions">
                  <button type="button" className="btn btn--gold" onClick={() => void addKey()}>
                    ساخت کلید API
                  </button>
                </div>

                {state.apiKeys.length ? (
                  <ul className="owner__keys">
                    {state.apiKeys.map((row) => (
                      <li key={row.id}>
                        <div className="owner__key-head">
                          <strong>{row.label}</strong>
                          <button type="button" onClick={() => void removeKey(row.id)}>
                            حذف
                          </button>
                        </div>
                        <code dir="ltr">{row.key}</code>
                        <div className="owner__key-meta">
                          <span>دامنه: {row.domain || "همه"}</span>
                          <span>{row.requests} درخواست</span>
                          <button type="button" onClick={() => void copyKey(row.key)}>
                            کپی
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="owner__empty">کلیدی ساخته نشده است.</p>
                )}

                <p className="owner__hint" dir="rtl">
                  API اختصاصی: <code dir="ltr">{`${state.host}/api/v1/prices?key=YOUR_KEY`}</code> —
                  فقط از دامنهٔ ثبت‌شده و با کلید پاسخ می‌دهد. تابلوی خود سایت بدون کلید کار می‌کند.
                </p>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <label className="owner__field">
              <span>یوزرنیم یا لینک کانال</span>
              <input
                type="text"
                dir="ltr"
                value={channelValue}
                placeholder="@channel or https://t.me/channel"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setChannelValue(e.target.value)}
              />
            </label>
            <div className="owner__actions">
              <button type="button" className="btn" onClick={() => void saveChannel()}>
                ذخیره
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => void resetChannel()}>
                پاک کردن
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => void lock()}>
                قفل
              </button>
            </div>
            <p className="owner__hint">
              امکانات اعلان، ربات تلگرام و API روی هاست PHP فعال می‌شوند. در این نسخه فقط کانال در
              همین مرورگر ذخیره شد.
            </p>
          </>
        )}

        {message ? (
          <p className={`owner__msg ${failed ? "owner__msg--error" : ""}`} role="status">
            {message}
          </p>
        ) : null}

        <div className="owner__actions owner__actions--end">
          {authenticated ? (
            <button type="button" className="btn btn--ghost" onClick={() => void lock()}>
              قفل کردن
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
