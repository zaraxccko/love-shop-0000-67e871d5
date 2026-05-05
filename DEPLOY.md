# 🚀 Deploy prxvt.ink — quick start

Полный production-стек: Postgres + API (Fastify) + Frontend (Vite/SPA) + Caddy (HTTPS).

## 1. Подготовка VPS

- Открой порты **80** и **443** в фаерволе.
- DNS A-записи `prxvt.ink` и `www.prxvt.ink` → IP сервера.
- Установлен Docker + Docker Compose v2.

## 2. Настройка переменных

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Открой и отредактируй:

**`.env` (root)** — для фронта и прокси:
- `APP_DOMAINS=your-domain.com, www.your-domain.com`
- `VITE_API_URL=https://your-domain.com/api`
- `VITE_ADMIN_IDS=твой_telegram_id`
- `POSTGRES_PASSWORD=сильный_пароль`

**`backend/.env`** — для API:
- `DATABASE_URL=postgresql://appuser:<тот же пароль>@postgres:5432/shopdb?schema=public`
- `JWT_SECRET=` → сгенерируй: `openssl rand -hex 32`
- `TELEGRAM_BOT_TOKEN=` от @BotFather
- `ADMIN_TG_IDS=` тот же ID, что в `VITE_ADMIN_IDS`
- `OTSTUK_CHAT_ID=` ID чата отстука, куда должны падать заявки/профиты/отмены
- `WEBAPP_URL=https://your-domain.com`
- `CORS_ORIGIN=https://your-domain.com`
- `PUBLIC_UPLOAD_URL=https://your-domain.com/uploads`

## 3. Запуск

```bash
docker compose up --build -d
docker compose logs -f
```

Caddy автоматически выпустит SSL-сертификат Let's Encrypt при первом запросе к домену.

## 4. Проверка

- https://prxvt.ink — фронт
- https://prxvt.ink/api/health → `{"ok":true}`

## 5. Обновление

```bash
git pull
docker compose up --build -d
```

> ⚠️ Если меняешь `VITE_*` переменные — нужен пересбор фронта (`--build`), они вкомпилированы в bundle.

## Архитектура контейнеров

```
[ Internet ] → :443 proxy(Caddy) → frontend:80 (SPA static)
                                 ↘ api:3000 (/api/*, /uploads/*)
                                                ↘ postgres:5432
```
