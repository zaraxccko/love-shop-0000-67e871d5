import { useEffect, useState } from "react";
import { Trash2, Pencil, Plus, RotateCcw, Eye, ChevronLeft, MapPin, Check, X, Image as ImageIcon, Truck } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useCatalog } from "@/store/catalog";
import type { OrderRecord } from "@/store/account";
import { useAdminPanel } from "@/store/adminPanel";
import { useT } from "@/lib/i18n";
import { loc } from "@/lib/loc";
import { COUNTRIES, findDistrict } from "@/data/locations";
import { useLocationToggles } from "@/store/locationToggles";
import {
  resolvePromoRule,
  useLocationPromos,
  type LocationPromoRule,
} from "@/store/locationPromos";
import type { Category, Product, LocalizedString, StashType, VariantStash } from "@/types/shop";
import { STASH_TYPES } from "@/types/shop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AnalyticsTab } from "@/components/shop/admin/AnalyticsTab";
import { BroadcastTab } from "@/components/shop/admin/BroadcastTab";
import { ImageCropper } from "@/components/shop/admin/ImageCropper";
import { PromoTab } from "@/components/shop/admin/PromoTab";
import { toast } from "sonner";

const GRADIENTS = ["gradient-mango", "gradient-mint", "gradient-grape", "gradient-primary", "gradient-hero"];

const blankProduct = (): Product => ({
  id: `p_${Date.now().toString(36)}`,
  name: { ru: "", en: "" },
  description: { ru: "", en: "" },
  category: "",
  priceTHB: 0,
  weight: "",
  inStock: 0,
  gradient: "gradient-mango",
  emoji: "✨",
  cities: [],
});

const blankCategory = (): Category => ({
  slug: `cat_${Date.now().toString(36)}`,
  name: { ru: "", en: "" },
  emoji: "✨",
  gradient: "gradient-mango",
});

/** Read RU or EN from a LocalizedString safely. */
const getLang = (v: LocalizedString | undefined, l: "ru" | "en"): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v[l] ?? "";
};
const setLang = (
  v: LocalizedString | undefined,
  l: "ru" | "en",
  val: string
): LocalizedString => {
  const base = typeof v === "object" && v !== null ? v : { ru: typeof v === "string" ? v : "", en: "" };
  return { ...base, [l]: val };
};

const resolveOrderItemName = (value: unknown, lang: "ru" | "en" = "ru"): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record[lang] === "string") return record[lang] as string;
  if (typeof record.ru === "string") return record.ru as string;
  if (typeof record.en === "string") return record.en as string;
  if (record.name) return resolveOrderItemName(record.name, lang);

  return "";
};

