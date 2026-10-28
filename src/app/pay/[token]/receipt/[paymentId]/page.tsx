import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Receipt } from "@/components/receipt";
import { receiptData } from "@/lib/services/receipts";

export const metadata = { title: "Rent receipt", robots: { index: false } };

export default async function TenantReceiptPage({ params }: { params: Promise<{ token: string; paymentId: string }> }) {
  const { token, paymentId } = await params;
  const data = await receiptData({ paymentId, invoiceToken: token });
  if (!data) notFound();
  return (
    <main className="px-4 py-8">
      <div className="no-print mx-auto mb-5 flex max-w-xl justify-end">
        <PrintButton label="Download / print" />
      </div>
      <Receipt {...data} />
    </main>
  );
}
