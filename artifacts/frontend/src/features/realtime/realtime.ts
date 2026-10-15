import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { AUTH_STATE_CHANGED_EVENT } from "@/features/auth/api";

/** Server events the UI reacts to; "realtime.ready" fires on every (re)connect so listeners can reconcile. */
export type RealtimeEvent =
  | "realtime.ready"
  | "order.created"
  | "order.status.updated"
  | "preorder.created"
  | "preorder.released"
  | "preorder.updated";

const ALL_EVENTS: RealtimeEvent[] = [
  "realtime.ready",
  "order.created",
  "order.status.updated",
  "preorder.created",
  "preorder.released",
  "preorder.updated",
];

type Listener = (event: RealtimeEvent, payload: any) => void;

const listeners = new Set<Listener>();
let socket: Socket | null = null;

// The socket lives at the server origin (not under /api/v1). When the API base
// is absolute (separate API host) use its origin; otherwise the page's own
// origin, which the dev server / reverse proxy forwards to the API.
function getRealtimeUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const origin = base && /^https?:\/\//.test(base) ? new URL(base).origin : window.location.origin;
  return `${origin}/realtime`;
}

function connect() {
  const token = localStorage.getItem("token");
  if (!token) return;
  socket = io(getRealtimeUrl(), {
    auth: { token },
    transports: ["websocket", "polling"],
  });
  for (const event of ALL_EVENTS) {
    socket.on(event, (payload: unknown) => listeners.forEach((listener) => listener(event, payload)));
  }
}

function disconnect() {
  socket?.disconnect();
  socket = null;
}

// Reconnect with the new token whenever the signed-in user changes.
if (typeof window !== "undefined") {
  window.addEventListener(AUTH_STATE_CHANGED_EVENT, () => {
    disconnect();
    if (listeners.size > 0) connect();
  });
}

/** Shares one socket connection across all subscribers; it closes when the last one leaves. */
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!socket) connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  };
}

/**
 * Calls `handler` for the given realtime events. Polling should stay in place
 * as a fallback: this only makes updates arrive sooner.
 */
export function useRealtimeEvents(
  events: RealtimeEvent[],
  handler: (event: RealtimeEvent, payload: any) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const eventsKey = events.join(",");

  useEffect(() => {
    const wanted = new Set(eventsKey.split(",") as RealtimeEvent[]);
    return subscribe((event, payload) => {
      if (wanted.has(event)) handlerRef.current(event, payload);
    });
  }, [eventsKey]);
}
