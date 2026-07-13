export type RoomStatus = 'voting' | 'revealed'

export const NUMERIC_CARDS = [0, 1, 2, 3, 5, 8, 13, 21] as const
export const SPECIAL_CARDS = ['?', '☕'] as const
export type NumericCard = typeof NUMERIC_CARDS[number]
export type SpecialCard = typeof SPECIAL_CARDS[number]
export type CardValue = NumericCard | SpecialCard

export interface Participant {
  id: string
  nickname: string
  isHost: boolean
  joinedAt: number
}

export interface Vote {
  participantId: string
  value: CardValue
}

export interface RevealedStats {
  average: number | null
  min: number | null
  max: number | null
  consensus: boolean
}

export interface Round {
  id: string
  startedAt: number
  status: RoomStatus
  votes: Map<string, Vote>
  revealedAt?: number
  stats?: RevealedStats
}

export interface RoundSummary {
  id: string
  finishedAt: number
  stats: RevealedStats
  votes: { nickname: string; value: CardValue }[]
}

export interface Room {
  code: string
  createdAt: number
  lastActivityAt: number
  hostId: string
  participants: Map<string, Participant>
  currentRound: Round
  history: RoundSummary[]
}

export interface PublicRound {
  id: string
  status: RoomStatus
  votedParticipantIds: string[]
  votes?: Vote[]
  average?: number | null
  min?: number | null
  max?: number | null
  consensus?: boolean
}

export interface PublicRoomState {
  code: string
  hostId: string
  participants: Participant[]
  currentRound: PublicRound
  history: RoundSummary[]
}

export interface JoinAckOk {
  ok: true
  you: Participant
  room: PublicRoomState
}
export interface JoinAckErr {
  ok: false
  error: string
}

export interface ClientToServerEvents {
  'room:join': (
    payload: { roomCode: string; nickname: string },
    ack: (result: JoinAckOk | JoinAckErr) => void,
  ) => void
  'vote:cast': (payload: { value: CardValue | null }) => void
  'round:reveal': () => void
  'round:reset': () => void
}

export interface ServerToClientEvents {
  'room:participant_joined': (payload: { participant: Participant }) => void
  'room:participant_left': (payload: { participantId: string; newHostId?: string }) => void
  'round:vote_updated': (payload: { participantId: string; hasVoted: boolean }) => void
  'round:revealed': (
    payload: { votes: Vote[] } & RevealedStats,
  ) => void
  'round:reset': (payload: { newRound: PublicRound; history: RoundSummary[] }) => void
  'room:error': (payload: { code: string; message: string }) => void
}
