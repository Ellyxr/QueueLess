/*
  Warnings:

  - A unique constraint covering the columns `[fullName]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "users_fullName_key" ON "users"("fullName");
