import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PdfJsWorker } from "@/components/pdf/PdfJsWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDF Toolkit",
  description: "Client-side PDF tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-zinc-50 font-sans text-zinc-950 antialiased dark:bg-black dark:text-zinc-50`}
      >
        <PdfJsWorker />
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
            <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:px-6">
              <div className="text-sm font-semibold tracking-tight">PDF Toolkit</div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
