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
