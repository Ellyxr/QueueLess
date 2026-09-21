import { useState } from "react";
import { Link } from "wouter";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasabuyTerms } from "./pasabuy-terms";
import {
  acceptPasabuyTerms,
  getEligibility,
  isEligibleToDeliver,
} from "./pasabuy-eligibility";

/**
 * Gate shown before a student can accept a Pasabuy request. Reads mock
 * eligibility state (see pasabuy-eligibility.ts) — swap for real profile data
 * once the backend exposes a verification flag and terms-acceptance timestamp.
 * The student ID itself is submitted on the profile page's "Student ID" section.
 */
export function PasabuyEligibilityGate({ onEligible }: { onEligible: (verified: boolean) => void }) {
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const eligibility = getEligibility();
  const eligible = isEligibleToDeliver(eligibility);

  if (eligible) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>You're eligible to deliver Pasabuy orders.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2 text-sm text-amber-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">You're not ready to deliver Pasabuy orders.</p>
          {!eligibility.studentIdVerified && <p className="mt-1 text-xs">Student ID required.</p>}
          {!eligibility.termsAccepted && (
            <p className="mt-1 text-xs">Accept the Pasabuy Terms &amp; Conditions to continue.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!eligibility.studentIdVerified && (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href="/profile#student-id">Complete Profile</Link>
          </Button>
        )}
        {!eligibility.termsAccepted && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setIsTermsOpen(true)}
          >
            View Pasabuy Terms
          </Button>
        )}
      </div>

      <Dialog open={isTermsOpen} onOpenChange={setIsTermsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pasabuy Terms &amp; Conditions</DialogTitle>
          </DialogHeader>
          <PasabuyTerms accepted={termsChecked} onAcceptedChange={setTermsChecked} />
          <DialogFooter>
            <Button
              className="rounded-full"
              disabled={!termsChecked}
              onClick={() => {
                acceptPasabuyTerms();
                setIsTermsOpen(false);
                onEligible(isEligibleToDeliver(getEligibility()));
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
