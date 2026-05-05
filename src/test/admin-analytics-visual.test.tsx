import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { AnalyticsTab } from "@/components/shop/admin/AnalyticsTab";
import { useAdminPanel } from "@/store/adminPanel";

vi.mock("@/lib/api", () => ({
  Admin: {
    users: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    banUser: vi.fn(),
  },
}));

describe("admin analytics visual layout", () => {
  it("renders the updated KPI set and activation chart title", () => {
    useAdminPanel.setState({
      analytics: {
        totals: {
          users: 33,
          activations: 33,
          dau: 5,
          wau: 5,
          mau: 5,
          gmvUSD: 120,
          ordersToday: 2,
          avgCheckUSD: 120,
          purchasesCount: 1,
          purchasesUSD: 120,
        },
        funnel: { starts: 33, captchaPassed: 33, miniAppOpened: 33, firstOrder: 2, firstPurchase: 1 },
        depositsFunnel: { created: 0, paid: 0, confirmed: 0 },
        activations7d: Array.from({ length: 7 }, (_, i) => ({ date: `05-0${i + 1}`, value: i + 1 })),
        dau7d: Array.from({ length: 7 }, (_, i) => ({ date: `05-0${i + 1}`, value: i })),
        topProducts: [],
        sources: [],
      },
    });

    const { container } = render(
      <Tabs defaultValue="analytics">
        <AnalyticsTab />
      </Tabs>
    );

    expect(screen.getByText("Активаций")).toBeInTheDocument();
    expect(screen.getByText("Активных за день")).toBeInTheDocument();
    expect(screen.getByText("Активных за месяц")).toBeInTheDocument();
    expect(screen.getByText("Активации (7д)")).toBeInTheDocument();
    expect(container.querySelector(".gap-4")).toBeTruthy();
    expect(container.innerHTML).toContain("rounded-[1.45rem]");
  });
});