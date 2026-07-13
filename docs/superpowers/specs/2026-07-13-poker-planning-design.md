# Poker Planning — Design Spec

**Date:** 2026-07-13
**Status:** Approved for planning

## 1. Цель

Онлайн-приложение для покер-планирования спринтов по стори-поинтам. Команда собирается в комнате по ссылке, каждый вскрытым голосованием оценивает задачу картой из Fibonacci-колоды, хост открывает голоса, приложение показывает среднее. Референс UX — planningpokeronline.com.

## 2. Скоуп MVP

**В MVP входит:**
- Создание комнаты, вход по ссылке / коду, ввод никнейма.
- Стандартная Fibonacci-колода: `0, 1, 2, 3, 5, 8, 13, 21, ?, ☕`.
- Скрытое голосование, reveal хостом, показ среднего/min/max/консенсуса.
- Reset раунда с сохранением предыдущего в историю сессии.
- История раундов в текущей сессии + экспорт CSV.
- Круглый «стол» с участниками по окружности.

**Вне скоупа MVP:**
- Аккаунты, регистрация, OAuth.
- Кастомные колоды, роли «наблюдатель», таймер голосования.
- Название стори/тикета для раунда.
- Персистентная история (переживающая рестарт сервера).
- Интеграции с JIRA/Linear.
- Чат, эмодзи-реакции.
- Мобильная адаптация сверх базовой респонсивности.
- Аутентификация/authorization участников. Никнеймы не уникальны, реконнект = новый участник.

## 3. Технологический стек

- **Frontend:** Next.js (App Router), React, TypeScript.
- **Backend:** кастомный Node.js-сервер под Next.js + Socket.IO.
- **Общий код:** типы событий и модели данных в `lib/types.ts` — шарятся между клиентом и сервером.
- **Хранилище:** in-memory `Map<string, Room>` в Node-процессе. Без БД.
- **Тестирование:** Vitest (unit + integration), Playwright (e2e happy path).
- **Деплой:** платформа с долгоживущим Node-процессом (Railway / Fly.io / Render). Vercel не подходит — нужен долгоживущий WebSocket и in-memory state.

## 4. Архитектура

```
┌──────────────────┐         WebSocket          ┌──────────────────────┐
│  Browser (React) │ ◄────────────────────────► │  Node + Socket.IO    │
│                  │                            │                      │
│  /            —  │                            │  RoomStore (Map)     │
│    create room   │                            │  ├─ Room             │
│  /r/[code]    —  │                            │  │  ├─ participants  │
│    play view     │                            │  │  ├─ currentRound  │
└──────────────────┘                            │  │  └─ history[]     │
                                                │  └─ TTL cleanup      │
                                                └──────────────────────┘
```

Один Node-процесс на инстанс. Горизонтальное масштабирование в MVP не поддерживается — комната живёт целиком в памяти одного процесса.

## 5. Модель данных

```ts
type RoomStatus = 'voting' | 'revealed'
type CardValue  = 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21 | '?' | '☕'

interface Participant {
  id: string           // socket.id
  nickname: string
  isHost: boolean
  joinedAt: number
}

interface Vote {
  participantId: string
  value: CardValue     // hidden until reveal
}

interface Round {
  id: string           // uuid
  startedAt: number
  status: RoomStatus
  votes: Map<string, Vote>
  revealedAt?: number
  average?: number     // числовые голоса; '?' и '☕' игнорируются
  min?: number
  max?: number
  consensus?: boolean  // true, если все числовые голоса совпадают
}

interface Room {
  code: string         // 6 символов, base32 без похожих (нет 0/O/1/I/L)
  createdAt: number
  lastActivityAt: number
  hostId: string       // participant.id
  participants: Map<string, Participant>
  currentRound: Round
  history: RoundSummary[]  // укороченные для трансляции
}

interface RoundSummary {
  id: string
  finishedAt: number
  average: number | null
  min: number | null
  max: number | null
  votes: { nickname: string, value: CardValue }[]   // nickname, а не id — участник мог выйти
}

// Публичное состояние комнаты, отдаваемое при join.
// Голоса в currentRound идут БЕЗ значений, если status === 'voting'.
interface PublicRoomState {
  code: string
  hostId: string
  participants: Participant[]
  currentRound:
    | { id: string; status: 'voting';   votedParticipantIds: string[] }
    | { id: string; status: 'revealed'; votes: Vote[]; average: number|null; min: number|null; max: number|null; consensus: boolean }
  history: RoundSummary[]
}
```

