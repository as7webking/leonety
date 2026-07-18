import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { CookieNotice } from "@/components/cookie-notice";
import { Footer } from "@/components/footer";
import { NumberInputWheelGuard } from "@/components/number-input-wheel-guard";
import { PwaInstaller } from "@/components/pwa-installer";
import { I18nProvider } from "@/contexts/i18n-context";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
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
    { rel: "icon", url: "/icon-96.png", type: "image/png", sizes: "96x96" },
    { rel: "shortcut icon", url: "/favicon.ico" },
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={initialLocale} className="h-full antialiased scroll-smooth" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-background font-sans">
        <div className="flex min-h-screen flex-col bg-background">
          <I18nProvider initialLocale={initialLocale}>
            <PwaInstaller />
            <NumberInputWheelGuard />
            <div className="flex-1">
              {children}
            </div>
            <Footer />
            <CookieNotice />
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
