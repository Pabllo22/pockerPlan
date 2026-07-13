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

describe('RoomStore.reserveRoom', () => {
  it('создаёт пустую комнату без участников и с пустым hostId', () => {
    const store = new RoomStore()
    const room = store.reserveRoom(T0)
    expect(room.hostId).toBe('')
    expect(room.participants.size).toBe(0)
    expect(store.getRoom(room.code)).toBe(room)
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
      expect(pub.currentRound.votes?.[0]?.value).toBe(5)
      expect(pub.currentRound.average).toBe(5)
    }
  })
})
