AvrilMatanguihan, Mashoge

## TopicHeader

if meron kayo gusto pagawa, pede nio sia lagay o iparoute di2. Ireference lang ung needed na folder o file/feature at CONTRIBUTING.md

Pindutin niu close issue para maacknowledge :33

exampol,

1. **No dedicated vendor contact number field.** `Vendor` (schema.prisma) has no `contactNumber`/`businessPhone` column. Reusing the owner's personal `User.phone` is a stopgap — a vendor with multiple staff or a different public-facing number has no way to set one. Suggested fix: add `contactNumber String?` to `Vendor`, expose it in `UpdateVendorDto` / `GET /vendors/mine`, and let the frontend collect it in the storefront settings form. parecheck kung ganun nga

2. **No slug for public storefront URLs.** The storefront URL embedded in the QR code is `/store/<uuid>`, which is not human-friendly and can't be printed/read confidently off a flyer. Consider adding a unique `slug` field to `Vendor` and resolving `/store/:slug` server-side, falling back to UUID for existing vendors without one.

3. @mashoge: **No persisted product images.** `VendorProduct` (frontend type) and the `Product` model have no image field wired end-to-end — the vendor dashboard's product form stores an image locally in the browser only (see `vendor.tsx`, `Product.image`), and it is never sent to the backend. The promotion page's "Featured items" preview therefore falls back to a static placeholder image for every product. If real product photos are wanted on the flyer, `Product` needs an `imageUrl` column plus upload support (e.g. object storage + `imageUrl` in `ProductInput`).

4. @AvrilMatanguihan: **Duplicate payment risk in `createCheckout`.** The check for an existing `paymentShare.paymentId` happens outside the `$transaction`, so two requests at nearly the same time (double-click "Pay", a retry) can both think no payment exists yet and each create their own `Payment` row — the second one just overwrites the link, leaving an orphaned duplicate. Suggested fix: move that check inside the transaction (or use the same "conditional update, check the count" pattern already used in `confirmPickup` and `addGroupOrderItem`). I added a DB-level unique index on `Payment.providerPaymentId` as a safety net, but the actual duplicate-row cause is still open.