# Fee assessments (US-044)

`PricingService` calculates all new order markup and Pasabuy fee quotes. The
marketplace rate comes from `MARKETPLACE_FEE_RATE` (a percent from 0 to 100,
with at most six decimal places). Order fee = subtotal × rate / 100, rounded
half up to two decimal places. Both individual and group orders persist the
subtotal, fee, and total from this calculation.

Pasabuy charges a fixed PHP 30 for an in-campus dropoff and PHP 50 otherwise;
the campus bounds and 270-meter distance guard are checked during request
creation. The fee is only charged after a deliverer accepts and the requester
starts a separate checkout. A cart `calculate` request with
`isPasabuyRequest=true` returns the two fee options, but its food checkout
total excludes the future Pasabuy fee. `pasabuyDeliveryFee: "0.00"` means
none is charged during food checkout.

The `fee_assessments` table captures one immutable snapshot per order and one
per Pasabuy request in the same transaction that creates the parent. It records
the assessed amount, basis and percentage for marketplace markup, or campus
tier and delivery distance for Pasabuy, along with rule version and timestamps.
An assessment records the quoted fee, **not** payment success: payment status
and refunds live on `Payment` and `Refund`. The migration backfills existing
amounts with `LEGACY_*_SNAPSHOT` rule versions and an unknown rate so it does
not falsely claim which configuration produced historical fees.
