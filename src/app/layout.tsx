import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RTR NETWORK",
  description: "A secure mobile-first cloud mining dashboard.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico", apple: "/logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="rtr-build" content={process.env.NEXT_PUBLIC_BUILD_TIMESTAMP} />
      </head>
      <body className="min-h-full flex flex-col">
        <div id="app-root">
          <div id="google_translate_element" className="google-translate-hidden" />
          <Providers>{children}</Providers>
          <Script id="google-translate-init">
            {`window.googleTranslateElementInit = function() { new window.google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element'); };`}
          </Script>
          <Script src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit" strategy="afterInteractive" />
        </div>
      </body>
    </html>
  );
}
