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
      {DECK.map((card) => {
        const selected = card === value
        return (
          <button
            key={String(card)}
            disabled={disabled}
            onClick={() => onSelect(selected ? null : card)}
            style={{
              width: 56,
              height: 84,
              border: '2px solid',
              borderColor: selected ? '#2563eb' : '#cbd5e1',
              background: selected ? '#dbeafe' : '#fff',
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: '#111',
            }}
          >
            {card}
          </button>
        )
      })}
    </div>
  )
}
