# pockerPlan

Онлайн-приложение для покер-планирования спринтов. Анонимные комнаты по ссылке, круглый стол, скрытое голосование, reveal хостом, история раундов, real-time через Socket.IO.

## Стек

Next.js 15 + React 19 + TypeScript · Socket.IO · Node 20 · Vitest + Playwright.

## Локально

```bash
npm install
npm run dev              # http://localhost:3000
npm run typecheck
npm test                 # unit + integration
npm run test:e2e         # Playwright happy path
```

## Prod-сборка

```bash
npm run build
npm start                # долгоживущий Node + Socket.IO на :3000
```

## Деплой

Приложение держит комнаты **in-memory** и требует **долгоживущий WebSocket** — serverless/edge (Vercel, Netlify Functions) не подходит. Нужен один Node-процесс.

### Fly.io (рекомендую)

```bash
fly launch --copy-config --no-deploy    # использует существующий fly.toml
fly deploy
```

`fly.toml` уже сконфигурирован: 256 МБ / 1 shared CPU, регион `fra`, `auto_stop_machines`.

### Railway

Подключить репо → Railway автоматически поднимет `Dockerfile`. Задать переменную `PORT` (Railway обычно инжектит сам).

### Render

Создать Web Service, указать `Dockerfile`, порт `3000`. Free plan засыпает через ~15 мин неактивности — комнаты обнуляются, но для MVP ок.

## Известные ограничения

- Один инстанс: горизонтальное масштабирование потребует Redis-адаптер Socket.IO + вынос `RoomStore` в Redis.
- Комнаты живут до 2ч бездействия, потом чистятся TTL-свипером.
- Реконнект = новый участник (никнейм из `localStorage` авто-подставится, но `socket.id` будет новым).
