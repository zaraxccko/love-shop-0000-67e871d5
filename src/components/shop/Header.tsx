import { ShoppingBag, MapPin, Shield, User as UserIcon } from "lucide-react";
import { useCart } from "@/store/cart";
import { haptic } from "@/lib/telegram";
import { useI18n, useT } from "@/lib/i18n";
import { useLocation } from "@/store/location";
import { findCity } from "@/data/locations";
import logo from "@/assets/logo.webp";

interface HeaderProps {
  onCartClick: () => void;
  onLocationClick: () => void;
  showAdminButton?: boolean;
  onAdminClick?: () => void;
  onAccountClick?: () => void;
}

export const Header = ({ onCartClick, onLocationClick, showAdminButton, onAdminClick, onAccountClick }: HeaderProps) => {
  const totalQty = useCart((s) => s.totalQty());
  const t = useT();
  const lang = useI18n((s) => s.lang) ?? "ru";
  const city = useLocation((s) => s.city);
  const found = city ? findCity(city) : null;

  return (
    <header className="sticky top-0 z-30 px-5 pt-5 pb-3 bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={logo}
            alt="Love Shop"
            width={44}
            height={44}
            loading="eager"
            decoding="async"
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority="high"
            className="w-11 h-11 rounded-2xl object-cover shadow-soft shrink-0 select-none"
          />
          <div className="min-w-0">
            <div className="font-display font-bold text-lg leading-none truncate">Love Shop</div>
            <button
              onClick={() => {
                haptic("light");
                onLocationClick();
              }}
              className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 active:scale-95"
            >
              <MapPin className="w-3 h-3 text-primary" />
              {found ? (
                <>
                  <span className="font-semibold text-foreground">
                    {found.country.flag} {found.city.name[lang]}
                  </span>
                  <span>· {t("header.openTill")}</span>
                </>
              ) : (
                <span>{t("loc.pickCountry")}</span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showAdminButton && (
            <button
              onClick={() => {
                haptic("light");
                onAdminClick?.();
              }}
              className="h-11 px-3 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95 transition-[var(--transition-base)]"
              aria-label="Admin panel"
              title="Admin"
            >
              <Shield className="w-5 h-5 text-primary" />
            </button>
          )}
          {onAccountClick && (
            <button
              onClick={() => { haptic("light"); onAccountClick(); }}
              className="w-11 h-11 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95 transition-[var(--transition-base)]"
              aria-label="Account"
            >
              <UserIcon className="w-5 h-5 text-foreground" />
            </button>
          )}
          <button
            data-cart-target
            onClick={() => {
              haptic("light");
              onCartClick();
            }}
            className="relative w-11 h-11 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95 transition-[var(--transition-base)]"
            aria-label="Cart"
          >
            <ShoppingBag key={totalQty} className={`w-5 h-5 text-foreground ${totalQty > 0 ? "animate-cart-shake" : ""}`} />
            {totalQty > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 gradient-primary text-primary-foreground text-[11px] font-bold rounded-full flex items-center justify-center shadow-glow animate-pop">
                {totalQty}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
