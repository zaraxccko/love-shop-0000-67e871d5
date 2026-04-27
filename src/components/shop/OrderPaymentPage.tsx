import { useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Clock, Truck, MapPin, Tag, X } from "lucide-react";
import { CRYPTO_LIST, useAccount, type CryptoCode } from "@/store/account";
import { useCart, RESERVATION_MS, DELIVERY_FEE_USD } from "@/store/cart";
import { useLocation } from "@/store/location";
import { findGiftVariant, getPromoGiftGrams, useLocationPromos } from "@/store/locationPromos";
import { useI18n } from "@/lib/i18n";
import { haptic, useTelegram } from "@/lib/telegram";
import { formatTHB } from "@/lib/format";
import { loc } from "@/lib/loc";
import { findDistrict } from "@/data/locations";
import { STASH_TYPES } from "@/types/shop";
import { CryptoAmountCard } from "@/components/shop/CryptoAmountCard";
import { Promo, ApiError } from "@/lib/api";
import { toast } from "sonner";

interface OrderPaymentPageProps {
  onBack: () => void;
  /** Called once the user marked the order as paid (cart cleared, order added). */
  onPaid: () => void;
}

/**
 * Страница оплаты активного заказа.
 * Открывается из «Активный заказ» в личном кабинете.
 *
 * Flow:
 *   1. Юзер выбирает крипту → видит адрес + сумму
 *   2. Жмёт «Я оплатил» → создаём запись заказа со статусом `awaiting`,
 *      чистим корзину, возвращаемся в кабинет.
 */