## 6. State-машина раунда

```
       ┌──────────┐   host: reveal    ┌──────────┐
  ────►│  voting  │──────────────────►│ revealed │
       └──────────┘                    └────┬─────┘
            ▲                               │
            │       host: reset             │
            └───────────────────────────────┘
             (currentRound → history,
              создаётся новый Round)
```

**Правила переходов:**
- `voting → revealed`: только хост, только если в `votes` есть ≥1 запись.
- `revealed → voting`: только хост. Текущий раунд копируется в `history` как `RoundSummary`, создаётся новый пустой `Round` в статусе `voting`.
- В `voting` рассылаются только флаги «проголосовал / не проголосовал» — значения хранятся на сервере и не покидают его до `reveal`.
- Голос можно менять и убирать (шлём `null`) в статусе `voting` любое число раз.

**Передача хост-флага:** при дисконнекте хоста хост-флаг переходит участнику с наименьшим `joinedAt` среди оставшихся. Если оставшихся нет — комната остаётся в памяти до TTL-очистки (2 часа бездействия).

## 7. UI

### 7.1. Экраны

**A. `/` — Landing:**
- Кнопка `Create room` — `POST /api/rooms` → редирект на `/r/<code>`.
- Поле кода + `Join` → редирект на `/r/<code>`.

**B. `/r/[code]` — Room:**
- При первом заходе — модалка ввода никнейма. Никнейм хранится в `localStorage` глобально (один ключ `pp:nickname`), автозаполняется при следующем заходе в любую комнату; редактируется до подтверждения.
- Центральный круглый «стол», по окружности — карточки участников.
- Текущий пользователь всегда снизу.
- В центре стола — кнопки хоста и результаты раунда после reveal.
- Внизу — колода из 10 карт (выбор своего голоса).
- Свёрнутый блок «History» со списком раундов сессии и кнопкой экспорта CSV.

### 7.2. Раскладка «по кругу»

- Для N участников угол `θᵢ = (2π · i / N) − π/2` (начиная сверху, по часовой).
- Позиционирование через CSS `transform: translate(...)` на абсолютно-позиционированных `ParticipantSeat`.
- Никакого canvas — обычный DOM, чтобы клики / фокус / a11y работали.
- Свой игрок всегда занимает нижнюю позицию — остальные распределяются вокруг.
- При изменении числа участников — плавный переход через CSS transition.

### 7.3. Состояния карточки участника

- `voting` + голос не отдан: серая карточка, нет бейджа.
- `voting` + голос отдан: рубашка карты `🂠` или бейдж `voted`.
- `revealed`: лицо карты со значением, крупно.

### 7.4. Центральный стол

- `voting`: кнопка `Reveal` (только хост, disabled если 0 голосов).
- `revealed`: сводка — `avg`, `min`, `max`, бейдж `consensus` если совпало. Кнопка `New round` (только хост).

### 7.5. Структура компонентов

```
app/
  page.tsx                     # Landing
  r/[code]/page.tsx            # Room
  api/rooms/route.ts           # POST — создание комнаты
components/
  NicknameModal.tsx
  Table.tsx                    # круглый стол, раскладка по окружности
  ParticipantSeat.tsx          # 1 участник + карта (рубашка/лицо)
  TableCenter.tsx              # Reveal / New round / результаты
  Deck.tsx                     # колода снизу, выбор своего голоса
  HistoryList.tsx              # свёрнутый список + экспорт CSV
lib/
  types.ts                     # общие типы клиент+сервер
  socket-client.ts             # хук useSocket()
  room.ts                      # чистая логика RoomStore (сервер)
  csv.ts                       # форматирование истории → CSV
server/
  index.ts                     # кастомный Next.js server + Socket.IO
  handlers.ts                  # обработчики Socket.IO событий
```

## 8. Socket.IO протокол

Один namespace `/`, участники комнаты в Socket.IO-room с именем `room:<code>`.

### 8.1. Client → Server

| event | payload | ответ / эффект |
|---|---|---|
| `room:join` | `{ roomCode, nickname }` | ack: `{ ok: true, you, room: PublicRoomState }` или `{ ok: false, error }`. Broadcast `room:participant_joined`. |
| `vote:cast` | `{ value: CardValue \| null }` | Сохраняет/сбрасывает голос. Broadcast `round:vote_updated` БЕЗ значения. |
| `round:reveal` | `{}` | Только хост, только если есть голоса. Broadcast `round:revealed` со значениями. |
| `round:reset` | `{}` | Только хост, только в `revealed`. Broadcast `round:reset`. |

