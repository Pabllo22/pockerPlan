# Poker Planning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать веб-приложение для покер-планирования спринтов: анонимные комнаты по ссылке, круглый стол с участниками, скрытое голосование, reveal хостом, история раундов, real-time через WebSocket.

**Architecture:** Next.js (App Router) + кастомный Node.js-сервер с Socket.IO в одном процессе. Всё состояние — in-memory `RoomStore` (`Map<code, Room>`) с TTL-очисткой. Значения голосов никогда не покидают сервер до `round:reveal`. Круглый стол — обычный DOM с `transform: translate(...)`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, Socket.IO 4, Node 20+, Vitest, Playwright, pino.

## Global Constraints

- **Node version floor:** 20 LTS+.
- **Package manager:** npm (используем `package-lock.json`).
- **TypeScript strict:** `"strict": true` в `tsconfig.json`.
- **Единый источник типов:** типы событий и моделей — только в `lib/types.ts`, импортируются и клиентом, и сервером.
- **Секретность голосов:** значение `Vote.value` не сериализуется в любое сообщение клиенту, пока раунд в статусе `voting`. Только `hasVoted: boolean`.
- **Права:** `round:reveal` и `round:reset` разрешены только `socket.id === room.hostId`. Иначе `room:error`.
- **Fibonacci deck:** ровно `0, 1, 2, 3, 5, 8, 13, 21, '?', '☕'`. `?` и `☕` игнорируются в `average/min/max`.
- **Room code:** 6 символов из алфавита `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (без похожих `0/O/1/I/L`).
- **TTL:** комнаты живут in-memory, чистка по `now - lastActivityAt > 2h` каждые 10 минут.
- **Коммиты:** одно осмысленное изменение — один коммит. Conventional commits (`feat:`, `test:`, `chore:` и т.д.).
- **TDD:** сначала падающий тест, потом минимальная реализация, потом рефакторинг при необходимости.

---

## File Structure

```
poker-planning/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── .gitignore
├── .nvmrc
│
├── lib/
│   ├── types.ts             # общие типы (клиент+сервер)
│   ├── deck.ts              # константа DECK + isNumericCard()
│   ├── room.ts              # RoomStore + чистая логика раундов
│   ├── csv.ts               # RoundSummary[] → CSV
│   └── socket-client.ts     # useSocket() хук
│
├── server/
│   ├── index.ts             # кастомный Next.js server + Socket.IO
│   └── handlers.ts          # регистрация Socket.IO обработчиков
│
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx             # Landing (Create + Join)
│   ├── r/[code]/page.tsx    # Room
│   └── api/rooms/route.ts   # POST — создать комнату
│
├── components/
│   ├── NicknameModal.tsx
│   ├── Table.tsx
│   ├── ParticipantSeat.tsx
│   ├── TableCenter.tsx
│   ├── Deck.tsx
│   └── HistoryList.tsx
│
└── tests/
    ├── unit/
    │   ├── room.test.ts
    │   ├── csv.test.ts
    │   └── deck.test.ts
    ├── integration/
    │   └── socket.test.ts
    └── e2e/
        └── happy-path.spec.ts
```

---

## Task 1: Проектный скелет + тулинг

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `.nvmrc`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (заглушка)

**Interfaces:**
- Produces: работающий `npm run dev` (пустая главная), `npm test` (0 тестов OK), `npm run typecheck` (без ошибок).

- [ ] **Step 1: Инициализировать git и написать `.gitignore`**

```bash
cd /Users/pabllo/Documents/pockerPlane
git init
```

Создать `.gitignore`:
```
node_modules
.next
out
dist
.env*
!.env.example
playwright-report
test-results
coverage
.DS_Store
```

- [ ] **Step 2: Написать `package.json`**

```json
{
  "name": "poker-planning",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io": "^4.7.5",
    "socket.io-client": "^4.7.5",
    "pino": "^9.0.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.11.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tsx": "^4.7.0",
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "@playwright/test": "^1.44.0",
    "jsdom": "^24.0.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/jest-dom": "^6.4.0"
  }
}
```

- [ ] **Step 3: Написать `.nvmrc`**

```
20
```

- [ ] **Step 4: Написать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "playwright-report", "test-results"]
}
```

- [ ] **Step 5: Написать `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}
export default nextConfig
```

- [ ] **Step 6: Написать `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
  resolve: {
    alias: { '@': new URL('./', import.meta.url).pathname },
  },
})
```

- [ ] **Step 7: Написать `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 8: Заглушки Next.js**

Создать `app/layout.tsx`:
```tsx
import './globals.css'

export const metadata = { title: 'Poker Planning' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

Создать `app/globals.css`:
```css
:root { color-scheme: light dark }
* { box-sizing: border-box }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif }
```

Создать `app/page.tsx` (заглушка, доработаем в Task 8):
```tsx
export default function Home() {
  return <main style={{ padding: 24 }}><h1>Poker Planning</h1></main>
}
```

Создать пустой `server/index.ts` заглушкой — минимальный кастомный сервер Next.js без Socket.IO (Socket.IO подключим в Task 5):
```ts
import { createServer } from 'node:http'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)

const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()
const httpServer = createServer((req, res) => handle(req, res))
httpServer.listen(port, () => {
  console.log(`> ready on http://localhost:${port}`)
})
```

- [ ] **Step 9: Установить зависимости и проверить, что всё запускается**

Run: `npm install`
Expected: успешная установка, `package-lock.json` создан.

Run: `npm run typecheck`
Expected: без ошибок.

Run: `npm test`
Expected: `No test files found`, но exit code 0 или явное сообщение — уточнить `--passWithNoTests`. Если Vitest требует флаг, добавить его в скрипт: `"test": "vitest run --passWithNoTests"`.

Run: `npm run dev` (в фоне, тайм-аут 10с) → `curl http://localhost:3000` → должен вернуть HTML с "Poker Planning". Убить процесс.

- [ ] **Step 10: Коммит**

```bash
git add .
git commit -m "chore: scaffold Next.js + Socket.IO project"
```

---

## Task 2: Общие типы (`lib/types.ts`)

**Files:**
- Create: `lib/types.ts`

**Interfaces:**
- Produces:
  - `CardValue = 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21 | '?' | '☕'`
  - `Participant`, `Vote`, `Round`, `RoundSummary`, `Room`
  - `PublicRoomState` (discriminated union по `currentRound.status`)
  - `ClientToServerEvents`, `ServerToClientEvents` — интерфейсы Socket.IO
  - `RoomStatus = 'voting' | 'revealed'`

- [ ] **Step 1: Написать `lib/types.ts`**

```ts
export type RoomStatus = 'voting' | 'revealed'

export const NUMERIC_CARDS = [0, 1, 2, 3, 5, 8, 13, 21] as const
export const SPECIAL_CARDS = ['?', '☕'] as const
export type NumericCard = typeof NUMERIC_CARDS[number]
export type SpecialCard = typeof SPECIAL_CARDS[number]
export type CardValue = NumericCard | SpecialCard

export interface Participant {
  id: string
  nickname: string
  isHost: boolean
  joinedAt: number
}

export interface Vote {
  participantId: string
  value: CardValue
}

export interface RevealedStats {
  average: number | null
  min: number | null
  max: number | null
  consensus: boolean
}

export interface Round {
  id: string
  startedAt: number
  status: RoomStatus
  votes: Map<string, Vote>
  revealedAt?: number
  stats?: RevealedStats
}

export interface RoundSummary {
  id: string
  finishedAt: number
  stats: RevealedStats
  votes: { nickname: string; value: CardValue }[]
}

export interface Room {
  code: string
  createdAt: number
  lastActivityAt: number
  hostId: string
  participants: Map<string, Participant>
  currentRound: Round
  history: RoundSummary[]
}

export type PublicRoomState =
  | {
      code: string
      hostId: string
      participants: Participant[]
      currentRound: { id: string; status: 'voting'; votedParticipantIds: string[] }
      history: RoundSummary[]
    }
  | {
      code: string
      hostId: string
      participants: Participant[]
      currentRound: { id: string; status: 'revealed'; votes: Vote[] } & RevealedStats
      history: RoundSummary[]
    }

// ── Socket.IO event contracts ───────────────────────────────────────────────

export interface JoinAckOk {
  ok: true
  you: Participant
  room: PublicRoomState
}
export interface JoinAckErr {
  ok: false
  error: string
}

export interface ClientToServerEvents {
  'room:join': (
    payload: { roomCode: string; nickname: string },
    ack: (result: JoinAckOk | JoinAckErr) => void,
  ) => void
  'vote:cast': (payload: { value: CardValue | null }) => void
  'round:reveal': () => void
  'round:reset': () => void
}

export interface ServerToClientEvents {
  'room:participant_joined': (payload: { participant: Participant }) => void
  'room:participant_left': (payload: { participantId: string; newHostId?: string }) => void
  'round:vote_updated': (payload: { participantId: string; hasVoted: boolean }) => void
  'round:revealed': (
    payload: { votes: Vote[] } & RevealedStats,
  ) => void
  'round:reset': (payload: { newRound: PublicRoomState['currentRound']; history: RoundSummary[] }) => void
  'room:error': (payload: { code: string; message: string }) => void
}
```

