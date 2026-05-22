import { create } from "zustand";
import { persist } from "zustand/middleware";
import { findCity, COUNTRIES } from "@/data/locations";
import type { Product } from "@/types/shop";

export interface CountryPromo {
  /** Подарок (граммы) при покупке 2g */
  giftFor2: number;
  /** Подарок (граммы) при покупке 5g */
  giftFor5: number;
  /** Подарок (граммы) при покупке 10g */
  giftFor10: number;
}

const DEFAULT_PROMO: CountryPromo = { giftFor2: 1, giftFor5: 3, giftFor10: 0 };

// На всех локациях единая акция: 2g + 1g в подарок.
const DEFAULT_BY_COUNTRY: Record<string, CountryPromo> = {};

interface LocationPromosState {
  /** Промо-настройки по slug страны */
  promos: Record<string, CountryPromo>;
  getPromo: (countrySlug: string | null | undefined) => CountryPromo;
  setPromo: (countrySlug: string, patch: Partial<CountryPromo>) => void;
  resetPromo: (countrySlug: string) => void;
}

export const useLocationPromos = create<LocationPromosState>()(
  persist(
    (set, get) => ({
      promos: {},
      getPromo: (countrySlug) => {
        if (!countrySlug) return DEFAULT_PROMO;
        const stored = get().promos[countrySlug];
        if (stored) return { ...DEFAULT_PROMO, ...stored };
        return DEFAULT_BY_COUNTRY[countrySlug] ?? DEFAULT_PROMO;
      },
      setPromo: (countrySlug, patch) =>
        set((s) => {
          const current =
            s.promos[countrySlug] ?? DEFAULT_BY_COUNTRY[countrySlug] ?? DEFAULT_PROMO;
          return {
            promos: {
              ...s.promos,
              [countrySlug]: { ...DEFAULT_PROMO, ...current, ...patch },
            },
          };
        }),
      resetPromo: (countrySlug) =>
        set((s) => {
          const next = { ...s.promos };
          delete next[countrySlug];
          return { promos: next };
        }),
    }),
    {
      name: "loveshop-location-promos",
      version: 3,
      migrate: () => ({ promos: {} }),
    }
  )
);

/** Получить количество грамм-подарка для города (на основе настроек страны). */
export const getPromoGiftGrams = (citySlug: string | null | undefined, boughtGrams: number) => {
  const countrySlug = citySlug ? findCity(citySlug)?.country.slug : null;
  const promo = useLocationPromos.getState().getPromo(countrySlug);

  if (boughtGrams >= 10 && promo.giftFor10 > 0) return promo.giftFor10;
  if (boughtGrams >= 5 && promo.giftFor5 > 0) return promo.giftFor5;
  if (boughtGrams >= 2 && promo.giftFor2 > 0) return promo.giftFor2;
  return 0;
};

export const findGiftVariant = (product: Product, giftGrams: number) =>
  product.variants?.find((v) => v.grams === giftGrams || v.id === `${giftGrams}g`);

/** Список всех стран — удобно для админки. */
export const ALL_COUNTRY_SLUGS = COUNTRIES.map((c) => c.slug);
