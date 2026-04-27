import type { Product } from "@/types/shop";
import { useI18n, useT } from "@/lib/i18n";
import { useLocation } from "@/store/location";
import { findCity } from "@/data/locations";
import { loc } from "@/lib/loc";
import { useLocationPromos } from "@/store/locationPromos";

interface HeroProps {
  product: Product;
  onClick?: () => void;
}

export const Hero = ({ product, onClick }: HeroProps) => {
  const t = useT();
  const lang = useI18n((s) => s.lang) ?? "ru";
  const citySlug = useLocation((s) => s.city);
  const countrySlug = citySlug ? findCity(citySlug)?.country.slug : undefined;

  // Pick the smallest variant of >=5g available in the current country to advertise
  // the "+5g free" promo & price. Falls back to gracefully hiding the price chip.
  const promoVariant = (() => {
    if (!countrySlug) return null;
    const eligible = (product.variants ?? [])
      .filter((v) => v.grams >= 5 && v.pricesByCountry?.[countrySlug])
      .sort((a, b) => a.grams - b.grams);
    return eligible[0] ?? null;
  })();
  const promoPrice = promoVariant?.pricesByCountry?.[countrySlug ?? ""];

  return (
    <button
      onClick={onClick}
      className="mx-5 mb-5 block w-[calc(100%-2.5rem)] text-left rounded-3xl gradient-hero p-5 pr-[44%] relative overflow-hidden shadow-soft active:scale-[0.99] transition-[var(--transition-base)] min-h-[160px]"
    >
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/30 blur-2xl" />
      {product.imageUrl ? (
        <div className="absolute right-3 top-3 bottom-3 w-[38%] rounded-2xl overflow-hidden shadow-card">
          <img
            src={product.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="absolute right-2 bottom-0 text-[100px] leading-none opacity-90 select-none">
          {product.emoji}
        </div>
      )}
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-foreground/70 mb-1">
          {t("hero.pickOfDay")}
        </div>
        <div className="font-display text-[20px] font-bold leading-tight text-foreground">
          {loc(product.name, lang)}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {promoVariant && promoPrice != null && (
            <span className="bg-card/90 backdrop-blur text-foreground text-xs font-bold px-3 py-1.5 rounded-full">
              {promoVariant.grams}g · ${promoPrice}
            </span>
          )}
          <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-glow">
            🎁 5+5g {lang === "en" ? "Free" : "в подарок"}
          </span>
        </div>
      </div>
    </button>
  );
};
