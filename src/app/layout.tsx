import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlixCasa Pro — CasaStream",
  description: "Smart Media Streaming for Android TV, mobile, and desktop",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-zinc-950 text-white">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
