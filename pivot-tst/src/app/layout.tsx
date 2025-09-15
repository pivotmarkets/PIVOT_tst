import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ReactQueryProvider } from "@/components/ReactQueryProvider";
import { WalletProvider } from "@/components/WalletProvider";
import { Toaster } from "@/components/ui/toaster";
import { WrongNetworkAlert } from "@/components/WrongNetworkAlert";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Pivot Markets",
  title: "NextJS Boilerplate Template",
  description: "Aptos Boilerplate Template",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
    <body className="bg-[#1a1a1e57] text-white">
      <WalletProvider>
        <ReactQueryProvider>
          <div id="root">{children}</div>
          <WrongNetworkAlert />
          <Toaster />
        </ReactQueryProvider>
      </WalletProvider>
    </body>
  </html>
  );
}
