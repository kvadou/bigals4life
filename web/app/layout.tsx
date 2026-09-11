import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strike Ceiling | Every pin. Every possibility.",
  description: "Live bowling scores and the highest score you can still finish with. Built for your league night.",
  appleWebApp: { capable: true, title: "Strike Ceiling", statusBarStyle: "default" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
