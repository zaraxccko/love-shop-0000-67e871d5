import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCancelNotification,
  buildNewOrderNotification,
  buildProfitNotification,
} from "../../backend/src/orderNotifications";

const order = {
  id: "cmot123",
  userTgId: 8044243116n,
  totalUSD: 150,
  crypto: "USDT",
  items: [
    { productName: "Gelato", variantId: "1g", qty: 2 },
    { productName: { ru: "Печенье", en: "Cookie" }, qty: 1 },
  ],
};

describe("order notification regressions", () => {
  it("formats new order / profit / cancel messages for the otstuk chat", () => {
    const user = { username: "oxescrow", firstName: "Ox" };

    expect(buildNewOrderNotification(order, user)).toContain("🛒 <b>Новая заявка на заказ</b> #cmot123");
    expect(buildNewOrderNotification(order, user)).toContain("👤 @oxescrow");
    expect(buildNewOrderNotification(order, user)).toContain("📦 позиций: 3\n• Gelato (1g) ×2\n• Печенье ×1");

    expect(buildProfitNotification(order, user)).toContain("💸 <b>Новый профит</b> #cmot123");
    expect(buildCancelNotification(order, user)).toContain("🚫 <b>Не оплачено/отмена</b> #cmot123");
  });

  it("uses clickable tg mention when username is absent", () => {
    expect(buildCancelNotification(order, { firstName: "Ivan" })).toContain(
      '👤 <a href="tg://user?id=8044243116">Ivan</a>'
    );
  });

  it("keeps order status decisions in user DM, but admin order logs only in otstuk helper", () => {
    const adminRoutes = readFileSync(resolve(process.cwd(), "backend/src/routes/admin.ts"), "utf8");
    expect(adminRoutes).not.toMatch(/notifyAdmins\(/);
    expect(adminRoutes).toMatch(/bot\.send(?:Message|Photo|MediaGroup)\(Number\(order\.userTgId\)/);
    expect(adminRoutes).toMatch(/notifyOrdersChat\(buildProfitNotification/);
    expect(adminRoutes).toMatch(/notifyOrdersChat\(buildCancelNotification/);
  });
});