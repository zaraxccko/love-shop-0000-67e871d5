import { useEffect, useRef } from "react";
import { Minus, Plus, Trash2, Truck, Clock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart, lineKey, DELIVERY_FEE_USD } from "@/store/cart";
import { formatTHB } from "@/lib/format";
import { haptic } from "@/lib/telegram";
import { useI18n, useT } from "@/lib/i18n";
import { loc } from "@/lib/loc";
import { useLocation } from "@/store/location";
import { useLocationPromos } from "@/store/locationPromos";
import { findDistrict } from "@/data/locations";
import { STASH_TYPES } from "@/types/shop";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckout: () => void;
}

const CRYPTO_OPTIONS = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "TRX", name: "Tron" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "TON", name: "Toncoin" },
  { symbol: "USDT", name: "Tether" },
];

export const CartSheet = ({ open, onOpenChange, onCheckout }: CartSheetProps) => {
  const rawLines = useCart((s) => s.lines);
  const linesWithGifts = useCart((s) => s.linesWithGifts);
  const lines = linesWithGifts();
  void rawLines; // subscribe to lines changes
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const subtotal = useCart((s) => s.subtotalUSD());
  const delivery = useCart((s) => s.delivery);
  const toggleDelivery = useCart((s) => s.toggleDelivery);
  const setDelivery = useCart((s) => s.setDelivery);
  const deliveryAddress = useCart((s) => s.deliveryAddress);
  const setDeliveryAddress = useCart((s) => s.setDeliveryAddress);
  const canDeliver = useCart((s) => s.canDeliver());
  const total = useCart((s) => s.totalTHB());
  const t = useT();
  const lang = useI18n((s) => s.lang) ?? "ru";
  void useLocation((s) => s.city); // re-render on city change
  void useLocationPromos((s) => s.promos); // re-render on promo settings change

  const scrollRef = useRef<HTMLDivElement>(null);
  const deliveryBtnRef = useRef<HTMLButtonElement>(null);

  // Если в корзине больше нет позиций от 3 г — выключаем доставку автоматически.
  useEffect(() => {
    if (delivery && !canDeliver) setDelivery(false);
  }, [delivery, canDeliver, setDelivery]);

  const handleToggleDelivery = () => {
    if (!canDeliver) {
      haptic("warning");
      return;
    }
    haptic("light");
    const wasOn = delivery;
    toggleDelivery();
    if (!wasOn) {
      // Scroll so the delivery button + newly revealed address field are visible
      requestAnimationFrame(() => {
        const container = scrollRef.current;
        const btn = deliveryBtnRef.current;
        if (!container || !btn) return;
        const target = btn.offsetTop - 12;
        container.scrollTo({ top: target, behavior: "smooth" });
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-0 p-0 max-h-[90vh] flex flex-col bg-background"
      >
        <SheetHeader className="px-5 pt-4 pb-2">
          <div className="w-12 h-1.5 rounded-full bg-muted mx-auto mb-3" />
          <SheetTitle className="font-display text-2xl text-left">{t("cart.title")}</SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
          {lines.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-6xl mb-3">🛍️</div>
              <div className="font-semibold">{t("cart.empty.title")}</div>
              <div className="text-sm text-muted-foreground mt-1">{t("cart.empty.sub")}</div>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => {
                const key = lineKey(line);
                const unit = line.priceUSD ?? line.product.priceTHB ?? 0;
                const variantLabel = line.variantId ? ` · ${line.variantId}` : "";
                const isGift = line.isGift;
                return (
                  <div
                    key={key}
                    className={`bg-card rounded-2xl p-3 flex items-center gap-3 shadow-card ${isGift ? "border border-primary/30" : ""}`}
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden relative ${!line.product.imageUrl ? line.product.gradient : ""}`}
                    >
                      {line.product.imageUrl ? (
                        <img src={line.product.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl">{line.product.emoji}</span>
                      )}
                      {isGift && (
                        <span className="absolute -top-1 -right-1 text-lg">🎁</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm leading-tight line-clamp-2">
                        {loc(line.product.name, lang)}
                        <span className="text-muted-foreground font-normal">{variantLabel}</span>
                      </div>
                      {(line.districtSlug || line.stashType) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {line.districtSlug && (
                            <span>📍 {findDistrict(line.districtSlug)?.name[lang] ?? line.districtSlug}</span>
                          )}
                          {line.stashType && (() => {
                            const meta = STASH_TYPES.find((t) => t.value === line.stashType);
                            return meta ? (
                              <span className="bg-muted rounded-full px-1.5 py-0.5">
                                {meta.emoji} {meta.label[lang]}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}
                      {isGift ? (
                        <div className="text-primary font-bold text-xs mt-1 uppercase tracking-wide">
                          {lang === "ru" ? `Подарок × ${line.qty}` : `Gift × ${line.qty}`}
                        </div>
                      ) : (
                        <div className="text-primary font-bold text-sm mt-1">
                          {formatTHB(unit * line.qty)}
                        </div>
                      )}
                    </div>
                    {!isGift && (
                      <div className="flex items-center gap-1.5 bg-background rounded-full p-1">
                        <button
                          onClick={() => {
                            haptic("light");
                            if (line.qty === 1) remove(key);
                            else setQty(key, line.qty - 1);
                          }}
                          className="w-7 h-7 rounded-full bg-card flex items-center justify-center active:scale-90 transition-[var(--transition-base)]"
                          aria-label="-"
                        >
                          {line.qty === 1 ? (
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          ) : (
                            <Minus className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <span className="w-5 text-center font-bold text-sm">{line.qty}</span>
                        <button
                          onClick={() => {
                            haptic("light");
                            setQty(key, line.qty + 1);
                          }}
                          className="w-7 h-7 rounded-full gradient-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-[var(--transition-base)] disabled:opacity-40"
                          aria-label="+"
                        >
                          <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                ref={deliveryBtnRef}
                type="button"
                onClick={handleToggleDelivery}
                disabled={!canDeliver}
                className={`w-full mt-2 rounded-2xl p-3 flex items-center gap-3 active:scale-[0.99] transition-colors ${
                  delivery
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : "bg-card border border-border"
                } ${!canDeliver ? "opacity-50 cursor-not-allowed active:scale-100" : ""}`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    delivery ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  <Truck className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-sm">
                    {lang === "ru" ? "Доставка курьером" : "Courier delivery"}
                  </div>
                  <div className={`text-[11px] ${delivery ? "opacity-80" : "text-muted-foreground"}`}>
                    {!canDeliver
                      ? lang === "ru"
                        ? "Доступно от 3 г в заказе"
                        : "Available from 3g in order"
                      : lang === "ru"
                        ? "Применяется ко всему заказу"
                        : "Applied once to the whole order"}
                  </div>
                </div>
                <div className="font-bold text-sm">+${DELIVERY_FEE_USD}</div>
              </button>

              {delivery && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {lang === "ru"
                        ? "Время доставки: 40–60 минут"
                        : "Delivery time: 40–60 minutes"}
                    </span>
                  </div>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder={
                      lang === "ru"
                        ? "Точный адрес для курьера (улица, дом, отель, номер квартиры/виллы)"
                        : "Exact address for courier (street, building, hotel, apt/villa number)"
                    }
                    className="w-full resize-none rounded-2xl bg-card border border-border px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                  <div className="text-[11px] text-muted-foreground rounded-xl bg-card border border-border px-3 py-2 leading-snug">
                    {lang === "ru"
                      ? "✈️ Курьер свяжется с вами в Telegram за 10 минут до приезда."
                      : "✈️ The courier will contact you on Telegram 10 minutes before arrival."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="shrink-0 px-5 pt-3 pb-6 border-t border-border bg-card">
            {delivery && (
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{lang === "ru" ? "Сумма" : "Subtotal"}</span>
                <span>{formatTHB(subtotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground">{t("cart.total")}</span>
              <span className="font-display font-bold text-2xl">{formatTHB(total)}</span>
            </div>

            <button
              onClick={() => {
                haptic("medium");
                onCheckout();
              }}
              className="w-full gradient-primary text-primary-foreground font-bold py-4 rounded-2xl shadow-glow active:scale-[0.98] transition-[var(--transition-base)]"
            >
              {t("cart.checkout")}
            </button>

            <div className="mt-4">
              <div className="text-[11px] text-muted-foreground text-center mb-2">
                {lang === "ru" ? "Принимаем к оплате" : "We accept"}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {CRYPTO_OPTIONS.map((c) => (
                  <span
                    key={c.symbol}
                    className="text-[10px] font-bold bg-background border border-border rounded-full px-2.5 py-1 text-foreground/80"
                    title={c.name}
                  >
                    {c.symbol}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
