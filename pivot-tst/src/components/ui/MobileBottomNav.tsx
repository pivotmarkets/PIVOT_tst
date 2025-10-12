"use client";
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Home, ScanEye, User, TrendingUp, PlusCircle } from "lucide-react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

interface MobileBottomNavProps {
  onInsightsClick?: () => void;
  isInsightsActive?: boolean;
  onInsightsClose?: () => void;
}

export default function MobileBottomNav({
  onInsightsClick,
  isInsightsActive = false,
}: MobileBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { account } = useWallet();

  let insightsLabel = "Insights";
  let insightsPath = "/insights";
  let InsightsIcon = ScanEye;

  if (pathname?.startsWith("/market")) {
    insightsLabel = "Market";
    insightsPath = "/market";
    InsightsIcon = TrendingUp;
  } else if (pathname?.startsWith("/create")) {
    insightsLabel = "Create";
    insightsPath = "/create";
    InsightsIcon = PlusCircle;
  }

  const navItems = [
    {
      id: "explore",
      label: "Explore",
      icon: Home,
      path: "/",
      onClick:
        onInsightsClick ||
        (() => {
          router.push("/");
        }),
    },
    {
      id: "insights",
      label: insightsLabel,
      icon: InsightsIcon,
      path: insightsPath,
      onClick:
        onInsightsClick ||
        (() => {
          router.push("/");
        }),
    },
    {
      id: "profile",
      label: account?.address ? "Profile" : "Sign In",
      icon: User,
      path: "/profile",
      onClick: () => {
        if (!account?.address) {
          // Trigger wallet connect modal or toast here
          return;
        }
        router.push("/profile");
      },
    },
  ];

  const isActive = (item: typeof navItems[0]) => {
    if (item.id === "explore") {
      return pathname === "/" && !isInsightsActive;
    }
    if (item.id === "insights") {
      return pathname?.startsWith(insightsPath) || isInsightsActive;
    }
    if (item.id === "profile") {
      return pathname?.startsWith("/profile");
    }
    return pathname === item.path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#232328] border-t border-[#2c2c2f] z-50 md:hidden">
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <button
              key={item.id}
              onClick={(e) => {
                if (active) {
                  e.preventDefault();
                  return;
                }
                item.onClick();
              }}
              disabled={active}
              className={`relative flex flex-col items-center justify-center min-w-[60px] pb-1.5 pt-0.5 px-1 rounded-md transition-all duration-200 ${
                active
                  ? "text-emerald-600 cursor-default"
                  : "text-gray-400 hover:text-gray-200 cursor-pointer"
              }`}
            >
              <Icon
                className={`w-5 h-5 mb-0.5 transition-all duration-200 ${
                  active ? "scale-105" : ""
                }`}
              />
              <span className="text-[10px] font-medium">{item.label}</span>
              {/* Removed green underline */}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
