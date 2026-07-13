import type { RoundSummary } from './types'

const HEADER = '#,finishedAt,average,min,max,consensus,votes'

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function roundsToCsv(rounds: RoundSummary[]): string {
  const lines = [HEADER]
  rounds.forEach((r, idx) => {
    const votes = r.votes.map(v => `${v.nickname}=${v.value}`).join(';')
    lines.push([
      String(idx + 1),
      new Date(r.finishedAt).toISOString(),
      r.stats.average ?? '',
      r.stats.min ?? '',
      r.stats.max ?? '',
      r.stats.consensus,
      csvField(votes),
    ].join(','))
  })
  return lines.join('\n')
}
