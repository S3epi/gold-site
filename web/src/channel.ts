const STORE_KEY = "mesghalyar.telegram.v1";

/**
 * Public channel shown to every visitor. Set this to the owner's channel
 * username (without the leading @) to publish it for all devices.
 */
const DEFAULT_CHANNEL = "";

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const TELEGRAM_URL =
  /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/([^\s?#]+)(?:[?#].*)?\/?$/i;

/** Accepts "@name", "name", or any t.me link (channel, post, preview or invite) and returns a canonical link. */
export function normalizeChannel(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromUrl = raw.match(TELEGRAM_URL);
  if (fromUrl) return normalizePath(fromUrl[1]);
  const name = raw.startsWith("@") ? raw.slice(1) : raw;
  return USERNAME.test(name) ? `https://t.me/${name}` : null;
}

function normalizePath(path: string): string | null {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  const parts = clean.split("/");
  const head = parts[0] ?? "";

  if (head.startsWith("+")) {
    return parts.length === 1 && /^\+[A-Za-z0-9_-]{10,}$/.test(head) ? `https://t.me/${head}` : null;
  }
  if (head === "joinchat") {
    return parts.length === 2 && /^[A-Za-z0-9_-]{8,}$/.test(parts[1] ?? "")
      ? `https://t.me/joinchat/${parts[1]}`
      : null;
  }
  if (head === "s" && parts.length === 2 && USERNAME.test(parts[1] ?? "")) {
    return `https://t.me/${parts[1]}`;
  }
  if (!USERNAME.test(head)) return null;
  if (parts.length === 1) return `https://t.me/${head}`;
  if (parts.length === 2 && /^\d+$/.test(parts[1] ?? "")) return `https://t.me/${head}/${parts[1]}`;
  return null;
}

export function readChannel(): string | null {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored !== null) {
      const normalized = normalizeChannel(stored);
      if (normalized) return normalized;
    }
  } catch {
    // storage blocked; fall through to the public default
  }
  return normalizeChannel(DEFAULT_CHANNEL);
}

export function writeChannel(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, value);
  } catch {
    // storage disabled; the menu simply keeps the previous value
  }
}

export function channelUsername(url: string): string {
  if (/t\.me\/(?:\+|joinchat\/)/i.test(url)) return url.replace(/^https?:\/\//, "");
  const match = url.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/i);
  return match ? `@${match[1]}` : url;
}