- [ ] **Step 2: Проверить, что типы компилируются**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Коммит**

```bash
git add lib/types.ts
git commit -m "feat(types): shared client/server type definitions"
```

---

## Task 3: Колода (`lib/deck.ts`)

**Files:**
- Create: `lib/deck.ts`, `tests/unit/deck.test.ts`

**Interfaces:**
- Consumes: `CardValue`, `NUMERIC_CARDS`, `SPECIAL_CARDS` из `lib/types.ts`.
- Produces:
  - `DECK: readonly CardValue[]` — упорядоченная колода из 10 карт.
  - `isNumericCard(value: CardValue): value is NumericCard` — type guard.

- [ ] **Step 1: Написать падающий тест `tests/unit/deck.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { DECK, isNumericCard } from '@/lib/deck'

describe('deck', () => {
  it('содержит ровно 10 карт в фибоначчи-порядке + ? и ☕', () => {
    expect(DECK).toEqual([0, 1, 2, 3, 5, 8, 13, 21, '?', '☕'])
  })

  it('isNumericCard истинен только для чисел', () => {
    expect(isNumericCard(0)).toBe(true)
    expect(isNumericCard(21)).toBe(true)
    expect(isNumericCard('?')).toBe(false)
    expect(isNumericCard('☕')).toBe(false)
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- deck`
Expected: FAIL — `Cannot find module '@/lib/deck'`.

- [ ] **Step 3: Написать `lib/deck.ts`**

```ts
import type { CardValue, NumericCard } from './types'
import { NUMERIC_CARDS, SPECIAL_CARDS } from './types'

export const DECK: readonly CardValue[] = [...NUMERIC_CARDS, ...SPECIAL_CARDS]

export function isNumericCard(value: CardValue): value is NumericCard {
  return typeof value === 'number'
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npm test -- deck`
Expected: PASS, 2 теста.

- [ ] **Step 5: Коммит**

```bash
git add lib/deck.ts tests/unit/deck.test.ts
git commit -m "feat(deck): fibonacci deck constant and isNumericCard guard"
```

---

## Task 4: RoomStore и чистая логика (`lib/room.ts`)

**Files:**
- Create: `lib/room.ts`, `tests/unit/room.test.ts`

**Interfaces:**
- Consumes: типы из `lib/types.ts`, `isNumericCard` из `lib/deck.ts`.
- Produces (все — pure или с явным `now: number` для тестируемости):
  - `class RoomStore` — экземпляр держит `Map<code, Room>`.
    - `createRoom(hostId: string, hostNickname: string, now: number): Room`
    - `getRoom(code: string): Room | undefined`
    - `addParticipant(code: string, participantId: string, nickname: string, now: number): { room: Room, participant: Participant } | { error: string }`
    - `removeParticipant(code: string, participantId: string, now: number): { room: Room, newHostId?: string } | null` — возвращает `null` если комнаты нет; если участников не осталось, комната остаётся, чтобы TTL её убрал.
    - `castVote(code: string, participantId: string, value: CardValue | null, now: number): { room: Room } | { error: string }`
    - `revealRound(code: string, actorId: string, now: number): { room: Room } | { error: string }`
    - `resetRound(code: string, actorId: string, now: number): { room: Room } | { error: string }`
    - `cleanupStale(now: number, ttlMs: number): string[]` — возвращает список удалённых кодов.
    - `toPublic(room: Room): PublicRoomState`
    - `toSummary(round: Round, participants: Map<string, Participant>): RoundSummary`
  - `generateRoomCode(rng?: () => string): string` — 6 символов из алфавита `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.

- [ ] **Step 1: Написать первую партию падающих тестов — создание и участники**

Создать `tests/unit/room.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { RoomStore, generateRoomCode } from '@/lib/room'

const T0 = 1_700_000_000_000

describe('generateRoomCode', () => {
  it('возвращает 6 символов из безопасного алфавита', () => {
    const code = generateRoomCode()
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/)
  })
})

describe('RoomStore.createRoom', () => {
  it('создаёт комнату с хостом и пустым voting-раундом', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    expect(room.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/)
    expect(room.hostId).toBe('h1')
    expect(room.participants.size).toBe(1)
    expect(room.participants.get('h1')?.isHost).toBe(true)
    expect(room.currentRound.status).toBe('voting')
    expect(room.currentRound.votes.size).toBe(0)
    expect(room.history).toEqual([])
    expect(room.createdAt).toBe(T0)
    expect(room.lastActivityAt).toBe(T0)
  })

  it('генерирует уникальные коды', () => {
    const store = new RoomStore()
    const codes = new Set(Array.from({ length: 50 }, (_, i) => store.createRoom(`h${i}`, 'X', T0).code))
    expect(codes.size).toBe(50)
  })
})

