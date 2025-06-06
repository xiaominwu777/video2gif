import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Script
        type="text/javascript"
        src="/js/polyfill.js"
        strategy="lazyOnload"
      />
      <Script
        type="text/javascript"
        src="/js/ie10-viewport-bug-workaround.js"
        strategy="lazyOnload"
      />
      <Script
        type="text/javascript"
        src="/js/bootstrap-native-v4.js"
        strategy="lazyOnload"
      />
      <Script src="/js/gifjs/NeuQuant.js" strategy="lazyOnload" />
      <Script src="/js/gifjs/LZWEncoder.js" strategy="lazyOnload" />
      <Script src="/js/gifjs/GIFEncoder.js" strategy="lazyOnload" />
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background antialiased`}
      >
        {" "}
        {children}
      </body>
    </html>
  );
}
