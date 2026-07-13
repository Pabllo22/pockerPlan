'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { NicknameModal } from '@/components/NicknameModal'
import { Table } from '@/components/Table'
import { TableCenter } from '@/components/TableCenter'
import { Deck } from '@/components/Deck'
import { HistoryList } from '@/components/HistoryList'
import { useSocket } from '@/lib/socket-client'
import type {
  CardValue,
  Participant,
  PublicRound,
  PublicRoomState,
  RevealedStats,
  RoundSummary,
  Vote,
} from '@/lib/types'

export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const code = (params.code ?? '').toUpperCase()

  const socket = useSocket()
  const [nickname, setNickname] = useState<string | null>(null)
  const [me, setMe] = useState<Participant | null>(null)
  const [state, setState] = useState<PublicRoomState | null>(null)
  const [myVote, setMyVote] = useState<CardValue | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onJoined({ participant }: { participant: Participant }) {
      setState((s) => (s ? { ...s, participants: [...s.participants, participant] } : s))
    }
    function onLeft({
      participantId,
      newHostId,
    }: {
      participantId: string
      newHostId?: string
    }) {
      setState((s) => {
        if (!s) return s
        const participants = s.participants
          .filter((p) => p.id !== participantId)
          .map((p) => (newHostId && p.id === newHostId ? { ...p, isHost: true } : p))
        return { ...s, participants, hostId: newHostId ?? s.hostId }
      })
    }
    function onVoteUpdated({
      participantId,
      hasVoted,
    }: {
      participantId: string
      hasVoted: boolean
    }) {
      setState((s) => {
        if (!s || s.currentRound.status !== 'voting') return s
        const set = new Set(s.currentRound.votedParticipantIds)
        if (hasVoted) set.add(participantId)
        else set.delete(participantId)
        return {
          ...s,
          currentRound: { ...s.currentRound, votedParticipantIds: [...set] },
        }
      })
    }
    function onRevealed(payload: { votes: Vote[] } & RevealedStats) {
      setState((s) => {
        if (!s) return s
        const nextRound: PublicRound = {
          id: s.currentRound.id,
          status: 'revealed',
          votedParticipantIds: payload.votes.map((v) => v.participantId),
          votes: payload.votes,
          average: payload.average,
          min: payload.min,
          max: payload.max,
          consensus: payload.consensus,
        }
        return { ...s, currentRound: nextRound }
      })
    }
    function onReset({
      newRound,
      history,
    }: {
      newRound: PublicRound
      history: RoundSummary[]
    }) {
      setMyVote(null)
      setState((s) => (s ? { ...s, currentRound: newRound, history } : s))
    }
    function onErr(e: { code: string; message: string }) {
      setError(e.message)
      setTimeout(() => setError(null), 3000)
    }
    socket.on('room:participant_joined', onJoined)
    socket.on('room:participant_left', onLeft)
    socket.on('round:vote_updated', onVoteUpdated)
    socket.on('round:revealed', onRevealed)
    socket.on('round:reset', onReset)
    socket.on('room:error', onErr)
    return () => {
      socket.off('room:participant_joined', onJoined)
      socket.off('room:participant_left', onLeft)
      socket.off('round:vote_updated', onVoteUpdated)
      socket.off('round:revealed', onRevealed)
      socket.off('round:reset', onReset)
      socket.off('room:error', onErr)
    }
  }, [socket])

  function join(nickname: string) {
    setNickname(nickname)
    socket.emit('room:join', { roomCode: code, nickname }, (ack) => {
      if (!ack.ok) {
        setError(ack.error)
        return
      }
      setMe(ack.you)
      setState(ack.room)
    })
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
  }

  function vote(value: CardValue | null) {
    setMyVote(value)
    socket.emit('vote:cast', { value })
  }

  const votedIds = useMemo(() => {
    if (!state) return new Set<string>()
    return new Set(state.currentRound.votedParticipantIds)
  }, [state])

  if (!nickname) return <NicknameModal onSubmit={join} />
  if (!state || !me) return <main style={{ padding: 24 }}>Connecting…</main>

  const isHost = state.hostId === me.id
  const canReveal =
    state.currentRound.status === 'voting' && votedIds.size > 0
  const revealedStats: RevealedStats | undefined =
    state.currentRound.status === 'revealed'
      ? {
          average: state.currentRound.average ?? null,
          min: state.currentRound.min ?? null,
          max: state.currentRound.max ?? null,
          consensus: state.currentRound.consensus ?? false,
        }
      : undefined

  return (
    <main style={{ maxWidth: 720, margin: '24px auto', padding: 16 }}>
      <header
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <strong>Room: {state.code}</strong>
        <button onClick={copyLink} style={{ cursor: 'pointer' }}>Copy link</button>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 12 }}>
          status: {state.currentRound.status}
        </span>
      </header>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: 8,
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <Table
        participants={state.participants}
        youId={me.id}
        status={state.currentRound.status}
        votedIds={votedIds}
        revealedVotes={
          state.currentRound.status === 'revealed'
            ? state.currentRound.votes
            : undefined
        }
        centerSlot={
          <TableCenter
            status={state.currentRound.status}
            isHost={isHost}
            canReveal={canReveal}
            stats={revealedStats}
            onReveal={() => socket.emit('round:reveal')}
            onReset={() => socket.emit('round:reset')}
          />
        }
      />

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 8, fontSize: 14, opacity: 0.7 }}>Your card:</div>
        <Deck
          value={myVote}
          onSelect={vote}
          disabled={state.currentRound.status !== 'voting'}
        />
      </div>

      <HistoryList rounds={state.history} />
    </main>
  )
}
