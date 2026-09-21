import { Checkbox } from "@/components/ui/checkbox";

export function PasabuyTerms({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
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
        <span>I agree to the Pasabuy Terms &amp; Conditions.</span>
      </label>
    </div>
  );
}
