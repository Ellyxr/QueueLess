# QueueLess API + Socket.IO on Render (US-051)

The NestJS REST API and the Socket.IO realtime server run in **one** Render Web
Service at `https://queueless-bg1x.onrender.com`. They share one process, one
HTTP server and Render's `PORT`.

| What        | URL                                                      |
| ----------- | -------------------------------------------------------- |
| REST API    | `https://queueless-bg1x.onrender.com/api/v1`             |
| Swagger     | `https://queueless-bg1x.onrender.com/api/v1/docs`        |
| Health      | `https://queueless-bg1x.onrender.com/api/v1/health`      |
| DB check    | `https://queueless-bg1x.onrender.com/api/v1/health/ready`|
| Socket.IO   | `https://queueless-bg1x.onrender.com/realtime` (path `/socket.io`) |

## Configure the existing Web Service (dashboard)

`render.yaml` documents the setup, but a service created in the dashboard is
not changed by it. In the Web Service's **Settings**:

- **Root Directory:** blank
- **Runtime:** Node
- **Build Command:**
  `pnpm install --frozen-lockfile --prod=false && pnpm --dir artifacts/api-server build:render`
- **Start Command:** `pnpm --dir artifacts/api-server start:render`
- **Health Check Path:** `/api/v1/health`

In **Environment**, set `NODE_VERSION=24.19.0`, `NODE_ENV=production`,
`CORS_ORIGIN=https://queueless-static.onrender.com`, plus `DATABASE_URL`,
`DIRECT_URL`, `JWT_SECRET` and the PayMongo/ImageKit keys from
`artifacts/api-server/.env.example`. Do **not** set `PORT`; Render provides it.

In production the API refuses to start without `DATABASE_URL`, `JWT_SECRET`
and `CORS_ORIGIN`. `start:render` runs `prisma migrate deploy` before starting.

## Connect from the frontend

```ts
import { io } from "socket.io-client";

const socket = io("https://queueless-bg1x.onrender.com/realtime", {
  auth: { token: accessToken },
  transports: ["websocket", "polling"],
});
socket.on("realtime.ready", () => { /* refetch missed data */ });
```

## Verify

- `curl https://queueless-bg1x.onrender.com/api/v1/health` returns `{"status":"ok",...}`.
- `/api/v1/health/ready` returns `"database":"ok"`.
- Logs show `QueueLess API + Socket.IO listening on 0.0.0.0:10000 (production)`.
- From `https://queueless-static.onrender.com`, the browser Network tab shows a
  `101 Switching Protocols` request to `/socket.io/?EIO=4&transport=websocket`.
- An unlisted origin gets no `Access-Control-Allow-Origin` header for REST or
  Socket.IO polling requests.
