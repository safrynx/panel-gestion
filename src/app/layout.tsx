import type { Metadata } from "next";
import { DM_Sans, Unbounded } from "next/font/google";
import "./globals.css";
import { UIProvider } from "./ui";

const display = Unbounded({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display-loaded", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "GTASUN Staff Manager",
  description: "Panel privé de gestion du staff GTASUN"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body><UIProvider>{children}</UIProvider></body>
    </html>
  );
}
