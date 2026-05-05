// ============================================================
// 🌐 API client — тонкая обёртка над fetch с авто-JWT.
// ============================================================

function resolveBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!raw) return "/api";
  const trimmed = raw.replace(/\/$/, "");
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}
const BASE = resolveBase();

const TOKEN_KEY = "loveshop-token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string | null) => { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

type ReqInit = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T = unknown>(path: string, init: ReqInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    if (init.body instanceof FormData) {
      body = init.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (looksLikeHtml(contentType, text)) {
    throw new ApiError(502, "API returned HTML instead of JSON", {
      error: "api_misconfigured", path: `${BASE}${path}`,
    });
  }
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    // Глобальный перехват бана: любой 403 {error:"banned"} переключает UI на экран блокировки.
    if (
      res.status === 403 &&
      data && typeof data === "object" &&
      (data as { error?: string }).error === "banned"
    ) {
      try {
        tokenStore.set(null);
        window.dispatchEvent(new CustomEvent("loveshop:banned"));
      } catch {}
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, data);
  }
  return data as T;
}

function safeJson(s: string) { try { return JSON.parse(s); } catch { return s; } }
function looksLikeHtml(contentType: string, text: string) {
  if (/text\/html/i.test(contentType)) return true;
  const trimmed = text.trimStart().slice(0, 64).toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

// ============================================================
// Эндпоинты
// ============================================================

export interface AdminUser {
  tgId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  lang: string;
  citySlug?: string | null;
  createdAt: string;
  ordersCount: number;
  isBanned?: boolean;
}

export interface MeUser {
  tgId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  lang: "ru" | "en";
  citySlug?: string | null;
  balanceUSD: number;
  isAdmin: boolean;
  isModerator?: boolean;
}

export const Auth = {
  loginWithTelegram: (initData: string) =>
    api<{ token: string; user: MeUser }>("/auth/telegram", { method: "POST", body: { initData } }),
  me: () => api<MeUser>("/me"),
};

export const Catalog = {
  list: (city?: string) => api<any[]>(`/catalog${city ? `?city=${encodeURIComponent(city)}` : ""}`),
  categories: () => api<any[]>("/categories"),
};

export const Orders = {
  create: (payload: {
    totalUSD: number;
    items: any[];
    delivery: boolean;
    deliveryAddress?: string;
    crypto?: string;
    payAddress?: string;
    promoCode?: string;
  }) => api<any>("/orders", { method: "POST", body: payload }),
  mine: () => api<any[]>("/orders/me"),
};

export interface PromoValidation {
  code: string;
  discountPct: number;
  discountUSD: number;
  finalUSD: number;
}

export const Promo = {
  validate: (code: string, totalUSD: number) =>
    api<PromoValidation>("/promo/validate", { method: "POST", body: { code, totalUSD } }),
};

export const Admin = {
  awaiting: () => api<{ orders: any[]; deposits: any[] }>("/admin/awaiting"),
  history: (limit = 50, offset = 0) =>
    api<{ orders: any[]; deposits: any[] }>(`/admin/history?limit=${limit}&offset=${offset}`),
  confirmOrder: (id: string, payload: { photos?: File[]; text?: string }) => {
    const fd = new FormData();
    for (const file of payload.photos ?? []) fd.append("photo", file);
    if (payload.text) fd.append("text", payload.text);
    return api(`/admin/orders/${id}/confirm`, { method: "POST", body: fd });
  },
  cancelOrder: (id: string) => api(`/admin/orders/${id}/cancel`, { method: "POST" }),
  patchOrder: (id: string, payload: { totalUSD?: number; items?: any[]; deliveryAddress?: string }) =>
    api(`/admin/orders/${id}`, { method: "PATCH", body: payload }),
  messageOrder: (id: string, text: string) =>
    api(`/admin/orders/${id}/message`, { method: "POST", body: { text } }),
  createProduct: (data: any) => api("/admin/products", { method: "POST", body: data }),
  updateProduct: (id: string, data: any) => api(`/admin/products/${id}`, { method: "PUT", body: data }),
  deleteProduct: (id: string) => api(`/admin/products/${id}`, { method: "DELETE" }),
  createCategory: (data: any) => api("/admin/categories", { method: "POST", body: data }),
  updateCategory: (slug: string, data: any) => api(`/admin/categories/${slug}`, { method: "PUT", body: data }),
  deleteCategory: (slug: string) => api(`/admin/categories/${slug}`, { method: "DELETE" }),
  analytics: () => api<any>("/admin/analytics"),
  users: (limit = 100, offset = 0) =>
    api<{ users: AdminUser[]; total: number }>(`/admin/users?limit=${limit}&offset=${offset}`),
  banUser: (tgId: string, banned: boolean) =>
    api<{ tgId: string; isBanned: boolean }>(`/admin/users/${tgId}/ban`, { method: "POST", body: { banned } }),
  broadcast: (payload: any) => api("/broadcast", { method: "POST", body: payload }),
  promoList: () => api<Array<{ id: string; code: string; discountPct: number; active: boolean; createdAt: string; redemptions: number }>>("/admin/promo"),
  promoCreate: (payload: { code: string; discountPct: number; active?: boolean }) =>
    api<{ id: string; code: string; discountPct: number; active: boolean }>("/admin/promo", { method: "POST", body: payload }),
  promoUpdate: (id: string, payload: { active?: boolean; discountPct?: number }) =>
    api(`/admin/promo/${id}`, { method: "PATCH", body: payload }),
  promoDelete: (id: string) => api(`/admin/promo/${id}`, { method: "DELETE" }),
};
