const STORE_KEY = "mesghalyar.telegram.v1";

/**
 * Public channel shown to every visitor. Set this to the owner's channel
 * username (without the leading @) to publish it for all devices.
 */
const DEFAULT_CHANNEL = "";

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const URL_SHAPE = /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/([A-Za-z][A-Za-z0-9_]{3,31})\/?$/i;

/** Accepts "@name", "name", "t.me/name" or a full Telegram link and returns the canonical https link. */
export function normalizeChannel(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromUrl = raw.match(URL_SHAPE);
  if (fromUrl) return `https://t.me/${fromUrl[1]}`;
  const name = raw.startsWith("@") ? raw.slice(1) : raw;
  return USERNAME.test(name) ? `https://t.me/${name}` : null;
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
  const match = url.match(/t\.me\/([A-Za-z0-9_]+)/);
  return match ? `@${match[1]}` : url;
}
