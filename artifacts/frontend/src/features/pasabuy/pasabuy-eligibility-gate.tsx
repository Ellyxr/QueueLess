import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasabuyTerms } from "./pasabuy-terms";
import { acceptPasabuyTerms, getTermsAccepted, isEligibleToDeliver } from "./pasabuy-eligibility";
import { getPasabuyProfile, type PasabuyProfileResponse } from "./pasabuy-api";

/**
 * Gate shown before a student can accept a Pasabuy request. Fetches the real
 * profile from `GET /pasabuy/profile` — `studentIdVerified` only becomes true
 * once an admin has reviewed the uploaded photo, there's no client-side
 * shortcut anymore.
 */
export function PasabuyEligibilityGate({ onEligible }: { onEligible: (verified: boolean) => void }) {
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => getTermsAccepted());
  const [profile, setProfile] = useState<PasabuyProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPasabuyProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your Pasabuy profile.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking your Pasabuy eligibility...</span>
      </div>
    );
  }

  const eligible = isEligibleToDeliver(profile, termsAccepted);

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
          {!profile?.studentIdVerified && (
            <p className="mt-1 text-xs">
              {profile?.profile?.photoSubmitted
                ? "Your student ID is awaiting admin verification."
                : "A verified student ID is required."}
            </p>
          )}
          {!termsAccepted && (
            <p className="mt-1 text-xs">Accept the Pasabuy Terms &amp; Conditions to continue.</p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {!profile?.studentIdVerified && (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href="/profile#student-id">Complete Profile</Link>
          </Button>
        )}
        {!termsAccepted && (
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
                setTermsAccepted(true);
                setIsTermsOpen(false);
                onEligible(isEligibleToDeliver(profile, true));
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
