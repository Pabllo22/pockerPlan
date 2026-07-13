import { describe, it, expect } from 'vitest'
import { DECK, isNumericCard } from '@/lib/deck'

describe('deck', () => {
  it('содержит ровно 10 карт в фибоначчи-порядке + ? и ☕', () => {
    expect(DECK).toEqual([0, 1, 2, 3, 5, 8, 13, 21, '?', '☕'])
  })

  it('isNumericCard истинен только для чисел', () => {
    expect(isNumericCard(0)).toBe(true)
    expect(isNumericCard(21)).toBe(true)
    expect(isNumericCard('?')).toBe(false)
    expect(isNumericCard('☕')).toBe(false)
  })
})
