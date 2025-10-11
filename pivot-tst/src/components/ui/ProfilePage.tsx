"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart3,
  MessageCircle,
  CheckCircle,
  TrendingUp,
  Trophy,
  ShieldCheck,
  User,
  Activity,
  Store,
} from "lucide-react";
import { truncateAddress, useWallet } from "@aptos-labs/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { WalletSelector } from "../WalletSelector";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import MobileBottomNav from "./MobileBottomNav";

// Mock data - replace with real data from your API
const mockPerformanceData = [
  { date: "Tue 07", value: 1000 },
  { date: "Wed 08", value: 1020 },
  { date: "Thu 09", value: 1100 },
  { date: "Fri 10", value: 1080 },
  { date: "Sat 11", value: 1135 },
];

const USDC_ASSET_ADDRESS: string = "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832";
const config = new AptosConfig({ network: Network.TESTNET });
const aptos = new Aptos(config);

// const mockTrades = [
//   {
//     id: 1,
//     market: "Will BTC hit $100k?",
//     type: "BUY",
//     outcome: "YES",
//     shares: 100,
//     price: 0.65,
//     total: 65,
//     date: "2025-01-10",
//     status: "completed",
//   },
//   {
//     id: 2,
//     market: "ETH vs BTC Performance",
//     type: "SELL",
//     outcome: "NO",
//     shares: 50,
//     price: 0.42,
//     total: 21,
//     date: "2025-01-09",
//     status: "completed",
//   },
// ];

// const mockMarkets = [
//   {
//     id: 1,
//     title: "Will BTC hit $100k in January 2025?",
//     volume: 5200,
//     traders: 234,
//     endDate: "2025-01-31",
//     status: "active",
//   },
//   {
//     id: 2,
//     title: "Will Aptos TVL exceed $1B?",
//     volume: 3800,
//     traders: 156,
//     endDate: "2025-03-31",
//     status: "active",
//   },
// ];

