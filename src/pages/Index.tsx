import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Header } from "@/components/shop/Header";
import { Hero } from "@/components/shop/Hero";
import { CategoryPills } from "@/components/shop/CategoryPills";
import { ProductCard } from "@/components/shop/ProductCard";
import { CartSheet } from "@/components/shop/CartSheet";
import { StickyCartBar } from "@/components/shop/StickyCartBar";
import { SplashLanguage } from "@/components/shop/SplashLanguage";
import { LocationPicker } from "@/components/shop/LocationPicker";
import { ProductSheet } from "@/components/shop/ProductSheet";
import { AccountPage } from "@/components/shop/AccountPage";
import { OrderPaymentPage } from "@/components/shop/OrderPaymentPage";
import { CaptchaGate } from "@/components/shop/CaptchaGate";
import { useCaptcha } from "@/store/captcha";
import { useTelegram } from "@/lib/telegram";
import { useI18n, useT } from "@/lib/i18n";
import { useLocation } from "@/store/location";
import { useCatalog } from "@/store/catalog";
import { useAuth } from "@/store/auth";
import { useAccount } from "@/store/account";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";
import { findCity } from "@/data/locations";
import { toast } from "sonner";
import type { Product } from "@/types/shop";
import AdminPage from "./Admin";

type Screen = "shop" | "account" | "order-payment";
type OrderPaymentOrigin = "shop" | "account";

