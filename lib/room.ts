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

function computeStats(votes: Vote[]): RevealedStats {
  const nums: number[] = votes.map(v => v.value).filter(isNumericCard)
  if (nums.length === 0) return { average: null, min: null, max: null, consensus: false }
  const sum = nums.reduce((a, b) => a + b, 0)
  const average = Math.round((sum / nums.length) * 10) / 10
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const consensus = nums.every(n => n === nums[0])
  return { average, min, max, consensus }
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
      hostId: '',
      participants: new Map(),
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

  toPublic(room: Room): PublicRoomState {
    const votedParticipantIds = [...room.currentRound.votes.keys()]
    if (room.currentRound.status === 'voting') {
      return {
        code: room.code,
        hostId: room.hostId,
        participants: [...room.participants.values()],
        history: room.history,
        currentRound: {
          id: room.currentRound.id,
          status: 'voting',
          votedParticipantIds,
        },
      }
    }
    const stats = room.currentRound.stats ?? { average: null, min: null, max: null, consensus: false }
    return {
      code: room.code,
      hostId: room.hostId,
      participants: [...room.participants.values()],
      history: room.history,
      currentRound: {
        id: room.currentRound.id,
        status: 'revealed',
        votedParticipantIds,
        votes: [...room.currentRound.votes.values()],
        ...stats,
      },
    }
  }
}
