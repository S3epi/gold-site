import { apiJson, apiPost } from "./api";

export interface ApiKeyRow {
  id: number;
  label: string;
  key: string;
  domain: string;
  createdAt: number;
  lastUsedAt: number | null;
  requests: number;
}

export interface AnnouncementRow {
  id: number;
  text: string;
  createdAt: number;
  reads: number;
}

export interface TelegramState {
  hasToken: boolean;
  tokenHint: string;
  channel: string;
  botUsername: string | null;
  isAdmin: boolean | null;
  message: string | null;
}

export interface OwnerState {
  ok: boolean;
  channel: string;
  telegram: TelegramState;
  announcements: AnnouncementRow[];
  apiKeys: ApiKeyRow[];
  host: string;
  hasPassword: boolean;
}

export interface TelegramCheck {
  ok: boolean;
  botUsername: string | null;
  isAdmin: boolean | null;
  message: string;
}

export const ownerApi = {
  session: () =>
    apiJson<{ ok: boolean; authenticated: boolean; hasPassword?: boolean }>("v1/owner/session", {}, 8_000),
  login: (password: string) =>
    apiPost<{ ok: boolean; error?: string }>("v1/owner/login", { password }),
  logout: () => apiPost<{ ok: boolean }>("v1/owner/logout", {}),
  state: () => apiJson<OwnerState>("v1/owner/state"),
  saveSettings: (body: { channel?: string; telegramToken?: string; telegramChannel?: string }) =>
    apiPost<{ ok: boolean; message?: string }>("v1/owner/settings", body),
  testTelegram: () => apiPost<TelegramCheck>("v1/owner/telegram/test", {}),
  refreshTelegram: () => apiPost<TelegramCheck>("v1/owner/telegram/refresh", {}),
  sendTelegram: () => apiPost<TelegramCheck>("v1/owner/telegram/send", {}, 30_000),
  createAnnouncement: (text: string) =>
    apiPost<{ ok: boolean; id?: number; message?: string }>("v1/owner/announcements", { text }),
  deleteAnnouncement: (id: number) =>
    apiPost<{ ok: boolean }>("v1/owner/announcements/delete", { id }),
  createApiKey: (label: string, domain: string) =>
    apiPost<{ ok: boolean; key?: ApiKeyRow; message?: string }>("v1/owner/api-keys", { label, domain }),
  deleteApiKey: (id: number) => apiPost<{ ok: boolean }>("v1/owner/api-keys/delete", { id })
};
