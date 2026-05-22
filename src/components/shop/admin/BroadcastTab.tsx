import { useMemo, useState } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Send, Image as ImageIcon, X, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { haptic } from "@/lib/telegram";
import { useAdminPanel } from "@/store/adminPanel";
import { Admin } from "@/lib/api";

type Segment = "all" | "active" | "inactive";

const SEGMENT_LABELS: Record<Segment, string> = {
  all: "Все юзеры",
  active: "Только с заказами",
  inactive: "Без заказов",
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export const BroadcastTab = () => {
  const analytics = useAdminPanel((s) => s.analytics);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [btnText, setBtnText] = useState("");
  const [btnUrl, setBtnUrl] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [sending, setSending] = useState(false);

  const recipients = useMemo(() => {
    const users = analytics.totals.users;
    const ordersFraction = 0.49;
    switch (segment) {
      case "active":
        return Math.round(users * ordersFraction);
      case "inactive":
        return Math.round(users * (1 - ordersFraction));
      default:
        return users;
    }
  }, [analytics, segment]);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await fileToDataUrl(f);
    setImage(url);
  };

  const send = async () => {
    if (!text.trim()) {
      toast.error("Добавьте текст сообщения");
      return;
    }
    if (btnText.trim() && !btnUrl.trim()) {
      toast.error("У кнопки должна быть ссылка");
      return;
    }
    haptic("medium");
    setSending(true);
    try {
      const { logId, queued } = await Admin.broadcast({
        segment,
        text,
        image,
        button: btnText.trim() ? { text: btnText.trim(), url: btnUrl.trim() } : null,
      });
      toast.info(`Рассылка запущена · получателей: ${queued.toLocaleString("ru")}`);

      // Поллим статус — рассылка идёт в фоне на бэке
      const started = Date.now();
      const maxMs = 30 * 60 * 1000; // 30 минут
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 3000));
        let status;
        try {
          status = await Admin.broadcastStatus(logId);
        } catch (e) {
          if (Date.now() - started > maxMs) throw e;
          continue;
        }
        if (status.status === "completed") {
          haptic("success");
          toast.success(
            `Готово · отправлено ${status.sent.toLocaleString("ru")} из ${status.total.toLocaleString("ru")}, ошибок ${status.failed.toLocaleString("ru")}`
          );
          break;
        }
        if (status.status === "failed") {
          haptic("error");
          toast.error(`Рассылка прервана: ${status.error ?? "неизвестная ошибка"}`);
          break;
        }
        if (Date.now() - started > maxMs) {
          toast.warning(`Рассылка ещё идёт · отправлено ${status.sent}/${status.total}. Проверьте позже.`);
          break;
        }
      }

      setText("");
      setImage(null);
      setBtnText("");
      setBtnUrl("");
    } catch (e) {
      haptic("error");
      toast.error(`Не удалось отправить: ${e instanceof Error ? e.message : "ошибка сети"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <TabsContent value="broadcast" className="space-y-4 mt-4">

      <div className="bg-card rounded-2xl shadow-card p-4 space-y-3">
        <div>
          <Label>Сегмент</Label>
          <Select value={segment} onValueChange={(v) => setSegment(v as Segment)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SEGMENT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-[11px] text-muted-foreground mt-1.5">
            Получит сообщение: <b className="text-foreground">{recipients.toLocaleString("ru")}</b>
          </div>
        </div>

        <div>
          <Label>Текст сообщения</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Привет! У нас новинки 🔥..."
            rows={5}
            className="mt-1 resize-none"
          />
          <div className="text-[10px] text-muted-foreground text-right mt-0.5">
            {text.length} / 4096
          </div>
        </div>

        <div>
          <Label>Картинка (опционально)</Label>
          {image ? (
            <div className="mt-1 relative rounded-xl overflow-hidden">
              <img src={image} alt="" className="w-full max-h-48 object-cover" />
              <button
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/90 backdrop-blur flex items-center justify-center active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="mt-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-6 cursor-pointer text-muted-foreground text-sm active:scale-[0.99]">
              <ImageIcon className="w-4 h-4" />
              Загрузить картинку
              <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <Label className="text-xs h-4 flex items-center">Текст кнопки</Label>
            <Input
              value={btnText}
              onChange={(e) => setBtnText(e.target.value)}
              placeholder="Открыть магазин"
              className="mt-1 w-full"
            />
          </div>
          <div className="min-w-0">
            <Label className="text-xs h-4 flex items-center gap-1">
              <LinkIcon className="w-3 h-3" /> URL
            </Label>
            <Input
              value={btnUrl}
              onChange={(e) => setBtnUrl(e.target.value)}
              placeholder="https://t.me/..."
              className="mt-1 w-full"
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      {(text || image || btnText) && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2 px-1">
            Превью
          </div>
          <div className="bg-card rounded-2xl shadow-card overflow-hidden">
            {image && <img src={image} alt="" className="w-full max-h-56 object-cover" />}
            {text && (
              <div className="px-4 py-3 text-sm whitespace-pre-wrap">{text}</div>
            )}
            {btnText && (
              <div className="px-3 pb-3">
                <div className="w-full bg-primary/10 text-primary font-semibold rounded-xl py-2 text-center text-sm">
                  {btnText}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Button
        onClick={send}
        disabled={sending || !text.trim()}
        className="w-full gradient-primary h-12 text-base"
      >
        <Send className="w-4 h-4 mr-2" />
        {sending ? "Рассылаю..." : `Разослать · ${recipients.toLocaleString("ru")}`}
      </Button>
    </TabsContent>
  );
};