const ProfilePage = () => {
  const [activeTab, setActiveTab] = useState("summary");
  const [timeRange, setTimeRange] = useState("ALL");

  const useUSDCBalance = () => {
    const { account } = useWallet();
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const fetchBalance = async () => {
      if (!account?.address) {
        setBalance(0);
        return;
      }

      setLoading(true);
      try {
        const balances = await aptos.getCurrentFungibleAssetBalances({
          options: {
            where: {
              owner_address: { _eq: account.address.toString() },
            },
          },
        });

        // Filter for all USDC balances
        const usdcBalances = balances.filter(
          (b: any) => b.asset_type.toLowerCase() === USDC_ASSET_ADDRESS.toLowerCase(),
        );

        let formatted = 0;

        if (usdcBalances.length > 0) {
          // Find the balance with is_primary: true
          const primaryBalance = usdcBalances.find((b: any) => b.is_primary === true);

          if (primaryBalance) {
            formatted = Number(primaryBalance.amount) / 1e6;
          } else {
            // Fallback to most recent if no primary found
            const mostRecentBalance = usdcBalances.sort(
              (a: any, b: any) =>
                new Date(b.last_transaction_timestamp).getTime() - new Date(a.last_transaction_timestamp).getTime(),
            )[0];

            formatted = Number(mostRecentBalance.amount) / 1e6;
            console.log("No primary balance found, using most recent:", mostRecentBalance);
          }
        }

        setBalance(formatted);
      } catch (error) {
        console.error("Error fetching USDC balance:", error);
        setBalance(0);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchBalance();
    }, [account?.address]);

    return { balance, loading, refetch: fetchBalance };
  };
  // Overview Tab Component
  const OverviewTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Portfolio Chart */}
      <div className="bg-[#2f2f33] rounded-xl p-6 border border-gray-700/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Portfolio</h2>
        </div>

        {/* Net Worth Display */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-full bg-blue-500 flex items-center justify-center">
              <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-8 h-8 rounded-full" />
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{balance}</div>
              <div className="text-sm text-gray-400">net worth</div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 -ml-3 mb-6">
          <div className="text-center">
            <div className="flex items-start justify-center gap-2 mb-1 min-w-[100px]">
              <div className="flex items-center justify-center">
                <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-6 h-6 rounded-full flex-shrink-0" />
              </div>
              <span className="text-white font-bold truncate">{balance.toFixed(3)}</span>
            </div>
            <div className="text-xs text-gray-400">balance</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <div className="rounded-full flex items-center justify-center">
                <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-6 h-6 rounded-full" />
              </div>
              <span className="text-white font-bold">0</span>
            </div>
            <div className="text-xs text-gray-400">invested</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <div className="rounded-full  flex items-center justify-center">
                <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-6 h-6 rounded-full" />
              </div>
              <span className="text-green-400 font-bold">+0</span>
            </div>
            <div className="text-xs text-gray-400">profit</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <div className="w-6 h-6 rounded bg-orange-900/30 flex items-center justify-center">
                <Trophy className="w-3 h-3 text-orange-500" />
              </div>
              <span className="text-white font-bold">10</span>
            </div>
            <div className="text-xs text-gray-400">Bronze</div>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={200} className="outline-none focus:outline-none">
          <AreaChart data={mockPerformanceData} className="outline-none focus:outline-none">
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#008259" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#008259" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#6b7280"
              tick={{ fill: "#9ca3af", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "8px",
              }}
            />
            <Area type="monotone" dataKey="value" stroke="#008259" strokeWidth={2} fill="url(#colorValue)" />
          </AreaChart>
        </ResponsiveContainer>

        {/* Time Range Selector */}
        <div className="flex gap-2 mt-4 w-full justify-center">
          {["1D", "1W", "1M", "ALL"].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                timeRange === range ? "bg-[#008259] text-white" : "bg-transparent text-gray-400"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-[#2f2f33] rounded-xl p-6 border border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4">Stats</h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Win/Loss Record</span>
              <span className="text-white font-medium">0W - 0L</span>
            </div>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-600">
              <div className="bg-gray-600" style={{ width: "100%" }} />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Win Rate</span>
            <span className="text-gray-400 font-bold">0%</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Total ROI</span>
            <span className="text-gray-400 font-bold">0%</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Avg Hold Time</span>
            <span className="text-white font-medium">0 days</span>
          </div>
        </div>
      </div>

      {/* Achievements */}
      {/* <div className="bg-[#2f2f33] rounded-xl p-6 border border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Achievements
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {mockBadges.map((badge, i) => (
            <div
              key={i}
              className={`group relative aspect-square rounded-lg flex flex-col items-center justify-center p-2 cursor-pointer transition-all ${
                badge.unlocked
                  ? "bg-gradient-to-br from-amber-500/20 to-purple-500/20 border border-amber-500/50"
                  : "bg-slate-700/50 border border-slate-600 opacity-50"
              }`}
            >
              <div className="text-2xl mb-1">{badge.icon}</div>
              <p className="text-xs text-center font-medium text-white">{badge.label}</p>
              {!badge.unlocked && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-lg">
                  <Lock className="w-5 h-5 text-gray-500" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 text-center text-sm text-gray-400">3 of 6 badges earned</div>
      </div> */}
    </motion.div>
  );

  //   // Positions Tab Component
  //   const PositionsTab = () => (
  //     <motion.div
  //       initial={{ opacity: 0, y: 20 }}
  //       animate={{ opacity: 1, y: 0 }}
  //       exit={{ opacity: 0, y: -20 }}
  //       className="space-y-4"
  //     >
  //       <div className="bg-[#2f2f33] rounded-xl p-4 border  border-gray-700/20">
  //         <h3 className="text-lg font-bold text-white mb-4">Active Positions (3)</h3>

  //         {mockPositions.map((position) => (
  //           <div key={position.id} className="border-b border-gray-800 last:border-b-0 py-4 first:pt-0 last:pb-0">
  //             <p className="text-white font-medium text-sm mb-2">{position.marketTitle}</p>

  //             <div className="grid grid-cols-2 gap-4 mb-3">
  //               <div>
  //                 <p className="text-gray-400 text-xs mb-1">Position</p>
  //                 <span
  //                   className={`px-2 py-1 rounded text-xs font-bold ${
  //                     position.outcome === "YES" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
  //                   }`}
  //                 >
  //                   {position.outcome} {position.shares.toFixed(0)}
  //                 </span>
  //               </div>

  //               <div>
  //                 <p className="text-gray-400 text-xs mb-1">P&L</p>
  //                 <p className={`font-bold text-sm ${position.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
  //                   {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)} ({position.pnlPercent >= 0 ? "+" : ""}
  //                   {position.pnlPercent.toFixed(1)}%)
  //                 </p>
  //               </div>
  //             </div>

  //             <div className="flex gap-2">
  //               <button className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm text-white font-medium transition-all">
  //                 Add More
  //               </button>
  //               <button className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white font-medium transition-all">
  //                 Sell
  //               </button>
  //             </div>
  //           </div>
  //         ))}
  //       </div>
  //     </motion.div>
  //   );

  // Trades Tab Component
  const TradesTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      <div className="bg-[#2f2f33] rounded-xl p-4 border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4">Recent Trades</h3>

        {/* {mockTrades.map((trade) => (
          <div key={trade.id} className="border-b border-gray-800 last:border-b-0 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{trade.market}</p>
                <p className="text-gray-400 text-xs mt-1">{trade.date}</p>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-bold ${
                  trade.type === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}
              >
                {trade.type}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Outcome</p>
                <p className="text-white font-medium">{trade.outcome}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Shares</p>
                <p className="text-white font-medium">{trade.shares}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Total</p>
                <p className="text-white font-medium">${trade.total}</p>
              </div>
            </div>
          </div>
        ))} */}
        <div className="border-b border-gray-800 last:border-b-0 py-4 first:pt-0 mb-2.5 last:pb-0 flex items-center justify-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          <p className="text-gray-400 text-sm text-center">No trades yet</p>
        </div>
      </div>
    </motion.div>
  );

  // Markets Tab Component
  const MarketsTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      <div className="bg-[#2f2f33] rounded-xl p-4 border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4">Created Markets</h3>

        {/* {mockMarkets.map((market) => (
          <div key={market.id} className="border-b border-gray-800 last:border-b-0 py-4 first:pt-0 last:pb-0">
            <p className="text-white font-medium text-sm mb-3">{market.title}</p>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Volume</p>
                <p className="text-white font-medium">${market.volume}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Traders</p>
                <p className="text-white font-medium">{market.traders}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Ends</p>
                <p className="text-white font-medium">{market.endDate}</p>
              </div>
            </div>
          </div>
        ))} */}
        <div className="border-b border-gray-800 last:border-b-0 py-4 mb-2.5 first:pt-0 last:pb-0 flex items-center justify-center gap-2">
          <Store className="w-4 h-4 text-gray-400" />
          <p className="text-gray-400 text-sm text-center">No markets created yet</p>
        </div>
      </div>
    </motion.div>
  );

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "summary":
        return <OverviewTab />;
      case "trades":
        return <TradesTab />;
      case "markets":
        return <MarketsTab />;
      default:
        return <OverviewTab />;
    }
  };
  const { account } = useWallet();
  const { balance } = useUSDCBalance();

  return (
    <div className="min-h-screen bg-[#232328]">
      {/* Header */}
      <header className="bg-[#1a1a1e2c] animate-fadeInDown sticky top-0 z-40 overflow-hidden border-b border-b-[var(--Stroke-Dark,#2c2c2f)] px-3 sm:px-4 lg:px-4">
        <div className="max-w-7xl mx-auto py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo Section */}
            <div className="flex items-center gap-3 sm:gap-6">
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                <img
                  src="/icons/p-lg.png"
                  alt="Pivot Logo"
                  className="ml-1 sm:ml-2 h-10 w-10 sm:h-12 sm:w-12 text-blue-400"
                />
              </h1>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Wallet Selector */}
              <div className="flex gap-1 sm:gap-2 items-center">
                <WalletSelector />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Profile Header */}
      <div className="max-w-7xl mx-auto px-4 py-6 pb-32">
        <div className="flex flex-col items-center gap-4 mb-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#008259] rounded-full p-1">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Name and Handle */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-bold text-white">Creator</h1>
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <p className="text-gray-400">{truncateAddress(account?.address.toStringLong())}</p>
          </div>

          {/* Following, Followers, and Creator Earnings */}
          <div className="flex gap-2.5 sm:gap-6 text-gray-300">
            <button className="text-center px-2 py-1 sm:px-3 sm:py-2 hover:bg-gray-700 rounded-md transition-colors">
              <span className="text-xs sm:text-sm font-semibold text-gray-200">0 Following</span>
            </button>
            <button className="text-center px-2 py-1 sm:px-3 sm:py-2 hover:bg-gray-700 rounded-md transition-colors">
              <span className="text-xs sm:text-sm font-semibold text-gray-200">0 Followers</span>
            </button>
            <button className="text-center px-2 py-1 sm:px-3 sm:py-2 hover:bg-gray-700 rounded-md transition-colors">
              <span className="text-xs sm:text-sm font-semibold text-gray-200">0 Creator Earnings</span>
            </button>
          </div>

          {/* Get Mana Button (Commented Out) */}
          {/* <button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 transition-all">
      Get mana Ⓜ
    </button> */}
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-6 pb-2 border-b border-gray-800">
          <div className="flex gap-1 w-full max-w-md">
            {" "}
            {/* Optional max width for control */}
            {[
              { id: "summary", icon: BarChart3, label: "Summary" },
              { id: "trades", icon: TrendingUp, label: "Trades" },
              { id: "markets", icon: MessageCircle, label: "Markets" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center px-4 py-2 flex-1 transition-all ${
                  activeTab === tab.id
                    ? "text-[#008259] border-b-2 border-emerald-700"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <tab.icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">{renderTabContent()}</AnimatePresence>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default ProfilePage;
