/**
 * MOCK-ONLY deliverer eligibility state (student ID number + photo, and Pasabuy
 * terms acceptance). The real `PasabuyProfile` model only stores a student ID
 * string — there's no photo, verification flag, or terms-acceptance timestamp
 * on the backend yet (see artifacts/api-server/AddressMe.md). Submitting a
 * student ID here auto-verifies it instantly since there's no admin review
 * queue to simulate; swap for `getProfile` / `upsertProfile` in
 * `@/features/auth/api` once those fields exist.
 */

function getCurrentUserId(): string | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return (JSON.parse(stored) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

function storageKey(userId: string): string {
  return `queueless-pasabuy-eligibility:${userId}`;
}

export interface PasabuyEligibilityState {
  studentIdNumber: string;
  /** Small resized data URL — never rendered to anyone but the owning student. */
  studentIdPhoto: string | null;
  studentIdVerified: boolean;
  termsAccepted: boolean;
}

const EMPTY_STATE: PasabuyEligibilityState = {
  studentIdNumber: "",
  studentIdPhoto: null,
  studentIdVerified: false,
  termsAccepted: false,
};

export function getEligibility(): PasabuyEligibilityState {
  const userId = getCurrentUserId();
  if (!userId) return EMPTY_STATE;
  const stored = localStorage.getItem(storageKey(userId));
  if (!stored) return EMPTY_STATE;
  try {
    return { ...EMPTY_STATE, ...(JSON.parse(stored) as Partial<PasabuyEligibilityState>) };
  } catch {
    return EMPTY_STATE;
  }
}

function setEligibility(next: PasabuyEligibilityState): void {
  const userId = getCurrentUserId();
  if (!userId) return;
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
}

/** Submits the student ID number + photo. Mock-verifies instantly — no admin review queue exists in this frontend-only build. */
export function submitStudentId(studentIdNumber: string, studentIdPhoto: string): void {
  setEligibility({
    ...getEligibility(),
    studentIdNumber: studentIdNumber.trim(),
    studentIdPhoto,
    studentIdVerified: true,
  });
}

export function acceptPasabuyTerms(): void {
  setEligibility({ ...getEligibility(), termsAccepted: true });
}

export function isEligibleToDeliver(state: PasabuyEligibilityState): boolean {
  return state.studentIdVerified && state.termsAccepted;
}