export const OrderPaymentPage = ({ onBack, onPaid }: OrderPaymentPageProps) => {
  const lang = useI18n((s) => s.lang) ?? "ru";
  const tr = (ru: string, en: string) => (lang === "ru" ? ru : en);

  const rawLines = useCart((s) => s.lines);
  const citySlug = useLocation((s) => s.city);
  const promoRules = useLocationPromos((s) => s.rules);
  const cartId = useCart((s) => s.cartId);
  const delivery = useCart((s) => s.delivery);
  const deliveryAddress = useCart((s) => s.deliveryAddress);
  const reservedAt = useCart((s) => s.reservedAt);
  const clearCart = useCart((s) => s.clear);
  const linesWithGifts = useCart((s) => s.linesWithGifts);
  const subtotalFn = useCart((s) => s.subtotalUSD);
  const totalFn = useCart((s) => s.totalTHB);

  const lines = useMemo(() => linesWithGifts(), [rawLines, linesWithGifts]);
  const subtotal = useMemo(() => subtotalFn(), [rawLines, subtotalFn]);
  const total = useMemo(() => totalFn(), [rawLines, delivery, totalFn]);

  const addOrder = useAccount((s) => s.addOrder);
  const hydrateAccount = useAccount((s) => s.hydrate);
  const hasAwaitingOrder = useAccount((s) => s.orders.some((o) => o.status === "awaiting"));
  const { user } = useTelegram();

  const [crypto, setCrypto] = useState<CryptoCode>("USDT");
  const [submitting, setSubmitting] = useState(false);
  const cryptoMeta = useMemo(() => CRYPTO_LIST.find((c) => c.code === crypto)!, [crypto]);

  // ---- Promo code ----
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountPct: number; discountUSD: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const finalTotal = useMemo(
    () => (promo ? Math.max(0, Math.round((total - promo.discountUSD) * 100) / 100) : total),
    [total, promo]
  );

  // Reservation timer
  const msLeft = reservedAt ? Math.max(0, reservedAt + RESERVATION_MS - Date.now()) : 0;
  const mm = String(Math.floor(msLeft / 60000)).padStart(2, "0");
  const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0");

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    try {
      const res = await Promo.validate(code, total);
      setPromo({ code: res.code, discountPct: res.discountPct, discountUSD: res.discountUSD });
      haptic("success");
      toast.success(tr(`Скидка −${res.discountPct}% применена`, `Discount −${res.discountPct}% applied`));
    } catch (e) {
      const err = e as ApiError;
      const errCode = err?.body && typeof err.body === "object" ? (err.body as any).error : undefined;
      const msg = errCode === "promo_not_found"
        ? tr("Промокод не найден", "Promo code not found")
        : errCode === "promo_already_used"
        ? tr("Этот промокод уже использован", "You already used this promo")
        : tr("Не удалось применить промокод", "Failed to apply promo");
      haptic("error");
      toast.error(msg);
      setPromo(null);
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setPromo(null);
    setPromoInput("");
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      haptic("success");
      toast.success(tr("Скопировано", "Copied"));
    } catch {
      toast.error(tr("Не удалось скопировать", "Copy failed"));
    }
  };

  // Группируем подарки и обычные позиции — для отображения только реальные позиции
  // (подарки покажутся отдельной плашкой внутри своей карточки).
  const realLines = lines.filter((l) => !l.isGift);

  const handlePaid = async () => {
    if (submitting) return;
    if (hasAwaitingOrder) {
      clearCart();
      await hydrateAccount().catch(() => {});
      toast.success(tr("Ждём подтверждения", "Waiting for confirmation"));
      onPaid();
      return;
    }
    if (realLines.length === 0) return;
    setSubmitting(true);
    const customerName = user?.first_name
      ? `${user.first_name}${user.last_name ? " " + user.last_name : ""}${user.username ? ` (@${user.username})` : ""}`
      : user?.username ? `@${user.username}` : undefined;
    const snapshot = {
      totalUSD: finalTotal,
      items: lines,
      delivery,
      deliveryAddress: delivery ? deliveryAddress : undefined,
      status: "awaiting" as const,
      customerName,
      customerTgId: user?.id,
      crypto,
      payAddress: cryptoMeta.address,
      promoCode: promo?.code,
    };
    try {
      await addOrder(snapshot);
      clearCart();
      haptic("success");
      toast.success(tr("Ждём подтверждения", "Waiting for confirmation"));
      onPaid();
      await hydrateAccount().catch(() => {});
    } catch (e: any) {
      const code = e?.body?.error;
      const msg = code === "order_already_submitted"
        ? tr("Заявка уже отправлена", "Order already submitted")
        : code === "delivery_address_required"
        ? tr("Укажите адрес доставки", "Enter delivery address")
        : code === "validation_failed"
        ? tr("Ошибка данных заказа — проверьте корзину", "Invalid order data — check the cart")
        : code === "unauthorized"
        ? tr("Сессия истекла — перезайдите через Telegram", "Session expired — re-open via Telegram")
        : code === "promo_not_found"
        ? tr("Промокод недействителен", "Promo code is invalid")
        : code === "promo_already_used"
        ? tr("Этот промокод уже использован", "You already used this promo")
        : tr(`Не удалось оформить заказ${code ? `: ${code}` : ""}`, `Failed to place order${code ? `: ${code}` : ""}`);
      haptic("error");
      toast.error(msg);
      console.error("[order] create failed", e);
    } finally {
      setSubmitting(false);
    }
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
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg leading-tight">
            {tr("Оплата заказа", "Order payment")}
          </div>
          {cartId && (
            <div className="text-[11px] font-mono text-muted-foreground">#{cartId}</div>
          )}
        </div>
      </header>

      <main className="px-5 pb-32 space-y-5">
        {realLines.length === 0 ? (
          <div className="rounded-2xl bg-card shadow-card p-6 text-center text-sm text-muted-foreground">
            {tr("Заказ пуст", "Order is empty")}
          </div>
        ) : (
          <>
            {/* Reservation timer */}
            {reservedAt > 0 && msLeft > 0 && (
              <div className="rounded-2xl bg-amber-500/10 text-amber-600 px-4 py-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <div className="text-xs font-bold">
                  {tr("Зарезервировано", "Reserved")} · {mm}:{ss}
                </div>
              </div>
            )}

            {/* Promo code */}
            <section className="rounded-2xl bg-card shadow-card p-4 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                {tr("Промокод", "Promo code")}
              </div>
              {promo ? (
                <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-bold text-sm">{promo.code}</div>
                    <div className="text-[11px] text-primary font-semibold">
                      −{promo.discountPct}% · −{formatTHB(promo.discountUSD)}
                    </div>
                  </div>
                  <button
                    onClick={removePromo}
                    className="w-8 h-8 rounded-full bg-card flex items-center justify-center active:scale-90"
                    aria-label={tr("Убрать", "Remove")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder={tr("Введите код", "Enter code")}
                    className="min-w-0 bg-background border border-border rounded-xl px-3 py-3 text-sm font-mono uppercase placeholder:font-sans placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={64}
                    onKeyDown={(e) => { if (e.key === "Enter") applyPromo(); }}
                  />
                  <button
                    onClick={applyPromo}
                    disabled={promoLoading || !promoInput.trim()}
                    className="px-3 rounded-xl gradient-primary text-primary-foreground font-bold text-xs active:scale-[0.98] disabled:opacity-50"
                  >
                    {promoLoading ? "…" : tr("Применить", "Apply")}
                  </button>
                </div>
              )}
            </section>

            {/* Items */}
            <section>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {tr("Состав заказа", "Order items")}
              </div>
              <div className="space-y-2">
                {realLines.map((line, idx) => {
                  const variant = line.product.variants?.find((v) => v.id === line.variantId);
                  const grams = variant?.grams ?? 0;
                  const districtName = line.districtSlug
                    ? findDistrict(line.districtSlug)?.name[lang] ?? line.districtSlug
                    : null;
                  const stashMeta = line.stashType
                    ? STASH_TYPES.find((t) => t.value === line.stashType)
                    : null;
                  const giftGrams = getPromoGiftGrams(promoRules, citySlug, grams);
                  const hasGift = giftGrams > 0 && !!findGiftVariant(line.product, giftGrams);

                  return (
                    <div
                      key={`${line.product.id}-${line.variantId}-${idx}`}
                      className="rounded-2xl bg-card shadow-card p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm leading-tight">
                            {loc(line.product.name, lang)}
                            {line.variantId && (
                              <span className="text-muted-foreground font-normal"> · {line.variantId}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            × {line.qty}
                          </div>
                        </div>
                        <div className="font-bold text-sm shrink-0">
                          {formatTHB((line.priceUSD ?? line.product.priceTHB ?? 0) * line.qty)}
                        </div>
                      </div>

                      {/* Не показываем район/закладку если выбрана доставка */}
                      {!delivery && (districtName || stashMeta) && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px]">
                          {districtName && (
                            <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-foreground/80">
                              <MapPin className="w-3 h-3" /> {districtName}
                            </span>
                          )}
                          {stashMeta && (
                            <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-foreground/80">
                              {stashMeta.emoji} {stashMeta.label[lang]}
                            </span>
                          )}
                        </div>
                      )}

                      {hasGift && (
                        <div className="mt-2 text-[11px] text-primary font-bold uppercase tracking-wide">
                          🎁 {tr(`Подарок ${giftGrams}g × ${line.qty}`, `Gift ${giftGrams}g × ${line.qty}`)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Delivery info */}
            {delivery && (
              <section className="rounded-2xl bg-card shadow-card p-4">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Truck className="w-4 h-4 text-primary" />
                  {tr("Доставка курьером", "Courier delivery")}
                  <span className="ml-auto text-xs text-muted-foreground">+${DELIVERY_FEE_USD}</span>
                </div>
                {deliveryAddress && (
                  <div className="mt-2 text-xs text-foreground/80 leading-snug whitespace-pre-wrap">
                    {deliveryAddress}
                  </div>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {tr("Время доставки: 40–60 минут", "Delivery time: 40–60 minutes")}
                </div>
              </section>
            )}

            {/* Totals */}
            <section className="rounded-2xl bg-card shadow-card p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{tr("Сумма", "Subtotal")}</span>
                <span>{formatTHB(subtotal)}</span>
              </div>
              {delivery && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{tr("Доставка", "Delivery")}</span>
                  <span>+${DELIVERY_FEE_USD}</span>
                </div>
              )}
              {promo && (
                <div className="flex items-center justify-between text-xs text-primary font-semibold">
                  <span>{tr("Промокод", "Promo")} {promo.code} (−{promo.discountPct}%)</span>
                  <span>−{formatTHB(promo.discountUSD)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-semibold">{tr("К оплате", "Total")}</span>
                <span className="font-display font-bold text-2xl">{formatTHB(finalTotal)}</span>
              </div>
            </section>

            {/* Crypto selector */}
            <section>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {tr("Способ оплаты", "Payment method")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CRYPTO_LIST.map((c) => {
                  const active = c.code === crypto;
                  return (
                    <button
                      key={c.code}
                      onClick={() => { haptic("light"); setCrypto(c.code); }}
                      className={`rounded-2xl p-3 text-left border transition-colors ${
                        active
                          ? "gradient-primary text-primary-foreground border-transparent shadow-glow"
                          : "bg-card border-border"
                      }`}
                    >
                      <div className="font-bold">{c.code}</div>
                      <div className={`text-[11px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                        {c.name === c.network || c.code === c.network ? c.name : `${c.name} · ${c.network}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Crypto amount + копирование */}
            <CryptoAmountCard
              amountUSD={finalTotal}
              crypto={crypto}
              cryptoName={
                cryptoMeta.name === cryptoMeta.network || cryptoMeta.code === cryptoMeta.network
                  ? cryptoMeta.name
                  : `${cryptoMeta.name} · ${cryptoMeta.network}`
              }
            />

            {/* Wallet address */}
            <section className="rounded-2xl bg-card shadow-card p-4">
              <div className="text-xs text-muted-foreground mb-1">
                {tr("Адрес кошелька", "Wallet address")}
              </div>
              <div className="font-mono text-sm break-all">{cryptoMeta.address}</div>
              <button
                onClick={() => copy(cryptoMeta.address)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-background border border-border rounded-xl py-2.5 text-sm font-bold active:scale-[0.98]"
              >
                <Copy className="w-4 h-4" />
                {tr("Скопировать адрес", "Copy address")}
              </button>
            </section>

            <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-foreground/80 space-y-1.5">
              <div className="flex gap-2 items-start">
                <span className="text-primary font-bold">⚠️</span>
                <span>
                  {cryptoMeta.name === cryptoMeta.network || cryptoMeta.code === cryptoMeta.network
                    ? tr(
                        `Отправляйте только ${cryptoMeta.name}.`,
                        `Send only ${cryptoMeta.name}.`
                      )
                    : tr(
                        `Отправляйте только ${cryptoMeta.name} в сети ${cryptoMeta.network}.`,
                        `Send only ${cryptoMeta.name} on the ${cryptoMeta.network} network.`
                      )}
                </span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-primary font-bold">💸</span>
                <span>
                  {tr("Учитывайте комиссию сети.", "Mind the network fee.")}
                </span>
              </div>
            </div>

            <button
              onClick={handlePaid}
              disabled={submitting}
              className="w-full gradient-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-glow active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Check className="w-5 h-5" />
              {submitting ? tr("Отправляем…", "Sending…") : tr("Я оплатил", "I have paid")}
            </button>
          </>
        )}
      </main>
    </div>
  );
};
