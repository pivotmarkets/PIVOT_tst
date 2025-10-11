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

export default function MobileBottomNav({ onInsightsClick, isInsightsActive = false }: MobileBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { account } = useWallet();

  // Determine label, path, and icon dynamically based on pathname
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
      onClick: onInsightsClick || (() => {
        router.push("/");
      }),
    },
    {
      id: "insights",
      label: insightsLabel,
      icon: InsightsIcon,
      path: insightsPath,
      onClick: onInsightsClick || (() => {
        router.push(insightsPath);
      }),
    },
    {
      id: "profile",
      label: account?.address ? "Profile" : "Sign In",
      icon: User,
      path: "/profile",
      onClick: () => {
        if (!account?.address) {
          // Trigger wallet connection modal or toast here
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
    <nav className="fixed bottom-0 left-0 right-0 bg-[#232328] border-t border-t-[var(--Stroke-Dark,#2c2c2f)] z-50 md:hidden">
      <div className="flex items-center justify-around px-4 py-3 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <button
              key={item.id}
              onClick={(e) => {
                // Prevent navigation if already on the active page
                if (active) {
                  e.preventDefault();
                  return;
                }
                item.onClick();
              }}
              disabled={active}
              className={`flex flex-col items-center justify-center min-w-[70px] py-1 px-2 rounded-lg transition-all duration-200 ${
                active 
                  ? "text-[#008259] cursor-default" 
                  : "text-gray-400 hover:text-gray-200 cursor-pointer"
              }`}
            >
              <Icon
                className={`w-6 h-6 mb-1 transition-all duration-200 ${
                  active ? "scale-110" : ""
                }`}
              />
              <span className="text-xs font-medium">{item.label}</span>
              {active && (
                <div className="absolute bottom-0 w-12 h-1 bg-[#008259] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}