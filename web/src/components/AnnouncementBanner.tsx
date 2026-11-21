import { useEffect, useState } from "react";
import { apiJson, apiPost, deviceId } from "../api";

interface Announcement {
  id: number;
  text: string;
  createdAt: number;
}

const READ_KEY = "narkhino.announcements.read.v1";

function readIds(): number[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function remember(id: number): void {
  try {
    const next = Array.from(new Set([...readIds(), id])).slice(-300);
    localStorage.setItem(READ_KEY, JSON.stringify(next));
  } catch {
    // storage disabled; the server receipt still prevents repeats on this device
  }
}

/**
 * One announcement at a time. A visitor sees it until they press «خواندم»;
 * then neither this device nor the server shows it again.
 */
export function AnnouncementBanner() {
  const [item, setItem] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const device = encodeURIComponent(deviceId());
        const json = await apiJson<{ ok?: boolean; items?: Announcement[] }>(
          `v1/announcements/active?device=${device}`,
          {},
          8_000
        );
        if (cancelled || !Array.isArray(json.items)) return;
        const localRead = new Set(readIds());
        const next = json.items.find(
          (a) => a && typeof a.text === "string" && a.text.trim() && !localRead.has(a.id)
        );
        if (next) setItem(next);
      } catch {
        // Static hosting has no announcement API; the board works without it.
      }
    };

    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!item) return null;

  const dismiss = async (): Promise<void> => {
    remember(item.id);
    setItem(null);
    try {
      await apiPost("v1/announcements/read", { id: item.id, device: deviceId() }, 8_000);
    } catch {
      // The local receipt already stops it from being shown again here.
    }
  };

  return (
    <aside className="notice" role="status" aria-live="polite">
      <div className="notice__head">
        <strong>اعلان نرخینو</strong>
      </div>
      <p className="notice__text">{item.text}</p>
      <button type="button" className="btn btn--gold notice__ok" onClick={() => void dismiss()}>
        خواندم
      </button>
    </aside>
  );
}