const Index = () => {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const city = useLocation((s) => s.city);
  const products = useCatalog((s) => s.products);
  const categories = useCatalog((s) => s.categories);
  const catalogLoaded = useCatalog((s) => s.loaded);

  const { user, tg } = useTelegram();
  const { isAdmin } = useAuth();
  const loginWithInitData = useSession((s) => s.loginWithInitData);
  const refreshMe = useSession((s) => s.refreshMe);
  const banned = useSession((s) => s.banned);
  const hydrateCatalog = useCatalog((s) => s.hydrate);
  const hydrateAccount = useAccount((s) => s.hydrate);

  // ── Бутстрап сессии ────────────────────────────────────────────
  // 1) Если запущены внутри Telegram WebApp — логинимся через initData.
  // 2) Если уже есть сохранённый JWT — просто подтягиваем /me.
  // 3) Если ни того, ни другого (превью в браузере) — пропускаем,
  //    каталог продолжит работать в read-only режиме на mock-данных.
  useEffect(() => {
    const initData = tg?.initData;
    if (initData) {
      loginWithInitData(initData).then(() => {
        hydrateAccount();
      });
    } else {
      refreshMe().then(() => hydrateAccount());
    }
    hydrateCatalog();
  }, [tg?.initData, loginWithInitData, refreshMe, hydrateCatalog, hydrateAccount]);

  const [category, setCategory] = useState<string>("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [showLocPicker, setShowLocPicker] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const [screen, setScreen] = useState<Screen>("shop");
  const [orderPaymentOrigin, setOrderPaymentOrigin] = useState<OrderPaymentOrigin>("shop");

  const cartLines = useCart((s) => s.lines);
  const cartDelivery = useCart((s) => s.delivery);
  const cartAddress = useCart((s) => s.deliveryAddress);
  const captchaPassed = useCaptcha((s) => s.passed);

  const handleCheckout = async () => {
    if (cartLines.length === 0) return;
    if (cartDelivery && !cartAddress.trim()) {
      toast.error(lang === "en" ? "Please enter delivery address" : "Укажите адрес доставки");
      return;
    }
    setCartOpen(false);
    setOrderPaymentOrigin("shop");
    setScreen("order-payment");
  };

  const cityInfo = city ? findCity(city) : null;

  const cityProducts = useMemo(() => {
    if (!city || !cityInfo) return products;
    const cityDistrictSlugs = new Set(
      (cityInfo.city.districts ?? []).map((d) => d.slug)
    );
    const countrySlug = cityInfo.country.slug;
    return products.filter((p) => {
      // Must allow this city
      if (p.cities && p.cities.length > 0 && !p.cities.includes(city)) return false;
      const variants = p.variants ?? [];
      // No variants yet → show by city allowlist (freshly created products).
      if (variants.length === 0) return true;
      // Has variants → at least one must be priced for this country.
      // If a variant has no district/stash info, treat it as available city-wide.
      return variants.some((v) => {
        if (!v.pricesByCountry?.[countrySlug]) return false;
        const variantDistricts = [
          ...(v.districts ?? []),
          ...((v.stashes ?? []).map((s) => s.districtSlug)),
        ];
        if (variantDistricts.length === 0) return true;
        if (cityDistrictSlugs.size === 0) return true;
        return variantDistricts.some((d) => cityDistrictSlugs.has(d));
      });
    });
  }, [products, city, cityInfo]);

  const featured = useMemo(
    () => cityProducts.find((p) => p.featured) ?? cityProducts[0],
    [cityProducts]
  );

  const filtered = useMemo(
    () => (category === "all" ? cityProducts : cityProducts.filter((p) => p.category === category)),
    [cityProducts, category]
  );

  // Banned users — простая заглушка 404, без какого-либо UI магазина.
  if (banned) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="max-w-sm w-full text-center space-y-3">
          <div className="text-6xl font-display font-extrabold text-muted-foreground">404</div>
          <h1 className="font-display font-bold text-xl">Сервис временно недоступен</h1>
        </div>
      </div>
    );
  }

  // Admins open the shop by default and switch to the admin panel via the header button.
  if (isAdmin && showAdmin) return <AdminPage onExit={() => setShowAdmin(false)} />;

  if (!lang) return <SplashLanguage onPicked={() => {}} />;
  // Captcha gate — admins тоже проходят (защита от ботов на входе).
  if (!captchaPassed) return <CaptchaGate />;
  if (!city || showLocPicker)
    return (
      <LocationPicker
        showBack={!!city}
        onBack={() => setShowLocPicker(false)}
        onPicked={() => setShowLocPicker(false)}
      />
    );

  if (screen === "order-payment")
    return (
      <OrderPaymentPage
        onBack={() => setScreen(orderPaymentOrigin === "account" ? "account" : "shop")}
        onPaid={() => setScreen("account")}
      />
    );

  if (screen === "account")
    return (
      <AccountPage
        onBack={() => setScreen("shop")}
        onOpenCart={() => {
          setScreen("shop");
          setCartOpen(true);
        }}
        onOpenActiveOrder={() => {
          setOrderPaymentOrigin("account");
          setScreen("order-payment");
        }}
      />
    );

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background">
      <Header
        onCartClick={() => setCartOpen(true)}
        onLocationClick={() => setShowLocPicker(true)}
        showAdminButton={isAdmin}
        onAdminClick={() => setShowAdmin(true)}
        onAccountClick={() => setScreen("account")}
      />

      <main className="pb-32">
        {!catalogLoaded ? (
          <>
            <div className="px-5 pt-4 relative">
              <div className="h-44 rounded-3xl bg-muted animate-pulse" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <span className="text-xs font-medium text-muted-foreground">
                  Loading…
                </span>
              </div>
            </div>
            <div className="flex gap-2 overflow-hidden pb-3 pl-5 pr-5 pt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-24 rounded-full bg-muted animate-pulse shrink-0" />
              ))}
            </div>
            <section className="px-5">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-card rounded-3xl overflow-hidden shadow-card">
                    <div className="aspect-square bg-muted animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {featured && <Hero product={featured} />}

            <CategoryPills categories={categories} active={category} onChange={setCategory} />

            <section className="px-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold text-xl">
                  {category === "all" ? t("section.allProducts") : t("section.category")}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} {t("section.count")}
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <div className="text-5xl font-display font-bold mb-2">404</div>
                  {t("section.empty")}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map((p) => (
                    <ProductCard key={p.id} product={p} onOpen={setOpenProduct} />
                  ))}
                </div>
              )}

            </section>
          </>
        )}
      </main>

      <StickyCartBar onClick={() => setCartOpen(true)} />
      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        onCheckout={handleCheckout}
      />
      <ProductSheet
        product={openProduct}
        onOpenChange={(o) => !o && setOpenProduct(null)}
      />
    </div>
  );
};

export default Index;
