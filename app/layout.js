import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import SWUpdateToast from "@/components/SWUpdateToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "OneShot",
  description: "OneShot memory engine dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/Icon.png",
  },
};

export const viewport = {
  themeColor: "#05050a",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        data-theme="dark"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          <ServiceWorkerRegister />
          <PWAInstallPrompt />
          <SWUpdateToast />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
