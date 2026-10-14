import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

// Attaches Socket.IO to the same HTTP server (and therefore the same Render
// PORT) as the REST API, and applies the same CORS allow-list instead of the
// gateway's permissive default.
export class RenderSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      // Render's proxy supports WebSockets; polling remains as a fallback.
      transports: ['websocket', 'polling'],
      // Keep the connection alive through Render's idle timeouts.
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });
  }
}
