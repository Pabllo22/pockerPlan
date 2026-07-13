import { describe, it, expect } from 'vitest'
import { roundsToCsv } from '@/lib/csv'
import type { RoundSummary } from '@/lib/types'

describe('roundsToCsv', () => {
  it('форматирует историю в CSV с заголовком', () => {
    const rounds: RoundSummary[] = [
      {
        id: 'r1',
        finishedAt: 1700000000000,
        stats: { average: 5, min: 3, max: 8, consensus: false },
        votes: [
          { nickname: 'Alice', value: 3 },
          { nickname: 'Bob', value: 8 },
        ],
      },
    ]
    const csv = roundsToCsv(rounds)
    expect(csv.split('\n')[0]).toBe('#,finishedAt,average,min,max,consensus,votes')
    expect(csv).toContain('1,')
    expect(csv).toContain('Alice=3;Bob=8')
    expect(csv).toContain('5,3,8,false')
  })

  it('никнеймы с запятой берутся в кавычки', () => {
    const rounds: RoundSummary[] = [{
      id: 'r1',
      finishedAt: 0,
      stats: { average: null, min: null, max: null, consensus: false },
      votes: [{ nickname: 'A, B', value: '?' }],
    }]
    expect(roundsToCsv(rounds)).toContain('"A, B=?"')
  })
})
