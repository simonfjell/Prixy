import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import CookieBanner from "./components/CookieBanner";
import { Analytics } from "@vercel/analytics/react";  // <-- NY

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prixy - Smarta prisjämförelser",
  description:
    "Jämför priser från Tradera, Power, XXL, Elgiganten och fler med AI-driven prisanalys",
  icons: {
    icon: [
      { url: "/LOGO (P).png" },
      { url: "/LOGO (P).png", sizes: "32x32", type: "image/png" },
      { url: "/LOGO (P).png", sizes: "16x16", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className={inter.className}>
        {children}
        <CookieBanner />
        <Analytics />   {/* <-- NY RAD */}
      </body>
    </html>
  );
}