describe('RoomStore.addParticipant', () => {
  it('добавляет гостя, обновляет lastActivityAt', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    const result = store.addParticipant(room.code, 'p2', 'Bob', T0 + 100)
    expect('room' in result).toBe(true)
    if ('room' in result) {
      expect(result.participant.nickname).toBe('Bob')
      expect(result.participant.isHost).toBe(false)
      expect(result.room.participants.size).toBe(2)
      expect(result.room.lastActivityAt).toBe(T0 + 100)
    }
  })

  it('возвращает ошибку для несуществующей комнаты', () => {
    const store = new RoomStore()
    const result = store.addParticipant('ZZZZZZ', 'p2', 'Bob', T0)
    expect('error' in result).toBe(true)
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -- room`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/room.ts` (частично — покроем всё дальше)**

Создать `lib/room.ts`:
```ts
import type {
  CardValue,
  Participant,
  PublicRoomState,
  Room,
  Round,
  RoundSummary,
  Vote,
  RevealedStats,
} from './types'
import { isNumericCard } from './deck'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function generateRoomCode(): string {
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export class RoomStore {
  private rooms = new Map<string, Room>()

  createRoom(hostId: string, hostNickname: string, now: number): Room {
    let code = generateRoomCode()
    while (this.rooms.has(code)) code = generateRoomCode()

    const host: Participant = { id: hostId, nickname: hostNickname, isHost: true, joinedAt: now }
    const round: Round = {
      id: crypto.randomUUID(),
      startedAt: now,
      status: 'voting',
      votes: new Map(),
    }
    const room: Room = {
      code,
      createdAt: now,
      lastActivityAt: now,
      hostId,
      participants: new Map([[hostId, host]]),
      currentRound: round,
      history: [],
    }
    this.rooms.set(code, room)
    return room
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  addParticipant(
    code: string,
    participantId: string,
    nickname: string,
    now: number,
  ): { room: Room; participant: Participant } | { error: string } {
    const room = this.rooms.get(code)
    if (!room) return { error: 'room_not_found' }
    const participant: Participant = {
      id: participantId,
      nickname,
      isHost: false,
      joinedAt: now,
    }
    room.participants.set(participantId, participant)
    room.lastActivityAt = now
    return { room, participant }
  }
}
```

- [ ] **Step 4: Проверить, что первый набор тестов проходит**

Run: `npm test -- room`
Expected: PASS для всех тестов из Step 1.

- [ ] **Step 5: Дописать тесты — уход участника и передача хоста**

Дописать в `tests/unit/room.test.ts`:
```ts
describe('RoomStore.removeParticipant', () => {
  it('удаляет обычного участника', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 10)
    const result = store.removeParticipant(room.code, 'p2', T0 + 20)
    expect(result?.room.participants.has('p2')).toBe(false)
    expect(result?.newHostId).toBeUndefined()
    expect(result?.room.hostId).toBe('h1')
  })

  it('передаёт хост-флаг самому раннему присоединившемуся, когда уходит хост', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 10)
    store.addParticipant(room.code, 'p3', 'Carol', T0 + 20)
    const result = store.removeParticipant(room.code, 'h1', T0 + 30)
    expect(result?.newHostId).toBe('p2')
    expect(result?.room.hostId).toBe('p2')
    expect(result?.room.participants.get('p2')?.isHost).toBe(true)
  })

  it('возвращает null для несуществующей комнаты', () => {
    const store = new RoomStore()
    expect(store.removeParticipant('ZZZZZZ', 'x', T0)).toBeNull()
  })
})
```

- [ ] **Step 6: Убедиться, что новые тесты падают**

Run: `npm test -- room`
Expected: FAIL — `removeParticipant is not a function`.

- [ ] **Step 7: Реализовать `removeParticipant`**

Добавить в класс `RoomStore`:
```ts
  removeParticipant(
    code: string,
    participantId: string,
    now: number,
  ): { room: Room; newHostId?: string } | null {
    const room = this.rooms.get(code)
    if (!room) return null
    if (!room.participants.has(participantId)) {
      return { room }
    }
    const wasHost = room.hostId === participantId
    room.participants.delete(participantId)
    room.currentRound.votes.delete(participantId)
    room.lastActivityAt = now
    if (!wasHost) return { room }
    const earliest = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]
    if (!earliest) return { room }
    earliest.isHost = true
    room.hostId = earliest.id
    return { room, newHostId: earliest.id }
  }
```

- [ ] **Step 8: Проверить**

Run: `npm test -- room`
Expected: PASS.

- [ ] **Step 9: Тесты на `castVote`**

Дописать:
```ts
describe('RoomStore.castVote', () => {
  it('сохраняет голос', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    const r = store.castVote(room.code, 'h1', 5, T0 + 10)
    expect('room' in r).toBe(true)
    if ('room' in r) {
      expect(r.room.currentRound.votes.get('h1')?.value).toBe(5)
      expect(r.room.lastActivityAt).toBe(T0 + 10)
    }
  })

  it('перезаписывает предыдущий голос', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.castVote(room.code, 'h1', 3, T0 + 1)
    store.castVote(room.code, 'h1', 8, T0 + 2)
    expect(room.currentRound.votes.get('h1')?.value).toBe(8)
  })

  it('снимает голос, если value === null', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.castVote(room.code, 'h1', 3, T0 + 1)
    store.castVote(room.code, 'h1', null, T0 + 2)
    expect(room.currentRound.votes.has('h1')).toBe(false)
  })

  it('отклоняет голос в статусе revealed', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.castVote(room.code, 'h1', 3, T0 + 1)
    store.revealRound(room.code, 'h1', T0 + 2)
    const r = store.castVote(room.code, 'h1', 5, T0 + 3)
    expect('error' in r).toBe(true)
  })

  it('отклоняет голос от нечастника', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    const r = store.castVote(room.code, 'ghost', 5, T0 + 1)
    expect('error' in r).toBe(true)
  })
})
```

- [ ] **Step 10: Убедиться, что тесты падают, затем реализовать `castVote`**

Run: `npm test -- room`
Expected: FAIL.

Добавить в `RoomStore`:
```ts
  castVote(
    code: string,
    participantId: string,
    value: CardValue | null,
    now: number,
  ): { room: Room } | { error: string } {
    const room = this.rooms.get(code)
    if (!room) return { error: 'room_not_found' }
    if (!room.participants.has(participantId)) return { error: 'not_a_participant' }
    if (room.currentRound.status !== 'voting') return { error: 'round_not_voting' }
    if (value === null) {
      room.currentRound.votes.delete(participantId)
    } else {
      room.currentRound.votes.set(participantId, { participantId, value })
    }
    room.lastActivityAt = now
    return { room }
  }
```

Run: `npm test -- room`
Expected: PASS.

- [ ] **Step 11: Тесты на `revealRound`**

Дописать:
```ts
describe('RoomStore.revealRound', () => {
  it('считает average/min/max по числовым, игнорирует ? и ☕', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 1)
    store.addParticipant(room.code, 'p3', 'Carol', T0 + 2)
    store.addParticipant(room.code, 'p4', 'Dave', T0 + 3)
    store.castVote(room.code, 'h1', 3, T0 + 4)
    store.castVote(room.code, 'p2', 8, T0 + 5)
    store.castVote(room.code, 'p3', '?', T0 + 6)
    store.castVote(room.code, 'p4', '☕', T0 + 7)
    const r = store.revealRound(room.code, 'h1', T0 + 10)
    expect('room' in r).toBe(true)
    if ('room' in r) {
      expect(r.room.currentRound.status).toBe('revealed')
      expect(r.room.currentRound.stats?.average).toBe(5.5)
      expect(r.room.currentRound.stats?.min).toBe(3)
      expect(r.room.currentRound.stats?.max).toBe(8)
      expect(r.room.currentRound.stats?.consensus).toBe(false)
    }
  })

  it('consensus=true, если все числовые голоса совпадают', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 1)
    store.castVote(room.code, 'h1', 5, T0 + 2)
    store.castVote(room.code, 'p2', 5, T0 + 3)
    const r = store.revealRound(room.code, 'h1', T0 + 4)
    if ('room' in r) expect(r.room.currentRound.stats?.consensus).toBe(true)
  })

  it('average=null, если нет числовых голосов', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.castVote(room.code, 'h1', '?', T0 + 1)
    const r = store.revealRound(room.code, 'h1', T0 + 2)
    if ('room' in r) {
      expect(r.room.currentRound.stats?.average).toBeNull()
      expect(r.room.currentRound.stats?.min).toBeNull()
      expect(r.room.currentRound.stats?.max).toBeNull()
    }
  })

  it('отклоняет reveal без голосов', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    const r = store.revealRound(room.code, 'h1', T0 + 1)
    expect('error' in r).toBe(true)
  })

  it('отклоняет reveal от не-хоста', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 1)
    store.castVote(room.code, 'p2', 5, T0 + 2)
    const r = store.revealRound(room.code, 'p2', T0 + 3)
    expect('error' in r).toBe(true)
  })

  it('отклоняет повторный reveal', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.castVote(room.code, 'h1', 5, T0 + 1)
    store.revealRound(room.code, 'h1', T0 + 2)
    const r = store.revealRound(room.code, 'h1', T0 + 3)
    expect('error' in r).toBe(true)
  })
})
```

- [ ] **Step 12: Реализовать `revealRound`**

Run: `npm test -- room`
Expected: FAIL.

Добавить в `RoomStore`:
```ts
  revealRound(code: string, actorId: string, now: number): { room: Room } | { error: string } {
    const room = this.rooms.get(code)
    if (!room) return { error: 'room_not_found' }
    if (room.hostId !== actorId) return { error: 'not_host' }
    if (room.currentRound.status !== 'voting') return { error: 'round_not_voting' }
    if (room.currentRound.votes.size === 0) return { error: 'no_votes' }
    const stats = computeStats([...room.currentRound.votes.values()])
    room.currentRound.status = 'revealed'
    room.currentRound.revealedAt = now
    room.currentRound.stats = stats
    room.lastActivityAt = now
    return { room }
  }
```

И добавить рядом хелпер:
```ts
function computeStats(votes: Vote[]): RevealedStats {
  const nums = votes.map(v => v.value).filter(isNumericCard)
  if (nums.length === 0) return { average: null, min: null, max: null, consensus: false }
  const sum = nums.reduce((a, b) => a + b, 0)
  const average = Math.round((sum / nums.length) * 10) / 10
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const consensus = nums.every(n => n === nums[0])
  return { average, min, max, consensus }
}
```

Run: `npm test -- room`
Expected: PASS.

- [ ] **Step 13: Тесты на `resetRound`**

Дописать:
```ts
describe('RoomStore.resetRound', () => {
  it('переносит раунд в history и создаёт новый пустой voting-раунд', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 1)
    store.castVote(room.code, 'h1', 5, T0 + 2)
    store.castVote(room.code, 'p2', 8, T0 + 3)
    store.revealRound(room.code, 'h1', T0 + 4)
    const oldRoundId = room.currentRound.id
    const r = store.resetRound(room.code, 'h1', T0 + 5)
    expect('room' in r).toBe(true)
    if ('room' in r) {
      expect(r.room.currentRound.status).toBe('voting')
      expect(r.room.currentRound.votes.size).toBe(0)
      expect(r.room.currentRound.id).not.toBe(oldRoundId)
      expect(r.room.history).toHaveLength(1)
      expect(r.room.history[0].id).toBe(oldRoundId)
      expect(r.room.history[0].votes).toHaveLength(2)
    }
  })

  it('отклоняет reset в voting', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    const r = store.resetRound(room.code, 'h1', T0 + 1)
    expect('error' in r).toBe(true)
  })

  it('отклоняет reset от не-хоста', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 1)
    store.castVote(room.code, 'h1', 5, T0 + 2)
    store.revealRound(room.code, 'h1', T0 + 3)
    const r = store.resetRound(room.code, 'p2', T0 + 4)
    expect('error' in r).toBe(true)
  })
})
```

- [ ] **Step 14: Реализовать `resetRound` + `toSummary`**

Добавить в `RoomStore`:
```ts
  resetRound(code: string, actorId: string, now: number): { room: Room } | { error: string } {
    const room = this.rooms.get(code)
    if (!room) return { error: 'room_not_found' }
    if (room.hostId !== actorId) return { error: 'not_host' }
    if (room.currentRound.status !== 'revealed') return { error: 'round_not_revealed' }
    room.history.push(this.toSummary(room.currentRound, room.participants))
    room.currentRound = {
      id: crypto.randomUUID(),
      startedAt: now,
      status: 'voting',
      votes: new Map(),
    }
    room.lastActivityAt = now
    return { room }
  }

  toSummary(round: Round, participants: Map<string, Participant>): RoundSummary {
    return {
      id: round.id,
      finishedAt: round.revealedAt ?? round.startedAt,
      stats: round.stats ?? { average: null, min: null, max: null, consensus: false },
      votes: [...round.votes.values()].map(v => ({
        nickname: participants.get(v.participantId)?.nickname ?? '(gone)',
        value: v.value,
      })),
    }
  }
```

Run: `npm test -- room`
Expected: PASS.

- [ ] **Step 15: Тест на TTL cleanup**

Дописать:
```ts
describe('RoomStore.cleanupStale', () => {
  it('удаляет комнаты, у которых lastActivityAt старше TTL', () => {
    const store = new RoomStore()
    const stale = store.createRoom('h1', 'Alice', T0)
    const fresh = store.createRoom('h2', 'Bob', T0 + 3_600_000)
    const removed = store.cleanupStale(T0 + 8_000_000, 2 * 60 * 60 * 1000)
    expect(removed).toContain(stale.code)
    expect(removed).not.toContain(fresh.code)
    expect(store.getRoom(stale.code)).toBeUndefined()
    expect(store.getRoom(fresh.code)).toBeDefined()
  })
})
```

- [ ] **Step 16: Реализовать `cleanupStale`**

Добавить:
```ts
  cleanupStale(now: number, ttlMs: number): string[] {
    const removed: string[] = []
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivityAt > ttlMs) {
        this.rooms.delete(code)
        removed.push(code)
      }
    }
    return removed
  }
```

Run: `npm test -- room`
Expected: PASS.

- [ ] **Step 17: Тесты на `toPublic` (маскирование голосов)**

Дописать:
```ts
describe('RoomStore.toPublic', () => {
  it('в статусе voting отдаёт только votedParticipantIds, БЕЗ значений', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.addParticipant(room.code, 'p2', 'Bob', T0 + 1)
    store.castVote(room.code, 'h1', 5, T0 + 2)
    const pub = store.toPublic(room)
    expect(pub.currentRound.status).toBe('voting')
    if (pub.currentRound.status === 'voting') {
      expect(pub.currentRound.votedParticipantIds).toEqual(['h1'])
    }
    const json = JSON.stringify(pub)
    expect(json).not.toContain('"value"')
    expect(json).not.toContain(':5')
  })

  it('в статусе revealed отдаёт значения и статистику', () => {
    const store = new RoomStore()
    const room = store.createRoom('h1', 'Alice', T0)
    store.castVote(room.code, 'h1', 5, T0 + 1)
    store.revealRound(room.code, 'h1', T0 + 2)
    const pub = store.toPublic(room)
    expect(pub.currentRound.status).toBe('revealed')
    if (pub.currentRound.status === 'revealed') {
      expect(pub.currentRound.votes[0].value).toBe(5)
      expect(pub.currentRound.average).toBe(5)
    }
  })
})
```

- [ ] **Step 18: Реализовать `toPublic`**

Добавить:
```ts
  toPublic(room: Room): PublicRoomState {
    const base = {
      code: room.code,
      hostId: room.hostId,
      participants: [...room.participants.values()],
      history: room.history,
    }
    if (room.currentRound.status === 'voting') {
      return {
        ...base,
        currentRound: {
          id: room.currentRound.id,
          status: 'voting',
          votedParticipantIds: [...room.currentRound.votes.keys()],
        },
      }
    }
    const stats = room.currentRound.stats ?? { average: null, min: null, max: null, consensus: false }
    return {
      ...base,
      currentRound: {
        id: room.currentRound.id,
        status: 'revealed',
        votes: [...room.currentRound.votes.values()],
        ...stats,
      },
    }
  }
```

Run: `npm test -- room`
Expected: PASS для всех.

- [ ] **Step 19: Коммит**

```bash
git add lib/room.ts tests/unit/room.test.ts
git commit -m "feat(room): in-memory RoomStore with pure round logic"
```

---

## Task 5: CSV-экспорт (`lib/csv.ts`)

**Files:**
- Create: `lib/csv.ts`, `tests/unit/csv.test.ts`

**Interfaces:**
- Consumes: `RoundSummary` из `lib/types.ts`.
- Produces: `roundsToCsv(rounds: RoundSummary[]): string` — CSV с заголовком `#,finishedAt,average,min,max,consensus,votes`.

- [ ] **Step 1: Падающий тест**

```ts
import { describe, it, expect } from 'vitest'
import { roundsToCsv } from '@/lib/csv'
import type { RoundSummary } from '@/lib/types'

describe('roundsToCsv', () => {
  it('форматирует историю в CSV с заголовком', () => {
    const rounds: RoundSummary[] = [
      {
        id: 'r1',
        finishedAt: 1700000000000,
        stats: { average: 5, min: 3, max: 8, consensus: false },
        votes: [
          { nickname: 'Alice', value: 3 },
          { nickname: 'Bob', value: 8 },
        ],
      },
    ]
    const csv = roundsToCsv(rounds)
    expect(csv.split('\n')[0]).toBe('#,finishedAt,average,min,max,consensus,votes')
    expect(csv).toContain('1,')
    expect(csv).toContain('Alice=3;Bob=8')
    expect(csv).toContain('5,3,8,false')
  })

  it('никнеймы с запятой берутся в кавычки', () => {
    const rounds: RoundSummary[] = [{
      id: 'r1',
      finishedAt: 0,
      stats: { average: null, min: null, max: null, consensus: false },
      votes: [{ nickname: 'A, B', value: '?' }],
    }]
    expect(roundsToCsv(rounds)).toContain('"A, B=?"')
  })
})
```

- [ ] **Step 2: Убедиться, что падает, затем реализовать**

Run: `npm test -- csv`
Expected: FAIL.

Написать `lib/csv.ts`:
```ts
import type { RoundSummary } from './types'

const HEADER = '#,finishedAt,average,min,max,consensus,votes'

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function roundsToCsv(rounds: RoundSummary[]): string {
  const lines = [HEADER]
  rounds.forEach((r, idx) => {
    const votes = r.votes.map(v => `${v.nickname}=${v.value}`).join(';')
    lines.push([
      String(idx + 1),
      new Date(r.finishedAt).toISOString(),
      r.stats.average ?? '',
      r.stats.min ?? '',
      r.stats.max ?? '',
      r.stats.consensus,
      csvField(votes),
    ].join(','))
  })
  return lines.join('\n')
}
```

Run: `npm test -- csv`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add lib/csv.ts tests/unit/csv.test.ts
git commit -m "feat(csv): rounds history to CSV export"
```

---

## Task 6: Socket.IO сервер и обработчики (`server/index.ts`, `server/handlers.ts`)

**Files:**
- Modify: `server/index.ts` — подключить Socket.IO.
- Create: `server/handlers.ts`, `tests/integration/socket.test.ts`

**Interfaces:**
- Consumes: `RoomStore`, `PublicRoomState`, event-типы.
- Produces:
  - `registerSocketHandlers(io: Server<...>, store: RoomStore, now?: () => number): void` — экспорт для использования из `server/index.ts` и тестов.
  - `startTtlSweeper(store: RoomStore, opts?: { intervalMs?: number; ttlMs?: number }): () => void` — возвращает stop-функцию.
  - В `server/index.ts` создаётся `RoomStore` (модульный singleton, экспортируется), инициализируется `io = new Server(httpServer)`, вызывается `registerSocketHandlers(io, store)`.

- [ ] **Step 1: Написать интеграционный тест `tests/integration/socket.test.ts` — happy path**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client'
import { RoomStore } from '@/lib/room'
import { registerSocketHandlers } from '@/server/handlers'
import type { ClientToServerEvents, ServerToClientEvents, JoinAckOk } from '@/lib/types'

type SC = ClientSocket<ServerToClientEvents, ClientToServerEvents>

async function withServer(fn: (port: number, store: RoomStore) => Promise<void>) {
  const httpServer: HttpServer = createServer()
  const store = new RoomStore()
  const io = new Server(httpServer)
  registerSocketHandlers(io, store)
  await new Promise<void>(res => httpServer.listen(0, res))
  const port = (httpServer.address() as { port: number }).port
  try {
    await fn(port, store)
  } finally {
    io.close()
    httpServer.close()
  }
}

function connect(port: number): SC {
  return clientIo(`http://localhost:${port}`, { transports: ['websocket'] })
}

async function joinRoom(sock: SC, roomCode: string, nickname: string): Promise<JoinAckOk> {
  return new Promise((resolve, reject) => {
    sock.emit('room:join', { roomCode, nickname }, (ack: any) => {
      ack.ok ? resolve(ack) : reject(new Error(ack.error))
    })
  })
}

describe('socket handlers happy path', () => {
  it('host создаёт → 2 гостя присоединяются → голосуют → reveal → все получают значения', async () => {
    await withServer(async (port, store) => {
      const room = store.createRoom('will-be-replaced', 'Alice', Date.now())
      // host заходит первым — сервер заменит placeholder id на socket.id
      const hostSock = connect(port)
      const hostAck = await joinRoom(hostSock, room.code, 'Alice')
      expect(hostAck.you.isHost).toBe(true)

      const bobSock = connect(port)
      const carolSock = connect(port)
      await joinRoom(bobSock, room.code, 'Bob')
      await joinRoom(carolSock, room.code, 'Carol')

      hostSock.emit('vote:cast', { value: 3 })
      bobSock.emit('vote:cast', { value: 5 })
      carolSock.emit('vote:cast', { value: 8 })

      // Ждём, пока сервер разошлёт vote_updated (по одному на голос)
      await new Promise(r => setTimeout(r, 50))

      const revealedBob = new Promise<any>(res => bobSock.once('round:revealed', res))
      const revealedCarol = new Promise<any>(res => carolSock.once('round:revealed', res))
      hostSock.emit('round:reveal')

      const [b, c] = await Promise.all([revealedBob, revealedCarol])
      expect(b.votes).toHaveLength(3)
      expect(b.average).toBeCloseTo(5.3, 1)
      expect(c.average).toBeCloseTo(5.3, 1)

      hostSock.disconnect(); bobSock.disconnect(); carolSock.disconnect()
    })
  })
})
```

Замечание для инженера: `store.createRoom('will-be-replaced', 'Alice', ...)` создаёт комнату до подключения. Handler при `room:join` с nickname хоста сопоставит участника с новым `socket.id`. Мы реализуем эту логику ниже (см. handler — при первом заходе с nickname == host.nickname и пустым `hostId === 'will-be-replaced'`... — упрощаем: HTTP `POST /api/rooms` в Task 7 отдаст код и host-nickname, а первое `room:join` с этим nickname получит host-права). Для теста мы напрямую манипулируем store.

Упростим тест: сделаем через прямой вызов. Заменить создание на:

```ts
      // упрощённо: сервер создаёт комнату сам при первом join
      const roomCode = 'ABC123'
      // не готово, см. Step 2 — сначала перепишем handler так, чтобы первый входящий становился хостом
```

**Решение:** упрощённый жизненный цикл — если при `room:join` комната не найдена, handler создаёт её и делает вошедшего хостом. Это упрощает и e2e-тест: `POST /api/rooms` резервирует код в store с TTL и без хоста, потом первый входящий становится хостом. Убираем условности — просто резервируем код и делаем первого вошедшего хостом.

Актуальный тест (переписать `tests/integration/socket.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { createServer, type Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client'
import { RoomStore } from '@/lib/room'
import { registerSocketHandlers } from '@/server/handlers'
import type { ClientToServerEvents, ServerToClientEvents, JoinAckOk } from '@/lib/types'

type SC = ClientSocket<ServerToClientEvents, ClientToServerEvents>

async function withServer(fn: (port: number, store: RoomStore) => Promise<void>) {
  const httpServer: HttpServer = createServer()
  const store = new RoomStore()
  const io = new Server(httpServer)
  registerSocketHandlers(io, store)
  await new Promise<void>(res => httpServer.listen(0, res))
  const port = (httpServer.address() as { port: number }).port
  try { await fn(port, store) } finally {
    await new Promise<void>(res => { io.close(); httpServer.close(() => res()) })
  }
}

function connect(port: number): SC {
  return clientIo(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true })
}

function join(sock: SC, roomCode: string, nickname: string): Promise<JoinAckOk> {
  return new Promise((resolve, reject) => {
    sock.emit('room:join', { roomCode, nickname }, (ack: any) => ack.ok ? resolve(ack) : reject(new Error(ack.error)))
  })
}

describe('socket happy path', () => {
  it('host + 2 гостя, голосуют, reveal, все видят значения', async () => {
    await withServer(async (port, store) => {
      const room = store.reserveRoom(Date.now())    // резервирует код без участников
      const host = connect(port); const bob = connect(port); const carol = connect(port)
      const hAck = await join(host, room.code, 'Alice')
      expect(hAck.you.isHost).toBe(true)
      await join(bob, room.code, 'Bob')
      await join(carol, room.code, 'Carol')

      host.emit('vote:cast', { value: 3 })
      bob.emit('vote:cast', { value: 5 })
      carol.emit('vote:cast', { value: 8 })
      await new Promise(r => setTimeout(r, 50))

      const [b, c] = await Promise.all([
        new Promise<any>(res => bob.once('round:revealed', res)),
        new Promise<any>(res => carol.once('round:revealed', res)),
      ])
      host.emit('round:reveal')
      const bMsg = await b; const cMsg = await c
      expect(bMsg.votes).toHaveLength(3)
      expect(bMsg.average).toBeCloseTo(5.3, 1)
      expect(cMsg.average).toBeCloseTo(5.3, 1)

      host.disconnect(); bob.disconnect(); carol.disconnect()
    })
  })
})
```

Замечание: этот тест требует нового метода `RoomStore.reserveRoom(now)`. Добавим его в Task 4 через хотфикс — см. Step 2 ниже.

- [ ] **Step 2: Добавить `RoomStore.reserveRoom` — новый метод**

Изменить `lib/room.ts`, добавить в класс:
```ts
  reserveRoom(now: number): Room {
    let code = generateRoomCode()
    while (this.rooms.has(code)) code = generateRoomCode()
    const round: Round = {
      id: crypto.randomUUID(),
      startedAt: now,
      status: 'voting',
      votes: new Map(),
    }
    const room: Room = {
      code,
      createdAt: now,
      lastActivityAt: now,
      hostId: '',              // будет назначен первым вошедшим
      participants: new Map(),
      currentRound: round,
      history: [],
    }
    this.rooms.set(code, room)
    return room
  }
```

Добавить unit-тест в `tests/unit/room.test.ts`:
```ts
describe('RoomStore.reserveRoom', () => {
  it('создаёт пустую комнату без участников и с пустым hostId', () => {
    const store = new RoomStore()
    const room = store.reserveRoom(T0)
    expect(room.hostId).toBe('')
    expect(room.participants.size).toBe(0)
    expect(store.getRoom(room.code)).toBe(room)
  })
})
```

Run: `npm test -- room`
Expected: PASS.

- [ ] **Step 3: Написать `server/handlers.ts` — обработчик join**

Создать:
```ts
import type { Server, Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  JoinAckErr,
  JoinAckOk,
} from '@/lib/types'
import type { RoomStore } from '@/lib/room'

type SIOServer = Server<ClientToServerEvents, ServerToClientEvents>
type SIOSocket = Socket<ClientToServerEvents, ServerToClientEvents>

interface SocketData {
  roomCode?: string
}

function roomChannel(code: string) {
  return `room:${code}`
}

export function registerSocketHandlers(
  io: SIOServer,
  store: RoomStore,
  now: () => number = () => Date.now(),
): void {
  io.on('connection', (socket: SIOSocket) => {
    const data = socket.data as SocketData

    socket.on('room:join', ({ roomCode, nickname }, ack) => {
      const room = store.getRoom(roomCode)
      if (!room) return ack({ ok: false, error: 'room_not_found' } satisfies JoinAckErr)

      let participant
      if (room.participants.size === 0) {
        // Пустая комната (либо reserved, либо после ухода всех) — вошедший становится хостом
        const host = { id: socket.id, nickname, isHost: true, joinedAt: now() }
        room.participants.set(socket.id, host)
        room.hostId = socket.id
        room.lastActivityAt = now()
        participant = host
      } else {
        const r = store.addParticipant(roomCode, socket.id, nickname, now())
        if ('error' in r) return ack({ ok: false, error: r.error } satisfies JoinAckErr)
        participant = r.participant
      }

      data.roomCode = roomCode
      socket.join(roomChannel(roomCode))
      ack({ ok: true, you: participant, room: store.toPublic(room) } satisfies JoinAckOk)
      socket.to(roomChannel(roomCode)).emit('room:participant_joined', { participant })
    })

    socket.on('vote:cast', ({ value }) => {
      const code = data.roomCode
      if (!code) return
      const r = store.castVote(code, socket.id, value, now())
      if ('error' in r) return socket.emit('room:error', { code: r.error, message: r.error })
      io.to(roomChannel(code)).emit('round:vote_updated', {
        participantId: socket.id,
        hasVoted: value !== null,
      })
    })

    socket.on('round:reveal', () => {
      const code = data.roomCode
      if (!code) return
      const r = store.revealRound(code, socket.id, now())
      if ('error' in r) return socket.emit('room:error', { code: r.error, message: r.error })
      const stats = r.room.currentRound.stats!
      const votes = [...r.room.currentRound.votes.values()]
      io.to(roomChannel(code)).emit('round:revealed', { votes, ...stats })
    })

    socket.on('round:reset', () => {
      const code = data.roomCode
      if (!code) return
      const r = store.resetRound(code, socket.id, now())
      if ('error' in r) return socket.emit('room:error', { code: r.error, message: r.error })
      const pub = store.toPublic(r.room)
      io.to(roomChannel(code)).emit('round:reset', {
        newRound: pub.currentRound,
        history: r.room.history,
      })
    })

    socket.on('disconnect', () => {
      const code = data.roomCode
      if (!code) return
      const r = store.removeParticipant(code, socket.id, now())
      if (!r) return
      io.to(roomChannel(code)).emit('room:participant_left', {
        participantId: socket.id,
        newHostId: r.newHostId,
      })
    })
  })
}

export function startTtlSweeper(
  store: RoomStore,
  opts: { intervalMs?: number; ttlMs?: number } = {},
): () => void {
  const interval = opts.intervalMs ?? 10 * 60 * 1000
  const ttl = opts.ttlMs ?? 2 * 60 * 60 * 1000
  const handle = setInterval(() => store.cleanupStale(Date.now(), ttl), interval)
  handle.unref?.()
  return () => clearInterval(handle)
}
```

- [ ] **Step 4: Прогнать happy-path интеграционный тест**

Run: `npm test -- socket`
Expected: PASS.

Если тест валится с timeout — увеличить `setTimeout(50)` до 200 и проверить порядок `.once` подписок (подписываться ДО `.emit`).

- [ ] **Step 5: Дописать тест на секретность голосов**

Дописать в `tests/integration/socket.test.ts`:
```ts
it('до reveal ни один клиент не видит значений — только hasVoted', async () => {
  await withServer(async (port, store) => {
    const room = store.reserveRoom(Date.now())
    const host = connect(port); const bob = connect(port)
    await join(host, room.code, 'Alice')
    await join(bob, room.code, 'Bob')

    const bobReceived: any[] = []
    bob.on('round:vote_updated', p => bobReceived.push(p))

    host.emit('vote:cast', { value: 8 })
    await new Promise(r => setTimeout(r, 50))

    expect(bobReceived).toHaveLength(1)
    expect(bobReceived[0]).toEqual({ participantId: expect.any(String), hasVoted: true })
    expect(JSON.stringify(bobReceived)).not.toContain('8')

    host.disconnect(); bob.disconnect()
  })
})
```

Run: `npm test -- socket`
Expected: PASS.

- [ ] **Step 6: Тест на права (не-хост не может reveal)**

Дописать:
```ts
it('не-хост, вызвавший round:reveal, получает room:error, статус не меняется', async () => {
  await withServer(async (port, store) => {
    const room = store.reserveRoom(Date.now())
    const host = connect(port); const bob = connect(port)
    await join(host, room.code, 'Alice')
    await join(bob, room.code, 'Bob')
    bob.emit('vote:cast', { value: 5 })
    await new Promise(r => setTimeout(r, 30))

    const err = new Promise<any>(res => bob.once('room:error', res))
    bob.emit('round:reveal')
    const e = await err
    expect(e.code).toBe('not_host')
    expect(store.getRoom(room.code)!.currentRound.status).toBe('voting')

    host.disconnect(); bob.disconnect()
  })
})
```

- [ ] **Step 7: Тест на дисконнект хоста → newHostId**

Дописать:
```ts
it('когда хост дисконнектится, оставшийся получает newHostId', async () => {
  await withServer(async (port, store) => {
    const room = store.reserveRoom(Date.now())
    const host = connect(port); const bob = connect(port)
    await join(host, room.code, 'Alice')
    const bobAck = await join(bob, room.code, 'Bob')

    const left = new Promise<any>(res => bob.once('room:participant_left', res))
    host.disconnect()
    const msg = await left
    expect(msg.newHostId).toBe(bobAck.you.id)
    expect(store.getRoom(room.code)!.hostId).toBe(bobAck.you.id)

    bob.disconnect()
  })
})
```

Run: `npm test -- socket`
Expected: все PASS.

- [ ] **Step 8: Подключить Socket.IO в `server/index.ts`**

Изменить `server/index.ts`:
```ts
import { createServer } from 'node:http'
import next from 'next'
import { Server } from 'socket.io'
import { RoomStore } from '../lib/room.js'
import { registerSocketHandlers, startTtlSweeper } from './handlers.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../lib/types.js'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)

export const store = new RoomStore()

const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()
const httpServer = createServer((req, res) => handle(req, res))
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: dev ? { origin: '*' } : undefined,
})
registerSocketHandlers(io, store)
startTtlSweeper(store)

