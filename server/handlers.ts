import type { Server, Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  JoinAckErr,
  JoinAckOk,
  Participant,
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
      if (!room) {
        const err: JoinAckErr = { ok: false, error: 'room_not_found' }
        ack(err)
        return
      }

      let participant: Participant
      if (room.participants.size === 0) {
        const host: Participant = { id: socket.id, nickname, isHost: true, joinedAt: now() }
        room.participants.set(socket.id, host)
        room.hostId = socket.id
        room.lastActivityAt = now()
        participant = host
      } else {
        const r = store.addParticipant(roomCode, socket.id, nickname, now())
        if ('error' in r) {
          const err: JoinAckErr = { ok: false, error: r.error }
          ack(err)
          return
        }
        participant = r.participant
      }

      data.roomCode = roomCode
      socket.join(roomChannel(roomCode))
      const ok: JoinAckOk = { ok: true, you: participant, room: store.toPublic(room) }
      ack(ok)
      socket.to(roomChannel(roomCode)).emit('room:participant_joined', { participant })
    })

    socket.on('vote:cast', ({ value }) => {
      const code = data.roomCode
      if (!code) return
      const r = store.castVote(code, socket.id, value, now())
      if ('error' in r) {
        socket.emit('room:error', { code: r.error, message: r.error })
        return
      }
      io.to(roomChannel(code)).emit('round:vote_updated', {
        participantId: socket.id,
        hasVoted: value !== null,
      })
    })

    socket.on('round:reveal', () => {
      const code = data.roomCode
      if (!code) return
      const r = store.revealRound(code, socket.id, now())
      if ('error' in r) {
        socket.emit('room:error', { code: r.error, message: r.error })
        return
      }
      const stats = r.room.currentRound.stats!
      const votes = [...r.room.currentRound.votes.values()]
      io.to(roomChannel(code)).emit('round:revealed', { votes, ...stats })
    })

    socket.on('round:reset', () => {
      const code = data.roomCode
      if (!code) return
      const r = store.resetRound(code, socket.id, now())
      if ('error' in r) {
        socket.emit('room:error', { code: r.error, message: r.error })
        return
      }
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
