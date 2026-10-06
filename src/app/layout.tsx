import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MyWed · Wedding business workspace",
  description:
    "From the first enquiry to the final frame. Manage your wedding photography business.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
