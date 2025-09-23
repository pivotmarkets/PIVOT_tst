import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ReactQueryProvider } from "@/components/ReactQueryProvider";
import { WalletProvider } from "@/components/WalletProvider";
import { Toaster } from "@/components/ui/toaster";
import { WrongNetworkAlert } from "@/components/WrongNetworkAlert";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Pivot Markets",
  title: "Pivot Markets",
  description: "Aptos Boilerplate Template",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/logo.png", type: "image/svg+xml" },
      { url: "/icons/logo.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/logo.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/logo.png", sizes: "192x192", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#1a1a1e57] text-white min-h-screen flex flex-col">
        <WalletProvider>
          <ReactQueryProvider>
            {/* Main content wrapper */}
            <div className="flex-1">
              <div id="root">{children}</div>
            </div>
            
            <footer className="bg-[#2f2f33] pt-6 border-t border-t-[var(--Stroke-Dark,#2c2c2f)]">
              <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex items-center justify-center mb-4">
                  <img src="./icons/logo-foot.png" alt="Footer Logo" className="h-14 w-auto" />
                </div>
                <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
                  <span>© 2025 Pivot Markets</span>
            
                  <span>•</span>
                  <span>Privacy Policy</span>
                  <span>•</span>
                  <span>Terms of Service</span>
                </div>
              </div>
            </footer>
            
            <WrongNetworkAlert />
            <Toaster />
          </ReactQueryProvider>
        </WalletProvider>
      </body>
    </html>
  );
}