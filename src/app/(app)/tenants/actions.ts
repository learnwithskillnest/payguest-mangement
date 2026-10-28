"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DocumentType, PoliceVerification } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { addDays, fmtDate, today } from "@/lib/dates";
import { maskAadhaar } from "@/lib/billing";
import { dateField, flash, optStr, rupeesField, str } from "@/lib/forms";
import { deleteUpload, saveUpload } from "@/lib/uploads";

const POLICE = Object.values(PoliceVerification) as string[];
const DOC_TYPES = Object.values(DocumentType) as string[];

function profileFields(fd: FormData) {
  const idType = optStr(fd, "idType");
  let idNumber = optStr(fd, "idNumber");
  if (idNumber && idType === "Aadhaar") idNumber = maskAadhaar(idNumber);
  const police = str(fd, "policeVerification");
  return {
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    email: optStr(fd, "email"),
    occupation: optStr(fd, "occupation"),
    organisation: optStr(fd, "organisation"),
    permanentAddress: optStr(fd, "permanentAddress"),
    emergencyContactName: optStr(fd, "emergencyContactName"),
    emergencyContactPhone: optStr(fd, "emergencyContactPhone"),
    idType,
    idNumber,
    policeVerification: (POLICE.includes(police) ? police : "NOT_STARTED") as PoliceVerification,
    policeVerificationRef: optStr(fd, "policeVerificationRef"),
    policeVerifiedOn: dateField(fd, "policeVerifiedOn"),
    agreementStart: dateField(fd, "agreementStart"),
    agreementEnd: dateField(fd, "agreementEnd"),
    notes: optStr(fd, "notes"),
  };
}

/** A bed is free for an open-ended stay from `from` if no stay on it is ongoing or ends on/after `from`. */
async function bedFreeFrom(bedId: string, from: Date, ignoreStayId?: string) {
  const clash = await db.stay.findFirst({
    where: {
      bedId,
      id: ignoreStayId ? { not: ignoreStayId } : undefined,
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
    include: { tenant: true },
  });
  return clash;
}

async function maybeUpload(tenantId: string, fd: FormData, field: string, type: DocumentType) {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return;
  const saved = await saveUpload(file);
  await db.document.create({ data: { tenantId, type, fileName: file.name, ...saved } });
}

export async function createTenant(fd: FormData) {
  const { property } = await requireOwner();
  const back = `/tenants/new${str(fd, "bedId") ? `?bedId=${str(fd, "bedId")}` : ""}`;
  const profile = profileFields(fd);
  if (!profile.name || !profile.phone) flash(back, "error", "Name and mobile number are required.");

  const bed = await db.bed.findFirst({ where: { id: str(fd, "bedId"), room: { propertyId: property.id } }, include: { room: true } });
  if (!bed) flash(back, "error", "Choose a bed for the tenant.");
  const startDate = dateField(fd, "startDate") ?? today();
  const clash = await bedFreeFrom(bed.id, startDate);
  if (clash) {
    flash(back, "error", `Room ${bed.room.name} bed ${bed.label} is taken by ${clash.tenant.name} on that date${clash.endDate ? ` (free from ${fmtDate(addDays(clash.endDate, 1))})` : ""}.`);
  }
  const rent = rupeesField(fd, "rent", bed.rent);

  const tenant = await db.tenant.create({
    data: {
      ...profile,
      propertyId: property.id,
      depositAmount: rupeesField(fd, "depositAmount"),
      depositReceived: rupeesField(fd, "depositReceived"),
      depositReceivedOn: dateField(fd, "depositReceivedOn"),
      stays: { create: { bedId: bed.id, startDate, rent } },
    },
  });
  try {
    await maybeUpload(tenant.id, fd, "idFile", "ID_PROOF");
    await maybeUpload(tenant.id, fd, "agreementFile", "AGREEMENT");
  } catch (e) {
    flash(`/tenants/${tenant.id}`, "error", `Tenant saved, but the file upload failed: ${(e as Error).message}`);
  }
  revalidatePath("/rooms");
  redirect(`/tenants/${tenant.id}?msg=${encodeURIComponent(`${tenant.name} added to room ${bed.room.name}, bed ${bed.label}.`)}`);
}

async function ownedTenant(id: string) {
  const { property } = await requireOwner();
  const tenant = await db.tenant.findFirst({
    where: { id, propertyId: property.id },
    include: { stays: { orderBy: { startDate: "desc" }, include: { bed: { include: { room: true } } } } },
  });
  if (!tenant) flash("/tenants", "error", "Tenant not found.");
  return { tenant, property };
}

/** The stay that is current today, or the latest upcoming one. */
function activeStay<T extends { startDate: Date; endDate: Date | null }>(stays: T[]) {
  const t = today();
  return stays.find((s) => !s.endDate || s.endDate >= t) ?? null;
}

export async function updateTenant(fd: FormData) {
  const { tenant } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  const profile = profileFields(fd);
  if (!profile.name || !profile.phone) flash(back, "error", "Name and mobile number are required.");
  // Keep an already-masked Aadhaar if the field was left as-is
  await db.tenant.update({ where: { id: tenant.id }, data: profile });
  revalidatePath(back);
  flash(back, "msg", "Tenant details saved.");
}

export async function updateDeposit(fd: FormData) {
  const { tenant } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      depositAmount: rupeesField(fd, "depositAmount", tenant.depositAmount),
      depositReceived: rupeesField(fd, "depositReceived", tenant.depositReceived),
      depositReceivedOn: dateField(fd, "depositReceivedOn"),
      depositDeduction: rupeesField(fd, "depositDeduction", tenant.depositDeduction),
      depositDeductionNote: optStr(fd, "depositDeductionNote"),
      depositRefunded: rupeesField(fd, "depositRefunded", tenant.depositRefunded),
      depositRefundedOn: dateField(fd, "depositRefundedOn"),
    },
  });
  revalidatePath(back);
  flash(back, "msg", "Deposit updated.");
}

