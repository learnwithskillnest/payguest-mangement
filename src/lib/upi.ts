// UPI deep links (NPCI "upi://pay" format) and WhatsApp click-to-chat links.

export function upiLink(opts: { vpa: string; payeeName: string; amount: number; note: string; ref?: string }): string {
  const params = new URLSearchParams();
  params.set("pa", opts.vpa.trim());
  params.set("pn", opts.payeeName.trim());
  params.set("am", opts.amount.toFixed(2));
  params.set("cu", "INR");
  params.set("tn", opts.note.slice(0, 80));
  if (opts.ref) params.set("tr", opts.ref.slice(0, 35));
  // URLSearchParams encodes spaces as "+", which several UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/** Normalise an Indian mobile number for wa.me: digits only, with 91 country code. */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

export function whatsappLink(phone: string, message: string): string | null {
  const n = whatsappNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

export function isValidVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/.test(vpa.trim());
}
