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
  const you = participants.find((p) => p.id === youId)
  const others = participants.filter((p) => p.id !== youId)
  const ordered = you ? [...others, you] : participants
  const n = ordered.length || 1

  const voteMap = new Map<string, Vote>()
  revealedVotes?.forEach((v) => voteMap.set(v.participantId, v))

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, margin: '0 auto' }}>
      {ordered.map((p, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
        const x = SIZE / 2 + RADIUS * Math.cos(angle) - 48
        const y = SIZE / 2 + RADIUS * Math.sin(angle) - 60
        const seatState: 'idle' | 'voted' | 'revealed' =
          status === 'revealed' ? 'revealed' : votedIds.has(p.id) ? 'voted' : 'idle'
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transition: 'all 0.3s ease',
            }}
          >
            <ParticipantSeat
              participant={p}
              state={seatState}
              revealedValue={voteMap.get(p.id)?.value}
              isYou={p.id === youId}
            />
          </div>
        )
      })}
      <div
        style={{
          position: 'absolute',
          left: SIZE / 2 - 120,
          top: SIZE / 2 - 80,
          width: 240,
          height: 160,
          borderRadius: 120,
          background: '#065f46',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.3)',
        }}
      >
        {centerSlot}
      </div>
    </div>
  )
}
