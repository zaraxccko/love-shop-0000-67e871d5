import TelegramBot from "node-telegram-bot-api";
import PQueue from "p-queue";
import { env } from "./env.js";
import { prisma } from "./db.js";

export const bot = new TelegramBot(env.telegramBotToken, { polling: true });

// Telegram global limit: ~30 msg/sec across all chats. Keep some headroom.
const queue = new PQueue({ concurrency: 1, intervalCap: 25, interval: 1000 });
const SEND_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function telegramCode(err: any) {
  return err?.response?.body?.error_code ?? err?.code;
}

function telegramDescription(err: any) {
  return String(err?.response?.body?.description ?? err?.message ?? "");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isParseModeError(err: any) {
  return telegramCode(err) === 400 && /parse entities|can't parse|unsupported start tag/i.test(telegramDescription(err));
}

function isRecoverablePhotoError(err: any) {
  const desc = telegramDescription(err);
  return telegramCode(err) === 400 && /http url|file identifier|failed to get|wrong file|image|caption/i.test(desc);
}

function isReplyMarkupError(err: any) {
  return telegramCode(err) === 400 && /button|reply markup|inline keyboard|url/i.test(telegramDescription(err));
}

interface SendOpts {
  chatId: number | string;
  text: string;
  imageUrl?: string;
  button?: { text: string; url: string } | null;
}

async function sendOne({ chatId, text, imageUrl, button }: SendOpts): Promise<void> {
  const getReplyMarkup = (includeButton: boolean) =>
    includeButton && button ? { inline_keyboard: [[{ text: button.text, url: button.url }]] } : undefined;

  const sendText = async (parseHtml: boolean, includeButton: boolean) => {
    await withTimeout(
      bot.sendMessage(chatId, text, {
        ...(parseHtml ? { parse_mode: "HTML" as const } : {}),
        reply_markup: getReplyMarkup(includeButton),
        disable_web_page_preview: false,
      }),
      SEND_TIMEOUT_MS,
      `sendMessage chatId=${chatId}`
    );
  };

  const sendTextWithFallback = async (includeButton = Boolean(button)): Promise<void> => {
    try {
      await sendText(true, includeButton);
    } catch (err) {
      if (isParseModeError(err)) return sendText(false, includeButton);
      if (includeButton && isReplyMarkupError(err)) {
        console.warn(`[broadcast] button skipped chatId=${chatId}: ${telegramDescription(err)}`);
        return sendTextWithFallback(false);
      }
      throw err;
    }
  };

  const sendPhoto = async (parseHtml: boolean, includeButton: boolean) => {
    if (!imageUrl) return;
    await withTimeout(
      bot.sendPhoto(chatId, imageUrl, {
        caption: text,
        ...(parseHtml ? { parse_mode: "HTML" as const } : {}),
        reply_markup: getReplyMarkup(includeButton),
      }),
      SEND_TIMEOUT_MS,
      `sendPhoto chatId=${chatId}`
    );
  };

  const sendPhotoWithFallback = async (includeButton = Boolean(button)): Promise<void> => {
    try {
      await sendPhoto(true, includeButton);
    } catch (err) {
      if (isParseModeError(err)) return sendPhoto(false, includeButton);
      if (includeButton && isReplyMarkupError(err)) {
        console.warn(`[broadcast] button skipped chatId=${chatId}: ${telegramDescription(err)}`);
        return sendPhotoWithFallback(false);
      }
      throw err;
    }
  };

  let attempt = 0;
  while (attempt < 5) {
    try {
      if (imageUrl) {
        try {
          await sendPhotoWithFallback();
        } catch (err) {
          if (isRecoverablePhotoError(err)) {
            console.warn(`[broadcast] photo skipped chatId=${chatId}: ${telegramDescription(err)}`);
            await sendTextWithFallback();
          } else {
            throw err;
          }
        }
      } else {
        await sendTextWithFallback();
      }
      return;
    } catch (err: any) {
      const code = telegramCode(err);
      const retryAfter = err?.response?.body?.parameters?.retry_after;
      // 429 — flood control
      if (code === 429 && retryAfter) {
        await sleep((retryAfter + 1) * 1000);
        attempt++;
        continue;
      }
      // 403 (blocked) / 400 (chat not found) — пропускаем без ретрая
      if (code === 403 || code === 400) throw err;
      // прочие ошибки — экспоненциальная задержка
      await sleep(1000 * 2 ** attempt);
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
  onProgress?: (stats: { sent: number; failed: number; processed: number; total: number }) => void | Promise<void>;
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  let processed = 0;
  const total = opts.recipients.length;
  await Promise.all(
    opts.recipients.map((chatId) =>
      queue.add(async () => {
        try {
          await sendOne({ chatId, text: opts.text, imageUrl: opts.imageUrl, button: opts.button });
          sent++;
        } catch (err: any) {
          const code = err?.response?.body?.error_code ?? err?.code;
          const desc = err?.response?.body?.description ?? err?.message;
          console.warn(`[broadcast] failed chatId=${chatId}: ${code} — ${desc}`);
          failed++;
        } finally {
          processed++;
          try {
            await opts.onProgress?.({ sent, failed, processed, total });
          } catch (err: any) {
            console.warn(`[broadcast] progress update failed: ${err?.message ?? err}`);
          }
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
          await withTimeout(
            bot.sendMessage(Number(id), text, { parse_mode: "HTML" }),
            SEND_TIMEOUT_MS,
            `notifyAdmin chatId=${id}`
          );
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
      `🇹🇭 Таиланд · 🇮🇩 Бали · 🇻🇳 Вьетнам · 🇲🇾 КЛ · 🇦🇪 ОАЭ\n` +
      `\n` +
      `<b>Что внутри:</b>\n` +
      `• Только лучшие сорта и чистые кристаллы\n` +
      `• Качественная упаковка кладов\n` +
      `• Доставка в течении 40-60 минут на заказы от 3 гр (уточнять у оператора)\n` +
      `• Оплата в крипте: наша безопасность — ваша конфиденциальность\n` +
      `• Первый заказ — 15% 🎟 <code>SUMMER10</code> 🎟\n` +
      `• Оператор: @angeI_x\n` +
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
    `🇹🇭 Thailand · 🇮🇩 Bali · 🇻🇳 Vietnam · 🇲🇾 KL · 🇦🇪 UAE\n` +
    `\n` +
    `<b>What's inside:</b>\n` +
    `• Only the best varieties and pure crystals\n` +
    `• Quality packaging of stashes\n` +
    `• Delivery within 40-60 minutes for orders from 3g (check with operator)\n` +
    `• Payment in crypto: our safety — your confidentiality\n` +
    `• First order — 15% off 🎟 <code>SUMMER10</code> 🎟\n` +
    `• Operator: @angeI_x\n` +
    `\n` +
    `<b>🧊 Make your trip unforgettable 🧊</b>`
  );
}

function welcomeKeyboard(lang: WelcomeLang) {
  const cta = "🛍 Shop Now 🛍";
  const webappUrl = `${env.webappUrl}${env.webappUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  // вторая строка — переключатель языка (активный отмечен •)
  const ruLabel = lang === "ru" ? "• Русский" : "Русский";
  const enLabel = lang === "en" ? "• English" : "English";
  return {
    inline_keyboard: [
      [{ text: cta, web_app: { url: webappUrl } }],
      [
        { text: ruLabel, callback_data: "welcome:lang:ru" },
        { text: enLabel, callback_data: "welcome:lang:en" },
      ],
    ],
  };
}

type TelegramFrom = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

async function rememberTelegramUser(from?: TelegramFrom): Promise<void> {
  if (!from?.id || from.is_bot) return;

  const tgId = BigInt(from.id);
  await prisma.user.upsert({
    where: { tgId },
    create: {
      tgId,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      lang: from.language_code === "en" ? "en" : "ru",
      isAdmin: env.adminTgIds.some((id) => id === tgId),
    },
    update: {
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      lang: from.language_code === "en" ? "en" : "ru",
      isAdmin: env.adminTgIds.some((id) => id === tgId),
    },
  });
}

bot.on("message", (msg) => {
  rememberTelegramUser(msg.from).catch((err) => {
    console.warn(`[bot] failed to remember user ${msg.from?.id ?? "unknown"}: ${err?.message ?? err}`);
  });
});

bot.onText(/\/start/, async (msg) => {
  try {
    await rememberTelegramUser(msg.from);
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
    await rememberTelegramUser(q.from);
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
