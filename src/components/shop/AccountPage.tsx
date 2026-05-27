import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Package,
  User as UserIcon,
  ShoppingBag,
  Clock,
  Repeat,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAccount, type OrderRecord } from "@/store/account";
import { useCart, RESERVATION_MS } from "@/store/cart";
import { useI18n } from "@/lib/i18n";
import { useTelegram, haptic, openTelegramProfile } from "@/lib/telegram";
import { useCatalog } from "@/store/catalog";
import { formatTHB } from "@/lib/format";
import { loc } from "@/lib/loc";
import { STASH_TYPES, type StashType } from "@/types/shop";

interface AccountPageProps {
  onBack: () => void;
  onOpenCart: () => void;
  onOpenActiveOrder: () => void;
}

const statusMeta = {
  awaiting:    { ru: "Ожидание",    en: "Awaiting",    cls: "bg-amber-500/15 text-amber-600" },
  paid:        { ru: "Оплачен",     en: "Paid",        cls: "bg-emerald-500/15 text-emerald-600" },
  in_delivery: { ru: "В доставке",  en: "In delivery", cls: "bg-amber-500/15 text-amber-600" },
  completed:   { ru: "Оплачен",     en: "Paid",        cls: "bg-emerald-500/15 text-emerald-600" },
  cancelled:   { ru: "Отменён",     en: "Cancelled",   cls: "bg-destructive/15 text-destructive" },
} as const;

type HistoryFilter = "all" | "confirmed" | "cancelled";

function stashLabel(t: StashType | undefined, lang: "ru" | "en"): string {
  if (!t) return "";
  const meta = STASH_TYPES.find((s) => s.value === t);
  return meta ? `${meta.emoji} ${meta.label[lang]}` : "";
}

function resolveLineName(value: unknown, lang: "ru" | "en"): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record[lang] === "string") return record[lang] as string;
  if (typeof record.ru === "string") return record.ru as string;
  if (typeof record.en === "string") return record.en as string;
  if (record.name) return resolveLineName(record.name, lang);

  return "";
}

function renderLine(l: any, lang: "ru" | "en") {
  const name = resolveLineName(l.product?.name, lang) || resolveLineName(l.productName, lang) || "";
  const variant = l.variantId ? ` · ${l.variantId}` : "";
  const stash = l.stashType ? stashLabel(l.stashType, lang) : "";
  return (
    <>
      <div>{name}{variant}</div>
      {(stash || l.qty) && (
        <div className="text-muted-foreground">
          {stash}{stash ? " " : ""}× {l.qty}
        </div>
      )}
    </>
  );
}

