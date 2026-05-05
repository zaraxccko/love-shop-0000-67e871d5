export type OrderNotificationUser = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type OrderNotificationOrder = {
  id: string;
  userTgId: bigint | number | string;
  totalUSD: number;
  crypto?: string | null;
  items: unknown;
  delivery?: boolean;
  deliveryAddress?: string | null;
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function tgMention(tgId: bigint | number | string, user?: OrderNotificationUser | null): string {
  if (user?.username) return `@${escapeHtml(user.username)}`;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || `tg:${tgId}`;
  return `<a href="tg://user?id=${tgId}">${escapeHtml(name)}</a>`;
}

export function orderItemsSummary(items: unknown): { count: number; lines: string } {
  const arr = Array.isArray(items) ? items : [];
  const lines = arr.slice(0, 20).map((it: any) => {
    const nameRaw = it?.productName ?? it?.product?.name ?? it?.name ?? it?.productId ?? "Товар";
    const name = typeof nameRaw === "string" ? nameRaw : nameRaw?.ru ?? nameRaw?.en ?? "Товар";
    const variant = it?.variantId || it?.product?.weight || "";
    const qty = Math.max(1, Number(it?.qty ?? 1) || 1);
    return `• ${escapeHtml(String(name))}${variant ? ` (${escapeHtml(String(variant))})` : ""} ×${qty}`;
  }).join("\n");
  return { count: arr.reduce((sum: number, it: any) => sum + Math.max(1, Number(it?.qty ?? 1) || 1), 0), lines };
}

export function buildNewOrderNotification(order: OrderNotificationOrder, user?: OrderNotificationUser | null, promoLine = ""): string {
  const who = tgMention(order.userTgId, user);
  const { count, lines } = orderItemsSummary(order.items);
  const cryptoLine = order.crypto ? ` (${escapeHtml(order.crypto)})` : "";
  return (
    `🛒 <b>Новая заявка на заказ</b> #${order.id}\n` +
    `👤 ${who}\n` +
    `💰 $${order.totalUSD.toFixed(2)}${cryptoLine}\n` +
    `📦 позиций: ${count}` +
    (lines ? `\n${lines}` : "") +
    (order.delivery ? `\n🚚 доставка: ${escapeHtml(order.deliveryAddress ?? "—")}` : "") +
    promoLine
  );
}

export function buildProfitNotification(order: OrderNotificationOrder, user?: OrderNotificationUser | null): string {
  const who = tgMention(order.userTgId, user);
  const { count, lines } = orderItemsSummary(order.items);
  return (
    `💸 <b>Новый профит</b> #${order.id}\n` +
    `👤 ${who}\n` +
    `💰 $${order.totalUSD.toFixed(2)}${order.crypto ? ` (${escapeHtml(order.crypto)})` : ""}\n` +
    `📦 позиций: ${count}` +
    (lines ? `\n${lines}` : "")
  );
}

export function buildCancelNotification(order: OrderNotificationOrder, user?: OrderNotificationUser | null): string {
  const who = tgMention(order.userTgId, user);
  const { count, lines } = orderItemsSummary(order.items);
  return (
    `🚫 <b>Не оплачено/отмена</b> #${order.id}\n` +
    `👤 ${who}\n` +
    `💰 $${order.totalUSD.toFixed(2)}${order.crypto ? ` (${escapeHtml(order.crypto)})` : ""}\n` +
    `📦 позиций: ${count}` +
    (lines ? `\n${lines}` : "")
  );
}