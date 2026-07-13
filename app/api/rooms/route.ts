import { NextResponse } from 'next/server'
import type { RoomStore } from '@/lib/room'

export async function POST() {
  const store = (globalThis as unknown as { __roomStore?: RoomStore }).__roomStore
  if (!store) {
    return NextResponse.json({ error: 'store_not_ready' }, { status: 503 })
  }
  const room = store.reserveRoom(Date.now())
  return NextResponse.json({ code: room.code }, { status: 201 })
}