export const AccountPage = ({ onBack, onOpenCart, onOpenActiveOrder }: AccountPageProps) => {
  const lang = useI18n((s) => s.lang) ?? "ru";
  const { user } = useTelegram();
  const orders = useAccount((s) => s.orders);
  const hydrate = useAccount((s) => s.hydrate);
  const products = useCatalog((s) => s.products);
  const cartLines = useCart((s) => s.lines);
  const cartTotal = useCart((s) => s.totalTHB());
  const cartId = useCart((s) => s.cartId);
  const reservedAt = useCart((s) => s.reservedAt);
  const clearCart = useCart((s) => s.clear);
  const addToCart = useCart((s) => s.add);

  const tr = (ru: string, en: string) => (lang === "ru" ? ru : en);

  // ── Авто-рефреш ───────────────────────────────────────────────
  useEffect(() => {
    hydrate();
    const tick = () => { if (!document.hidden) hydrate(); };
    const interval = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [hydrate]);

  // ── Активный заказ ─────────────────────────────────────────────
  // Активным считаем ТОЛЬКО awaiting (ждёт подтверждения от магазина).
  // Подтверждённые/отменённые сразу уезжают в историю — пользователь может оформить новый.
  const awaitingOrder = orders.find((o) => o.status === "awaiting") ?? null;
  const allHistory = orders.filter((o) => o.status !== "awaiting");

  // ── Фильтр истории ────────────────────────────────────────────
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [lightbox, setLightbox] = useState<{ list: string[]; index: number } | null>(null);
  const historyOrders = useMemo(() => {
    if (filter === "all") return allHistory;
    if (filter === "confirmed")
      return allHistory.filter((o) => o.status === "completed" || o.status === "paid" || o.status === "in_delivery");
    return allHistory.filter((o) => o.status === "cancelled");
  }, [allHistory, filter]);

  // ── Резерв корзины ────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!reservedAt || cartLines.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [reservedAt, cartLines.length]);

  const msLeft = reservedAt ? Math.max(0, reservedAt + RESERVATION_MS - now) : 0;
  useEffect(() => {
    if (reservedAt && cartLines.length > 0 && msLeft === 0) clearCart();
  }, [msLeft, reservedAt, cartLines.length, clearCart]);

  const mm = String(Math.floor(msLeft / 60000)).padStart(2, "0");
  const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0");

  // ── Лайтбокс: клавиатура ──────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((lb) => lb ? { ...lb, index: (lb.index + 1) % lb.list.length } : lb);
      if (e.key === "ArrowLeft")  setLightbox((lb) => lb ? { ...lb, index: (lb.index - 1 + lb.list.length) % lb.list.length } : lb);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [lightbox]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });

  const displayName = user?.first_name
    ? `${user.first_name}${user.last_name ? " " + user.last_name : ""}`
    : user?.username ? `@${user.username}` : tr("Гость", "Guest");
  const initials = (user?.first_name?.[0] ?? user?.username?.[0] ?? "G").toUpperCase();

  // ── Повторить заказ ───────────────────────────────────────────
  const repeatOrder = (o: OrderRecord) => {
    let added = 0;
    for (const line of o.items) {
      if ((line as any).isGift) continue;
      const pid = line.product?.id ?? (line as any).productId;
      if (!pid) continue;
      const product = products.find((p) => p.id === pid) ?? line.product;
      if (!product) continue;
      for (let i = 0; i < line.qty; i++) {
        addToCart(product, {
          variantId: line.variantId,
          districtSlug: line.districtSlug,
          stashType: line.stashType,
          priceUSD: line.priceUSD,
        });
      }
      added++;
    }
    if (added === 0) {
      toast.error(tr("Нечего повторить", "Nothing to repeat"));
      return;
    }
    haptic("light");
    toast.success(tr("Добавлено в корзину", "Added to cart"));
    onOpenCart();
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background">
      <header className="sticky top-0 z-30 px-5 pt-5 pb-3 bg-background/80 backdrop-blur-xl flex items-center gap-3">
        <button
          onClick={() => { haptic("light"); onBack(); }}
          className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="font-display font-bold text-lg">{tr("Личный кабинет", "Account")}</div>
      </header>

      <main className="px-5 pb-32 space-y-5">
        <section className="rounded-2xl bg-card shadow-card p-4 flex items-center gap-3">
          {user?.photo_url ? (
            <img src={user.photo_url} alt={displayName} className="w-12 h-12 rounded-2xl object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-2xl gradient-primary text-primary-foreground flex items-center justify-center font-bold">
              {user?.first_name || user?.username ? initials : <UserIcon className="w-6 h-6" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{displayName}</div>
            <div className="text-[11px] text-muted-foreground">
              {user?.id ? `Telegram ID: ${user.id}` : tr("Не из Telegram", "Not from Telegram")}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => {
            haptic("light");
            openTelegramProfile("love_supp_asia");
          }}
          className="w-full text-left rounded-2xl bg-card shadow-card p-4 active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl gradient-primary text-primary-foreground flex items-center justify-center text-xl">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{tr("Связаться с оператором", "Contact operator")}</div>
              <div className="text-[11px] text-muted-foreground">@love_supp_asia</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="font-display font-bold text-lg flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" /> {tr("Активный заказ", "Active order")}
            </div>
            {cartLines.length > 0 && !awaitingOrder && (
              <button onClick={onOpenActiveOrder} className="text-xs font-bold text-primary">
                {tr("Открыть", "Open")}
              </button>
            )}
          </div>
          {awaitingOrder ? (
            <div className="w-full rounded-2xl bg-card shadow-card p-4 space-y-2 opacity-90">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-mono font-bold text-muted-foreground">#{awaitingOrder.id}</div>
                <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-amber-500/15 text-amber-600">
                  {tr("Ждём подтверждения", "Waiting for confirmation")}
                </span>
              </div>
              <div className="font-display font-bold text-xl">{formatTHB(awaitingOrder.totalUSD)}</div>
              {awaitingOrder.items.length > 0 && (
                <div className="space-y-1">
                  {awaitingOrder.items.map((l, i) => (
                    <div key={i} className="text-xs text-foreground/80">
                      {renderLine(l, lang)}
                    </div>
                  ))}
                </div>
              )}
              {awaitingOrder.delivery && (
                <div className="text-[11px] text-muted-foreground">
                  🚚 {tr("Доставка", "Delivery")}{awaitingOrder.deliveryAddress ? ` · ${awaitingOrder.deliveryAddress}` : ""}
                </div>
              )}
            </div>
          ) : cartLines.length === 0 ? (
            <div className="rounded-2xl bg-card shadow-card p-4 text-sm text-muted-foreground text-center">
              {tr("Корзина пуста", "Cart is empty")}
            </div>
          ) : (
            <button onClick={onOpenActiveOrder} className="w-full rounded-2xl bg-card shadow-card p-4 text-left active:scale-[0.99] space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-mono font-bold text-muted-foreground">#{cartId}</div>
                <div className="text-[11px] text-muted-foreground">{cartLines.length} {tr("позиций", "items")}</div>
              </div>
              <div className="font-display font-bold text-xl">{formatTHB(cartTotal)}</div>
              {reservedAt > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 text-amber-600 px-3 py-2">
                  <Clock className="w-4 h-4" />
                  <div className="text-[11px] font-bold">{tr("Зарезервировано", "Reserved")} · {mm}:{ss}</div>
                </div>
              )}
            </button>
          )}
        </section>

        {/* ── История заказов ───────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="font-display font-bold text-lg flex items-center gap-2">
              <Package className="w-4 h-4" /> {tr("История заказов", "Order history")}
            </div>
          </div>

          {allHistory.length > 0 && (
            <div className="flex gap-1.5 mb-3 p-1 rounded-2xl bg-muted">
              {([
                ["all", tr("Все", "All")],
                ["confirmed", tr("Подтв.", "Confirmed")],
                ["cancelled", tr("Отмен.", "Cancelled")],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex-1 h-8 rounded-xl text-xs font-bold transition-colors ${
                    filter === key ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {historyOrders.length === 0 ? (
            <div className="rounded-2xl bg-card shadow-card p-4 text-sm text-muted-foreground text-center">
              {allHistory.length === 0
                ? tr("Заказов пока нет", "No orders yet")
                : tr("Ничего не найдено", "Nothing found")}
            </div>
          ) : (
            <div className="space-y-2">
              {historyOrders.slice(0, 20).map((o) => {
                const m = statusMeta[o.status];
                const canRepeat = o.status !== "awaiting" && o.items.length > 0;
                return (
                  <div key={o.id} className="rounded-2xl bg-card shadow-card p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-mono font-bold text-muted-foreground">#{o.id}</div>
                      <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${m.cls}`}>{m[lang]}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="font-bold">{formatTHB(o.totalUSD)}</div>
                      <div className="text-[11px] text-muted-foreground">{fmtDate(o.createdAt)}</div>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {o.items.map((l, i) => (
                        <div key={i} className="text-xs text-foreground/80">
                          {renderLine(l, lang)}
                        </div>
                      ))}
                    </div>
                    {o.delivery && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        🚚 {tr("Доставка", "Delivery")}{o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                      </div>
                    )}
                    {((o.confirmPhotos && o.confirmPhotos.length > 0) || o.confirmPhoto || o.confirmText) && (
                      <div className="mt-2 rounded-xl bg-primary/5 border border-primary/20 p-2.5 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-primary">
                          {tr("Сообщение от магазина", "Message from shop")}
                        </div>
                        {(() => {
                          const list = o.confirmPhotos && o.confirmPhotos.length > 0
                            ? o.confirmPhotos
                            : (o.confirmPhoto ? [o.confirmPhoto] : []);
                          if (list.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {list.map((src, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => { haptic("light"); setLightbox({ list, index: i }); }}
                                  className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted active:scale-95 transition-transform"
                                  aria-label={`Photo ${i + 1}`}
                                >
                                  <img src={src} alt={`confirm-${i}`} className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {o.confirmText && (
                          <div className="text-xs text-foreground/90 whitespace-pre-wrap">{o.confirmText}</div>
                        )}
                      </div>
                    )}
                    {canRepeat && (
                      <button
                        onClick={() => repeatOrder(o)}
                        className="mt-3 w-full h-9 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <Repeat className="w-3.5 h-3.5" /> {tr("Повторить заказ", "Repeat order")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-in fade-in"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {lightbox.list.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) => lb ? { ...lb, index: (lb.index - 1 + lb.list.length) % lb.list.length } : lb);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"
                aria-label="Prev"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) => lb ? { ...lb, index: (lb.index + 1) % lb.list.length } : lb);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-bold">
                {lightbox.index + 1} / {lightbox.list.length}
              </div>
            </>
          )}

          <img
            src={lightbox.list[lightbox.index]}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
};
