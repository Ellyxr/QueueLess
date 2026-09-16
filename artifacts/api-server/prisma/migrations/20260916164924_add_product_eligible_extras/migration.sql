-- CreateTable
CREATE TABLE "_ProductEligibleExtras" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ProductEligibleExtras_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProductEligibleExtras_B_index" ON "_ProductEligibleExtras"("B");

-- AddForeignKey
ALTER TABLE "_ProductEligibleExtras" ADD CONSTRAINT "_ProductEligibleExtras_A_fkey" FOREIGN KEY ("A") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductEligibleExtras" ADD CONSTRAINT "_ProductEligibleExtras_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
