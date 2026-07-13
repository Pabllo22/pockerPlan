'use client'
import { useEffect, useState } from 'react'

const KEY = 'pp:nickname'

export function NicknameModal({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
    if (saved) setValue(saved)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    window.localStorage.setItem(KEY, trimmed)
    onSubmit(trimmed)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: '#fff',
          padding: 24,
          borderRadius: 8,
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: '#111',
        }}
      >
        <h2 style={{ margin: 0 }}>Enter your nickname</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={30}
          placeholder="e.g. Alice"
          style={{ padding: 10 }}
        />
        <button type="submit" disabled={!value.trim()} style={{ padding: 10, cursor: 'pointer' }}>
          Join
        </button>
      </form>
    </div>
  )
}
