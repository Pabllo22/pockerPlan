'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/rooms', { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      const { code } = await res.json()
      router.push(`/r/${code}`)
    } finally {
      setCreating(false)
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed) router.push(`/r/${trimmed}`)
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1>Poker Planning</h1>
      <button
        onClick={create}
        disabled={creating}
        style={{ width: '100%', padding: 12, marginBottom: 24, cursor: 'pointer' }}
      >
        {creating ? 'Creating…' : 'Create room'}
      </button>
      <form onSubmit={join}>
        <label style={{ display: 'block', marginBottom: 8 }}>Or join by code:</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC123"
            maxLength={6}
            style={{ flex: 1, padding: 12, textTransform: 'uppercase' }}
          />
          <button type="submit" style={{ padding: '0 20px', cursor: 'pointer' }}>
            Join
          </button>
        </div>
      </form>
    </main>
  )
}
