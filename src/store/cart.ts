import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, Product, StashType } from "@/types/shop";
import { useLocation } from "@/store/location";
import { findGiftVariant, getPromoGiftGrams } from "@/store/locationPromos";

const lineKey = (l: Pick<CartLine, "product" | "variantId" | "districtSlug" | "stashType"> & { isGift?: boolean }) =>
  `${l.product.id}::${l.variantId ?? ""}::${l.districtSlug ?? ""}::${l.stashType ?? ""}${l.isGift ? "::gift" : ""}`;

interface AddOptions {
  variantId?: string;
  districtSlug?: string;
  stashType?: StashType;
  priceUSD?: number;
}

export interface DisplayCartLine extends CartLine {
  isGift?: boolean;
}

export const DELIVERY_FEE_USD = 20;

/** Время резерва товаров в корзине (мс). */
export const RESERVATION_MS = 30 * 60 * 1000;

const newCartId = () =>
  "ORD-" + Math.random().toString(36).slice(2, 8).toUpperCase();

interface CityCart {
  lines: CartLine[];
  delivery: boolean;
  deliveryAddress: string;
  cartId: string;
  reservedAt: number;
}

const emptyCart = (): CityCart => ({
  lines: [],
  delivery: false,
  deliveryAddress: "",
  cartId: newCartId(),
  reservedAt: 0,
});
const activeKey = () => useLocation.getState().city ?? "__none__";

interface CartState {
  /** Корзины по городам. */
  cartsByCity: Record<string, CityCart>;
  /** Зеркало активной корзины (для удобной подписки в компонентах). */
  lines: CartLine[];
  delivery: boolean;
  deliveryAddress: string;
  cartId: string;
  reservedAt: number;
  setDeliveryAddress: (v: string) => void;
  setDelivery: (v: boolean) => void;
  toggleDelivery: () => void;
  add: (product: Product, opts?: AddOptions) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  totalQty: () => number;
  subtotalUSD: () => number;
  totalTHB: () => number;
  linesWithGifts: () => DisplayCartLine[];
  /** Пересинхронизировать зеркало с активным городом (вызывается при смене локации). */
  _syncMirror: () => void;
}

/** Apply updater to active city's cart and return new state slice (incl. mirror). */
const applyToActive = (
  state: CartState,
  updater: (cart: CityCart) => CityCart
) => {
  const key = activeKey();
  const current = state.cartsByCity[key] ?? emptyCart();
  const next = updater(current);
  return {
    cartsByCity: { ...state.cartsByCity, [key]: next },
    lines: next.lines,
    delivery: next.delivery,
    deliveryAddress: next.deliveryAddress,
    cartId: next.cartId,
    reservedAt: next.reservedAt,
  };
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      cartsByCity: {},
      lines: [],
      delivery: false,
      deliveryAddress: "",
      cartId: "",
      reservedAt: 0,
      _syncMirror: () => {
        const key = activeKey();
        let c = get().cartsByCity[key] ?? emptyCart();
        // Миграция старых корзин без cartId/reservedAt
        if (c.lines.length > 0 && (!c.cartId || c.reservedAt === 0)) {
          c = {
            ...c,
            cartId: c.cartId || newCartId(),
            reservedAt: c.reservedAt || Date.now(),
          };
          set((s) => ({
            cartsByCity: { ...s.cartsByCity, [key]: c },
          }));
        }
        set({
          lines: c.lines,
          delivery: c.delivery,
          deliveryAddress: c.deliveryAddress,
          cartId: c.cartId,
          reservedAt: c.reservedAt,
        });
      },
      setDeliveryAddress: (v) =>
        set((s) => applyToActive(s, (c) => ({ ...c, deliveryAddress: v }))),
      setDelivery: (v) =>
        set((s) => applyToActive(s, (c) => ({ ...c, delivery: v }))),
      toggleDelivery: () =>
        set((s) => applyToActive(s, (c) => ({ ...c, delivery: !c.delivery }))),
      add: (product, opts) =>
        set((s) =>
          applyToActive(s, (c) => {
            const candidate: CartLine = {
              product,
              qty: 1,
              variantId: opts?.variantId,
              districtSlug: opts?.districtSlug,
              stashType: opts?.stashType,
              priceUSD: opts?.priceUSD,
            };
            // Если корзина пустая или резерв истёк — стартуем новый заказ
            const expired =
              c.reservedAt > 0 && Date.now() - c.reservedAt > RESERVATION_MS;
            const base =
              c.lines.length === 0 || expired
                ? { ...c, cartId: newCartId(), reservedAt: Date.now() }
                : c;
            const key = lineKey(candidate);
            const existing = base.lines.find((l) => lineKey(l) === key);
            if (existing) {
              return {
                ...base,
                lines: base.lines.map((l) =>
                  lineKey(l) === key ? { ...l, qty: l.qty + 1 } : l
                ),
              };
            }
            return { ...base, lines: [...base.lines, candidate] };
          })
        ),
      remove: (key) =>
        set((s) =>
          applyToActive(s, (c) => {
            const lines = c.lines.filter((l) => lineKey(l) !== key);
            return lines.length === 0
              ? emptyCart()
              : { ...c, lines };
          })
        ),
      setQty: (key, qty) =>
        set((s) =>
          applyToActive(s, (c) => ({
            ...c,
            lines:
              qty <= 0
                ? c.lines.filter((l) => lineKey(l) !== key)
                : c.lines.map((l) => (lineKey(l) === key ? { ...l, qty } : l)),
          }))
        ),
      clear: () => set((s) => applyToActive(s, () => emptyCart())),
      totalQty: () => get().lines.reduce((s, l) => s + l.qty, 0),
      subtotalUSD: () =>
        get().lines.reduce(
          (s, l) => s + l.qty * (l.priceUSD ?? l.product.priceTHB ?? 0),
          0
        ),
      totalTHB: () => {
        const sub = get().lines.reduce(
          (s, l) => s + l.qty * (l.priceUSD ?? l.product.priceTHB ?? 0),
          0
        );
        return sub + (get().delivery ? DELIVERY_FEE_USD : 0);
      },
      linesWithGifts: () => {
        const out: DisplayCartLine[] = [];
        const citySlug = useLocation.getState().city;
        for (const l of get().lines) {
          out.push(l);
          const variant = l.product.variants?.find((v) => v.id === l.variantId);
          const grams = variant?.grams ?? 0;
          const giftGrams = getPromoGiftGrams(citySlug, grams);
          const giftVariant = giftGrams > 0 ? findGiftVariant(l.product, giftGrams) : undefined;
          if (giftVariant) {
            out.push({
              product: l.product,
              qty: l.qty,
              variantId: giftVariant.id,
              districtSlug: l.districtSlug,
              stashType: l.stashType,
              priceUSD: 0,
              isGift: true,
            });
          }
        }
        return out;
      },
    }),
    {
      name: "sweetleaf-cart-v2",
      onRehydrateStorage: () => (state) => {
        state?._syncMirror();
      },
    }
  )
);

// При смене города/страны — переключаем активную корзину.
useLocation.subscribe((s, prev) => {
  if (s.city !== prev.city) {
    useCart.getState()._syncMirror();
  }
});

export { lineKey };
