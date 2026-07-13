import type { CardValue, NumericCard } from './types'
import { NUMERIC_CARDS, SPECIAL_CARDS } from './types'

export const DECK: readonly CardValue[] = [...NUMERIC_CARDS, ...SPECIAL_CARDS]

export function isNumericCard(value: CardValue): value is NumericCard {
  return typeof value === 'number'
}
