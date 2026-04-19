# Прототип платформы отчётов (Report Platform)

Тестовое задание: асинхронная генерация отчётов, API, UI, `docker-compose`. Подробная архитектура и обоснования решений — в **[ARCHITECTURE.md](./ARCHITECTURE.md)** (отдельный документ по требованию задания).

## Быстрый старт

```bash
docker compose up --build
```

- UI: `http://localhost:8080`
- API: `http://localhost:3000` (health: `GET /health`)

При первом старте контейнеры **api** и **worker** выполняют `prisma migrate deploy` и (у api) сидирование демо-данных.

## Стек

| Слой | Технологии |
|------|------------|
| Backend | Node.js 20, TypeScript, Fastify, Prisma, BullMQ |
| Frontend | React, TypeScript, Vite |
| Данные / очередь | PostgreSQL 16, Redis 7 |
| Файлы | Общий Docker volume `files` (`FILES_DIR`), см. ARCHITECTURE.md |

## Тесты backend

Из каталога `backend`:

```bash
npm test
```

(разбор CSV/ODS-цепочки, санитизация имён загрузки и др.)

## PDF с кириллицей

В worker для PDF нужны шрифты в репозитории: `backend/fonts/NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` (OFL). Подробнее — в ARCHITECTURE.md.

## Сервисы compose

- **frontend** — Nginx + статика React, порт `8080`
- **api** — HTTP API, порт `3000`
- **worker** — обработка очереди отчётов
- **postgres** — метаданные запусков, демо-данные, метаданные загрузок
- **redis** — очередь BullMQ
