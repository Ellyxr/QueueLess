import { useEffect, useRef, useState } from "react";
import { IdCard, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getPasabuyProfile,
  upsertPasabuyProfile,
  uploadStudentIdPhoto,
  type PasabuyProfileResponse,
} from "./pasabuy-api";

const LOCAL_PREVIEW_KEY_PREFIX = "queueless-pasabuy-id-photo-preview";
const MAX_PHOTO_DIMENSION = 480;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function getCurrentUserId(): string | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return (JSON.parse(stored) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

function previewStorageKey(): string | null {
  const userId = getCurrentUserId();
  return userId ? `${LOCAL_PREVIEW_KEY_PREFIX}:${userId}` : null;
}

/** Client-side-only "here's what I uploaded" convenience — never treated as a re-fetchable server field. The photo itself is only ever sent to the real upload endpoint below. */
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
 * `pasabuy-eligibility.ts` / `pasabuy-eligibility-gate.tsx`). The student ID
 * number is saved via `PUT /pasabuy/profile`; the photo is uploaded via the
 * real multipart `POST /pasabuy/profile/student-id-photo` endpoint for admin
 * review. `studentIdVerified` reflects whatever the backend currently
 * returns — there's no auto-verify shortcut anymore.
 */
export function PasabuyStudentIdCard() {
  const [profile, setProfile] = useState<PasabuyProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [studentIdNumber, setStudentIdNumber] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const data = await getPasabuyProfile();
    setProfile(data);
    setStudentIdNumber(data.profile?.studentId ?? "");
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    refresh()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your Pasabuy profile.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    const key = previewStorageKey();
    if (key) {
      const stored = localStorage.getItem(key);
      if (stored) setPhotoPreview(stored);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Photo must be 2MB or smaller.");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPhotoPreview(dataUrl);
      setPendingFile(file);
      const key = previewStorageKey();
      if (key) localStorage.setItem(key, dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process that photo.");
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);
    if (!studentIdNumber.trim()) {
      setError("Enter your student ID number.");
      return;
    }
    setIsSaving(true);
    try {
      await upsertPasabuyProfile(studentIdNumber.trim());
      if (pendingFile) {
        await uploadStudentIdPhoto(pendingFile);
        setPendingFile(null);
      }
      await refresh();
      setMessage(
        pendingFile
          ? "Student ID submitted for review."
          : "Student ID saved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your student ID.");
    } finally {
      setIsSaving(false);
    }
  };

  const studentIdVerified = Boolean(profile?.studentIdVerified);
  const photoSubmitted = Boolean(profile?.profile?.photoSubmitted);

  return (
    <Card id="student-id" className="scroll-mt-24 border-card-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl tracking-tighter">
          <IdCard className="h-5 w-5" />
          Student ID
        </CardTitle>
        <CardDescription>
          Required to become a Pasabuy deliverer. Only admins reviewing your submission can see
          your ID photo — it's never shown to other students, vendors, or requesters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
          </div>
        ) : studentIdVerified ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Student ID verified</span>
          </div>
        ) : photoSubmitted ? (
          <p className="text-xs text-amber-700">Submitted — awaiting admin verification.</p>
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
          {pendingFile && (
            <p className="text-[11px] text-muted-foreground">
              New photo selected — it will upload when you save.
            </p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs font-medium text-emerald-600">{message}</p>}

        <Button className="rounded-full" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Saving..." : profile?.profile ? "Update Student ID" : "Submit Student ID"}
        </Button>
      </CardContent>
    </Card>
  );
}