### 8.2. Server → Client (broadcast в `room:<code>`)

| event | payload |
|---|---|
| `room:participant_joined` | `{ participant: Participant }` |
| `room:participant_left` | `{ participantId, newHostId?: string }` |
| `round:vote_updated` | `{ participantId, hasVoted }` — без значений |
| `round:revealed` | `{ votes: Vote[], average, min, max, consensus }` |
| `round:reset` | `{ newRound: Round, history: RoundSummary[] }` |
| `room:error` | `{ code, message }` |

### 8.3. Инварианты

- Значение голоса никогда не покидает сервер до `round:reveal`. Клиент получает только `hasVoted: boolean`.
- Только хост инициирует `reveal` / `reset`. Сервер проверяет `socket.id === room.hostId` — иначе `room:error`.
- `lastActivityAt` комнаты обновляется на каждом входящем событии.
- Фоновый `setInterval` каждые 10 минут удаляет комнаты с `now - lastActivityAt > 2ч`.
- Реконнект = новый участник; никаких персональных токенов в MVP.

## 9. HTTP API

- `POST /api/rooms` → `{ code }`. Создаёт пустую комнату в `RoomStore`, возвращает код. Дальнейшая коммуникация — через WebSocket.
- `GET /r/[code]` — SSR-страница. Не читает состояние комнаты на сервере — состояние приходит через WS после подключения.

## 10. Тестирование

### 10.1. Unit (Vitest, `lib/room.ts`)

Чистая логика, без сети. Покрываем:
- `createRoom()`: уникальный код, хост-участник, пустой раунд в `voting`.
- `addParticipant` / `removeParticipant`: включая передачу хост-флага.
- `castVote`: сохранение, перезапись, отклонение в `revealed`.
- `reveal`: расчёт `average` только по числовым; отклонение без голосов; отклонение от не-хоста.
- `reset`: перенос в history, новый пустой раунд; отклонение в `voting`.
- TTL cleanup.
- `csv.ts`: форматирование `RoundSummary[]` в CSV.

### 10.2. Integration (Vitest + `socket.io-client`)

Реальный сервер на случайном порту в `beforeAll`. Проверяем контракт event↔ack↔broadcast:
- Happy path: host создаёт → 3 участника входят → все голосуют → reveal → все получают одинаковые значения.
- **Секретность:** до `reveal` содержимое всех входящих `round:vote_updated` — только `{ participantId, hasVoted }`, значений нет.
- Права: не-хост шлёт `round:reveal` → `room:error`, статус не меняется.
- Дисконнект хоста: одному из оставшихся приходит `newHostId === его id`.

### 10.3. E2E (Playwright, 1 сценарий)

Два браузерных контекста, happy path:
1. User A → Create → редирект на `/r/<code>` → вводит nickname.
2. User B → тот же URL → nickname → оба видят друг друга за столом.
3. Оба голосуют → рубашка на карточках.
4. A (host) → Reveal → у обоих видны значения + среднее.
5. A → New round → раунд в history, стол пуст.

### 10.4. Что не тестируем

- Пиксель-перфект круглого стола — покрываем smoke-тестом «участник виден», верстку смотрим глазами.
- Нагрузку и многотысячные комнаты.
- Мультипроцессное состояние (единственный Node-процесс).

## 11. Деплой и эксплуатация

- **Платформа:** Railway / Fly.io / Render — любая с поддержкой долгоживущих Node-процессов и WebSocket.
- **Health-check:** `GET /api/health` → `{ ok: true, rooms: <count> }`.
- **Логи:** structured JSON (`pino`) на stdout — платформа их собирает.
- **Ограничения (MVP):** один инстанс, sticky sessions не нужны. При горизонтальном скейле в будущем — вынести `RoomStore` в Redis (см. п. 12).

## 12. Будущие расширения (вне MVP)

- Redis-адаптер Socket.IO + `RoomStore` в Redis → горизонтальное масштабирование.
- Названия тикетов и роль «наблюдатель».
- Аккаунты, персистентная история, экспорт в JIRA.
- Кастомные колоды, таймер голосования.
- Мобильная адаптация круглого стола (сейчас цель — desktop-first).
