import { useEffect } from "react";
import { ChevronLeft, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsTab } from "@/components/shop/admin/AnalyticsTab";
import { useAdminPanel } from "@/store/adminPanel";

interface ModeratorPageProps {
  onExit?: () => void;
}

const ModeratorPage = ({ onExit }: ModeratorPageProps) => {
  const refreshAnalytics = useAdminPanel((s) => s.refreshAnalytics);

  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  return (
    <div className="min-h-screen w-full max-w-4xl mx-auto bg-background px-5 sm:px-10 pt-6 pb-10">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onExit?.()}
          className="w-10 h-10 rounded-2xl bg-card shadow-card flex items-center justify-center active:scale-95"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-extrabold text-2xl flex-1 text-center">Аналитика</h1>
        <button
          onClick={() => onExit?.()}
          className="flex items-center gap-1 text-xs text-muted-foreground active:scale-95"
          aria-label="Shop"
          title="В магазин"
        >
          <Eye className="w-4 h-4" />
        </button>
      </header>
      <Tabs defaultValue="analytics">
        <TabsList className="sr-only">
          <TabsTrigger value="analytics">analytics</TabsTrigger>
        </TabsList>
        <AnalyticsTab readOnly />
      </Tabs>
    </div>
  );
};

export default ModeratorPage;
