import { createServer } from 'node:http'
import next from 'next'
import { Server } from 'socket.io'
import { RoomStore } from '@/lib/room'
import { registerSocketHandlers, startTtlSweeper } from '@/server/handlers'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/lib/types'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)

export const store = new RoomStore()
;(globalThis as unknown as { __roomStore: RoomStore }).__roomStore = store

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