httpServer.listen(port, () => {
  console.log(`> ready on http://localhost:${port}`)
})

// экспорт для API route
;(globalThis as any).__roomStore = store
```

Run: `npm run dev` в фоне на 5 секунд, curl `http://localhost:3000` → HTML отдаётся. Убить.

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 9: Коммит**

```bash
git add server/handlers.ts server/index.ts lib/room.ts tests/integration/socket.test.ts tests/unit/room.test.ts
git commit -m "feat(server): Socket.IO handlers with invariants and TTL sweeper"
```

---

## Task 7: HTTP API — `POST /api/rooms`

**Files:**
- Create: `app/api/rooms/route.ts`

**Interfaces:**
- Consumes: `store` singleton через `globalThis.__roomStore` (custom server прикрепляет его в Task 6, Step 8).
- Produces: `POST /api/rooms` → `{ code: string }` (201).

- [ ] **Step 1: Написать `app/api/rooms/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { RoomStore } from '@/lib/room'

export async function POST() {
  const store = (globalThis as any).__roomStore as RoomStore | undefined
  if (!store) {
    return NextResponse.json({ error: 'store_not_ready' }, { status: 503 })
  }
  const room = store.reserveRoom(Date.now())
  return NextResponse.json({ code: room.code }, { status: 201 })
}
```

