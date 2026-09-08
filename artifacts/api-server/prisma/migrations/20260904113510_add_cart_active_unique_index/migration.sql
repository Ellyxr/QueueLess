CREATE UNIQUE INDEX carts_userid_vendorid_active_key
ON carts ("userId", "vendorId")
WHERE status = 'ACTIVE';