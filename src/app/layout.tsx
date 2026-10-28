import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PG Manager", template: "%s · PG Manager" },
  description: "Run your PG without WhatsApp groups and notebooks: beds, rent, tenants, expenses and electricity in one place.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#237564" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