- [ ] **Step 2: Smoke-проверка**

Run: `npm run dev` в фоне, `curl -X POST http://localhost:3000/api/rooms` → `{"code":"XXXXXX"}` (6 знаков). Убить.

- [ ] **Step 3: Коммит**

```bash
git add app/api/rooms/route.ts
git commit -m "feat(api): POST /api/rooms creates room"
```

---

## Task 8: Клиентский Socket-хук (`lib/socket-client.ts`)

**Files:**
- Create: `lib/socket-client.ts`

**Interfaces:**
- Produces: `useSocket(): Socket<ServerToClientEvents, ClientToServerEvents>` — React-хук, возвращает готовое соединение (singleton за window life).

- [ ] **Step 1: Написать `lib/socket-client.ts`**

```ts
'use client'
import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from './types'

type SC = Socket<ServerToClientEvents, ClientToServerEvents>

let singleton: SC | null = null

export function getSocket(): SC {
  if (!singleton) {
    singleton = io({ autoConnect: true, transports: ['websocket'] })
  }
  return singleton
}

export function useSocket(): SC {
  const [sock] = useState<SC>(() => getSocket())
  useEffect(() => {
    if (!sock.connected) sock.connect()
  }, [sock])
  return sock
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Коммит**

```bash
git add lib/socket-client.ts
git commit -m "feat(client): useSocket hook"
```

---

## Task 9: Landing (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/rooms`.
- UX: кнопка Create → POST → редирект `router.push('/r/<code>')`. Поле кода + Join → редирект.

