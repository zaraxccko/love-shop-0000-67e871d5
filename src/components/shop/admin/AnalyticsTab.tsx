import { useEffect, useState } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { TrendingUp, Users, ShoppingBag, DollarSign, Activity, ChevronDown, Ban, ShieldCheck } from "lucide-react";
import { useAdminPanel } from "@/store/adminPanel";
import { Admin, type AdminUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/telegram";
import { toast } from "@/hooks/use-toast";

const KPI = ({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="bg-card rounded-2xl shadow-card p-3">
    <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wide font-semibold">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
    <div className="font-display font-extrabold text-xl mt-1">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);

const Sparkline = ({
  data,
  color = "hsl(var(--primary))",
  unit = "",
}: {
  data: { date: string; value: number }[];
  color?: string;
  unit?: string;
}) => {
  const w = 280;
  const h = 60;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = w / Math.max(data.length - 1, 1);
  const coords = data.map((d, i) => ({
    x: i * step,
    y: h - (d.value / max) * (h - 6) - 3,
    ...d,
  }));
  const points = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  const active = hover !== null ? coords[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    let nearest = 0;
    let best = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-16 touch-none"
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          onMove({ clientX: t.clientX, currentTarget: e.currentTarget } as unknown as React.MouseEvent<SVGSVGElement>);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          onMove({ clientX: t.clientX, currentTarget: e.currentTarget } as unknown as React.MouseEvent<SVGSVGElement>);
        }}
        onTouchEnd={() => setHover(null)}
      >
        <polygon points={area} fill={color} opacity={0.12} />
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {active && (
          <>
            <line x1={active.x} y1={0} x2={active.x} y2={h} stroke={color} strokeWidth={1} opacity={0.3} vectorEffect="non-scaling-stroke" />
            <circle cx={active.x} cy={active.y} r={4} fill="hsl(var(--background))" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {active && (
        <div
          className="absolute -top-1 -translate-x-1/2 -translate-y-full bg-foreground text-background text-[11px] font-bold px-2 py-1 rounded-lg shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: `${(active.x / w) * 100}%` }}
        >
          {unit}{active.value.toLocaleString("ru")}
        </div>
      )}
    </div>
  );
};

const FunnelRow = ({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground">
          {value.toLocaleString("ru")} <span className="opacity-60">· {pct}%</span>
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full gradient-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const UserRow = ({ user, onToggleBan, readOnly }: { user: AdminUser; onToggleBan: (u: AdminUser) => void; readOnly?: boolean }) => {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
  const date = new Date(user.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const banned = !!user.isBanned;
  return (
    <div className={`flex items-center gap-3 py-2 px-1 border-b border-border/50 last:border-0 ${banned ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {banned && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
              <Ban className="w-3 h-3" /> Бан
            </span>
          )}
        </div>
        {user.username ? (
          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const handle = `@${user.username}`;
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(handle);
                } else {
                  const ta = document.createElement("textarea");
                  ta.value = handle;
                  ta.style.position = "fixed";
                  ta.style.opacity = "0";
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                }
                haptic("success");
                toast({ description: `Скопировано: ${handle}` });
              } catch {
                toast({ description: "Не удалось скопировать", variant: "destructive" });
              }
            }}
            className="text-xs text-primary flex items-center gap-0.5 hover:underline cursor-pointer"
          >
            @{user.username}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">ID: {user.tgId}</span>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-muted-foreground">{date}</div>
        {user.ordersCount > 0 && (
          <div className="text-[10px] text-primary font-semibold">{user.ordersCount} заказ(ов)</div>
        )}
      </div>
      {!readOnly && (
        <Button
          variant={banned ? "outline" : "ghost"}
          size="sm"
          className={`shrink-0 h-8 px-2 ${banned ? "" : "text-destructive hover:text-destructive"}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleBan(user);
          }}
          title={banned ? "Разблокировать" : "Заблокировать"}
        >
          {banned ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
        </Button>
      )}
    </div>
  );
};

export const AnalyticsTab = ({ readOnly = false }: { readOnly?: boolean } = {}) => {
  const a = useAdminPanel((s) => s.analytics);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  const loadUsers = async (offset = 0) => {
    setLoadingUsers(true);
    try {
      const res = await Admin.users(100, offset);
      if (offset === 0) {
        setUsers(res.users);
      } else {
        setUsers((prev) => [...prev, ...res.users]);
      }
      setUsersTotal(res.total);
    } catch (e) {
      console.error("Failed to load users", e);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (showUsers && users.length === 0) {
      loadUsers();
    }
  }, [showUsers]);

  return (
    <TabsContent value="analytics" className="space-y-4 mt-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2">
        <KPI icon={Users} label="Юзеров" value={a.totals.users.toLocaleString("ru")} hint="всего" />
        <KPI icon={Activity} label="Активаций" value={a.totals.activations.toLocaleString("ru")} hint="/start всего" />
        <KPI icon={Users} label="Активных за день" value={a.totals.dau.toString()} hint="за сегодня" />
        <KPI icon={Users} label="Активных за месяц" value={a.totals.mau.toLocaleString("ru")} hint="за месяц" />
        
        <KPI icon={ShoppingBag} label="Заказов" value={a.totals.ordersToday.toString()} hint="сегодня" />
        <KPI icon={ShoppingBag} label="Покупок" value={a.totals.purchasesCount.toLocaleString("ru")} hint="подтверждено" />
        <KPI icon={DollarSign} label="Сумма покупок" value={`$${a.totals.purchasesUSD.toLocaleString("ru")}`} hint="подтверждено" />
      </div>

      {/* Sparklines */}
      <div className="bg-card rounded-2xl shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" /> Активации (7д)
          </div>
          <span className="text-xs text-muted-foreground">
            +{a.activations7d[a.activations7d.length - 1].value}
          </span>
        </div>
        <Sparkline data={a.activations7d} />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {a.activations7d.map((d) => (
            <span key={d.date}>{d.date}</span>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-card p-4 space-y-3">
        <div className="font-bold text-sm flex items-center gap-1.5">
          <Users className="w-4 h-4 text-primary" /> Активные пользователи в день (7д)
        </div>
        <Sparkline data={a.dau7d} />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {a.dau7d.map((d) => (
            <span key={d.date}>{d.date}</span>
          ))}
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-card rounded-2xl shadow-card p-4 space-y-3">
        <div className="font-bold text-sm">Воронка онбординга</div>
        <FunnelRow label="/start" value={a.funnel.starts} total={a.funnel.starts} />
        <FunnelRow label="Прошли капчу" value={a.funnel.captchaPassed} total={a.funnel.starts} />
        <FunnelRow label="Открыли Mini App" value={a.funnel.miniAppOpened} total={a.funnel.starts} />
        <FunnelRow label="Сделали 1-й заказ" value={a.funnel.firstOrder} total={a.funnel.starts} />
      </div>

      {/* Users list */}
      <div className="bg-card rounded-2xl shadow-card overflow-hidden">
        <button
          onClick={() => setShowUsers((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="font-bold text-sm flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary" /> Пользователи Mini App
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{usersTotal || a.totals.users}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showUsers ? "rotate-180" : ""}`} />
          </div>
        </button>

        {showUsers && (
          <div className="px-4 pb-4">
            {users.length === 0 && loadingUsers && (
              <div className="text-center text-sm text-muted-foreground py-4">Загрузка...</div>
            )}
            {users.map((u) => (
              <UserRow
                key={u.tgId}
                user={u}
                readOnly={readOnly}
                onToggleBan={async (target) => {
                  const next = !target.isBanned;
                  if (next && !confirm(`Заблокировать ${target.username ? "@" + target.username : target.firstName || target.tgId}?`)) return;
                  try {
                    const res = await Admin.banUser(target.tgId, next);
                    setUsers((prev) =>
                      prev.map((x) => (x.tgId === target.tgId ? { ...x, isBanned: res.isBanned } : x))
                    );
                    haptic("success");
                    toast({ description: res.isBanned ? "Пользователь заблокирован" : "Пользователь разблокирован" });
                  } catch (e) {
                    console.error("ban failed", e);
                    toast({ description: "Не удалось обновить статус", variant: "destructive" });
                  }
                }}
              />
            ))}
            {users.length < usersTotal && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-xs"
                disabled={loadingUsers}
                onClick={() => loadUsers(users.length)}
              >
                {loadingUsers ? "Загрузка..." : `Показать ещё (${usersTotal - users.length})`}
              </Button>
            )}
          </div>
        )}
      </div>

    </TabsContent>
  );
};
