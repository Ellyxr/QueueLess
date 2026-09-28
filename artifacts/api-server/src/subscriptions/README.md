# Vendor subscriptions (US-042)

`GET /api/v1/subscriptions/plans` lists plans. An administrator can create a
plan with `POST /api/v1/subscriptions/plans` (`name`, PHP `price` >= 1.00,
`durationDays` from 1 to 365, optional `benefitsDescription`). No plan or
price is seeded; administrators must configure the actual product offering.

An active vendor owner can `POST /api/v1/subscriptions` with a `planId`.
The server reserves a `PENDING` subscription and a linked `PENDING` payment,
then creates a PayMongo Sandbox checkout. `POST /api/v1/subscriptions/:id/checkout`
reuses the same checkout after a retry. `GET /api/v1/subscriptions/mine`
returns recent subscriptions and linked payment statuses to their owner.
Buyer accounts and nonowners cannot subscribe. A database index prevents
more than one pending or active subscription for a vendor.

Only a verified paid PayMongo webhook activates a subscription. Its start
and end dates are set when payment is confirmed. Pending checkout sessions
are expired after 30 minutes; active plans become `EXPIRED` at their end date.
A late payment on a cancelled pending subscription is automatically refunded.
Provider confirmation, not a checkout redirect, grants paid status. The
expiry sweep runs every minute; plan duration is measured in 24-hour days.

The two migrations are ordered deliberately: PostgreSQL commits the new
`PENDING` enum value before the next migration uses it as the default and in
the partial unique index. Before migration, check for vendors with more than
one existing `ACTIVE` subscription or payments linked more than once to the
same subscription; resolve conflicting old rows before deploying.
