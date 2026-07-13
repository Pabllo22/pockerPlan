'use client'
import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from './types'

type SC = Socket<ServerToClientEvents, ClientToServerEvents>

let singleton: SC | null = null

export function getSocket(): SC {
  if (!singleton) {
    singleton = io({ autoConnect: true, transports: ['websocket'] })
  }
  return singleton
}

export function useSocket(): SC {
  const [sock] = useState<SC>(() => getSocket())
  useEffect(() => {
    if (!sock.connected) sock.connect()
  }, [sock])
  return sock
}
