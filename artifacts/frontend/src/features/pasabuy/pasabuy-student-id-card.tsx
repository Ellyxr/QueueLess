import { useRef, useState } from "react";
import { IdCard, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getEligibility, submitStudentId } from "./pasabuy-eligibility";

const MAX_PHOTO_DIMENSION = 480;

/** Resizes the uploaded ID photo before storing it, so it doesn't blow past localStorage limits. Mock-only — a real upload would go straight to backend storage. */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like an image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process that image."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Student ID submission used to determine Pasabuy deliverer eligibility (see
 * `pasabuy-eligibility.ts` / `pasabuy-eligibility-gate.tsx`). This is a
 * frontend-only stand-in — the real `PasabuyProfile` model only stores a
 * student ID string today, with no photo field or verification flag (see
 * artifacts/api-server/AddressMe.md). The photo never leaves this browser and
 * is never rendered anywhere except this card.
 */
export function PasabuyStudentIdCard() {
  const [eligibility, setEligibility] = useState(() => getEligibility());
  const [studentIdNumber, setStudentIdNumber] = useState(eligibility.studentIdNumber);
  const [photoPreview, setPhotoPreview] = useState<string | null>(eligibility.studentIdPhoto);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPhotoPreview(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process that photo.");
    }
  };

  const handleSubmit = () => {
    setError(null);
    setMessage(null);
    if (!studentIdNumber.trim()) {
      setError("Enter your student ID number.");
      return;
    }
    if (!photoPreview) {
      setError("Upload a photo of your student ID.");
      return;
    }
    submitStudentId(studentIdNumber, photoPreview);
    setEligibility(getEligibility());
    setMessage("Student ID submitted and verified.");
  };

  return (
    <Card id="student-id" className="scroll-mt-24 border-card-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl tracking-tighter">
          <IdCard className="h-5 w-5" />
          Student ID
        </CardTitle>
        <CardDescription>
          Required to become a Pasabuy deliverer. Only you can see your ID photo — it's never
          shown to other students, vendors, or requesters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {eligibility.studentIdVerified ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Student ID verified</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not submitted yet.</p>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Student ID number</label>
          <Input
            value={studentIdNumber}
            onChange={(event) => setStudentIdNumber(event.target.value)}
            placeholder="e.g. 2023-00123"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Student ID photo</label>
          <div className="flex items-center gap-3">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Student ID preview"
                className="h-16 w-24 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                <IdCard className="h-5 w-5" />
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {photoPreview ? "Replace photo" : "Upload photo"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                handleFileChange(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs font-medium text-emerald-600">{message}</p>}

        <Button className="rounded-full" onClick={handleSubmit}>
          {eligibility.studentIdVerified ? "Update Student ID" : "Submit Student ID"}
        </Button>
      </CardContent>
    </Card>
  );
}