- [ ] **Step 1: Переписать `app/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/rooms', { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      const { code } = await res.json()
      router.push(`/r/${code}`)
    } finally { setCreating(false) }
  }

  function join(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed) router.push(`/r/${trimmed}`)
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1>Poker Planning</h1>
      <button onClick={create} disabled={creating} style={{ width: '100%', padding: 12, marginBottom: 24 }}>
        {creating ? 'Creating…' : 'Create room'}
      </button>
      <form onSubmit={join}>
        <label style={{ display: 'block', marginBottom: 8 }}>Or join by code:</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="ABC123"
            maxLength={6}
            style={{ flex: 1, padding: 12, textTransform: 'uppercase' }}
          />
          <button type="submit" style={{ padding: '0 20px' }}>Join</button>
        </div>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Smoke-проверка**

Run: `npm run dev` в фоне, `curl http://localhost:3000` → HTML содержит "Create room" и "Or join by code". Убить.

- [ ] **Step 3: Коммит**

```bash
git add app/page.tsx
git commit -m "feat(ui): landing page with create and join"
```

---

## Task 10: NicknameModal (`components/NicknameModal.tsx`)

**Files:**
- Create: `components/NicknameModal.tsx`

**Interfaces:**
- Produces: `<NicknameModal onSubmit={(nickname: string) => void} />` — модалка над экраном; при mount проверяет `localStorage['pp:nickname']`; если есть — предзаполняет и авто-фокус на кнопке. Не даёт закрыть без ввода.

- [ ] **Step 1: Написать компонент**

```tsx
'use client'
import { useEffect, useState } from 'react'

const KEY = 'pp:nickname'

export function NicknameModal({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
    if (saved) setValue(saved)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    window.localStorage.setItem(KEY, trimmed)
    onSubmit(trimmed)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <form onSubmit={submit} style={{
        background: 'var(--card-bg, #fff)', padding: 24, borderRadius: 8, width: 320,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h2 style={{ margin: 0 }}>Enter your nickname</h2>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength={30}
          placeholder="e.g. Alice"
          style={{ padding: 10 }}
        />
        <button type="submit" disabled={!value.trim()} style={{ padding: 10 }}>Join</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: 0 ошибок.

- [ ] **Step 3: Коммит**

```bash
git add components/NicknameModal.tsx
git commit -m "feat(ui): NicknameModal with localStorage persistence"
```

---

## Task 11: Deck (`components/Deck.tsx`)

**Files:**
- Create: `components/Deck.tsx`

**Interfaces:**
- Produces: `<Deck value={CardValue | null} onSelect={(v: CardValue | null) => void} disabled={boolean} />` — 10 карт из `DECK`. Клик по выбранной снимает голос.

- [ ] **Step 1: Написать компонент**

```tsx
'use client'
import { DECK } from '@/lib/deck'
import type { CardValue } from '@/lib/types'