export async function giveNotice(fd: FormData) {
  const { tenant } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  const stay = activeStay(tenant.stays);
  if (!stay) flash(back, "error", "This tenant has no current bed.");
  const lastDay = dateField(fd, "lastDay");
  if (!lastDay || lastDay < stay.startDate) flash(back, "error", "Choose a valid last day of stay.");
  await db.$transaction([
    db.stay.update({ where: { id: stay.id }, data: { endDate: lastDay } }),
    db.tenant.update({ where: { id: tenant.id }, data: { status: "NOTICE" } }),
  ]);
  revalidatePath("/rooms");
  flash(back, "msg", `Notice recorded. Bed ${stay.bed.room.name}-${stay.bed.label} will be free from ${fmtDate(addDays(lastDay, 1))}.`);
}

export async function cancelNotice(fd: FormData) {
  const { tenant } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  const stay = activeStay(tenant.stays);
  if (!stay) flash(back, "error", "This tenant has no current bed.");
  const clash = await db.stay.findFirst({ where: { bedId: stay.bedId, id: { not: stay.id }, startDate: { gt: stay.startDate } }, include: { tenant: true } });
  if (clash) flash(back, "error", `Can't cancel: ${clash.tenant.name} is booked into this bed from ${fmtDate(clash.startDate)}.`);
  await db.$transaction([
    db.stay.update({ where: { id: stay.id }, data: { endDate: null } }),
    db.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } }),
  ]);
  revalidatePath("/rooms");
  flash(back, "msg", "Notice cancelled. The tenant is staying on.");
}

export async function moveOut(fd: FormData) {
  const { tenant } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  const lastDay = dateField(fd, "lastDay") ?? today();
  const stay = activeStay(tenant.stays) ?? tenant.stays[0];
  if (stay && lastDay < stay.startDate) flash(back, "error", "Move-out date can't be before the move-in date.");
  await db.$transaction([
    ...(stay ? [db.stay.update({ where: { id: stay.id }, data: { endDate: lastDay } })] : []),
    db.tenant.update({ where: { id: tenant.id }, data: { status: "MOVED_OUT" } }),
  ]);
  revalidatePath("/rooms");
  flash(back, "msg", `${tenant.name} marked as moved out on ${fmtDate(lastDay)}. Settle the deposit below.`);
}

export async function changeBed(fd: FormData) {
  const { tenant, property } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  const stay = activeStay(tenant.stays);
  if (!stay) flash(back, "error", "This tenant has no current bed.");
  const bed = await db.bed.findFirst({ where: { id: str(fd, "bedId"), room: { propertyId: property.id } }, include: { room: true } });
  if (!bed) flash(back, "error", "Choose the new bed.");
  if (bed.id === stay.bedId) flash(back, "error", "That's the tenant's current bed.");
  const from = dateField(fd, "fromDate") ?? today();
  const clash = await bedFreeFrom(bed.id, from);
  if (clash) flash(back, "error", `Room ${bed.room.name} bed ${bed.label} is taken by ${clash.tenant.name} on that date.`);
  const rent = rupeesField(fd, "rent", bed.rent);

  if (from <= stay.startDate) {
    // Correcting the bed before the stay began: just move the stay.
    await db.stay.update({ where: { id: stay.id }, data: { bedId: bed.id, rent } });
  } else {
    await db.$transaction([
      db.stay.update({ where: { id: stay.id }, data: { endDate: addDays(from, -1) } }),
      db.stay.create({ data: { tenantId: tenant.id, bedId: bed.id, startDate: from, endDate: stay.endDate, rent } }),
    ]);
  }
  revalidatePath("/rooms");
  flash(back, "msg", `Moved to room ${bed.room.name}, bed ${bed.label} from ${fmtDate(from)}.`);
}

export async function uploadDocument(fd: FormData) {
  const { tenant } = await ownedTenant(str(fd, "tenantId"));
  const back = `/tenants/${tenant.id}`;
  const type = str(fd, "type");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) flash(back, "error", "Choose a file to upload.");
  try {
    await maybeUpload(tenant.id, fd, "file", (DOC_TYPES.includes(type) ? type : "OTHER") as DocumentType);
  } catch (e) {
    flash(back, "error", (e as Error).message);
  }
  revalidatePath(back);
  flash(back, "msg", "Document uploaded.");
}

export async function deleteDocument(fd: FormData) {
  const { property } = await requireOwner();
  const doc = await db.document.findFirst({ where: { id: str(fd, "documentId"), tenant: { propertyId: property.id } } });
  if (!doc) flash("/tenants", "error", "Document not found.");
  await db.document.delete({ where: { id: doc.id } });
  await deleteUpload(doc.storedName);
  flash(`/tenants/${doc.tenantId}`, "msg", "Document deleted.");
}
