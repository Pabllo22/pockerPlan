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
        <button
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 14 }}
        >
          {open ? '▾' : '▸'} History ({rounds.length})
        </button>
        <button onClick={exportCsv} style={{ fontSize: 12, cursor: 'pointer' }}>
          Export CSV
        </button>
      </div>
      {open && (
        <ol style={{ marginTop: 8 }}>
          {rounds.map((r, i) => (
            <li key={r.id}>
              #{i + 1} · avg {r.stats.average ?? '—'} · min {r.stats.min ?? '—'} · max{' '}
              {r.stats.max ?? '—'}
              {r.stats.consensus ? ' · 🎯' : ''}
              {' — '}
              {r.votes.map((v) => `${v.nickname}:${v.value}`).join(', ')}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
