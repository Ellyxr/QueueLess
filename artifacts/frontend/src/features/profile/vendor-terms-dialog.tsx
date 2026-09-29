import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SCROLL_THRESHOLD_PX = 16;

export function VendorTermsDialog({
  open,
  onOpenChange,
  onAgree,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgree: () => void;
}) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const atBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight <=
      SCROLL_THRESHOLD_PX;
    if (atBottom) setScrolledToBottom(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setScrolledToBottom(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Student Vendor Terms &amp; Conditions</DialogTitle>
        </DialogHeader>
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="max-h-[55vh] space-y-4 overflow-y-auto rounded-md border border-border bg-secondary/20 p-4 text-sm text-muted-foreground"
        >
          <p>
            These Terms and Conditions ("Terms") govern participation in the QueueLess
            Student Vendor program ("Program"). By checking the agreement box and
            submitting a Student Vendor application, you ("Vendor") agree to be bound
            by these Terms in full.
          </p>

          <div>
            <p className="font-semibold text-foreground">1. Nature of the Program</p>
            <p>
              QueueLess is a campus marketplace platform that connects students with
              informal, student-run stalls. QueueLess is not a business registration
              authority, does not issue or verify BIR permits, mayor's permits, or any
              other government business documentation, and does not represent that any
              Student Vendor is a legally registered business. Vendors acknowledge that
              they are operating an informal campus stall and are solely responsible for
              their own compliance with any applicable school, local, or national
              regulations.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">2. Prohibited Items</p>
            <p>
              Vendors must not list, advertise, sell, or distribute through QueueLess any
              of the following: alcohol, tobacco or tobacco products, vapes or
              e-cigarettes and related paraphernalia, illegal drugs or controlled
              substances, weapons, counterfeit goods, stolen goods, or any item
              prohibited under Philippine law or the host institution's student code of
              conduct. Violation of this section is grounds for immediate suspension of
              the Vendor's account and forfeiture of the current subscription period
              without refund.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">3. Identity and Bank Verification</p>
            <p>
              Vendors must submit one valid government or school-issued ID, a photo of
              themselves holding that same ID, and bank account details (account number
              and account holder name) for subscription billing. Vendors represent that
              all submitted information is accurate, current, and belongs to them. Bank
              account details will be used exclusively to process the subscription fee
              tied to the plan selected at application time. Submitting falsified
              identification or bank details is grounds for permanent removal from the
              Program.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">4. Application, Verification, and Contract</p>
            <p>
              Submitting an application does not guarantee approval. QueueLess
              administrators will review submitted documents and may approve, reject, or
              request additional information. Upon approval, the Vendor will receive a
              physical contract that must be printed, completed in wet ink, signed, and
              uploaded as a scanned document within seven (7) calendar days of receipt.
              Failure to return the signed contract within this period will result in
              automatic cancellation of the application. The subscription fee is
              deducted from the Vendor's designated bank account only after the Vendor
              has been approved, identity-verified, and the signed contract has been
              received and accepted by QueueLess.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">5. Subscription Fees and Renewal</p>
            <p>
              The subscription fee keeps the Vendor's storefront active on QueueLess and
              funds the platform's ongoing operation, including payment processing,
              order queuing, and customer support infrastructure. Fees are billed in
              advance for the selected term (1 month, 6 months, or 1 year) and are
              non-refundable once the term has begun, except where required by law.
              Promotional terms (such as the 6-month or 1-year bundles) are valid only
              for the initial term purchased and do not automatically apply to
              subsequent renewals unless the same promotion is active at the time of
              renewal.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">6. No Guarantee of Sales or Legal Standing</p>
            <p>
              QueueLess makes no warranty regarding sales volume, foot traffic, or
              profitability for any Student Vendor. QueueLess's role is limited to
              providing a discovery and ordering platform so students have more options
              to browse; QueueLess is not a party to, and assumes no liability for, any
              transaction, food safety issue, allergic reaction, or dispute between a
              Vendor and a buyer. Vendors agree to indemnify and hold QueueLess harmless
              from any claim arising out of the Vendor's products or conduct.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">7. Suspension and Termination</p>
            <p>
              QueueLess reserves the right to suspend or terminate a Student Vendor's
              account at any time for violation of these Terms, the sale of prohibited
              items, fraudulent identity or bank information, repeated buyer complaints,
              or any conduct that QueueLess reasonably determines to be harmful to the
              marketplace or its users. Suspended or terminated Vendors are not entitled
              to a refund of any unused portion of their subscription.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">8. Acknowledgment</p>
            <p>
              By checking "I agree to the Terms and Conditions" and submitting a Student
              Vendor application, you confirm that you have read, understood, and agree
              to be bound by all sections of these Terms.
            </p>
          </div>
        </div>
        {!scrolledToBottom && (
          <p className="text-center text-xs text-muted-foreground">
            Scroll to the bottom to enable the agree button.
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            className="w-full rounded-full sm:w-auto"
            disabled={!scrolledToBottom}
            onClick={() => {
              onAgree();
              onOpenChange(false);
            }}
          >
            I agree to the Terms and Conditions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
