import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TERMS: Array<{ title: string; body: string }> = [
  {
    title: "1. What Pasabuy is",
    body: "Pasabuy lets a verified NU Laguna student pick up your already-paid QueueLess order from the vendor and deliver it to you. QueueLess connects students; it does not employ deliverers.",
  },
  {
    title: "2. Fees",
    body: "Your food is paid when you place the order. A separate Pasabuy fee applies only after a deliverer accepts: ₱30 for in-campus delivery and ₱50 for outside-campus delivery. You are not charged when you submit a request, and the fee is not charged if nobody accepts.",
  },
  {
    title: "3. Delivery location",
    body: "Deliveries within 270 metres of the vendor are recommended. You may choose a farther location after confirming the warning, but deliverers may decline it and delays are more likely. You must give an accurate location and be reachable there.",
  },
  {
    title: "4. Deliverers",
    body: "Only students with an admin-verified student ID can deliver. Deliverers must hand over the exact order and may not open, swap, or keep any part of it. Pickup is released to the deliverer only after the vendor verifies their pickup code.",
  },
  {
    title: "5. Cancellations and problems",
    body: "A request expires if no deliverer accepts in time. Once accepted, either side can cancel with a reason, and repeated cancellations may limit your access. Report missing or wrong items through the report option so an admin can review.",
  },
  {
    title: "6. Misuse",
    body: "Theft, fraud, fake locations, harassment, or other violations may result in account restrictions and/or appropriate legal action where applicable.",
  },
];

export function PasabuyTerms({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2 rounded-2xl border border-border/80 bg-secondary/30 p-3">
      <p className="text-xs leading-5 text-muted-foreground">
        Misuse of Pasabuy, including theft, fraud, or other violations, may result in
        account restrictions and/or appropriate legal action where applicable.
      </p>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={accepted}
          onCheckedChange={(checked) => onAcceptedChange(checked === true)}
          className="mt-0.5"
        />
        <span>
          I agree to the Pasabuy{" "}
          <button
            type="button"
            className="font-semibold text-primary underline underline-offset-2"
            onClick={(event) => {
              event.preventDefault();
              setIsOpen(true);
            }}
          >
            Terms &amp; Conditions
          </button>
          .
        </span>
      </label>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pasabuy Terms &amp; Conditions</DialogTitle>
            <DialogDescription>Please read before requesting or accepting a Pasabuy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {TERMS.map((section) => (
              <div key={section.title}>
                <p className="text-sm font-semibold text-foreground">{section.title}</p>
                <p className="text-xs leading-5 text-muted-foreground">{section.body}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
