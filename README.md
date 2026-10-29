# PG Manager

A dashboard for paying-guest (PG) owners to replace WhatsApp groups and notebooks. It covers beds, rent, tenants, expenses and electricity in one place, and works on a phone.

## What it does

| Area | Features |
| --- | --- |
| **Rooms & beds** | Live bed board showing who is in each bed, who is on notice and the date the bed frees up, and which beds are free and since when. Upcoming bookings appear on the board. Supports multiple PGs per owner. |
| **Rent** | One-click monthly invoices, prorated for part-month stays. UPI payment link and QR for every invoice. Public pay page for tenants with a "I've paid" UTR claim. Owner confirms payment and gets a numbered digital receipt (print or save as PDF). One-tap WhatsApp reminders, plus automatic reminders before the due date, on it, and every N days after. |
| **Tenants** | Onboarding, ID proof and agreement uploads, police verification status, agreement dates, security deposit (received, deductions, refund), notice, bed shifts, move-out and deposit settlement. Aadhaar numbers are stored masked. |
| **Expenses & profit** | Expenses by category (food, staff salaries, electricity, building rent, repairs and so on), and a 12-month view of collected vs spent with profit and margin. |
| **Electricity** | Sub-meter readings per room. Each bill is split among the room's tenants by the days each one stayed, then added to their next rent invoice. Correcting a reading also fixes invoices that already include it. |

The dashboard's to-do list flags rent not yet generated, payment claims to confirm, missing meter readings, notice periods that have ended, pending police verifications, agreements expiring soon and short deposits.

## Tech

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, Prisma 6 and PostgreSQL. Rent and billing rules live in `src/lib/billing.ts` as pure, unit-tested functions.

## Run locally

```bash
cp .env.example .env            # set DATABASE_URL to your Postgres
npm install
npx prisma db push              # create tables
npm run db:seed                 # optional demo PG with 3 months of history
npm run dev
```

Open http://localhost:3000. Demo login: `demo@pgmanager.in` / `demo1234`.

## Deploy on Vercel

1. Import the repo in Vercel and add a Neon Postgres database from the Storage tab, which sets `DATABASE_URL`.
2. Add `CRON_SECRET` (any long random string). Optionally add `SEED_DEMO=1` to load the demo PG on each deploy.
3. Deploy. The `vercel-build` script creates the tables, and `vercel.json` runs the reminder job daily at 9:00 IST.

## Automatic rent reminders

Call `GET /api/cron/reminders` once a day with `Authorization: Bearer $CRON_SECRET`. You can use Vercel Cron, cron-job.org or a server crontab, ideally around 9 AM IST. The reminder schedule comes from each PG's settings. Delivery depends on `REMINDER_PROVIDER`:

- `log`: prints to the server log. This is the default and is meant for testing.
- `whatsapp_cloud`: Meta WhatsApp Cloud API. You need an approved template with 4 body variables: name, amount, month, payment link.
- `webhook`: POSTs `{phone, message, payUrl, ...}` to `REMINDER_WEBHOOK_URL`. Use it to plug in Interakt, AiSensy, MSG91, n8n and similar tools.

Manual reminders don't need any setup. The **Remind** button opens WhatsApp with the message and payment link already filled in.

## How payments are confirmed

UPI deep links can't report back whether a payment succeeded. The flow works like this:

1. The tenant pays from the link or QR.
2. The tenant enters the UTR on the pay page.
3. The owner checks their UPI app and taps **Confirm**, which issues the receipt.

The owner can also record cash or UPI payments directly. To confirm payments automatically, add a payment gateway such as Razorpay or Cashfree in a later version.

## Scripts

| Command | |
| --- | --- |
| `npm test` | Unit tests for billing rules, plus integration tests against `DATABASE_URL` |
| `npm run e2e` | Playwright end-to-end owner flow against a running server |
| `npm run smoke` | Loads every page against the seeded demo data |
| `npm run typecheck` / `npm run build` | |

## Notes for production

- Uploaded documents (up to 5 MB each) are stored in the database and only served to the signed-in owner. If storage grows large, move them to S3 or R2.
- Set `APP_URL` to your public URL so payment links in reminders work.
- Money is stored in whole rupees. Dates are calendar dates, and "today" is calculated in IST.

## Project layout

```
prisma/schema.prisma        data model
prisma/seed.ts              demo data
src/lib/billing.ts          proration, electricity split, reminder schedule, bed state
src/lib/services/           invoices, electricity, occupancy, reminders, reports
src/app/(app)/              owner dashboard pages and server actions
src/app/pay/                public tenant payment page and receipts
src/app/api/cron/reminders  daily reminder job
tests/  e2e/                unit/integration and browser tests
```
