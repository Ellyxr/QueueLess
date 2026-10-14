// Minimal Socket.IO (Engine.IO v4) client over Node's built-in WebSocket, used
// by the smoke test to listen on /realtime exactly like the browser does,
// without adding socket.io-client to the lockfile.
//
// Wire format (namespace "/realtime"):
//   server "0{...}"                -> engine open; client sends "40/realtime,{auth}"
//   server "2" / client "3"        -> ping / pong
//   server "40/realtime,{...}"     -> namespace connected
//   server "42/realtime,[ev,data]" -> event
//   server "41/realtime,"          -> disconnected by server (e.g. bad token)
//   server "44/realtime,{...}"     -> connect error

/* eslint-disable @typescript-eslint/no-explicit-any -- event payloads are untyped JSON */

export interface ReceivedEvent {
  event: string;
  data: unknown;
  at: number;
}

const NAMESPACE = '/realtime';

export class RealtimeProbe {
  readonly events: ReceivedEvent[] = [];
  private socket: WebSocket | null = null;
  private closedReason: string | null = null;
  private listeners: Array<() => void> = [];

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    readonly label: string,
  ) {}

  // Resolves once the server has authenticated the socket and sent
  // realtime.ready; rejects if the server disconnects it or times out.
  async connect(timeoutMs = 15_000): Promise<void> {
    const url = `${this.baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('message', (message) => this.onMessage(String(message.data)));
    socket.addEventListener('close', () => {
      this.closedReason ??= 'transport closed';
      this.notify();
    });
    socket.addEventListener('error', () => {
      this.closedReason ??= 'transport error';
      this.notify();
    });

    await this.waitUntil(
      () => this.has('realtime.ready'),
      timeoutMs,
      `${this.label}: realtime.ready`,
    );
  }

  isDisconnected() {
    return this.closedReason !== null;
  }

  disconnectReason() {
    return this.closedReason;
  }

  has(event: string, predicate: (data: any) => boolean = () => true) {
    return this.events.some((e) => e.event === event && predicate(e.data));
  }

  find(event: string, predicate: (data: any) => boolean = () => true) {
    return this.events.filter((e) => e.event === event && predicate(e.data));
  }

  async waitFor(event: string, predicate: (data: any) => boolean, timeoutMs = 15_000) {
    await this.waitUntil(() => this.has(event, predicate), timeoutMs, `${this.label}: ${event}`);
    return this.find(event, predicate)[0].data as any;
  }

  close() {
    this.socket?.close();
  }

  private onMessage(raw: string) {
    if (raw.startsWith('0')) {
      this.socket?.send(`40${NAMESPACE},${JSON.stringify({ token: this.token })}`);
    } else if (raw === '2') {
      this.socket?.send('3');
    } else if (raw.startsWith(`41${NAMESPACE}`)) {
      this.closedReason = 'io server disconnect';
    } else if (raw.startsWith(`44${NAMESPACE}`)) {
      this.closedReason = `connect error: ${raw.slice(NAMESPACE.length + 3)}`;
    } else if (raw.startsWith(`42${NAMESPACE},`)) {
      const body = raw.slice(raw.indexOf('['));
      const [event, data] = JSON.parse(body) as [string, unknown];
      this.events.push({ event, data, at: Date.now() });
    }
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners.splice(0)) listener();
  }

  private waitUntil(condition: () => boolean, timeoutMs: number, what: string) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), timeoutMs);
      const check = () => {
        if (condition()) {
          clearTimeout(timer);
          resolve();
        } else if (this.closedReason) {
          clearTimeout(timer);
          reject(new Error(`${what}: disconnected (${this.closedReason})`));
        } else {
          this.listeners.push(check);
        }
      };
      check();
    });
  }
}
