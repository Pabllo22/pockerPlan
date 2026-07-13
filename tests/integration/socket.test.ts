import { describe, it, expect } from 'vitest'
import { createServer, type Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client'
import { RoomStore } from '@/lib/room'
import { registerSocketHandlers } from '@/server/handlers'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  JoinAckOk,
} from '@/lib/types'

type SC = ClientSocket<ServerToClientEvents, ClientToServerEvents>

async function withServer(
  fn: (port: number, store: RoomStore) => Promise<void>,
): Promise<void> {
  const httpServer: HttpServer = createServer()
  const store = new RoomStore()
  const io = new Server(httpServer)
  registerSocketHandlers(io, store)
  await new Promise<void>((res) => httpServer.listen(0, res))
  const port = (httpServer.address() as { port: number }).port
  try {
    await fn(port, store)
  } finally {
    await new Promise<void>((res) => {
      io.close()
      httpServer.close(() => res())
    })
  }
}

function connect(port: number): SC {
  return clientIo(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  })
}

function join(sock: SC, roomCode: string, nickname: string): Promise<JoinAckOk> {
  return new Promise((resolve, reject) => {
    sock.emit('room:join', { roomCode, nickname }, (ack) => {
      if (ack.ok) resolve(ack)
      else reject(new Error(ack.error))
    })
  })
}

describe('socket happy path', () => {
  it('host + 2 гостя, голосуют, reveal, все видят значения', async () => {
    await withServer(async (port, store) => {
      const room = store.reserveRoom(Date.now())
      const host = connect(port)
      const bob = connect(port)
      const carol = connect(port)
      try {
        const hAck = await join(host, room.code, 'Alice')
        expect(hAck.you.isHost).toBe(true)
        await join(bob, room.code, 'Bob')
        await join(carol, room.code, 'Carol')

        const bobRevealed = new Promise<any>((res) =>
          bob.once('round:revealed', res),
        )
        const carolRevealed = new Promise<any>((res) =>
          carol.once('round:revealed', res),
        )

        host.emit('vote:cast', { value: 3 })
        bob.emit('vote:cast', { value: 5 })
        carol.emit('vote:cast', { value: 8 })
        await new Promise((r) => setTimeout(r, 80))

        host.emit('round:reveal')
        const [b, c] = await Promise.all([bobRevealed, carolRevealed])
        expect(b.votes).toHaveLength(3)
        expect(b.average).toBeCloseTo(5.3, 1)
        expect(c.average).toBeCloseTo(5.3, 1)
      } finally {
        host.disconnect()
        bob.disconnect()
        carol.disconnect()
      }
    })
  })
})

describe('socket secrecy', () => {
  it('до reveal ни один клиент не видит значений — только hasVoted', async () => {
    await withServer(async (port, store) => {
      const room = store.reserveRoom(Date.now())
      const host = connect(port)
      const bob = connect(port)
      try {
        await join(host, room.code, 'Alice')
        await join(bob, room.code, 'Bob')

        const received: any[] = []
        bob.on('round:vote_updated', (p) => received.push(p))

        host.emit('vote:cast', { value: 8 })
        await new Promise((r) => setTimeout(r, 80))

        expect(received).toHaveLength(1)
        expect(received[0]).toEqual({
          participantId: expect.any(String),
          hasVoted: true,
        })
        expect(JSON.stringify(received)).not.toContain('8')
      } finally {
        host.disconnect()
        bob.disconnect()
      }
    })
  })
})

describe('socket permissions', () => {
  it('не-хост, вызвавший round:reveal, получает room:error, статус не меняется', async () => {
    await withServer(async (port, store) => {
      const room = store.reserveRoom(Date.now())
      const host = connect(port)
      const bob = connect(port)
      try {
        await join(host, room.code, 'Alice')
        await join(bob, room.code, 'Bob')
        bob.emit('vote:cast', { value: 5 })
        await new Promise((r) => setTimeout(r, 50))

        const err = new Promise<any>((res) => bob.once('room:error', res))
        bob.emit('round:reveal')
        const e = await err
        expect(e.code).toBe('not_host')
        expect(store.getRoom(room.code)!.currentRound.status).toBe('voting')
      } finally {
        host.disconnect()
        bob.disconnect()
      }
    })
  })
})

describe('socket host transfer', () => {
  it('когда хост дисконнектится, оставшийся получает newHostId', async () => {
    await withServer(async (port, store) => {
      const room = store.reserveRoom(Date.now())
      const host = connect(port)
      const bob = connect(port)
      try {
        await join(host, room.code, 'Alice')
        const bobAck = await join(bob, room.code, 'Bob')

        const left = new Promise<any>((res) =>
          bob.once('room:participant_left', res),
        )
        host.disconnect()
        const msg = await left
        expect(msg.newHostId).toBe(bobAck.you.id)
        expect(store.getRoom(room.code)!.hostId).toBe(bobAck.you.id)
      } finally {
        bob.disconnect()
      }
    })
  })
})
