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
        style={{
          padding: '12px 24px',
          background: '#fff',
          color: '#065f46',
          fontWeight: 700,
          border: 'none',
          borderRadius: 6,
          cursor: canReveal ? 'pointer' : 'not-allowed',
        }}
      >
        Reveal
      </button>
    )
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{stats?.average ?? '—'}</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        min {stats?.min ?? '—'} · max {stats?.max ?? '—'}
        {stats?.consensus ? ' · 🎯 consensus' : ''}
      </div>
      {isHost && (
        <button
          onClick={onReset}
          style={{
            padding: '8px 16px',
            background: '#fff',
            color: '#065f46',
            fontWeight: 700,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          New round
        </button>
      )}
    </div>
  )
}
