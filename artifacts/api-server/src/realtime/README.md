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
that user). Events missed while disconnected are not replayed; recover them as
described below.

# Buzzer recovery and dedupe (US-068)

`eventId` is the id of the order's `READY_FOR_PICKUP` status-history entry. The
same id is exposed by the REST API, so socket and REST events dedupe with one key.

`GET /api/v1/orders/ready-for-pickup` (BUYER): every order currently
`READY_FOR_PICKUP` that this user collects. Same recipients as `order.ready`
(own orders, joined group orders, Pasabuy orders they fulfil). Each item has
the `order.ready` payload shape plus `pickupRole`
(`CUSTOMER` | `GROUP_MEMBER` | `PASABUY_FULFILLER`):

```json
{
  "serverTime": "2026-10-15T08:05:00.000Z",
  "orders": [
    { "eventId": "...", "orderId": "...", "orderReference": "A1B2C3D4",
      "status": "READY_FOR_PICKUP", "readyAt": "2026-10-15T08:00:00.000Z",
      "vendor": { "id": "...", "name": "...", "pickupLocation": "..." },
      "pickupRole": "CUSTOMER" }
  ]
}
```

Ready fields on the existing order responses (`null` until the order has been
ready; kept after it is completed):

- `GET /orders/mine` items, `GET /orders/:id/status`, `GET /orders/:id`:
  `readyAt`, `readyEventId`. (`eventId` on `GET /orders/:id` is the campus
  event, not the ready event.)

Client flow:

1. On `order.ready`: if `eventId` is not in the seen set, ring and add it.
2. On every `realtime.ready` (connect and reconnect): call
   `/orders/ready-for-pickup`, show the alert for each order, and ring only for
   unseen `eventId`s. Use `serverTime - readyAt` to decide whether a missed
   event is too old to ring for.
3. Keep the seen set in `localStorage` so reloads and other tabs do not ring
   again; an order that leaves `READY_FOR_PICKUP` drops out of the list.
