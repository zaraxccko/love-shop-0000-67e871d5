import { useEffect, useMemo, useState } from "react";
import { Events, type AdminEvent, type UserEventType } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";

const TYPE_META: Record<UserEventType, { emoji: string; label: string }> = {
  start: { emoji: "🚀", label: "Запустил бота" },
  lang_switch: { emoji: "🌐", label: "Сменил язык" },
  bot_blocked: { emoji: "🚫", label: "Заблокировал бота" },
  bot_unblocked: { emoji: "🔓", label: "Разблокировал бота" },
  catalog_open: { emoji: "👀", label: "Открыл каталог" },
  product_view: { emoji: "🛍", label: "Посмотрел товар" },
  cart_add: { emoji: "➕", label: "В корзину" },
  cart_remove: { emoji: "➖", label: "Из корзины" },
  cart_clear: { emoji: "🧹", label: "Очистил корзину" },
  checkout_open: { emoji: "💳", label: "К оформлению" },
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Все события" },
  ...Object.entries(TYPE_META).map(([value, meta]) => ({
    value,
    label: `${meta.emoji} ${meta.label}`,
  })),
];

const PAGE_SIZE = 100;

function describePayload(type: UserEventType, payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const p = payload as Record<string, any>;
  switch (type) {
    case "cart_add":
      return [p.name, p.grams ? `${p.grams}г` : null].filter(Boolean).join(" · ");
    case "cart_remove":
      return p.name ?? "";
    case "product_view":
      return p.name ?? "";
    case "catalog_open":
      return p.citySlug ? `город: ${p.citySlug}` : "";
    case "checkout_open":
      return [
        p.itemsCount ? `позиций: ${p.itemsCount}` : null,
        p.delivery ? "🚚 доставка" : null,
      ].filter(Boolean).join(" · ");
    case "lang_switch":
      return p.lang ? `→ ${p.lang}` : "";
    case "bot_blocked":
      return p.reason ?? "";
    default:
      return "";
  }
}

const userName = (u: AdminEvent["user"]) => {
  if (u.username) return `@${u.username}`;
  const fn = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return fn || `TG ${u.tgId}`;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function ActivityTab() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("all");
  const [tgId, setTgId] = useState<string>("");
  const [offset, setOffset] = useState(0);

  const load = async (reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const nextOffset = reset ? 0 : offset;
      const res = await Events.adminList({
        limit: PAGE_SIZE,
        offset: nextOffset,
        type: type === "all" ? undefined : type,
        tgId: tgId.trim() || undefined,
      });
      setEvents(reset ? res.events : [...events, ...res.events]);
      setTotal(res.total);
      if (reset) setOffset(PAGE_SIZE);
      else setOffset(nextOffset + PAGE_SIZE);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const hasMore = events.length < total;

  const stats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
    return m;
  }, [events]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="rounded-2xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            placeholder="Поиск по Telegram ID"
            value={tgId}
            onChange={(e) => setTgId(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="rounded-2xl"
          />
          <Button
            onClick={() => { setOffset(0); load(true); }}
            disabled={loading}
            className="gradient-primary shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground flex items-center justify-between px-1">
        <span>Всего: {total}</span>
        <span>Показано: {events.length}</span>
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 text-destructive p-3 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {events.map((e) => {
          const meta = TYPE_META[e.type] ?? { emoji: "•", label: e.type };
          const detail = describePayload(e.type, e.payload);
          return (
            <div key={e.id} className="rounded-2xl bg-card shadow-card p-3 flex gap-3">
              <div className="text-2xl shrink-0 leading-none">{meta.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold truncate">{meta.label}</div>
                  <div className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {formatTime(e.createdAt)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {userName(e.user)} · TG {e.user.tgId}
                </div>
                {detail && (
                  <div className="text-[11px] text-foreground/80 mt-1 truncate">{detail}</div>
                )}
              </div>
            </div>
          );
        })}

        {events.length === 0 && !loading && (
          <div className="rounded-2xl bg-card shadow-card p-6 text-center text-sm text-muted-foreground">
            Нет событий
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {hasMore && !loading && (
          <Button onClick={() => load(false)} variant="outline" className="w-full rounded-2xl">
            Загрузить ещё
          </Button>
        )}
      </div>
    </div>
  );
}
