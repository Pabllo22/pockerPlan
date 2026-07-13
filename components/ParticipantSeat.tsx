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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        minWidth: 96,
      }}
    >
      <div
        style={{
          width: 60,
          height: 88,
          borderRadius: 8,
          background:
            state === 'revealed' ? '#dbeafe' : state === 'voted' ? '#334155' : '#e2e8f0',
          border:
            '2px solid ' + (state === 'revealed' ? '#2563eb' : '#94a3b8'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color:
            state === 'revealed' ? '#111' : state === 'voted' ? '#fff' : '#94a3b8',
          fontSize: 24,
          fontWeight: 700,
        }}
      >
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
