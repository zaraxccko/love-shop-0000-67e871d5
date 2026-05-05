# LoveShop — Telegram WebApp Shop

Полноценный магазин для Telegram WebApp: фронт на React + Vite, бэк на Node.js (Fastify) + Prisma + PostgreSQL, Telegram-бот в том же процессе. Деплой — Docker Compose на любом VPS.

---

## 📦 Что внутри

```
.
├── src/                    # Фронтенд (React + Vite + Tailwind)
├── backend/                # Бэкенд (Fastify + Prisma + Telegram bot)
│   ├── docker-compose.yml  # Postgres + API одной командой
│   ├── Dockerfile
│   ├── prisma/schema.prisma
│   ├── nginx.conf.example  # Готовый конфиг nginx
│   └── .env.example
└── .env.example            # Переменные для фронта (VITE_API_URL)
```

---

## 🚀 Быстрый старт на VPS (с нуля до прод за 15 минут)

### 0. Что нужно на сервере

- Ubuntu 22.04+ (или Debian 12)
- Свободные порты 80, 443
- Домен, направленный A-записью на IP сервера
- Telegram-бот ([@BotFather](https://t.me/BotFather)) и его токен
- Твой Telegram ID ([@userinfobot](https://t.me/userinfobot))

### 1. Установить Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Склонировать проект

```bash
git clone <твой-репо> loveshop
cd loveshop
```

### 3. Настроить бэк

```bash
cd backend
cp .env.example .env
nano .env
```

Заполни:

| Переменная | Что вписать |
|---|---|
| `DATABASE_URL` | Оставь как есть (`postgresql://appuser:changeme@postgres:5432/shopdb?schema=public`) — постгрес поднимется в docker-compose |
| `JWT_SECRET` | Сгенерируй: `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | Из @BotFather |
| `ADMIN_TG_IDS` | Твой Telegram ID (через запятую можно несколько) |
| `OTSTUK_CHAT_ID` | ID чата отстука для заявок, профитов и отмен |
| `WEBAPP_URL` | `https://твой-домен.com` |
| `CORS_ORIGIN` | `https://твой-домен.com` |
| `PUBLIC_UPLOAD_URL` | `https://твой-домен.com/uploads` |

### 4. Поднять API + БД

```bash
docker compose up -d --build
docker compose logs -f api   # убедись что миграции прошли и бот стартанул
```

API крутится на `localhost:3000`. Бот сам зарегистрирует команды и вебхук.

### 5. Собрать фронт

В корне проекта (не в backend):

```bash
cd ..
cp .env.example .env
echo "VITE_API_URL=https://твой-домен.com/api" > .env
npm ci
npm run build
```

Готовая статика лежит в `./dist`.

### 6. Настроить nginx + SSL

Скопируй и подправь готовый конфиг:

```bash
sudo cp backend/nginx.conf.example /etc/nginx/sites-available/loveshop
sudo ln -s /etc/nginx/sites-available/loveshop /etc/nginx/sites-enabled/
# в файле замени your-domain.com и пути к dist/uploads
sudo nginx -t && sudo systemctl reload nginx
```

SSL через Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d твой-домен.com
```

### 7. Подключить WebApp в боте

В @BotFather: `/mybots → твой бот → Bot Settings → Menu Button → Configure menu button` и вставь `https://твой-домен.com`.

Готово. Открывай бота в телеге, жми кнопку — магазин работает.

---

## 🔄 Обновление

```bash
cd loveshop
git pull

# обновить бэк
cd backend && docker compose up -d --build

# пересобрать фронт
cd .. && npm ci && npm run build
```

Nginx сам начнёт раздавать новый `dist/`. Бэк перезапустится со свежей миграцией.

---

## 🛠 Команды

| Что | Команда |
|---|---|
| Установить deps фронта | `npm ci` |
| Собрать прод фронт | `npm run build` (в `./dist`) |
| Дев-режим фронта | `npm run dev` |
| Поднять бэк + БД | `cd backend && docker compose up -d --build` |
| Логи API | `cd backend && docker compose logs -f api` |
| Открыть psql | `cd backend && docker compose exec postgres psql -U appuser -d shopdb` |
| Бэкап БД | `cd backend && docker compose exec postgres pg_dump -U appuser shopdb > backup.sql` |

---

## 🔐 Переменные окружения

### Фронт (`.env` в корне)

```
VITE_API_URL=https://твой-домен.com/api
```

### Бэк (`backend/.env`)

См. `backend/.env.example` — там все переменные с комментариями.

---

## 📝 Особенности

- **Авторизация** — только через Telegram WebApp (`initData` валидируется на бэке HMAC-подписью).
- **Админы** — только те, чей Telegram ID указан в `ADMIN_TG_IDS`. Никаких хардкодов в коде.
- **Источник истины** — БД. Фронт не кэширует критичные данные (товары/заказы/баланс) в `localStorage`.
- **Курсы крипты** — обновляются с CoinGecko каждые 60 сек, кэш в `sessionStorage`.
- **Уведомления админу** — бот пишет в личку при каждом новом депозите/заказе.

---

## 🐛 Траблшутинг

**Бот не отвечает** — проверь `TELEGRAM_BOT_TOKEN` и логи: `docker compose logs api | grep -i bot`.

**WebApp пишет "login failed"** — `WEBAPP_URL` в `.env` бэка должен ровно совпадать с доменом, откуда открывается фронт.

**После скачивания zip не поднимается HTTPS** — проверь, что в root `.env` задан `APP_DOMAINS=your-domain.com, www.your-domain.com` или хотя бы заполнен `WEBAPP_URL`/`VITE_API_URL`, чтобы proxy не пытался выпускать сертификат на чужой домен.

**CORS-ошибки** — добавь свой домен в `CORS_ORIGIN` (через запятую можно несколько).

**Не приходят фото подтверждений** — проверь, что nginx раздаёт `/uploads/` из той же папки, куда монтируется volume `uploads` в docker-compose.
