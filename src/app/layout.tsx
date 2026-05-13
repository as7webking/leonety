import type { Metadata, Viewport } from "next";
import { CookieNotice } from "@/components/cookie-notice";
import { Footer } from "@/components/footer";
import { PwaInstaller } from "@/components/pwa-installer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Leonety",
    template: "%s | Leonety",
  },
  description: "Modern bookkeeping for freelancers and small businesses. Track income, expenses, time, and cash flow without spreadsheets.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Leonety",
  },
  formatDetection: {
    telephone: false,
  },
  icons: [
    { rel: "icon", url: "/favicon.ico" },
    { rel: "apple-touch-icon", url: "/icon-192x192.png" },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased scroll-smooth" data-scroll-behavior="smooth">
      <body suppressHydrationWarning className="min-h-screen bg-background font-sans">
        <div className="flex min-h-screen flex-col bg-background">
          <PwaInstaller />
          <div className="flex-1">
            {children}
          </div>
          <Footer />
          <CookieNotice />
        </div>
      </body>
    </html>
  );
}
