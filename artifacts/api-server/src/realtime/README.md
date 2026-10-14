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

# Order ready buzzer (`order.ready`, US-067)

Sent when a vendor moves an order to `READY_FOR_PICKUP`, after the change has
committed. Use it to play the pickup buzzer.

```json
{
  "eventId": "status-history uuid",
  "orderId": "uuid",
  "orderReference": "A1B2C3D4",
  "status": "READY_FOR_PICKUP",
  "readyAt": "2026-10-15T08:00:00.000Z",
  "vendor": { "id": "uuid", "name": "Kuya Grill", "pickupLocation": "Canteen B" }
}
```

Recipients (each user's own `user:<id>` room only):

- Normal order: the customer and `JOINED` group-order participants.
- Pasabuy order: only the assigned fulfiller, who collects it. The requester
  still gets `order.status.updated`.
- Never the vendor or any other user.

Nothing is sent if the order already moved on (completed or cancelled) or the
transaction rolled back. A concurrent conflicting update returns `409` and
publishes nothing. `order.status.updated` is still sent as before.

Client notes: ring once per `eventId` (the same event reaches every open tab of
that user). Events missed while disconnected are not replayed; after
`realtime.ready`, refetch `GET /api/v1/orders/mine` and treat
`READY_FOR_PICKUP` orders as ready.
