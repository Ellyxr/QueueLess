CREATE UNIQUE INDEX "role_assignments_active_user_role_key"
ON "role_assignments" ("userId", "role")
WHERE "revokedAt" IS NULL;