const adminCustomerLabel = (order: { customerUsername?: string; customerTgId?: number }) => {
  if (order.customerUsername) return `@${order.customerUsername}`;
  if (order.customerTgId) return `TG ${order.customerTgId}`;
  return "Гость";
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

interface AdminPageProps {
  onExit?: () => void;
}

const AdminPage = ({ onExit }: AdminPageProps) => {
  const t = useT();
  const {
    products,
    categories,
    upsertProduct,
    deleteProduct,
    upsertCategory,
    deleteCategory,
    reset,
  } = useCatalog();

  const [editingP, setEditingP] = useState<Product | null>(null);
  const [editingC, setEditingC] = useState<Category | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const refreshAll = useAdminPanel((s) => s.refreshAll);
  const awaitingOrders = useAdminPanel((s) => s.awaitingOrders);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const allCities = COUNTRIES.flatMap((c) => c.cities.map((city) => ({ ...city, country: c })));
  const activeCountry = COUNTRIES.find((c) => c.slug === selectedCountry);
  const activeCity = allCities.find((c) => c.slug === selectedCity);

  // Standalone deposits view (not tied to geo)
  if (selectedCountry === "__deposits__") {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry(null)}
            className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-base flex-1 text-center">
            Подтверждение оплат
          </h1>
          <span className="w-10" />
        </header>
        <DepositsTab standalone />
      </div>
    );
  }

  if (selectedCountry === "__analytics__") {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry(null)}
            className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-base flex-1 text-center">Аналитика</h1>
          <span className="w-10" />
        </header>
        <Tabs defaultValue="analytics">
          <TabsList className="sr-only">
            <TabsTrigger value="analytics">analytics</TabsTrigger>
          </TabsList>
          <AnalyticsTab />
        </Tabs>
      </div>
    );
  }

  if (selectedCountry === "__broadcast__") {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry(null)}
            className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-base flex-1 text-center">Рассылка</h1>
          <span className="w-10" />
        </header>
        <Tabs defaultValue="broadcast">
          <TabsList className="sr-only">
            <TabsTrigger value="broadcast">broadcast</TabsTrigger>
          </TabsList>
          <BroadcastTab />
        </Tabs>
      </div>
    );
  }

  if (selectedCountry === "__promo__") {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry(null)}
            className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-base flex-1 text-center">Промокоды</h1>
          <span className="w-10" />
        </header>
        <PromoTab />
      </div>
    );
  }

  if (selectedCountry === "__locations__") {
    return <LocationsAdmin onBack={() => setSelectedCountry(null)} />;
  }

  // Geo picker — country first
  if (!selectedCountry) {
    const awaitingCount = awaitingOrders.length;
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
        <header className="flex items-center justify-between mb-6">
          <button
            onClick={() => onExit?.()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground active:scale-95"
          >
            <Eye className="w-4 h-4" /> {t("admin.viewShop")}
          </button>
          <h1 className="font-display font-bold text-base">{t("admin.title")}</h1>
          <span className="w-10" />
        </header>

        <button
          onClick={() => setSelectedCountry("__deposits__")}
          className="w-full bg-card rounded-2xl p-4 shadow-card active:scale-[0.98] flex items-center gap-3 mb-3 text-left"
        >
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-2xl shrink-0">
            💸
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Подтверждение оплат</div>
            <div className="text-[11px] text-muted-foreground">
              {awaitingCount > 0
                ? `${awaitingOrders.length} новых заказов`
                : "Нет новых заявок"}
            </div>
          </div>
          {awaitingCount > 0 && (
            <span className="text-[11px] font-bold gradient-primary text-primary-foreground rounded-full px-2 py-1">
              {awaitingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setSelectedCountry("__promo__")}
          className="w-full bg-card rounded-2xl p-4 shadow-card active:scale-[0.98] flex items-center gap-3 mb-4 text-left"
        >
          <div className="w-12 h-12 rounded-xl gradient-mango flex items-center justify-center text-2xl shrink-0">
            🎟️
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">Промокоды</div>
            <div className="text-[11px] text-muted-foreground">Создание и управление скидками</div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry("__analytics__")}
            className="bg-card rounded-2xl p-4 shadow-card active:scale-[0.98] text-left"
          >
            <div className="w-10 h-10 rounded-xl gradient-mint flex items-center justify-center text-xl mb-2">
              📊
            </div>
            <div className="font-bold text-sm">Аналитика</div>
          </button>
          <button
            onClick={() => setSelectedCountry("__broadcast__")}
            className="bg-card rounded-2xl p-4 shadow-card active:scale-[0.98] text-left"
          >
            <div className="w-10 h-10 rounded-xl gradient-grape flex items-center justify-center text-xl mb-2">
              📢
            </div>
            <div className="font-bold text-sm">Рассылка</div>
          </button>
          <button
            onClick={() => setSelectedCountry("__locations__")}
            className="bg-card rounded-2xl p-4 shadow-card active:scale-[0.98] text-left col-span-2"
          >
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center text-xl mb-2">
              🌍
            </div>
            <div className="font-bold text-sm">Локации</div>
            <div className="text-[11px] text-muted-foreground">Включить / отключить страны и города</div>
          </button>
        </div>

        <h2 className="font-display font-extrabold text-2xl flex items-center gap-2">
          <MapPin className="w-5 h-5" /> Выберите страну
        </h2>
        <p className="text-muted-foreground text-sm mt-1 mb-6">
          Сначала выберите гео, затем настраивайте товары для него
        </p>
        <div className="grid grid-cols-2 gap-3">
          {COUNTRIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => {
                if (c.cities.length === 1) {
                  setSelectedCountry(c.slug);
                  setSelectedCity(c.cities[0].slug);
                } else {
                  setSelectedCountry(c.slug);
                }
              }}
              className="bg-card rounded-3xl p-4 shadow-card active:scale-95 transition-[var(--transition-base)] text-left flex flex-col items-start gap-2"
            >
              <span className="text-4xl">{c.flag}</span>
              <span className="font-bold text-sm leading-tight">{c.name.ru}</span>
              <span className="text-[11px] text-muted-foreground">
                {products.filter((p) =>
                  c.cities.some((ct) => p.cities?.includes(ct.slug))
                ).length}{" "}
                товаров
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // City picker (when country has multiple cities)
  if (activeCountry && !selectedCity) {
    return (
      <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry(null)}
            className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-base flex-1 text-center">
            {activeCountry.flag} {activeCountry.shortName?.ru ?? activeCountry.name.ru}
          </h1>
          <span className="w-10" />
        </header>
        <h2 className="font-display font-extrabold text-2xl">Выберите город</h2>
        <div className="space-y-2 mt-6">
          {activeCountry.cities.map((city) => (
            <button
              key={city.slug}
              onClick={() => setSelectedCity(city.slug)}
              className="w-full bg-card rounded-2xl p-4 shadow-card active:scale-[0.98] flex items-center justify-between"
            >
              <span className="font-bold">{city.name.ru}</span>
              <span className="text-xs text-muted-foreground">
                {products.filter((p) => p.cities?.includes(city.slug)).length} товаров
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Filter to products available in the active city
  const visibleProducts = activeCity
    ? products.filter((p) => p.cities?.includes(activeCity.slug))
    : products;

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background pb-10">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur px-5 pt-5 pb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => {
            // Back to city picker (if country has multiple cities) or country picker
            if (activeCountry && activeCountry.cities.length > 1) setSelectedCity(null);
            else {
              setSelectedCity(null);
              setSelectedCountry(null);
            }
          }}
          className="w-9 h-9 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95 shrink-0"
          aria-label="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h1 className="font-display font-bold text-sm truncate">{t("admin.title")}</h1>
          <div className="text-[11px] text-muted-foreground truncate">
            {activeCountry?.flag} {activeCity?.name.ru}
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm("Reset to samples?")) reset();
          }}
          className="w-9 h-9 rounded-2xl bg-card shadow-card flex items-center justify-center text-muted-foreground active:scale-95 shrink-0"
          aria-label="reset"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </header>

      <Tabs defaultValue="products" className="px-5">
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="products" className="flex-1 min-w-[80px]">{t("admin.products")}</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1 min-w-[80px]">{t("admin.categories")}</TabsTrigger>
        </TabsList>

        <DepositsTab />
        <AnalyticsTab />
        <BroadcastTab />

        <TabsContent value="products" className="space-y-3 mt-4">
          <Button
            onClick={() => {
              const p = blankProduct();
              if (activeCity) p.cities = [activeCity.slug];
              if (!p.category && categories[0]?.slug) p.category = categories[0].slug;
              setEditingP(p);
            }}
            className="w-full gradient-primary"
          >
            <Plus className="w-4 h-4 mr-1" /> {t("admin.add")}
          </Button>

          {activeCity?.districts && activeCity.districts.length > 0 && (
            <div className="bg-card rounded-2xl p-3 shadow-card space-y-3">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Районы города
              </div>
              {activeCity.districts.map((d) => {
                const items = visibleProducts.filter((p) => {
                  if (p.districts?.includes(d.slug)) return true;
                  return (p.variants ?? []).some((v) => {
                    if (v.districts?.includes(d.slug)) return true;
                    return (v.stashes ?? []).some((stash) => stash.districtSlug === d.slug);
                  });
                });
                return (
                  <div key={d.slug} className="border-t pt-2 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">{d.name.ru}</div>
                      <span className="text-[11px] text-muted-foreground">
                        {items.length} товаров
                      </span>
                    </div>
                    {items.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {items.map((p) => (
                          <span
                            key={p.id}
                            className="text-[11px] bg-muted rounded-full px-2 py-0.5"
                          >
                            {p.emoji} {loc(p.name, "ru")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {visibleProducts.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {t("admin.noProducts")}
            </div>
          ) : (
            visibleProducts.map((p) => (
              <div key={p.id} className="bg-card rounded-2xl p-3 flex items-center gap-3 shadow-card">
                <div
                  className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${!p.imageUrl ? p.gradient : ""}`}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">{p.emoji}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-1">
                    {p.featured && <span title="Pick of the day">⭐</span>}
                    {loc(p.name, "ru") || "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {loc(categories.find((c) => c.slug === p.category)?.name, "ru") || p.category}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {p.cities?.length ? p.cities.join(", ") : "all cities"}
                  </div>
                </div>
                <button
                  onClick={() => upsertProduct({ ...p, featured: !p.featured })}
                  className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 text-base ${p.featured ? "gradient-primary text-primary-foreground shadow-glow" : "bg-background text-muted-foreground"}`}
                  aria-label="Pick of the day"
                  title="Подборка дня"
                >
                  ★
                </button>
                <button
                  onClick={() => setEditingP(p)}
                  className="w-8 h-8 rounded-full bg-background flex items-center justify-center active:scale-90"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${loc(p.name, "ru")}"?`)) deleteProduct(p.id);
                  }}
                  className="w-8 h-8 rounded-full bg-background flex items-center justify-center active:scale-90"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-3 mt-4">
          <Button onClick={() => setEditingC(blankCategory())} className="w-full gradient-primary">
            <Plus className="w-4 h-4 mr-1" /> {t("admin.add")}
          </Button>

          {categories.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {t("admin.noCategories")}
            </div>
          ) : (
            categories.map((c) => (
              <div key={c.slug} className="bg-card rounded-2xl p-3 flex items-center gap-3 shadow-card">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.gradient}`}>
                  <span className="text-xl">{c.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{loc(c.name, "ru")}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.slug}</div>
                </div>
                <button
                  onClick={() => setEditingC(c)}
                  className="w-8 h-8 rounded-full bg-background flex items-center justify-center active:scale-90"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${loc(c.name, "ru")}"?`)) deleteCategory(c.slug);
                  }}
                  className="w-8 h-8 rounded-full bg-background flex items-center justify-center active:scale-90"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Product editor */}
      <Dialog open={!!editingP} onOpenChange={(o) => !o && setEditingP(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{loc(editingP?.name, "ru") ? t("admin.edit") : t("admin.add")}</DialogTitle>
          </DialogHeader>
          {editingP && (
            <div className="space-y-3">
              <div>
                <Label>{t("admin.image")}</Label>
                <div className="flex items-center gap-3 mt-1">
                  <div
                    className={`w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden ${!editingP.imageUrl ? editingP.gradient : ""}`}
                  >
                    {editingP.imageUrl ? (
                      <img src={editingP.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{editingP.emoji}</span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (!file) return;
                      const url = await fileToDataUrl(file);
                      setCropSrc(url);
                    }}
                    className="text-xs"
                  />
                  {editingP.imageUrl && (
                    <>
                      <button
                        onClick={() => setCropSrc(editingP.imageUrl!)}
                        className="text-xs text-primary"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setEditingP({ ...editingP, imageUrl: undefined })}
                        className="text-xs text-destructive"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{t("admin.imageHint")}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("admin.emoji")}</Label>
                  <Input
                    value={editingP.emoji}
                    onChange={(e) => setEditingP({ ...editingP, emoji: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("admin.gradient")}</Label>
                  <Select
                    value={editingP.gradient}
                    onValueChange={(v) => setEditingP({ ...editingP, gradient: v })}
                  >
                    <SelectTrigger>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-md shrink-0 ${editingP.gradient}`} />
                        <span className="truncate">{editingP.gradient}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {GRADIENTS.map((g) => (
                        <SelectItem key={g} value={g}>
                          <span className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md ${g}`} />
                            {g}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t("admin.name")} (RU)</Label>
                <Input
                  value={getLang(editingP.name, "ru")}
                  onChange={(e) =>
                    setEditingP({ ...editingP, name: setLang(editingP.name, "ru", e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>{t("admin.name")} (EN)</Label>
                <Input
                  value={getLang(editingP.name, "en")}
                  onChange={(e) =>
                    setEditingP({ ...editingP, name: setLang(editingP.name, "en", e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>{t("admin.description")} (RU)</Label>
                <Textarea
                  value={getLang(editingP.description, "ru")}
                  onChange={(e) =>
                    setEditingP({ ...editingP, description: setLang(editingP.description, "ru", e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>{t("admin.description")} (EN)</Label>
                <Textarea
                  value={getLang(editingP.description, "en")}
                  onChange={(e) =>
                    setEditingP({ ...editingP, description: setLang(editingP.description, "en", e.target.value) })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label>{t("admin.badge")} (RU)</Label>
                    <Input
                      value={getLang(editingP.badge, "ru")}
                      onChange={(e) => {
                        const v = setLang(editingP.badge, "ru", e.target.value);
                        const empty = !getLang(v, "ru") && !getLang(v, "en");
                        setEditingP({ ...editingP, badge: empty ? undefined : v });
                      }}
                    />
                  </div>
                  <div>
                    <Label>{t("admin.badge")} (EN)</Label>
                    <Input
                      value={getLang(editingP.badge, "en")}
                      onChange={(e) => {
                        const v = setLang(editingP.badge, "en", e.target.value);
                        const empty = !getLang(v, "ru") && !getLang(v, "en");
                        setEditingP({ ...editingP, badge: empty ? undefined : v });
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>{t("admin.category")}</Label>
                <Select
                  value={editingP.category}
                  onValueChange={(v) => setEditingP({ ...editingP, category: v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.emoji} {loc(c.name, "ru")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between bg-muted rounded-xl p-3">
                <Label className="m-0">{t("admin.featured")}</Label>
                <Switch
                  checked={!!editingP.featured}
                  onCheckedChange={(v) => setEditingP({ ...editingP, featured: v })}
                />
              </div>

              <div>
                <Label>{t("admin.cities")}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {allCities.map((c) => {
                    const checked = editingP.cities?.includes(c.slug) ?? false;
                    return (
                      <label
                        key={c.slug}
                        className="flex items-center gap-2 bg-muted rounded-lg p-2 text-xs"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const set = new Set(editingP.cities ?? []);
                            if (v) set.add(c.slug);
                            else set.delete(c.slug);
                            setEditingP({ ...editingP, cities: Array.from(set) });
                          }}
                        />
                        {c.country.flag} {c.name.ru}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Per-product district picker removed — districts are chosen per variant below. */}

              {/* Variants editor (grams + price by country + districts) */}
              {(() => {
                const variants = editingP.variants ?? [];
                const updateVariants = (v: typeof variants) =>
                  setEditingP({ ...editingP, variants: v });

                const selectedCountries = COUNTRIES.filter((co) =>
                  co.cities.some((ci) => editingP.cities?.includes(ci.slug))
                );
                const selectedCitiesWithDistricts = allCities.filter(
                  (c) =>
                    editingP.cities?.includes(c.slug) &&
                    c.districts &&
                    c.districts.length > 0
                );

                const PRESETS = [1, 2, 5, 10];
                const usedGrams = new Set(variants.map((v) => v.grams));

                return (
                  <div className="border-t pt-4">
                    <Label>Варианты (фасовки)</Label>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Граммовки с ценой по странам и доступностью по районам.
                    </p>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {PRESETS.filter((g) => !usedGrams.has(g)).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            updateVariants([
                              ...variants,
                              { id: `${g}g`, grams: g, pricesByCountry: {} },
                            ])
                          }
                          className="text-xs bg-muted rounded-full px-2 py-1 active:scale-95"
                        >
                          + {g}g
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const raw = prompt("Сколько грамм?");
                          const g = Number(raw);
                          if (!g || g <= 0 || usedGrams.has(g)) return;
                          updateVariants([
                            ...variants,
                            { id: `${g}g`, grams: g, pricesByCountry: {} },
                          ]);
                        }}
                        className="text-xs bg-muted rounded-full px-2 py-1 active:scale-95"
                      >
                        + другое
                      </button>
                    </div>

                    <div className="space-y-3 mt-3">
                      {variants.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          Пока нет вариантов.
                        </div>
                      )}
                      {variants
                        .slice()
                        .sort((a, b) => a.grams - b.grams)
                        .map((variant) => (
                          <div
                            key={variant.id}
                            className="bg-muted/50 rounded-xl p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-bold text-sm">{variant.grams}g</div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateVariants(variants.filter((v) => v.id !== variant.id))
                                }
                                className="w-7 h-7 rounded-full bg-background flex items-center justify-center active:scale-90"
                                aria-label="Удалить вариант"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </button>
                            </div>

                            {selectedCountries.length === 0 ? (
                              <div className="text-[11px] text-muted-foreground">
                                Сначала выберите города выше.
                              </div>
                            ) : (
                              <div>
                                <div className="text-[11px] text-muted-foreground mb-1">
                                  Цена по странам ($)
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {selectedCountries.map((co) => (
                                    <label key={co.slug} className="flex items-center gap-2 text-xs">
                                      <span className="w-14 shrink-0">
                                        {co.flag} {co.shortName?.ru ?? co.name.ru}
                                      </span>
                                      <Input
                                        type="number"
                                        className="h-8"
                                        value={variant.pricesByCountry[co.slug] ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const next = { ...variant.pricesByCountry };
                                          if (val === "") delete next[co.slug];
                                          else next[co.slug] = Number(val) || 0;
                                          updateVariants(
                                            variants.map((v) =>
                                              v.id === variant.id
                                                ? { ...v, pricesByCountry: next }
                                                : v
                                            )
                                          );
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}

                            {selectedCitiesWithDistricts.length > 0 && (() => {
                              const stashes: VariantStash[] = variant.stashes ?? [];
                              const setStashes = (s: VariantStash[]) =>
                                updateVariants(
                                  variants.map((v) =>
                                    v.id === variant.id ? { ...v, stashes: s, districts: undefined } : v
                                  )
                                );
                              const toggleStash = (districtSlug: string, type: StashType) => {
                                const exists = stashes.some(
                                  (s) => s.districtSlug === districtSlug && s.type === type
                                );
                                if (exists) {
                                  setStashes(
                                    stashes.filter(
                                      (s) => !(s.districtSlug === districtSlug && s.type === type)
                                    )
                                  );
                                } else {
                                  setStashes([...stashes, { districtSlug, type }]);
                                }
                              };
                              return (
                                <div>
                                  <div className="text-[11px] text-muted-foreground mb-1.5">
                                    Закладки (район + тип). Пара уникальна.
                                  </div>
                                  <div className="space-y-3">
                                    {selectedCitiesWithDistricts.map((city) => (
                                      <div key={city.slug} className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1">
                                          <span>{city.country.flag}</span>
                                          <span>{city.name.ru}</span>
                                          <span className="flex-1 h-px bg-border ml-1" />
                                        </div>
                                        {city.districts!.map((d) => {
                                          const districtTypes = new Set<StashType>(
                                            stashes
                                              .filter((s) => s.districtSlug === d.slug)
                                              .map((s) => s.type)
                                          );
                                          return (
                                            <div
                                              key={d.slug}
                                              className="bg-background rounded-xl px-2.5 py-2"
                                            >
                                              <div className="flex items-center gap-1 flex-wrap">
                                                <span className="text-[11px] font-semibold mr-1">
                                                  📍 {d.name.ru}
                                                </span>
                                                {STASH_TYPES.map((t) => {
                                                  const active = districtTypes.has(t.value);
                                                  return (
                                                    <button
                                                      key={t.value}
                                                      type="button"
                                                      onClick={() => toggleStash(d.slug, t.value)}
                                                      className={`text-[10px] rounded-full px-2 py-0.5 active:scale-95 transition-colors ${
                                                        active
                                                          ? "gradient-primary text-primary-foreground"
                                                          : "bg-muted text-muted-foreground"
                                                      }`}
                                                    >
                                                      {active ? "" : "+ "}{t.emoji} {t.label.ru}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setEditingP(null)} className="flex-1">
              {t("admin.cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (!editingP) return;
                if (!editingP.category || !editingP.category.trim()) {
                  toast.error("Выберите категорию");
                  return;
                }
                try {
                  await upsertProduct(editingP);
                  setEditingP(null);
                } catch {
                  // Оставляем диалог открытым, чтобы можно было поправить поля и сохранить снова.
                }
              }}
              className="flex-1 gradient-primary"
            >
              {t("admin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category editor */}
      <Dialog open={!!editingC} onOpenChange={(o) => !o && setEditingC(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{loc(editingC?.name, "ru") ? t("admin.edit") : t("admin.add")}</DialogTitle>
          </DialogHeader>
          {editingC && (
            <div className="space-y-3">
              <div>
                <Label>{t("admin.name")} (RU)</Label>
                <Input
                  value={getLang(editingC.name, "ru")}
                  onChange={(e) =>
                    setEditingC({ ...editingC, name: setLang(editingC.name, "ru", e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>{t("admin.name")} (EN)</Label>
                <Input
                  value={getLang(editingC.name, "en")}
                  onChange={(e) =>
                    setEditingC({ ...editingC, name: setLang(editingC.name, "en", e.target.value) })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("admin.emoji")}</Label>
                  <Input
                    value={editingC.emoji}
                    onChange={(e) => setEditingC({ ...editingC, emoji: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("admin.gradient")}</Label>
                  <Select
                    value={editingC.gradient}
                    onValueChange={(v) => setEditingC({ ...editingC, gradient: v })}
                  >
                    <SelectTrigger>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-md shrink-0 ${editingC.gradient}`} />
                        <span className="truncate">{editingC.gradient}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {GRADIENTS.map((g) => (
                        <SelectItem key={g} value={g}>
                          <span className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md ${g}`} />
                            {g}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setEditingC(null)} className="flex-1">
              {t("admin.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editingC) {
                  const slugify = (s: string) =>
                    s
                      .toLowerCase()
                      .trim()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "");
                  const enName = getLang(editingC.name, "en");
                  const ruName = getLang(editingC.name, "ru");
                  const autoSlug =
                    slugify(enName) || slugify(ruName) || `cat-${Date.now().toString(36)}`;
                  const slug = editingC.slug?.startsWith("cat_") || !editingC.slug
                    ? autoSlug
                    : editingC.slug;
                  upsertCategory({ ...editingC, slug });
                  setEditingC(null);
                }
              }}
              className="flex-1 gradient-primary"
            >
              {t("admin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageCropper
        open={!!cropSrc}
        src={cropSrc}
        onCancel={() => setCropSrc(null)}
        onConfirm={(dataUrl) => {
          if (editingP) setEditingP({ ...editingP, imageUrl: dataUrl });
          setCropSrc(null);
        }}
      />
    </div>
  );
};

const DepositsTab = ({ standalone = false }: { standalone?: boolean }) => {
  const orders = useAdminPanel((s) => s.awaitingOrders);
  const historyOrders = useAdminPanel((s) => s.historyOrders);
  const confirmOrder = useAdminPanel((s) => s.confirmOrder);
  const cancelOrder = useAdminPanel((s) => s.cancelOrder);
  const messageOrder = useAdminPanel((s) => s.messageOrder);

  const awaitingOrders = orders;
  void messageOrder;

  const [confirmTarget, setConfirmTarget] = useState<OrderRecord | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [text, setText] = useState<string>("");

  const onPhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const datas = await Promise.all(
      arr.map(
        (file) =>
          new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = rej;
            r.readAsDataURL(file);
          })
      )
    );
    setPhotos((prev) => [...prev, ...datas].slice(0, 10));
  };

  const submitConfirm = () => {
    if (!confirmTarget) return;
    confirmOrder(confirmTarget.id, { photos: photos.length ? photos : undefined, text: text || undefined });
    setConfirmTarget(null);
    setPhotos([]);
    setText("");
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}, ${hh}:${mi}`;
  };

  /** Объединяем одинаковые позиции (товар+вариант+район+закладка+isGift) в одну строку. */
  const mergeItems = (items: OrderRecord["items"]) => {
    const map = new Map<string, (typeof items)[number]>();
    for (const l of items ?? []) {
      if (!l) continue;
      const isGift = (l as { isGift?: boolean }).isGift === true;
      const productId = (l as any).product?.id ?? (l as any).productId ?? "";
      const key = `${productId}::${l.variantId ?? ""}::${l.districtSlug ?? ""}::${l.stashType ?? ""}::${isGift ? "g" : ""}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, qty: existing.qty + l.qty });
      } else {
        map.set(key, { ...l });
      }
    }
    return Array.from(map.values());
  };

  const statusLabel: Record<string, string> = {
    pending: "Создана",
    awaiting: "Ждёт подтверждения",
    confirmed: "Подтверждена",
    cancelled: "Отменена",
  };
  const statusClass: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    awaiting: "bg-primary/15 text-primary",
    confirmed: "bg-emerald-500/15 text-emerald-600",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const content = (
    <div className="space-y-3 mt-4">
      {/* === Заявки на оплату ЗАКАЗА (товары) === */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Заказы — ждут подтверждения ({awaitingOrders.length})
        </div>
        {awaitingOrders.length === 0 ? (
          <div className="bg-card rounded-2xl p-4 text-center text-sm text-muted-foreground shadow-card">
            Нет новых заказов
          </div>
        ) : (
          <div className="space-y-3">
            {awaitingOrders.map((o) => {
              const safeItems = Array.isArray(o.items) ? o.items : [];
              const realItems = mergeItems(safeItems.filter((l) => l && (l as { isGift?: boolean }).isGift !== true));
              return (
                <div key={o.id} className="bg-card rounded-2xl p-3 shadow-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display font-bold text-lg">
                        ${o.totalUSD}{o.crypto ? <span className="text-sm text-muted-foreground font-normal"> · {o.crypto}</span> : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {o.customerUsername ? `@${o.customerUsername}` : (o.customerTgId ? `TG ${o.customerTgId}` : "Гость")} · {fmt(o.createdAt)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${statusClass.awaiting}`}>
                      {statusLabel.awaiting}
                    </span>
                  </div>

                  {/* Состав заказа */}
                  <div className="space-y-1.5 bg-background rounded-xl p-2.5">
                    {realItems.map((l, idx) => {
                      const product = (l as any).product ?? {};
                      const productName = resolveOrderItemName(product.name) || resolveOrderItemName((l as any).productName) || "—";
                      const productEmoji = product.emoji ?? "📦";
                      const districtName = l.districtSlug
                        ? findDistrict(l.districtSlug)?.name.ru ?? l.districtSlug
                        : null;
                      const stashMeta = l.stashType
                        ? STASH_TYPES.find((t) => t.value === l.stashType)
                        : null;
                      return (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold flex items-center justify-between gap-2">
                            <span className="truncate">
                              {productEmoji} {productName}
                              {l.variantId && (
                                <span className="text-muted-foreground font-normal"> · {l.variantId}</span>
                              )}
                            </span>
                            <span className="shrink-0 font-bold">× {l.qty}</span>
                          </div>
                          {/* Если доставка — не показываем район/закладку */}
                          {!o.delivery && (districtName || stashMeta) && (
                            <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                              {districtName && (
                                <span className="inline-flex items-center gap-0.5 bg-muted rounded-full px-1.5 py-0.5">
                                  <MapPin className="w-2.5 h-2.5" /> {districtName}
                                </span>
                              )}
                              {stashMeta && (
                                <span className="inline-flex items-center gap-0.5 bg-muted rounded-full px-1.5 py-0.5">
                                  {stashMeta.emoji} {stashMeta.label.ru}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {o.delivery && (
                    <div className="rounded-xl bg-primary/5 border border-primary/20 px-2.5 py-2 text-[11px] flex items-start gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-bold text-primary">Доставка курьером</div>
                        {o.deliveryAddress && (
                          <div className="text-foreground/80 whitespace-pre-wrap">{o.deliveryAddress}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Информация об оплате (крипта + адрес) */}
                  {o.crypto && (
                    <div className="rounded-xl bg-background px-2.5 py-2 text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Оплата</span>
                        <span className="font-bold">{o.crypto} · ${o.totalUSD}</span>
                      </div>
                      {o.payAddress && (
                        <div className="font-mono break-all text-foreground/70">{o.payAddress}</div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmTarget(o); setPhotos([]); setText(""); }}
                      className="flex-1 gradient-primary text-primary-foreground font-bold py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Check className="w-4 h-4 shrink-0" /> <span>Подтвердить</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Отклонить заказ?")) cancelOrder(o.id);
                      }}
                      className="flex-1 bg-background border border-border font-bold py-2 px-2 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 text-destructive"
                    >
                      <X className="w-4 h-4 shrink-0" /> <span>Отклонить</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === История заказов === */}
      {(() => {
        const statusLabel: Record<string, string> = {
          paid: "Подтверждён",
          in_delivery: "В доставке",
          completed: "Подтверждён",
          cancelled: "Отменён",
          confirmed: "Подтверждён",
        };
        const statusClassMap: Record<string, string> = {
          paid: "bg-emerald-500/15 text-emerald-600",
          in_delivery: "bg-amber-500/15 text-amber-600",
          completed: "bg-emerald-500/15 text-emerald-600",
          cancelled: "bg-destructive/10 text-destructive",
          confirmed: "bg-emerald-500/15 text-emerald-600",
        };
        return (
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 mt-4">
              История ({historyOrders.length})
            </div>
            {historyOrders.length === 0 ? (
              <div className="bg-card rounded-2xl p-4 text-center text-sm text-muted-foreground shadow-card">
                Пусто
              </div>
            ) : (
              <div className={`space-y-2 ${historyOrders.length > 10 ? "max-h-[640px] overflow-y-auto pr-1 -mr-1" : ""}`}>
                {historyOrders.map((it) => (
                  <div key={`order-${it.id}`} className="bg-card rounded-2xl p-3 shadow-card flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1.5">
                        <span>${it.totalUSD}{it.crypto ? ` · ${it.crypto}` : ""}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {adminCustomerLabel(it)} · {fmt(it.createdAt)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${statusClassMap[it.status] ?? "bg-muted text-muted-foreground"}`}>
                      {statusLabel[it.status] ?? it.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {/* === Модалка подтверждения заказа: фото + текст === */}
      <Dialog open={!!confirmTarget} onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Подтвердить заказ</DialogTitle>
          </DialogHeader>
          {confirmTarget && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {adminCustomerLabel(confirmTarget)} · ${confirmTarget.totalUSD}
              </div>

              <div>
                <Label className="text-xs">
                  {confirmTarget.delivery ? "Фото для клиента (опционально)" : "Фото закладки"}
                </Label>
                <div className="mt-1.5 rounded-xl border border-dashed border-border p-3 space-y-2">
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((p, idx) => (
                        <div key={idx} className="relative group">
                          <img src={p} alt={`preview-${idx}`} className="w-full h-24 object-cover rounded-lg" />
                          <button
                            type="button"
                            onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs shadow-card"
                            aria-label="remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photos.length < 10 && (
                    <label className="flex flex-col items-center justify-center gap-1 py-3 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">
                        {photos.length === 0 ? "Загрузить фото (до 10)" : `Добавить ещё (${photos.length}/10)`}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { onPhoto(e.target.files); e.target.value = ""; }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs">Сообщение клиенту</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={confirmTarget.delivery
                    ? "Курьер выехал, ждите в течение 40–60 мин."
                    : "Координаты, описание места, ориентиры..."}
                  rows={4}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Отмена
            </Button>
            <Button onClick={submitConfirm} className="gradient-primary">
              <Check className="w-4 h-4 mr-1" /> Отправить клиенту
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (standalone) return content;

  return <TabsContent value="deposits" className="space-y-3 mt-4">{content}</TabsContent>;
};

export default AdminPage;

interface LocationsAdminProps { onBack: () => void }

const LocationsAdmin = ({ onBack }: LocationsAdminProps) => {
  const disabled = useLocationToggles((s) => s.disabled);
  const setDisabled = useLocationToggles((s) => s.setDisabled);
  const promoRules = useLocationPromos((s) => s.rules);
  const setPromoRule = useLocationPromos((s) => s.setRule);
  const isDisabled = (slug: string) => disabled.includes(slug);
  const updatePromo = (slug: string, patch: Partial<LocationPromoRule>) =>
    setPromoRule(slug, { ...resolvePromoRule(promoRules, slug), ...patch });
  const promoInputs = (slug: string) => {
    const promo = resolvePromoRule(promoRules, slug);
    return (
      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="text-[11px] text-muted-foreground">
          5g → подарок
          <Input
            type="number"
            min={0}
            value={promo.giftFor5}
            onChange={(e) => updatePromo(slug, { giftFor5: Number(e.target.value) })}
            className="mt-1 h-9 rounded-xl bg-background"
          />
        </label>
        <label className="text-[11px] text-muted-foreground">
          10g → подарок
          <Input
            type="number"
            min={0}
            value={promo.giftFor10 ?? promo.giftFor5}
            onChange={(e) => updatePromo(slug, { giftFor10: Number(e.target.value) })}
            className="mt-1 h-9 rounded-xl bg-background"
          />
        </label>
      </div>
    );
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background px-5 pt-6 pb-10">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-base flex-1 text-center">Локации</h1>
        <span className="w-10" />
      </header>

      <p className="text-muted-foreground text-sm mb-4">
        Отключённые локации показываются в каталоге тусклыми и недоступны для выбора.
      </p>

      <div className="bg-card rounded-2xl shadow-card p-4 mb-4 space-y-2">
        <div className="font-bold text-sm">Акция по умолчанию</div>
        <div className="text-xs text-muted-foreground">
          Для всех локаций: 5g → +5g. Для ОАЭ: 5g → +2g, 10g → +5g.
        </div>
      </div>

      <div className="space-y-4">
        {COUNTRIES.map((country) => {
          const countryOff = isDisabled(country.slug);
          return (
            <div key={country.slug} className="bg-card rounded-2xl shadow-card overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-3xl">{country.flag}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{country.name.ru}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {countryOff ? "Страна отключена" : `${country.cities.length} городов`}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={!countryOff}
                  onCheckedChange={(checked) => setDisabled(country.slug, !checked)}
                />
              </div>
              <div className="px-4 pb-4">{promoInputs(country.slug)}</div>

              {!countryOff && country.cities.length > 0 && (
                <div className="border-t divide-y">
                  {country.cities.map((city) => {
                    const cityOff = isDisabled(city.slug);
                    return (
                      <div key={city.slug} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm">{city.name.ru}</div>
                          <Switch
                            checked={!cityOff}
                            onCheckedChange={(checked) => setDisabled(city.slug, !checked)}
                          />
                        </div>
                        {promoInputs(city.slug)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