export function Deck({
  value,
  onSelect,
  disabled,
}: {
  value: CardValue | null
  onSelect: (v: CardValue | null) => void
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
      {DECK.map(card => {
        const selected = card === value
        return (
          <button
            key={String(card)}
            disabled={disabled}
            onClick={() => onSelect(selected ? null : card)}
            style={{
              width: 56, height: 84, border: '2px solid',
              borderColor: selected ? '#2563eb' : '#cbd5e1',
              background: selected ? '#dbeafe' : '#fff',
              borderRadius: 8, fontSize: 18, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {card}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Коммит**

```bash
git add components/Deck.tsx
git commit -m "feat(ui): Deck component"
```

---

## Task 12: ParticipantSeat (`components/ParticipantSeat.tsx`)

**Files:**
- Create: `components/ParticipantSeat.tsx`

**Interfaces:**
- Produces: `<ParticipantSeat participant={Participant} state={'idle' | 'voted' | 'revealed'} revealedValue?={CardValue} isYou={boolean} />`

- [ ] **Step 1: Написать компонент**

```tsx
'use client'
import type { CardValue, Participant } from '@/lib/types'

export function ParticipantSeat({
  participant,
  state,
  revealedValue,
  isYou,
}: {
  participant: Participant
  state: 'idle' | 'voted' | 'revealed'
  revealedValue?: CardValue
  isYou: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      minWidth: 96,
    }}>
      <div style={{
        width: 60, height: 88, borderRadius: 8,
        background: state === 'revealed' ? '#dbeafe' : state === 'voted' ? '#334155' : '#e2e8f0',
        border: '2px solid ' + (state === 'revealed' ? '#2563eb' : '#94a3b8'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: state === 'revealed' ? '#111' : state === 'voted' ? '#fff' : '#94a3b8',
        fontSize: 24, fontWeight: 700,
      }}>
        {state === 'revealed' ? String(revealedValue ?? '') : state === 'voted' ? '🂠' : ''}
      </div>
      <div style={{ fontSize: 14, fontWeight: isYou ? 700 : 500 }}>
        {participant.nickname}
        {participant.isHost ? ' 👑' : ''}
        {isYou ? ' (you)' : ''}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Коммит**

```bash
git add components/ParticipantSeat.tsx
git commit -m "feat(ui): ParticipantSeat with idle/voted/revealed states"
```

---

## Task 13: Table + круговая раскладка (`components/Table.tsx`)

**Files:**
- Create: `components/Table.tsx`

**Interfaces:**
- Consumes: `<ParticipantSeat>`.
- Produces: `<Table participants={Participant[]} youId={string} status={RoomStatus} votedIds={Set<string>} revealedVotes?={Vote[]} centerSlot={ReactNode} />`. Центр — `centerSlot` (для `TableCenter`).

- [ ] **Step 1: Написать компонент**

```tsx
'use client'
import type { Participant, RoomStatus, Vote } from '@/lib/types'
import { ParticipantSeat } from './ParticipantSeat'

const RADIUS = 220
const SIZE = 560

export function Table({
  participants,
  youId,
  status,
  votedIds,
  revealedVotes,
  centerSlot,
}: {
  participants: Participant[]
  youId: string
  status: RoomStatus
  votedIds: Set<string>
  revealedVotes?: Vote[]
  centerSlot: React.ReactNode
}) {
  // Свой игрок — вниз (угол π/2); остальные равномерно вокруг, идя по часовой от нижней позиции.
  const you = participants.find(p => p.id === youId)
  const others = participants.filter(p => p.id !== youId)
  const ordered = you ? [...others, you] : participants   // you last → рисуется внизу
  const n = ordered.length || 1

  const voteMap = new Map<string, Vote>()
  revealedVotes?.forEach(v => voteMap.set(v.participantId, v))

  return (
    <div style={{
      position: 'relative', width: SIZE, height: SIZE, margin: '0 auto',
    }}>
      {ordered.map((p, i) => {
        // Хотим, чтобы последний (you) оказался внизу — угол π/2.
        // Поэтому базовый угол: sтартуем с верха (-π/2) и идём по часовой.
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
        const x = SIZE / 2 + RADIUS * Math.cos(angle) - 48
        const y = SIZE / 2 + RADIUS * Math.sin(angle) - 60
        const state: 'idle' | 'voted' | 'revealed' =
          status === 'revealed'
            ? 'revealed'
            : votedIds.has(p.id)
              ? 'voted'
              : 'idle'
        return (
          <div key={p.id} style={{ position: 'absolute', left: x, top: y, transition: 'all 0.3s ease' }}>
            <ParticipantSeat
              participant={p}
              state={state}
              revealedValue={voteMap.get(p.id)?.value}
              isYou={p.id === youId}
            />
          </div>
        )
      })}
      <div style={{
        position: 'absolute', left: SIZE / 2 - 120, top: SIZE / 2 - 80,
        width: 240, height: 160, borderRadius: 120,
        background: '#065f46', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.3)',
      }}>
        {centerSlot}
      </div>
    </div>
  )
}
```

Замечание для инженера: раскладка проверяется глазами; тест на пиксельные координаты не пишем.

- [ ] **Step 2: Коммит**

```bash
git add components/Table.tsx
git commit -m "feat(ui): circular Table layout"
```

---

## Task 14: TableCenter (`components/TableCenter.tsx`)

**Files:**
- Create: `components/TableCenter.tsx`

**Interfaces:**
- Produces: `<TableCenter status={RoomStatus} isHost={boolean} canReveal={boolean} stats?={RevealedStats} onReveal={() => void} onReset={() => void} />`

- [ ] **Step 1: Написать компонент**

```tsx
'use client'
import type { RevealedStats, RoomStatus } from '@/lib/types'

export function TableCenter({
  status,
  isHost,
  canReveal,
  stats,
  onReveal,
  onReset,
}: {
  status: RoomStatus
  isHost: boolean
  canReveal: boolean
  stats?: RevealedStats
  onReveal: () => void
  onReset: () => void
}) {
  if (status === 'voting') {
    if (!isHost) {
      return <div style={{ textAlign: 'center' }}>waiting for host…</div>
    }
    return (
      <button
        onClick={onReveal}
        disabled={!canReveal}
        style={{ padding: '12px 24px', background: '#fff', color: '#065f46', fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        Reveal
      </button>
    )
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 700 }}>
        {stats?.average ?? '—'}
      </div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        min {stats?.min ?? '—'} · max {stats?.max ?? '—'}
        {stats?.consensus ? ' · 🎯 consensus' : ''}
      </div>
      {isHost && (
        <button
          onClick={onReset}
          style={{ padding: '8px 16px', background: '#fff', color: '#065f46', fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          New round
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Коммит**

```bash
git add components/TableCenter.tsx
git commit -m "feat(ui): TableCenter with reveal, stats, new round"
```

---

## Task 15: HistoryList (`components/HistoryList.tsx`)

**Files:**
- Create: `components/HistoryList.tsx`

**Interfaces:**
- Consumes: `roundsToCsv` из `lib/csv.ts`.
- Produces: `<HistoryList rounds={RoundSummary[]} />` — свёрнутый список; кнопка Export скачивает CSV через `Blob`.

- [ ] **Step 1: Написать компонент**

```tsx
'use client'
import { useState } from 'react'
import type { RoundSummary } from '@/lib/types'
import { roundsToCsv } from '@/lib/csv'

export function HistoryList({ rounds }: { rounds: RoundSummary[] }) {
  const [open, setOpen] = useState(false)
  if (rounds.length === 0) return null

  function exportCsv() {
    const blob = new Blob([roundsToCsv(rounds)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section style={{ marginTop: 32, borderTop: '1px solid #cbd5e1', paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 14 }}>
          {open ? '▾' : '▸'} History ({rounds.length})
        </button>
        <button onClick={exportCsv} style={{ fontSize: 12 }}>Export CSV</button>
      </div>
      {open && (
        <ol style={{ marginTop: 8 }}>
          {rounds.map((r, i) => (
            <li key={r.id}>
              #{i + 1} · avg {r.stats.average ?? '—'} · min {r.stats.min ?? '—'} · max {r.stats.max ?? '—'}
              {r.stats.consensus ? ' · 🎯' : ''}
              {' — '}
              {r.votes.map(v => `${v.nickname}:${v.value}`).join(', ')}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Коммит**

```bash
git add components/HistoryList.tsx
git commit -m "feat(ui): HistoryList with CSV export"
```

---

## Task 16: Страница комнаты (`app/r/[code]/page.tsx`)

**Files:**
- Create: `app/r/[code]/page.tsx`

**Interfaces:**
- Consumes: `useSocket`, все компоненты, `NicknameModal`.
- Логика: при mount без nickname — модалка; после submit — `socket.emit('room:join', ...)` с ack, обновляем локальное состояние; подписываемся на все server→client события и мутируем стейт.

- [ ] **Step 1: Написать страницу**

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { NicknameModal } from '@/components/NicknameModal'
import { Table } from '@/components/Table'
import { TableCenter } from '@/components/TableCenter'
import { Deck } from '@/components/Deck'
import { HistoryList } from '@/components/HistoryList'
import { useSocket } from '@/lib/socket-client'
import type {
  CardValue, Participant, PublicRoomState, RoundSummary, Vote,
} from '@/lib/types'

export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const code = (params.code ?? '').toUpperCase()

  const socket = useSocket()
  const [nickname, setNickname] = useState<string | null>(null)
  const [me, setMe] = useState<Participant | null>(null)
  const [state, setState] = useState<PublicRoomState | null>(null)
  const [myVote, setMyVote] = useState<CardValue | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Attach listeners once, up front.
  useEffect(() => {
    function onJoined({ participant }: { participant: Participant }) {
      setState(s => s && ({ ...s, participants: [...s.participants, participant] }))
    }
    function onLeft({ participantId, newHostId }: { participantId: string; newHostId?: string }) {
      setState(s => {
        if (!s) return s
        const participants = s.participants
          .filter(p => p.id !== participantId)
          .map(p => newHostId && p.id === newHostId ? { ...p, isHost: true } : p)
        return { ...s, participants, hostId: newHostId ?? s.hostId }
      })
    }
    function onVoteUpdated({ participantId, hasVoted }: { participantId: string; hasVoted: boolean }) {
      setState(s => {
        if (!s || s.currentRound.status !== 'voting') return s
        const set = new Set(s.currentRound.votedParticipantIds)
        hasVoted ? set.add(participantId) : set.delete(participantId)
        return { ...s, currentRound: { ...s.currentRound, votedParticipantIds: [...set] } }
      })
    }
    function onRevealed(payload: { votes: Vote[] } & { average: number|null; min: number|null; max: number|null; consensus: boolean }) {
      setState(s => s && ({
        ...s,
        currentRound: {
          id: s.currentRound.id, status: 'revealed',
          votes: payload.votes,
          average: payload.average, min: payload.min, max: payload.max, consensus: payload.consensus,
        },
      }))
    }
    function onReset({ newRound, history }: { newRound: PublicRoomState['currentRound']; history: RoundSummary[] }) {
      setMyVote(null)
      setState(s => s && ({ ...s, currentRound: newRound, history }))
    }
    function onErr(e: { code: string; message: string }) {
      setError(e.message)
      setTimeout(() => setError(null), 3000)
    }
    socket.on('room:participant_joined', onJoined)
    socket.on('room:participant_left', onLeft)
    socket.on('round:vote_updated', onVoteUpdated)
    socket.on('round:revealed', onRevealed)
    socket.on('round:reset', onReset)
    socket.on('room:error', onErr)
    return () => {
      socket.off('room:participant_joined', onJoined)
      socket.off('room:participant_left', onLeft)
      socket.off('round:vote_updated', onVoteUpdated)
      socket.off('round:revealed', onRevealed)
      socket.off('round:reset', onReset)
      socket.off('room:error', onErr)
    }
  }, [socket])

  function join(nickname: string) {
    setNickname(nickname)
    socket.emit('room:join', { roomCode: code, nickname }, ack => {
      if (!ack.ok) { setError(ack.error); return }
      setMe(ack.you); setState(ack.room)
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
  }

  function vote(value: CardValue | null) {
    setMyVote(value)
    socket.emit('vote:cast', { value })
  }

  const votedIds = useMemo(() => {
    if (!state) return new Set<string>()
    return state.currentRound.status === 'voting'
      ? new Set(state.currentRound.votedParticipantIds)
      : new Set(state.currentRound.votes.map(v => v.participantId))
  }, [state])

  if (!nickname) return <NicknameModal onSubmit={join} />
  if (!state || !me) return <main style={{ padding: 24 }}>Connecting…</main>

  const isHost = state.hostId === me.id
  const canReveal = state.currentRound.status === 'voting' && votedIds.size > 0

  return (
    <main style={{ maxWidth: 720, margin: '24px auto', padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <strong>Room: {state.code}</strong>
        <button onClick={copyLink}>Copy link</button>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 12 }}>
          status: {state.currentRound.status}
        </span>
      </header>

      {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 8, borderRadius: 4, marginBottom: 12 }}>{error}</div>}

      <Table
        participants={state.participants}
        youId={me.id}
        status={state.currentRound.status}
        votedIds={votedIds}
        revealedVotes={state.currentRound.status === 'revealed' ? state.currentRound.votes : undefined}
        centerSlot={
          <TableCenter
            status={state.currentRound.status}
            isHost={isHost}
            canReveal={canReveal}
            stats={state.currentRound.status === 'revealed' ? {
              average: state.currentRound.average,
              min: state.currentRound.min,
              max: state.currentRound.max,
              consensus: state.currentRound.consensus,
            } : undefined}
            onReveal={() => socket.emit('round:reveal')}
            onReset={() => socket.emit('round:reset')}
          />
        }
      />

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 8, fontSize: 14, opacity: 0.7 }}>Your card:</div>
        <Deck
          value={myVote}
          onSelect={vote}
          disabled={state.currentRound.status !== 'voting'}
        />
      </div>

      <HistoryList rounds={state.history} />
    </main>
  )
}
```

- [ ] **Step 2: Ручной smoke**

Run: `npm run dev` в фоне. В браузере (или `curl -sI`) открыть `http://localhost:3000` → создать комнату → откроется `/r/<code>`. Открыть второй таб на ту же ссылку → оба видят друг друга. Проверить руками, что голосование, reveal, reset работают. Убить.

- [ ] **Step 3: Коммит**

```bash
git add app/r/
git commit -m "feat(ui): room page wiring socket events to UI"
```

---

## Task 17: E2E happy-path (`tests/e2e/happy-path.spec.ts`)

**Files:**
- Create: `tests/e2e/happy-path.spec.ts`

**Interfaces:**
- Consumes: работающее приложение через Playwright `webServer` (см. `playwright.config.ts`).

- [ ] **Step 1: Установить браузеры Playwright**

Run: `npx playwright install chromium`
Expected: успешно.

- [ ] **Step 2: Написать e2e**

```ts
import { test, expect } from '@playwright/test'

test('happy path: host + guest, vote, reveal, new round', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const guestCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  await host.goto('/')
  await host.getByRole('button', { name: /create room/i }).click()
  await expect(host).toHaveURL(/\/r\/[A-Z2-9]{6}/)
  const url = host.url()

  // Host: enter nickname
  await host.getByPlaceholder(/e\.g\. alice/i).fill('Alice')
  await host.getByRole('button', { name: 'Join' }).click()
  await expect(host.getByText('Alice')).toBeVisible()

  // Guest: same URL
  await guest.goto(url)
  await guest.getByPlaceholder(/e\.g\. alice/i).fill('Bob')
  await guest.getByRole('button', { name: 'Join' }).click()

  // Both see both
  await expect(host.getByText('Bob')).toBeVisible()
  await expect(guest.getByText('Alice')).toBeVisible()

  // Both vote
  await host.getByRole('button', { name: '5', exact: true }).click()
  await guest.getByRole('button', { name: '8', exact: true }).click()

  // Host reveals
  await host.getByRole('button', { name: 'Reveal' }).click()

  // Both see stats (6.5 = (5+8)/2)
  await expect(host.getByText('6.5')).toBeVisible()
  await expect(guest.getByText('6.5')).toBeVisible()

  // Host: new round
  await host.getByRole('button', { name: 'New round' }).click()
  await expect(host.getByRole('button', { name: 'Reveal' })).toBeVisible()
  await expect(host.getByText('History (1)')).toBeVisible()
})
```

- [ ] **Step 3: Прогнать e2e**

Run: `npm run test:e2e`
Expected: PASS. Playwright сам поднимет dev-сервер.

Если тест валит на `strict mode violation` (совпадение локатора с несколькими элементами) — подкорректировать локаторы к уникальным (например, `page.locator('button').filter({ hasText: /^5$/ })`), сохраняя семантику.

- [ ] **Step 4: Финальный smoke — все проверки**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: всё зелёное.

- [ ] **Step 5: Коммит**

```bash
git add tests/e2e/happy-path.spec.ts
git commit -m "test(e2e): happy path with two browser contexts"
```

---

## Self-Review Notes (для инженера)

**Coverage vs spec:**
- Спека §2 (Scope MVP): реализовано в Tasks 4 (ядро), 5 (CSV), 13 (круглый стол), 15 (history).
- Спека §5 (Модель данных): Task 2.
- Спека §6 (State-машина): Task 4 (Steps 11-14, 17-18).
- Спека §7 (UI): Tasks 9-15, 16.
- Спека §8 (Socket.IO протокол): Task 6, включая инварианты секретности и прав.
- Спека §9 (HTTP API): Task 7.
- Спека §10 (Тесты): Tasks 3-6 (unit + integration), Task 17 (e2e).
- Спека §11 (Деплой): `Dockerfile` и CI намеренно отложены — MVP это не требует; заведём отдельным PR если понадобится.

**Известные компромиссы:**
- Раскладка «по кругу» проверяется глазами, не автотестом.
- Нет reconnection-токена — обновление вкладки = новый участник (по спеке §8.3).
- `global.__roomStore` — простой способ поделить singleton между кастомным сервером и API-route в MVP; в масштабе — Redis (§12).

---

## Execution Handoff

Плейн готов. Два варианта запуска:

1. **Subagent-Driven (рекомендую)** — новый subagent на каждую задачу, review между задачами, быстрая итерация.
2. **Inline Execution** — задачи выполняются в текущей сессии батчами с чекпоинтами.

Какой выбираешь?
