import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BA4L | Big Al's 4 Life",
  description: "Big Al's 4 Life. Live bowling scores, shared team scorebooks, and league standings.",
  appleWebApp: { capable: true, title: "BA4L", statusBarStyle: "default" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
