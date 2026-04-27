import { findCity } from "@/data/locations";
import type { Product } from "@/types/shop";

export const getPromoGiftGrams = (citySlug: string | null | undefined, boughtGrams: number) => {
  const countrySlug = citySlug ? findCity(citySlug)?.country.slug : null;
  if (countrySlug === "uae") {
    if (boughtGrams >= 10) return 5;
    if (boughtGrams >= 5) return 2;
    return 0;
  }

  if (boughtGrams >= 5) return 5;
  return 0;
};

export const findGiftVariant = (product: Product, giftGrams: number) =>
  product.variants?.find((v) => v.grams === giftGrams || v.id === `${giftGrams}g`);