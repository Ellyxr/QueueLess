# US-034 request creation

First create and pay an individual food order. The authenticated buyer then
calls `POST /api/v1/pasabuy/requests` with `orderId`, `dropoffLocation`,
`dropoffLatitude`, `dropoffLongitude`, and `termsAccepted: true`.
The order creation flag `isPasabuyRequest: true` is rejected because it would
open a request before the food order is paid.

Configure `PASABUY_CAMPUS_BOUNDS=minLatitude,minLongitude,maxLatitude,maxLongitude`
for the campus boundary. A vendor owner or admin must configure
`pickupLocation`, `pickupLatitude`, and `pickupLongitude` with
`PATCH /api/v1/vendors/:vendorId`. The API calculates straight-line distance
from the vendor's pickup coordinates, rejects dropoffs beyond 270 meters,
and assigns PHP 30 within the campus rectangle or PHP 50 outside it. It saves
`PENDING` and `NOT_CHARGED`, terms acceptance, 15-minute expiry, and
initial status history atomically. A database index limits each order to
one active Pasabuy request.

The remaining browse, acceptance, payment, and realtime steps belong to
US-035 through US-038.

## US-035 available requests

`GET /api/v1/pasabuy/requests` requires an authenticated buyer with a
Pasabuy profile containing a student ID, matching the existing acceptance
eligibility check. It returns other buyers' unclaimed `PENDING` requests
whose request window is still open and whose food order is still eligible.
The listing includes the pickup point, item description, fee, distance,
expiry, and public vendor details. It does not return the requester identity,
dropoff location or coordinates, related order ID, or food order total.
Filtering expired requests does not itself update their stored status;
request creation records `EXPIRED` history when replacing an expired request.

## US-036 acceptance

`POST /api/v1/pasabuy/requests/:id/accept` requires a buyer with a completed
Pasabuy profile. The requester cannot accept their own request. Acceptance
requires an unclaimed `PENDING` request within its expiry window and a
linked food order that is still paid, cooking, or ready for pickup. A
conditional database update claims the request once; status history and
the requester notification are written in the same transaction. A second
claim receives `409` and creates no second acceptance history entry.

## US-037 payment and delivery

Acceptance starts a five-minute fee payment window (`AWAITING_PAYMENT`);
the requester calls `POST /api/v1/pasabuy/requests/:id/checkout` for a
PayMongo checkout charging only the previously calculated PHP 30 or PHP 50
convenience fee. Repeated calls reuse the same checkout. The fee remains
unpaid until a verified `checkout_session.payment.paid` webhook confirms the
matching payment and amount. `GET /api/v1/pasabuy/requests/:id` lets the
requester or assigned deliverer read its authoritative status, fee, payment,
deadline and history. A sweep expires the unpaid assignment after the
deadline, first closing any open provider checkout. Pickup requires `PAID`,
then follows `PICKED_UP` → `DELIVERED`; the requester confirms receipt with
`POST /api/v1/pasabuy/requests/:id/complete` to reach `COMPLETED`.

PayMongo's webhook must be configured to send
`checkout_session.payment.paid` to `/api/v1/payments/webhook` over HTTPS.

## US-038 realtime status notifications

After a successful database transaction, the `/realtime` Socket.IO gateway
emits `pasabuy.status.updated` to the requester and assigned deliverer's
authenticated user rooms. Its payload contains `requestId`, `status`,
`paymentStatus`, and `updatedAt`. It contains no requester identity, address,
pickup code, or payment details. The event is sent for creation, acceptance,
payment confirmation or failure, pickup, delivery, receipt confirmation, and
request or payment expiry. On payment expiry, the former deliverer also
receives the event after being unassigned.

Events are notifications. Clients should call
`GET /api/v1/pasabuy/requests/:id` for authoritative state after receiving
an event or `realtime.ready` on reconnect. An open request expiring without a
deliverer is persisted by a 30-second sweep before its event is sent.

## Issue #96 remaining backend flows

The requester or assigned deliverer can `POST /api/v1/pasabuy/requests/:id/cancel`
with a nonempty `reason` while the request is waiting or paid and before the
vendor verifies pickup. Unpaid checkout sessions are closed before cancellation;
paid cancellations create a refund request for the existing admin refund flow.
Participants can `POST /api/v1/pasabuy/requests/:id/report` with a
`description` after payment; this creates a linked Report and moves the request
to `DISPUTED`. Fully processed Pasabuy refunds update `paymentStatus` to
`REFUNDED` and notify participants.

The vendor owner can call `GET /api/v1/pasabuy/vendor/orders/:orderId` to see
the assigned deliverer and pickup code once the fee is paid. When the food
order is ready, the vendor verifies the six digit code with
`POST /api/v1/pasabuy/vendor/orders/:orderId/verify-pickup` and body
`{ "code": "123456" }`. Five failed attempts lock further verification.
Only after verification can the deliverer use the existing pickup endpoint.

A buyer submits a student ID number via `PUT /api/v1/pasabuy/profile` and a
photo using multipart field `photo` at `POST /api/v1/pasabuy/profile/student-id-photo`.
The photo is uploaded privately; the profile response exposes submission and
verification booleans, never its file path. Admins review private links using
`GET /api/v1/admin/pasabuy/student-ids`, may retrieve a fresh short-lived link
from `GET /api/v1/admin/pasabuy/student-ids/:userId/photo`, and approve or reject
via `PATCH /api/v1/admin/pasabuy/student-ids/:userId` with
`{ "decision": "APPROVE" }` or `REJECT`. Browsing and accepting requests require
an approved student ID photo. Existing profiles containing only an ID number
must submit a photo for review.

Individual order creation accepts an optional `isPreorder` boolean when the
vendor supports preorders. It is returned by order creation, customer history,
and order status; marked preorders cannot create Pasabuy requests. Customer
history now includes `isPasabuyRequest` and a short `orderReference`; order
status includes the vendor's `pickupLocation` separately from its name.
