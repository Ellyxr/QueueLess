import { useState } from "react";
import { CreditCard, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePaymentMethod, type SavedPaymentMethodType } from "@/features/payments/payment-method";

interface PaymentMethodFormProps {
  onSaved: () => void;
  onCancel?: () => void;
}

const METHODS: { id: SavedPaymentMethodType; label: string; icon: typeof CreditCard }[] = [
  { id: "card", label: "Card", icon: CreditCard },
  { id: "gcash", label: "GCash", icon: Smartphone },
  { id: "grab_pay", label: "GrabPay", icon: Wallet },
];

export function PaymentMethodForm({ onSaved, onCancel }: PaymentMethodFormProps) {
  const [type, setType] = useState<SavedPaymentMethodType>("card");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [handle, setHandle] = useState("");

  const canSave =
    type === "card"
      ? cardNumber.replace(/\s/g, "").length >= 12 && expiry.length >= 4 && cvc.length >= 3
      : handle.trim().length >= 7;

  const handleSave = () => {
    if (!canSave) return;

    if (type === "card") {
      const digits = cardNumber.replace(/\s/g, "");
      const last4 = digits.slice(-4);
      const brand = digits.startsWith("4") ? "Visa" : digits.startsWith("5") ? "Mastercard" : "Card";
      savePaymentMethod({
        type: "card",
        label: `${brand} •••• ${last4}`,
        last4,
        expiry,
      });
    } else {
      savePaymentMethod({
        type,
        label: `${type === "gcash" ? "GCash" : "GrabPay"} • ${handle}`,
        accountHandle: handle,
      });
    }

    onSaved();
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-xs font-semibold transition-colors ${
              type === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>

      {type === "card" ? (
        <div className="mt-4 space-y-3">
          <input
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value)}
            placeholder="Card number (e.g. 4343 4343 4343 4345)"
            inputMode="numeric"
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <div className="flex gap-3">
            <input
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              placeholder="MM/YY"
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <input
              value={cvc}
              onChange={(event) => setCvc(event.target.value)}
              placeholder="CVC"
              inputMode="numeric"
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            PayMongo Sandbox — no real charge will ever be made with this card.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder={type === "gcash" ? "GCash mobile number" : "GrabPay mobile number"}
            inputMode="tel"
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <p className="text-[11px] text-muted-foreground">
            PayMongo Sandbox — this links a mock {type === "gcash" ? "GCash" : "GrabPay"} account.
          </p>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" className="w-full rounded-full" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" className="w-full rounded-full" disabled={!canSave} onClick={handleSave}>
          Save payment method
        </Button>
      </div>
    </div>
  );
}
