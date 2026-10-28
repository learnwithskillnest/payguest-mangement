// Demo data: one owner, one PG with 5 rooms, ~10 tenants and 3 months of history.
// Login: demo@pgmanager.in / demo1234
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { addDays, addMonths, currentPeriod, dueDateFor, periodStart, today } from "../src/lib/dates";
import { generateInvoices, recordPayment } from "../src/lib/services/invoices";
import { saveReading } from "../src/lib/services/electricity";

const db = new PrismaClient();

async function main() {
  const email = "demo@pgmanager.in";
  await db.user.deleteMany({ where: { email } });

  const t = today();
  const month = currentPeriod();
  const m = (n: number) => addMonths(month, n);

  const user = await db.user.create({
    data: {
      name: "Rajesh Kumar",
      email,
      phone: "9810012345",
      passwordHash: await hashPassword("demo1234"),
      properties: {
        create: {
          name: "Sunrise PG",
          address: "H-24, Sector 15\nNear Metro Gate 2",
          city: "Noida",
          phone: "9810012345",
          upiVpa: "sunrisepg@okhdfcbank",
          upiPayeeName: "Rajesh Kumar",
          rentDueDay: 5,
          electricityRate: 9,
          receiptPrefix: "SPG",
        },
      },
    },
    include: { properties: true },
  });
  const property = user.properties[0];

  const roomSpecs = [
    { name: "101", floor: "Ground", beds: 2, rent: 9000 },
    { name: "102", floor: "Ground", beds: 3, rent: 7500 },
    { name: "201", floor: "1st", beds: 2, rent: 9500 },
    { name: "202", floor: "1st", beds: 1, rent: 14000 },
    { name: "203", floor: "1st", beds: 3, rent: 7500 },
  ];
  const beds: Record<string, string> = {};
  for (const r of roomSpecs) {
    const room = await db.room.create({
      data: {
        propertyId: property.id,
        name: r.name,
        floor: r.floor,
        beds: { create: Array.from({ length: r.beds }, (_, i) => ({ label: "ABC"[i], rent: r.rent, createdAt: periodStart(m(-6)) })) },
      },
      include: { beds: true },
    });
    for (const b of room.beds) beds[`${r.name}${b.label}`] = b.id;
  }

  const start3 = periodStart(m(-3));
  const people = [
    { name: "Aman Verma", phone: "9876500001", bed: "101A", start: start3, occupation: "Working professional", org: "Infosys", police: "VERIFIED", deposit: 9000 },
    { name: "Rohit Sharma", phone: "9876500002", bed: "101B", start: addDays(start3, 9), occupation: "Student", org: "Amity University", police: "VERIFIED", deposit: 9000 },
    { name: "Karan Mehta", phone: "9876500003", bed: "102A", start: start3, occupation: "Working professional", org: "HCL", police: "SUBMITTED", deposit: 7500 },
    { name: "Vikas Yadav", phone: "9876500004", bed: "102B", start: periodStart(m(-1)), occupation: "Student", org: "JIIT", police: "NOT_STARTED", deposit: 7500, depositPaid: 4000 },
    { name: "Sahil Gupta", phone: "9876500005", bed: "201A", start: start3, occupation: "Working professional", org: "Paytm", police: "VERIFIED", deposit: 9500, notice: addDays(t, 12) },
    { name: "Ankit Singh", phone: "9876500006", bed: "201B", start: start3, occupation: "Working professional", org: "TCS", police: "VERIFIED", deposit: 9500 },
    { name: "Deepak Joshi", phone: "9876500007", bed: "202A", start: start3, occupation: "Working professional", org: "Adobe", police: "VERIFIED", deposit: 14000, end: addDays(periodStart(m(-1)), 14) },
    { name: "Nikhil Rao", phone: "9876500008", bed: "203A", start: addDays(start3, 20), occupation: "Student", org: "Sharda University", police: "VERIFIED", deposit: 7500 },
    { name: "Arjun Nair", phone: "9876500009", bed: "203B", start: start3, occupation: "Working professional", org: "Wipro", police: "SUBMITTED", deposit: 7500 },
    { name: "Manish Tiwari", phone: "9876500010", bed: "202A", start: addDays(t, 6), occupation: "Working professional", org: "Zomato", police: "NOT_STARTED", deposit: 14000, depositPaid: 14000 },
  ] as const;

  const tenantIds: Record<string, string> = {};
  for (const p of people) {
    const end = "end" in p ? p.end : "notice" in p ? p.notice : null;
    const tenant = await db.tenant.create({
      data: {
        propertyId: property.id,
        name: p.name,
        phone: p.phone,
        occupation: p.occupation,
        organisation: p.org,
        permanentAddress: "Lucknow, Uttar Pradesh",
        emergencyContactName: "Parent",
        emergencyContactPhone: "9415000000",
        idType: "Aadhaar",
        idNumber: "XXXX-XXXX-" + p.phone.slice(-4),
        policeVerification: p.police,
        policeVerifiedOn: p.police === "VERIFIED" ? addDays(p.start, 10) : null,
        agreementStart: p.start,
        agreementEnd: addDays(p.start, 330),
        depositAmount: p.deposit,
        depositReceived: "depositPaid" in p ? p.depositPaid : p.deposit,
        depositReceivedOn: p.start > t ? t : p.start,
        status: "end" in p ? "MOVED_OUT" : "notice" in p ? "NOTICE" : "ACTIVE",
        depositRefunded: "end" in p ? p.deposit : 0,
        depositRefundedOn: "end" in p ? end : null,
        stays: { create: { bedId: beds[p.bed], startDate: p.start, endDate: end, rent: (roomSpecs.find((r) => p.bed.startsWith(r.name))!).rent } },
      },
    });
    tenantIds[p.name] = tenant.id;
  }

  // Three past months: invoice, record meter readings, collect rent.
  let meter = 1000;
  for (const p of [m(-3), m(-2), m(-1)]) {
    await generateInvoices(property.id, p);
    for (const r of await db.room.findMany({ where: { propertyId: property.id } })) {
      const units = 80 + Math.round(Math.random() * 90);
      const prev = (await db.meterReading.findFirst({ where: { roomId: r.id }, orderBy: { period: "desc" } }))?.currentReading ?? meter;
      await saveReading({ propertyId: property.id, roomId: r.id, period: p, previousReading: prev, currentReading: prev + units, rate: property.electricityRate });
      meter += 7;
    }
  }
  await generateInvoices(property.id, month);

  const invoices = await db.invoice.findMany({ where: { propertyId: property.id }, include: { tenant: true } });
  for (const inv of invoices) {
    const due = dueDateFor(inv.period, property.rentDueDay);
    const isCurrent = inv.period === month;
    const isLast = inv.period === m(-1);
    if (isCurrent && ["Karan Mehta", "Vikas Yadav", "Arjun Nair"].includes(inv.tenant.name)) continue;
    if (isLast && inv.tenant.name === "Karan Mehta") continue; // overdue from last month
    const paidOn = addDays(due, -2 + Math.floor(Math.random() * 5));
    const amount = isLast && inv.tenant.name === "Vikas Yadav" ? Math.round(inv.totalAmount / 2) : inv.totalAmount;
    await recordPayment(property.id, inv.id, {
      amount,
      method: Math.random() > 0.2 ? "UPI" : "CASH",
      reference: Math.random() > 0.2 ? String(400000000000 + Math.floor(Math.random() * 99999999999)) : null,
      paidOn: paidOn > t ? t : paidOn,
      note: null,
    });
  }
  // A tenant who says they paid this month, awaiting confirmation.
  const claim = invoices.find((i) => i.period === month && i.tenant.name === "Arjun Nair");
  if (claim) {
    await db.invoice.update({ where: { id: claim.id }, data: { claimAmount: claim.totalAmount, claimRef: "429381726354", claimedAt: new Date() } });
  }

  const expenseTemplate = [
    { category: "FOOD", amount: 21000, day: 3, paidTo: "Grocery wholesaler" },
    { category: "STAFF_SALARY", amount: 12000, day: 1, paidTo: "Cook (Ramesh)" },
    { category: "STAFF_SALARY", amount: 7000, day: 1, paidTo: "Cleaner (Sunita)" },
    { category: "ELECTRICITY", amount: 7800, day: 12, paidTo: "UPPCL" },
    { category: "WATER", amount: 900, day: 8, paidTo: "Water tanker" },
    { category: "INTERNET", amount: 1400, day: 5, paidTo: "Airtel Xstream" },
    { category: "RENT", amount: 22000, day: 7, paidTo: "Building owner" },
    { category: "MAINTENANCE", amount: 1500, day: 18, paidTo: "Plumber" },
  ] as const;
  for (const p of [m(-3), m(-2), m(-1), month]) {
    for (const e of expenseTemplate) {
      const date = addDays(periodStart(p), e.day - 1);
      if (date > t) continue;
      await db.expense.create({
        data: { propertyId: property.id, category: e.category, amount: Math.round(e.amount * (0.9 + Math.random() * 0.2)), date, paidTo: e.paidTo },
      });
    }
  }

  console.log(`Seeded ${property.name}: login ${email} / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
