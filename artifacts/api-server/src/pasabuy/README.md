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
