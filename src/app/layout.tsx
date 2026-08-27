import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { CookieNotice } from "@/components/cookie-notice";
import { Footer } from "@/components/footer";
import { NumberInputWheelGuard } from "@/components/number-input-wheel-guard";
import { PwaInstaller } from "@/components/pwa-installer";
import { I18nProvider } from "@/contexts/i18n-context";
import { LOCALE_COOKIE, normalizeLocale, resolveLocaleFromAcceptLanguage } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://leonety.vercel.app"),
  title: {
    default: "Leonety",
    template: "%s | Leonety",
  },
  description: "Modern bookkeeping for freelancers and small businesses. Track income, expenses, time, and cash flow without spreadsheets.",
  manifest: "/manifest.json",
  applicationName: "Leonety",
  openGraph: {
    title: "Leonety",
    description: "Modern bookkeeping for freelancers and small businesses.",
    siteName: "Leonety",
    images: [{ url: "/brand/og-leonety.png", width: 1200, height: 630, alt: "Leonety" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Leonety",
    description: "Modern bookkeeping for freelancers and small businesses.",
    images: ["/brand/og-leonety.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Leonety",
  },
  formatDetection: {
    telephone: false,
  },
  icons: [
    { rel: "icon", url: "/brand/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    { rel: "icon", url: "/brand/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    { rel: "icon", url: "/brand/icon-96.png", type: "image/png", sizes: "96x96" },
    { rel: "shortcut icon", url: "/brand/favicon-32x32.png" },
    { rel: "apple-touch-icon", url: "/brand/apple-touch-icon.png" },
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
  const headersList = await headers();
  const explicitLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = explicitLocale
    ? normalizeLocale(explicitLocale)
    : resolveLocaleFromAcceptLanguage(headersList.get("accept-language"));

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
