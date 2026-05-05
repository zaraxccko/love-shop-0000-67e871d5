import { useMemo, useState } from "react";
import { ChevronLeft, MapPin, Package, Plus, Truck, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Product, StashType } from "@/types/shop";
import { STASH_TYPES } from "@/types/shop";
import { useCart, DELIVERY_FEE_USD } from "@/store/cart";
import { useLocation } from "@/store/location";
import { findGiftVariant, getPromoGiftGrams, useLocationPromos } from "@/store/locationPromos";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/loc";
import { haptic } from "@/lib/telegram";
import { findCity } from "@/data/locations";
import { cn } from "@/lib/utils";

const flyToCart = (sourceEl: HTMLElement, imageUrl: string | undefined, emoji: string) => {
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  if (!target) return;
  const from = sourceEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const endX = to.left + to.width / 2;
  const endY = to.top + to.height / 2;

  const node = document.createElement("div");
  node.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    width: 56px;
    height: 56px;
    transform: translate(-50%, -50%);
    z-index: 9999;
    pointer-events: none;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 30px -8px rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--card));
    transition: transform 0.7s cubic-bezier(0.5, -0.2, 0.7, 1), opacity 0.7s ease-out;
    will-change: transform, opacity;
  `;

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.style.cssText = "width:100%;height:100%;object-fit:cover;";
    node.appendChild(img);
  } else {
    node.style.fontSize = "32px";
    node.textContent = emoji;
  }

  document.body.appendChild(node);

  requestAnimationFrame(() => {
    node.style.transform = `translate(calc(-50% + ${endX - startX}px), calc(-50% + ${endY - startY}px)) scale(0.15)`;
    node.style.opacity = "0";
  });

  setTimeout(() => node.remove(), 750);
};

interface ProductSheetProps {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}

interface PendingAdd {
  variantId: string;
  grams: number;
  price: number;
  districtSlug: string;
  triggerEl: HTMLElement;
}

export const ProductSheet = ({ product, onOpenChange }: ProductSheetProps) => {
  const lang = useI18n((s) => s.lang) ?? "ru";
  const citySlug = useLocation((s) => s.city);
  void useLocationPromos((s) => s.promos); // re-render on promo settings change
  const add = useCart((s) => s.add);
  const delivery = useCart((s) => s.delivery);
  const toggleDelivery = useCart((s) => s.toggleDelivery);
  const [districtSlug, setDistrictSlug] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAdd | null>(null);

  const productId = product?.id;
  useMemo(() => {
    setDistrictSlug(null);
    setPending(null);
  }, [productId]);

  const cityInfo = citySlug ? findCity(citySlug) : null;
  const country = cityInfo?.country;
  const city = cityInfo?.city;

  // Helper: stashes of a variant (normalised — supports legacy `districts`)
  const variantStashes = (v: NonNullable<Product["variants"]>[number]) => {
    if (v.stashes && v.stashes.length) return v.stashes;
    if (v.districts && v.districts.length) {
      return v.districts.map((d) => ({ districtSlug: d, type: "prikop" as StashType }));
    }
    return [];
  };

  // Variants of this product available in the current city (have price + at least one stash in city)
  const variantsInCity = useMemo(() => {
    if (!product || !country) return [];
    return (product.variants ?? []).filter((v) => {
      if (!v.pricesByCountry?.[country.slug]) return false;
      if (city?.districts && city.districts.length > 0) {
        const cityDistrictSlugs = new Set(city.districts.map((d) => d.slug));
        return variantStashes(v).some((s) => cityDistrictSlugs.has(s.districtSlug));
      }
      return true;
    });
  }, [product, country, city]);

  // Districts of the current city that have at least one stash
  const availableDistricts = useMemo(() => {
    if (!city?.districts || !product) return [];
    return city.districts.filter((d) =>
      variantsInCity.some((v) => variantStashes(v).some((s) => s.districtSlug === d.slug))
    );
  }, [city, variantsInCity, product]);

  // Variants available in the chosen district
  const variantsInDistrict = useMemo(() => {
    if (!districtSlug) return [];
    return variantsInCity.filter((v) =>
      variantStashes(v).some((s) => s.districtSlug === districtSlug)
    );
  }, [districtSlug, variantsInCity]);

  if (!product) return null;
  const name = loc(product.name, lang);
  const description = loc(product.description, lang);

  const skipDistrictStep = !city?.districts || city.districts.length === 0;
  const effectiveVariants = skipDistrictStep ? variantsInCity : variantsInDistrict;
  const showDistrictPicker = !skipDistrictStep && !districtSlug;

  // Available stash types for the pending add
  const pendingTypes: StashType[] = pending
    ? (() => {
        const v = product.variants?.find((x) => x.id === pending.variantId);
        if (!v) return [];
        const seen = new Set<StashType>();
        for (const s of variantStashes(v)) {
          if (s.districtSlug === pending.districtSlug) seen.add(s.type);
        }
        return STASH_TYPES.map((t) => t.value).filter((t) => seen.has(t));
      })()
    : [];

  const confirmAdd = (type: StashType) => {
    if (!pending) return;
    haptic("medium");
    flyToCart(pending.triggerEl, product.imageUrl, product.emoji);
    add(product, {
      variantId: pending.variantId,
      districtSlug: pending.districtSlug,
      stashType: type,
      priceUSD: pending.price,
    });
    setPending(null);
  };

  return (
    <Sheet open={!!product} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-0 p-0 max-h-[90vh] flex flex-col bg-background [&>button.absolute]:hidden"
      >
        <div
          className={cn(
            "relative w-full max-h-[45vh] aspect-square mx-auto flex items-center justify-center overflow-hidden rounded-t-3xl bg-muted",
            !product.imageUrl && product.gradient
          )}
          style={{ maxWidth: "min(100%, 45vh)" }}
        >
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[96px] drop-shadow-sm select-none">{product.emoji}</span>
          )}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-card/90 backdrop-blur flex items-center justify-center active:scale-90 shadow-card"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          {!skipDistrictStep && districtSlug && (
            <button
              onClick={() => {
                haptic("light");
                setDistrictSlug(null);
              }}
              className="absolute top-3 left-3 h-9 px-3 rounded-full bg-card/90 backdrop-blur flex items-center gap-1 text-xs font-semibold active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
              {lang === "ru" ? "Район" : "District"}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
          <h2 className="font-display font-bold text-2xl leading-tight">{name}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
          )}

          {/* Step 1: pick district */}
          {showDistrictPicker && (
            <div className="mt-5">
              <div className="flex items-center gap-1.5 text-sm font-semibold mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                {lang === "ru" ? "Выберите район" : "Choose a district"}
              </div>
              {availableDistricts.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {lang === "ru" ? "Нет в наличии в вашем городе." : "Not available in your city."}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableDistricts.map((d) => (
                    <button
                      key={d.slug}
                      onClick={() => {
                        haptic("light");
                        setDistrictSlug(d.slug);
                      }}
                      className="bg-card rounded-2xl p-3 text-left shadow-card active:scale-[0.98]"
                    >
                      <div className="font-semibold text-sm">{d.name[lang]}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {(() => {
                          const n = variantsInCity.filter((v) =>
                            variantStashes(v).some((s) => s.districtSlug === d.slug)
                          ).length;
                          if (lang === "ru") {
                            const mod10 = n % 10;
                            const mod100 = n % 100;
                            let word = "вариантов";
                            if (mod10 === 1 && mod100 !== 11) word = "вариант";
                            else if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
                              word = "варианта";
                            return `${n} ${word}`;
                          }
                          return `${n} ${n === 1 ? "option" : "options"}`;
                        })()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: variants */}
          {!showDistrictPicker && (
            <div className="mt-5 space-y-2">
              {!skipDistrictStep && (
                <div className="text-xs text-muted-foreground mb-1">
                  {lang === "ru" ? "Доступно в районе" : "Available in"}{" "}
                  <span className="font-semibold text-foreground">
                    {city?.districts?.find((d) => d.slug === districtSlug)?.name[lang]}
                  </span>
                </div>
              )}
              {effectiveVariants.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {lang === "ru" ? "Нет доступных фасовок." : "No options available."}
                </div>
              ) : (
                effectiveVariants
                  .slice()
                  .sort((a, b) => a.grams - b.grams)
                  .map((v) => {
                    const price = country ? v.pricesByCountry?.[country.slug] ?? 0 : 0;
                    const giftGrams = getPromoGiftGrams(citySlug, v.grams);
                    const giftVariant = giftGrams > 0 ? findGiftVariant(product, giftGrams) : undefined;
                    // available stash types for this district
                    const dSlug = districtSlug ?? variantStashes(v)[0]?.districtSlug ?? "";
                    const typesHere = new Set(
                      variantStashes(v)
                        .filter((s) => s.districtSlug === dSlug)
                        .map((s) => s.type)
                    );
                    return (
                      <div
                        key={v.id}
                        className="bg-card rounded-2xl p-3 shadow-card flex items-center gap-3"
                      >
                        <div className="flex-1 flex items-baseline gap-2 flex-wrap">
                          <div className="font-bold text-base">{v.grams}g</div>
                          <div className="text-sm text-muted-foreground">·</div>
                          <div className="text-sm font-semibold text-foreground">${price}</div>
                          {giftVariant && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-0.5">
                              🎁 +{giftGrams}g Free
                            </span>
                          )}
                          {typesHere.size > 0 && (
                            <div className="w-full flex flex-wrap gap-1 mt-1">
                              {STASH_TYPES.filter((t) => typesHere.has(t.value)).map((t) => (
                                <span
                                  key={t.value}
                                  className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground"
                                >
                                  {t.emoji} {t.label[lang]}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="w-full text-[10px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {lang === "ru"
                              ? `Возможна доставка от 3 гр +$${DELIVERY_FEE_USD} на весь заказ`
                              : `Delivery from 3g +$${DELIVERY_FEE_USD} per order`}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            const trigger = e.currentTarget;
                            haptic("light");
                            // If only one type available — add directly. Otherwise show picker.
                            if (typesHere.size === 1) {
                              const onlyType = Array.from(typesHere)[0];
                              haptic("medium");
                              flyToCart(trigger, product.imageUrl, product.emoji);
                              add(product, {
                                variantId: v.id,
                                districtSlug: dSlug,
                                stashType: onlyType,
                                priceUSD: price,
                              });
                            } else {
                              setPending({
                                variantId: v.id,
                                grams: v.grams,
                                price,
                                districtSlug: dSlug,
                                triggerEl: trigger,
                              });
                            }
                          }}
                          className="h-9 px-4 rounded-full gradient-primary text-primary-foreground font-bold text-sm flex items-center gap-1 shadow-glow active:scale-95"
                        >
                          <Plus className="w-4 h-4" strokeWidth={3} />
                          {lang === "ru" ? "В корзину" : "Add"}
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>

        {/* Stash type picker overlay */}
        {pending && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex items-end">
            <div className="w-full bg-card rounded-t-3xl p-5 shadow-card animate-in slide-in-from-bottom">
              <div className="w-12 h-1.5 rounded-full bg-muted mx-auto mb-4" />
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="font-display font-bold text-lg">
                  {lang === "ru" ? "Тип закладки" : "Stash type"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {pending.grams}g ·{" "}
                {city?.districts?.find((d) => d.slug === pending.districtSlug)?.name[lang]}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {pendingTypes.map((tv) => {
                  const meta = STASH_TYPES.find((t) => t.value === tv)!;
                  return (
                    <button
                      key={tv}
                      onClick={() => confirmAdd(tv)}
                      className="bg-background rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] shadow-card"
                    >
                      <span className="text-2xl">{meta.emoji}</span>
                      <span className="font-semibold text-sm flex-1 text-left">
                        {meta.label[lang]}
                      </span>
                      <Plus className="w-4 h-4 text-primary" strokeWidth={3} />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPending(null)}
                className="w-full mt-3 text-sm text-muted-foreground py-2 active:scale-95"
              >
                {lang === "ru" ? "Отмена" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
