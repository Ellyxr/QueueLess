# Reconnect and state recovery

The `/realtime` gateway checks the JWT and user on every connection.
After the client joins its user room, the server emits `realtime.ready`.
This happens on initial connection and after a successful reconnect.

After reconnect, fetch authoritative state with the bearer token:

- Vendor owner: `GET /api/v1/orders/vendor/queue`
- Buyer list: `GET /api/v1/orders/mine`
- Buyer or joined group participant viewing an order:
  `GET /api/v1/orders/:orderId/status`

The client replaces displayed state with the API response.
An unauthorized connection receives no `realtime.ready`.
