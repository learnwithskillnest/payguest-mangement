import type { Tenant } from "@prisma/client";
import { Field } from "./ui";
import { isoDate } from "@/lib/dates";

export const ID_TYPES = ["Aadhaar", "PAN", "Driving licence", "Passport", "Voter ID", "College / company ID"];

export const POLICE_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export const DOC_LABELS: Record<string, string> = {
  ID_PROOF: "ID proof",
  PHOTO: "Photo",
  AGREEMENT: "Rent agreement",
  POLICE_VERIFICATION: "Police verification",
  OTHER: "Other",
};

export function PersonalFields({ t }: { t?: Partial<Tenant> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input name="name" defaultValue={t?.name ?? ""} required /></Field>
      <Field label="Mobile (WhatsApp)"><input name="phone" type="tel" defaultValue={t?.phone ?? ""} required /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={t?.email ?? ""} /></Field>
      <Field label="Occupation">
        <select name="occupation" defaultValue={t?.occupation ?? ""}>
          <option value="">—</option>
          <option>Student</option>
          <option>Working professional</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="College / company"><input name="organisation" defaultValue={t?.organisation ?? ""} /></Field>
      <Field label="Permanent address"><input name="permanentAddress" defaultValue={t?.permanentAddress ?? ""} /></Field>
      <Field label="Emergency contact name"><input name="emergencyContactName" defaultValue={t?.emergencyContactName ?? ""} /></Field>
      <Field label="Emergency contact phone"><input name="emergencyContactPhone" type="tel" defaultValue={t?.emergencyContactPhone ?? ""} /></Field>
    </div>
  );
}

export function VerificationFields({ t }: { t?: Partial<Tenant> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="ID type">
        <select name="idType" defaultValue={t?.idType ?? "Aadhaar"}>
          {ID_TYPES.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="ID number" hint="Aadhaar is saved masked (last 4 digits only)">
        <input name="idNumber" defaultValue={t?.idNumber ?? ""} />
      </Field>
      <Field label="Police verification">
        <select name="policeVerification" defaultValue={t?.policeVerification ?? "NOT_STARTED"}>
          {Object.entries(POLICE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Verification ref / application no.">
        <input name="policeVerificationRef" defaultValue={t?.policeVerificationRef ?? ""} />
      </Field>
      <Field label="Verified on"><input name="policeVerifiedOn" type="date" defaultValue={isoDate(t?.policeVerifiedOn)} /></Field>
      <div />
      <Field label="Agreement start"><input name="agreementStart" type="date" defaultValue={isoDate(t?.agreementStart)} /></Field>
      <Field label="Agreement end"><input name="agreementEnd" type="date" defaultValue={isoDate(t?.agreementEnd)} /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={t?.notes ?? ""} /></Field>
    </div>
  );
}
