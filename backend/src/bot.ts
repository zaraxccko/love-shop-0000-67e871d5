import TelegramBot from "node-telegram-bot-api";
import PQueue from "p-queue";
import { env } from "./env.js";

export const bot = new TelegramBot(env.telegramBotToken, { polling: true });

// Telegram global limit: ~30 msg/sec across all chats. Keep some headroom.
const queue = new PQueue({ concurrency: 1, intervalCap: 25, interval: 1000 });

interface SendOpts {
  chatId: number | string;
  text: string;
  imageUrl?: string;
  button?: { text: string; url: string } | null;
}

async function sendOne({ chatId, text, imageUrl, button }: SendOpts): Promise<void> {
  const reply_markup = button
    ? { inline_keyboard: [[{ text: button.text, url: button.url }]] }
    : undefined;

  let attempt = 0;
  while (attempt < 5) {
    try {
      if (imageUrl) {
        await bot.sendPhoto(chatId, imageUrl, {
          caption: text,
          parse_mode: "HTML",
          reply_markup,
        });
      } else {
        await bot.sendMessage(chatId, text, {
          parse_mode: "HTML",
          reply_markup,
          disable_web_page_preview: false,
        });
      }
      return;
    } catch (err: any) {
      const code = err?.response?.body?.error_code ?? err?.code;
      const retryAfter = err?.response?.body?.parameters?.retry_after;
      // 429 — flood control
      if (code === 429 && retryAfter) {
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
        attempt++;
        continue;
      }
      // 403 (blocked) / 400 (chat not found) — пропускаем без ретрая
      if (code === 403 || code === 400) throw err;
      // прочие ошибки — экспоненциальная задержка
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      attempt++;
    }
  }
  throw new Error("send failed after retries");
}

export async function broadcast(opts: {
  recipients: number[];
  text: string;
  imageUrl?: string;
  button?: { text: string; url: string } | null;
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    opts.recipients.map((chatId) =>
      queue.add(async () => {
        try {
          await sendOne({ chatId, text: opts.text, imageUrl: opts.imageUrl, button: opts.button });
          sent++;
        } catch {
          failed++;
        }
      })
    )
  );
  return { sent, failed };
}

export async function notifyAdmins(text: string): Promise<void> {
  if (!env.adminTgIds.length) {
    console.warn("[notifyAdmins] ADMIN_TG_IDS is empty — skipping admin notification");
    return;
  }
  await Promise.all(
    env.adminTgIds.map((id) =>
      queue.add(async () => {
        try {
          await bot.sendMessage(Number(id), text, { parse_mode: "HTML" });
        } catch (err: any) {
          const code = err?.response?.body?.error_code ?? err?.code;
          const description = err?.response?.body?.description ?? err?.message;
          if (code === 403) {
            console.warn(
              `[notifyAdmins] admin ${id} has not started a chat with the bot (403). ` +
              `Ask them to open the bot and press /start.`
            );
          } else {
            console.error(`[notifyAdmins] failed to notify ${id}: ${code ?? "?"} — ${description}`);
          }
        }
      })
    )
  );
}

// ── /start — премиум-приветствие с поддержкой RU/EN ──────────────
type WelcomeLang = "ru" | "en";

function pickLang(code?: string | null): WelcomeLang {
  if (!code) return "ru";
  const c = code.toLowerCase();
  // всё, что не похоже на русский/украинский/белорусский — в EN
  if (c.startsWith("ru") || c.startsWith("uk") || c.startsWith("be")) return "ru";
  return "en";
}

function welcomeText(lang: WelcomeLang, rawName: string): string {
  const name = rawName.trim().replace(/[<>&]/g, "") || (lang === "ru" ? "друг" : "friend");

  if (lang === "ru") {
    return (
      `<b>${name}, добро пожаловать в Love Shop ❤️</b>\n` +
      `\n` +
      `Закрытое сообщество авторских сладостей в Азии 🧸\n` +
      `\n` +
      `<b>География:</b>\n` +
      `🇹🇭 Таиланд · 🇮🇩 Бали · 🇻🇳 Вьетнам · 🇲🇾 Куала-Лумпур\n` +
      `\n` +
      `<b>Что внутри:</b>\n` +
      `• Только лучшие сорта и чистые кристаллы\n` +
      `• Безопасность кладов\n` +
      `• Доставка в течении 40-60 минут на любую позицию\n` +
      `• Оплата в крипте: наша безопасность — ваша конфиденциальность\n` +
      `• Первый заказ — 15% 🎟 <code>SUMMER10</code> 🎟\n` +
      `\n` +
      `<b>🧊 Сделай свой трип незабываемым 🧊</b>`
    );
  }

  return (
    `<b>${name}, welcome to Love Shop ❤️</b>\n` +
    `\n` +
    `Private community of author sweets in Asia 🧸\n` +
    `\n` +
    `<b>Geography:</b>\n` +
    `🇹🇭 Thailand · 🇮🇩 Bali · 🇻🇳 Vietnam · 🇲🇾 Kuala Lumpur\n` +
    `\n` +
    `<b>What's inside:</b>\n` +
    `• Only the best varieties and pure crystals\n` +
    `• Safety of stashes\n` +
    `• Delivery within 40-60 minutes for any item\n` +
    `• Payment in crypto: our safety — your confidentiality\n` +
    `• First order — 15% off 🎟 <code>SUMMER10</code> 🎟\n` +
    `\n` +
    `<b>🧊 Make your trip unforgettable 🧊</b>`
  );
}

function welcomeKeyboard(lang: WelcomeLang) {
  const cta = "🛍 Shop Now 🛍";
  // вторая строка — переключатель языка (активный отмечен •)
  const ruLabel = lang === "ru" ? "• Русский" : "Русский";
  const enLabel = lang === "en" ? "• English" : "English";
  return {
    inline_keyboard: [
      [{ text: cta, web_app: { url: env.webappUrl } }],
      [
        { text: ruLabel, callback_data: "welcome:lang:ru" },
        { text: enLabel, callback_data: "welcome:lang:en" },
      ],
    ],
  };
}

bot.onText(/\/start/, async (msg) => {
  try {
    const lang = pickLang(msg.from?.language_code);
    const name = msg.from?.first_name || "";
    await bot.sendMessage(msg.chat.id, welcomeText(lang, name), {
      parse_mode: "HTML",
      reply_markup: welcomeKeyboard(lang),
    });
  } catch {}
});

// Переключение языка приветствия прямо в сообщении.
bot.on("callback_query", async (q) => {
  try {
    const data = q.data || "";
    if (!data.startsWith("welcome:lang:")) return;
    const lang: WelcomeLang = data.endsWith(":en") ? "en" : "ru";
    const chatId = q.message?.chat.id;
    const messageId = q.message?.message_id;
    if (!chatId || !messageId) return;

    const name = q.from?.first_name || "";
    await bot.editMessageText(welcomeText(lang, name), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: welcomeKeyboard(lang),
    });
    await bot.answerCallbackQuery(q.id, {
      text: lang === "ru" ? "Язык: Русский" : "Language: English",
    });
  } catch {
    try { await bot.answerCallbackQuery(q.id); } catch {}
  }
});
