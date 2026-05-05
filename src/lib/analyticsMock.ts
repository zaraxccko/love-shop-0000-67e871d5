/**
 * Моковые данные для дашборда аналитики.
 * При подключении к VPS-боту заменить на fetch('/api/stats').
 */

export interface DailyPoint {
  date: string;
  value: number;
}

export interface AnalyticsSnapshot {
  totals: {
    users: number;
    activations: number; // /start hits
    dau: number;
    wau: number;
    mau: number;
    gmvUSD: number;
    ordersToday: number;
    avgCheckUSD: number;
    purchasesCount: number;
    purchasesUSD: number;
  };
  funnel: {
    starts: number;
    captchaPassed: number;
    miniAppOpened: number;
    firstOrder: number;
    firstPurchase?: number;
  };
  depositsFunnel: {
    created: number;
    paid: number;
    confirmed: number;
  };
  activations7d: DailyPoint[];
  dau7d: DailyPoint[];
  topProducts: { name: string; orders: number; gmvUSD: number }[];
  sources: { source: string; users: number }[];
}

const day = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(5, 10); // MM-DD
};

export const MOCK_ANALYTICS: AnalyticsSnapshot = {
  totals: {
    users: 0,
    activations: 0,
    dau: 0,
    wau: 0,
    mau: 0,
    gmvUSD: 0,
    ordersToday: 0,
    avgCheckUSD: 0,
    purchasesCount: 0,
    purchasesUSD: 0,
  },
  funnel: {
    starts: 0,
    captchaPassed: 0,
    miniAppOpened: 0,
    firstOrder: 0,
  },
  depositsFunnel: {
    created: 0,
    paid: 0,
    confirmed: 0,
  },
  activations7d: [
    { date: day(6), value: 0 },
    { date: day(5), value: 0 },
    { date: day(4), value: 0 },
    { date: day(3), value: 0 },
    { date: day(2), value: 0 },
    { date: day(1), value: 0 },
    { date: day(0), value: 0 },
  ],
  dau7d: [
    { date: day(6), value: 0 },
    { date: day(5), value: 0 },
    { date: day(4), value: 0 },
    { date: day(3), value: 0 },
    { date: day(2), value: 0 },
    { date: day(1), value: 0 },
    { date: day(0), value: 0 },
  ],
  topProducts: [],
  sources: [],
};
