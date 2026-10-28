import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Receipt } from "@/components/receipt";
import { getCurrentUser } from "@/lib/auth";
import { receiptData } from "@/lib/services/receipts";
import { payUrl } from "@/lib/services/reminders";
import { whatsappLink } from "@/lib/upi";
import { rupees } from "@/lib/money";

export const metadata = { title: "Receipt" };

export default async function OwnerReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const data = await receiptData({ paymentId: id, ownerId: user.id });
  if (!data) notFound();
  const share = whatsappLink(
    data.tenant.phone,
    `Hi ${data.tenant.name.split(" ")[0]}, thank you! We received ${rupees(data.payment.amount)}. Your receipt ${data.payment.receiptNo}: ${payUrl(data.invoice.publicToken)}/receipt/${data.payment.id}`,
  );
  return (
    <main className="px-4 py-8">
      <div className="no-print mx-auto mb-5 flex max-w-xl flex-wrap items-center justify-between gap-2">
        <Link href={`/rent/${data.invoice.id}`} className="text-sm text-stone-500 hover:text-stone-800">← Back to invoice</Link>
        <div className="flex gap-2">
          {share && <a href={share} target="_blank" rel="noreferrer" className="btn-secondary">Send on WhatsApp</a>}
          <PrintButton />
        </div>
      </div>
      <Receipt {...data} />
    </main>
  );
}
