# LoveShop Backend

Node.js + Fastify + Prisma + PostgreSQL backend for the LoveShop Telegram WebApp.
Telegram bot (long-polling) runs in the same process and handles broadcasts +
admin notifications.

## Что внутри

- **API** на Fastify (`/api/*`)
- **PostgreSQL** через Prisma ORM
- **Telegram bot** в том же процессе (рассылка, нотификации админу, /start с кнопкой WebApp)
- **HMAC-валидация** Telegram `initData` — подделать `tg_id` нельзя
- **JWT** (30 дней) на сессию
- **Загрузка фото-закладок** через multipart, отдача через nginx

---

## 🚀 Быстрый старт (Docker)

### 1. Подготовь VPS (Ubuntu 22.04)

```bash
# Docker + compose
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin nginx certbot python3-certbot-nginx
```

### 2. Залей бэк на сервер

```bash
mkdir -p /srv/loveshop && cd /srv/loveshop
# скопируй сюда содержимое папки backend/
```

### 3. Заполни `.env`

```bash
cp .env.example .env
nano .env
```

Обязательно:
- `DATABASE_URL` — оставь как есть, Postgres поднимается рядом в compose
- `JWT_SECRET` — `openssl rand -hex 32`
- `TELEGRAM_BOT_TOKEN` — от @BotFather
- `ADMIN_TG_IDS` — твой Telegram ID (через запятую если несколько)
- `OTSTUK_CHAT_ID` — ID чата отстука для заявок, профитов и отмен
- `WEBAPP_URL` — `https://your-domain.com` (где будет фронт)
- `CORS_ORIGIN` — `https://your-domain.com`
- `PUBLIC_UPLOAD_URL` — `https://your-domain.com/uploads`

### 4. Подними контейнеры

```bash
docker compose up -d --build
docker compose logs -f api  # посмотри что стартанул
```

Миграции прогоняются автоматически в CMD.

### 5. Фронт (Vite)

На том же VPS, в любой папке:

```bash
git clone <твой-фронт-репо> /tmp/front
cd /tmp/front
cat > .env.production <<EOF
VITE_API_URL=https://your-domain.com/api
EOF
npm ci && npm run build
mkdir -p /var/www/shop
cp -r dist/* /var/www/shop/
```

### 6. Nginx + SSL

```bash
cp nginx.conf.example /etc/nginx/sites-available/shop
sed -i 's/your-domain.com/REAL-DOMAIN.com/g' /etc/nginx/sites-available/shop
ln -s /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d REAL-DOMAIN.com
```

### 7. Бот в @BotFather

```
/setmenubutton → выбери своего бота → URL: https://your-domain.com → Title: 🛒 Магазин
```

Готово. Юзеры жмут кнопку → открывается твой фронт в Telegram WebView.

---

## 🛠 Локальная разработка

```bash
# Postgres локально
docker run -d --name shopdb -p 5432:5432 \
  -e POSTGRES_USER=appuser -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=shopdb \
  postgres:16-alpine

cp .env.example .env
# исправь DATABASE_URL=postgresql://appuser:changeme@localhost:5432/shopdb?schema=public

npm install
npm run prisma:migrate:dev   # создаст таблицы
npm run dev
```

---

## 📡 REST API

Все запросы фронта идут с заголовком `Authorization: Bearer <jwt>`,
полученным из `POST /api/auth/telegram`.

### Auth
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/telegram` | `{ initData }` → `{ token, user }` |
| GET  | `/api/me` | Текущий профиль + баланс |

### Каталог
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/catalog?city=slug` | Все товары |
| GET | `/api/categories` | Список категорий |

### Депозиты (юзер)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/deposits` | `{ amountUSD, crypto }` → создать заявку |
| POST | `/api/deposits/:id/paid` | Юзер отметил «оплатил» |
| POST | `/api/deposits/:id/cancel` | Юзер отменил |
| GET  | `/api/deposits/me` | Мои депозиты |

### Заказы (юзер)
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/orders` | Оформить, спишет с баланса в транзакции |
| GET  | `/api/orders/me` | Мои заказы |

### Админка (только `ADMIN_TG_IDS`)
| Метод | Путь | Описание |
|-------|------|----------|
| GET  | `/api/admin/awaiting` | Заявки ждущие подтверждения |
| GET  | `/api/admin/history?limit=&offset=` | История |
| POST | `/api/admin/deposits/:id/confirm` | Подтвердить пополнение → баланс +N |
| POST | `/api/admin/deposits/:id/cancel` | Отклонить |
| POST | `/api/admin/orders/:id/confirm` | multipart: `photo` (file), `text` |
| POST | `/api/admin/orders/:id/cancel` | Возвращает баланс |
| POST | `/api/admin/products` | Создать товар |
| PUT  | `/api/admin/products/:id` | Обновить |
| DELETE | `/api/admin/products/:id` | Удалить |
| GET  | `/api/admin/analytics` | KPI |
| POST | `/api/broadcast` | `{ segment, text, image, button }` — рассылка |

---

## 🔒 Безопасность

- `initData` валидируется по HMAC-SHA256 с `BOT_TOKEN` — клиент не может подделать `tg_id`.
- Срок жизни `initData` — 24ч. Старше → отклоняется.
- `is_admin` определяется ТОЛЬКО по `ADMIN_TG_IDS`, не по полю в БД.
- Адреса криптокошельков захардкожены на бэке (`src/routes/deposits.ts → CRYPTO_ADDRESSES`),
  чтобы клиент не подсунул свой.
- Списание баланса в `prisma.$transaction` — atomic.
- Telegram rate-limit (~25 msg/sec) обрабатывается через `p-queue` + ретраи на `429`.

---

## 🔄 Обновление

```bash
cd /srv/loveshop
git pull   # или загрузи новые файлы
docker compose up -d --build
```

Миграции применяются автоматически в CMD контейнера.

---

## 💾 Бэкап БД

```bash
# в crontab -e
0 3 * * * docker exec loveshop-postgres-1 pg_dump -U appuser shopdb | gzip > /srv/backups/shop_$(date +\%F).sql.gz
```

---

## ⚠️ Важно для админки

Админка работает **только** при реальной серверной авторизации через Telegram WebApp.
Одного `VITE_ADMIN_IDS` на фронте недостаточно: CRUD-операции всё равно проверяются
на бэкенде по `ADMIN_TG_IDS`.

Если кнопка админки есть, но сохранение/удаление не работает — проверь, что:
- пользователь открыл Mini App именно из Telegram;
- `ADMIN_TG_IDS` в `backend/.env` содержит его Telegram ID;
- после изменения `.env` контейнер `api` был пересобран и перезапущен.
