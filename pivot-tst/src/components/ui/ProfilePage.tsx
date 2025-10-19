"use client";

import React, { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  MessageCircle,
  ChevronDown,
  CheckCircle,
  Presentation,
  Trophy,
  User,
  PackageOpen,
} from "lucide-react";
import { truncateAddress, useWallet } from "@aptos-labs/wallet-adapter-react";
import { AnimatePresence } from "framer-motion";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { WalletSelector } from "../WalletSelector";
import MobileBottomNav from "./MobileBottomNav";
import Link from "next/link";

import {
  getUserPositionDetails,
  getMarketDetails,
  getAllMarketIds,
  getUserTradeHistory,
  MarketDetails,
  Position,
} from "@/app/view-functions/markets";
import { useWalletAuth } from "@/app/hooks/useWalletAuth";
import { PixelCoins } from ".";

const USDC_ASSET_ADDRESS: string = "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832";
const config = new AptosConfig({ network: Network.TESTNET });
const aptos = new Aptos(config);
const SHARES_DECIMALS = 6; // Updated to 6 for USDC
const PRICE_SCALE = 10000; // Basis points (0-10000 for 0-1)

const ProfilePage = () => {
  const [activeTab, setActiveTab] = useState("summary");
  const [balance, setBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [netWorth, setNetWorth] = useState(0);
  const [invested, setInvested] = useState(0);
  const [profit, setProfit] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [avgHoldTime, setAvgHoldTime] = useState(0);
  const [createdMarkets, setCreatedMarkets] = useState<MarketDetails[]>([]);
  const [userPositionsByMarket, setUserPositionsByMarket] = useState<
    { marketId: number; positions: Position[]; marketDetails: MarketDetails }[]
  >([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingMarkets, setLoadingMarkets] = useState(false);

  const { account } = useWallet();
  const { user } = useWalletAuth();
  // Fetch USDC balance
  const fetchBalance = async () => {
    if (!account?.address) {
      setBalance(0);
      return;
    }

    setLoadingBalance(true);
    try {
      const balances = await aptos.getCurrentFungibleAssetBalances({
        options: {
          where: {
            owner_address: { _eq: account.address.toString() },
          },
        },
      });

      const usdcBalances = balances.filter((b: any) => b.asset_type.toLowerCase() === USDC_ASSET_ADDRESS.toLowerCase());

      let formatted = 0;
      if (usdcBalances.length > 0) {
        const primaryBalance = usdcBalances.find((b: any) => b.is_primary === true);
        if (primaryBalance) {
          formatted = Number(primaryBalance.amount) / 1e6;
        } else {
          const mostRecentBalance = usdcBalances.sort(
            (a: any, b: any) =>
              new Date(b.last_transaction_timestamp).getTime() - new Date(a.last_transaction_timestamp).getTime(),
          )[0];
          formatted = Number(mostRecentBalance.amount) / 1e6;
        }
      }

      setBalance(formatted);
    } catch (error) {
      console.error("Error fetching USDC balance:", error);
      setBalance(0);
    } finally {
      setLoadingBalance(false);
    }
  };

  // Generate slug from market title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  };

  // Fetch all user profile data
  const fetchProfileData = async () => {
    if (!account?.address) return;

    const user = account.address.toString();

    try {
      const marketIds = await getAllMarketIds();
      const numMarketIds = marketIds.map((id) => Number(id));

      setLoadingMarkets(true);

      const detailsPromises = numMarketIds.map((id) => getMarketDetails(id));
      const allMarketDetails = (await Promise.all(detailsPromises)).filter((d) => d !== null) as MarketDetails[];
      setCreatedMarkets(allMarketDetails.filter((m) => m.creator === user));
      setLoadingMarkets(false);

      setLoadingPositions(true);
      const positionsPromises = numMarketIds.map((id) => getUserPositionDetails(id, user));
      const positionsPerMarket = await Promise.all(positionsPromises);
      const positionsByMarket = [];
      for (let i = 0; i < numMarketIds.length; i++) {
        const pos = positionsPerMarket[i];
        if (pos.length > 0) {
          const marketId = numMarketIds[i];
          const marketDetails = allMarketDetails.find((m) => Number(m.id) === marketId);
          if (marketDetails) {
            positionsByMarket.push({ marketId, positions: pos, marketDetails });
          }
        }
      }
      setUserPositionsByMarket(positionsByMarket);
      setLoadingPositions(false);

      setLoadingTrades(true);
      const tradesPromises = numMarketIds.map((id) => getUserTradeHistory(id, user, 50));
      let tradesResults = await Promise.all(tradesPromises);

      // Flatten the nested array structure properly and access raw data
      let allTrades = tradesResults
        .flatMap((result) => {
          // Each result is [Array] or [Array(n)], we need to flatten one more level
          if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
            return result[0];
          }
          return result;
        })
        .filter((t) => t !== null && t !== undefined);

      allTrades = allTrades.sort((a, b) => {
        const timeA = Number(a.timestamp || a.timestamp);
        const timeB = Number(b.timestamp || b.timestamp);
        return timeB - timeA;
      });
      // setTotalTrades(allTrades.length);
      setLoadingTrades(false);
      console.log("loadingTrades", loadingTrades);
      console.log("First trade after proper flattening:", allTrades[0]);

      // Calculate portfolio metrics from positions (source of truth)
      let totalInvested = 0;
      let positionsValue = 0;
      let unrealizedPnl = 0;

      positionsByMarket.forEach((pm) => {
        pm.positions.forEach((p) => {
          // Current market price
          const currentPriceBp = p.outcome === 1 ? Number(pm.marketDetails.yesPrice) : Number(pm.marketDetails.noPrice);
          const currentPrice = currentPriceBp / PRICE_SCALE;
          const shares = p.shares / 10 ** SHARES_DECIMALS;

          // Current value of position
          const value = shares * currentPrice;
          positionsValue += value;

          // Cost basis (what was actually paid including fees)
          const avgPrice = Number(p.avgPrice) / PRICE_SCALE;
          const cost = shares * avgPrice;
          totalInvested += cost;

          // Unrealized P&L
          unrealizedPnl += value - cost;
        });
      });

      // Calculate realized profit from closed positions
      // Total inflows from sells/redemptions
      const totalInflows = allTrades
        .filter((t) => t.tradeType === 2 || t.tradeType === 4 || t.tradeType === 5)
        .reduce((sum, t) => sum + Number(t.amount) / 10 ** SHARES_DECIMALS, 0);

      // Total outflows on buys
      let totalOutflows = allTrades
        .filter((t) => t.tradeType === 1 || t.tradeType === 3)
        .reduce((sum, t) => sum + Number(t.amount) / 10 ** SHARES_DECIMALS, 0);

      // Fallback: If no trade history for buys, use position cost basis as invested
      if (totalOutflows === 0 && totalInvested > 0) {
        totalOutflows = totalInvested;
      }

      // Realized profit = inflows - (outflows spent on positions that were closed)
      // Positions still held account for (totalInvested), so realized = inflows - (outflows - totalInvested)
      const realizedProfit = totalInflows - (totalOutflows - totalInvested);

      // Total profit = realized + unrealized
      const totalProfit = realizedProfit + unrealizedPnl;

      // Use total outflows as invested amount (total spent including all fees)
      setInvested(totalOutflows * 2);
      setProfit(totalProfit);
      setNetWorth(balance + positionsValue);

      let tempWins = 0;
      let tempLosses = 0;
      positionsByMarket.forEach((pm) => {
        if (pm.marketDetails.resolved) {
          const winningOutcome = pm.marketDetails.outcome;
          pm.positions.forEach((p) => {
            if (p.outcome === winningOutcome) tempWins++;
            else tempLosses++;
          });
        }
      });
      setWins(tempWins);
      setLosses(tempLosses);
      const totalResolved = tempWins + tempLosses;
      setWinRate(totalResolved > 0 ? (tempWins / totalResolved) * 100 : 0);

      const currentTime = Math.floor(Date.now() / 1000);
      const holdTimes = positionsByMarket.flatMap((pm) =>
        pm.positions.map((p) => (currentTime - Number(p.timestamp)) / 86400),
      );
      const avg = holdTimes.length > 0 ? holdTimes.reduce((sum, t) => sum + t, 0) / holdTimes.length : 0;
      setAvgHoldTime(avg);
    } catch (error) {
      console.error("Error fetching profile data:", error);
      setLoadingPositions(false);
      setLoadingTrades(false);
      setLoadingMarkets(false);
      // setLoadingPortfolio(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchProfileData();
  }, [account?.address]);

  // Overview Tab Component
  const OverviewTab = () => (
    <div className="space-y-6">
      <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl mb-5 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Portfolio</h2>
        </div>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-full bg-blue-500 flex items-center justify-center">
              <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-8 h-8 rounded-full" />
            </div>
            <div>
              {loadingBalance || !account?.address ? (
                <div className="h-9 w-32 bg-gray-700/50 rounded-lg animate-pulse mb-1"></div>
              ) : (
                <div className="text-3xl font-bold text-white">{netWorth.toFixed(2)}</div>
              )}
              <div className="text-sm text-gray-400">net worth</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-1">
              <div className="flex items-center justify-center flex-shrink-0">
                <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" />
              </div>
              {loadingBalance || !account?.address ? (
                <div className="h-5 w-16 bg-gray-700/50 rounded animate-pulse"></div>
              ) : (
                <span className="text-white font-bold text-sm sm:text-base truncate">{balance.toFixed(2)}</span>
              )}
            </div>
            <div className="text-xs text-gray-400">balance</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-1">
              <div className="flex items-center justify-center flex-shrink-0">
                <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" />
              </div>
              {loadingBalance || !account?.address ? (
                <div className="h-5 w-16 bg-gray-700/50 rounded animate-pulse"></div>
              ) : (
                <span className="text-white font-bold text-sm sm:text-base truncate">{invested.toFixed(2)}</span>
              )}
            </div>
            <div className="text-xs text-gray-400">invested</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-1">
              <div className="flex items-center justify-center flex-shrink-0">
                <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" />
              </div>
              {loadingBalance || !account?.address ? (
                <div className="h-5 w-16 bg-gray-700/50 rounded animate-pulse"></div>
              ) : (
                <span
                  className={`font-bold text-sm sm:text-base truncate ${profit >= 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {profit >= 0 ? "+" : ""}
                  {profit.toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400">profit/loss</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-1">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-500" />
              </div>
              <span className="text-white font-bold text-sm sm:text-base">1</span>
            </div>
            <div className="text-xs text-gray-400">Copper</div>
          </div>
        </div>
      </div>
      <div className="bg-[#2f2f33] rounded-xl p-6 border border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4">Stats</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400 flex items-center">Win/Loss Record</span>
              {loadingBalance || !account?.address ? (
                <div className="h-5 w-16 bg-gray-700/50 rounded animate-pulse"></div>
              ) : (
                <span className="text-white font-medium">
                  {wins}W - {losses}L
                </span>
              )}
            </div>
            {loadingBalance || !account?.address ? (
              <div className="h-2 w-full bg-gray-700/50 rounded-full animate-pulse"></div>
            ) : (
              <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-600">
                {wins === 0 && losses === 0 ? (
                  <div className="bg-gray-500 w-full" />
                ) : (
                  <>
                    <div className="bg-green-500" style={{ width: `${winRate}%` }} />
                    <div className="bg-red-500" style={{ width: `${100 - winRate}%` }} />
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm flex items-center">Win Rate</span>
            {loadingBalance || !account?.address ? (
              <div className="h-5 w-12 bg-gray-700/50 rounded animate-pulse"></div>
            ) : (
              <span className="text-white font-bold">{winRate.toFixed(0)}%</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm flex items-center">Total ROI</span>
            {loadingBalance || !account?.address ? (
              <div className="h-5 w-12 bg-gray-700/50 rounded animate-pulse"></div>
            ) : (
              <span className={`font-bold ${profit / invested >= 0 ? "text-green-400" : "text-red-400"}`}>
                {invested > 0 ? ((profit / invested) * 100).toFixed(0) : 0}%
              </span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm flex items-center">Avg Hold Time</span>
            {loadingBalance || !account?.address ? (
              <div className="h-5 w-16 bg-gray-700/50 rounded animate-pulse"></div>
            ) : (
              <span className="text-white font-medium">{avgHoldTime.toFixed(0)} days</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm flex items-center">Total Trades</span>
            {loadingBalance || !account?.address ? (
              <div className="h-5 w-12 bg-gray-700/50 rounded animate-pulse"></div>
            ) : (
              <span className="text-white font-medium">{user?.games_played ?? 0}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Positions Tab Component
  const PositionsTab = () => (
    <div className="space-y-4">
      <div className="bg-[#2f2f33] rounded-xl p-6 border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4">Your Positions ({userPositionsByMarket.length})</h3>
        {loadingPositions ? (
          <div className="text-center text-gray-400">Loading positions...</div>
        ) : userPositionsByMarket.length === 0 ? (
          <div className="border-b border-gray-800 last:border-b-0 py-10 mb-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-col items-center justify-center gap-3">
              <PackageOpen className="w-12 h-12 text-gray-600" />
              <div className="text-center space-y-1">
                {account?.address ? (
                  <p className="text-gray-400 text-sm font-medium">No active positions</p>
                ) : (
                  <p className="text-gray-400 text-sm font-medium">Sign in to view positions</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          userPositionsByMarket.map((pm) => {
            const isExpiringSoon = Number(pm.marketDetails.endTime) < Math.floor(Date.now() / 1000) + 86400;
            const slug = generateSlug(pm.marketDetails.title);
            return (
              <Link
                key={pm.marketId}
                href={`/market/${slug}/${pm.marketId}`}
                className="block border-b border-gray-700/20 last:border-b-0 p-2 rounded-md first:pt-0 last:pb-0 hover:bg-gray-700/20 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-center mb-2">
                  <p className="text-white font-medium text-sm">{pm.marketDetails.title}</p>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      pm.marketDetails.resolved
                        ? "bg-blue-500/20 text-blue-400"
                        : isExpiringSoon
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    {pm.marketDetails.resolved ? "Resolved" : isExpiringSoon ? "Closed" : "Active"}
                  </span>
                </div>
                {pm.positions.map((pos, index) => {
                  const currentPriceBp =
                    pos.outcome === 1 ? Number(pm.marketDetails.yesPrice) : Number(pm.marketDetails.noPrice);
                  const currentPrice = currentPriceBp / PRICE_SCALE;
                  const shares = pos.shares / 10 ** SHARES_DECIMALS;
                  const value = shares * currentPrice;
                  const avgPrice = Number(pos.avgPrice) / PRICE_SCALE;
                  const cost = shares * avgPrice;
                  const pnl = value - cost;
                  const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

                  return (
                    <div key={index} className="mb-3">
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-gray-400 text-xs mb-1">Position</p>
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              pos.outcome === 1 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {pos.outcome === 1 ? "YES" : "NO"} {shares.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs mb-1">P&L</p>
                          <p className={`font-bold text-sm ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {pnl >= 0 ? "+" : ""}
                            {pnl.toFixed(2)} ({pnlPercent >= 0 ? "+" : ""}
                            {pnlPercent.toFixed(1)}%)
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs mb-1">Current Price</p>
                          <p className="text-white font-medium">
                            {(currentPrice * 100).toFixed(2).replace(/\.00$/, "")}¢
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );

  // Markets Tab Component
  const MarketsTab = () => (
    <div className="space-y-4">
      <div className="bg-[#2f2f33] rounded-xl p-6 border-gray-700/20">
        <h3 className="text-lg font-bold text-white mb-4">Created Markets</h3>
        {loadingMarkets ? (
          <div className="text-center text-gray-400">Loading markets...</div>
        ) : createdMarkets.length === 0 ? (
          <div className="border-b border-gray-700/70 last:border-b-0 p-3 py-10 mb-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-col items-center justify-center gap-3">
              <PackageOpen className="w-12 h-12 text-gray-600" />
              <div className="text-center space-y-1">
                {account?.address ? (
                  <p className="text-gray-400 text-sm font-medium">No markets created yet</p>
                ) : (
                  <p className="text-gray-400 text-sm font-medium">Sign in to view your created markets</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          createdMarkets.map((market) => (
            <Link
              key={market.id}
              href={`/market/${generateSlug(market.title)}/${market.id}`}
              className="block border-b border-gray-700/20 last:border-b-0 p-2 rounded-md first:pt-0 last:pb-0 hover:bg-gray-700/20 transition-colors cursor-pointer"
            >
              <p className="text-white font-medium text-sm mb-3">{market.title}</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">TVL</p>
                  <p className="text-white font-medium">
                    {(Number(market.totalValueLocked) / 10 ** SHARES_DECIMALS).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Traders</p>
                  <p className="text-white font-medium">{market.participantCount}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Ends</p>
                  <p className="text-white font-medium">
                    {new Date(Number(market.endTime) * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "summary":
        return <OverviewTab />;
      case "positions":
        return <PositionsTab />;
      case "markets":
        return <MarketsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="min-h-screen bg-[#232328]">
      <header className="bg-[#1a1a1e2c] animate-fadeInDown sticky top-0 z-40 overflow-hidden border-b border-b-[var(--Stroke-Dark,#2c2c2f)] px-3 sm:px-4 lg:px-4">
        <div className="max-w-7xl mx-auto py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-6">
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                <Link href="/">
                  <img
                    src="/icons/p-lg.png"
                    alt="Pivot Logo"
                    className="ml-1 sm:ml-2 h-10 w-10 sm:h-12 sm:w-12 text-blue-400"
                  />
                </Link>
              </h1>
              <span className="text-gray-300 hidden lg:flex ml-6 font-medium transition-colors relative pb-1">
                Profile
                <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-3/4 h-[2px] bg-[#008259]"></span>
              </span>

              {/* Leaderboard Link - Desktop Only */}
              <Link href="/leaderboard" className="hidden lg:block group relative ml-6">
                <span className="text-gray-300 transition-colors duration-200 font-medium">Leaderboard</span>
                <span className="absolute left-0 -bottom-0.5 h-[2px] w-0 bg-[#008259] transition-all duration-300 group-hover:w-full"></span>
              </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {user && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-[#008259]/10 border border-[#008259]/30 rounded-lg">
                  <PixelCoins className="w-4 h-4 text-[#008259]" />
                  <span className="text-sm font-semibold text-[#008259]">{(user.points ?? 0).toLocaleString()}</span>
                </div>
              )}

              <div className="flex gap-1 sm:gap-2 items-center">
                <WalletSelector />
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-6xl px-4 sm:mx-auto mt-12 lg:pb-8 mx-auto py-6 pb-32">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full  bg-gradient-to-br from-green-500 to-emerald-600 p-0.5 shadow-lg shadow-green-500/20">
              <div className="w-full h-full rounded-full bg-gray-700/90 flex items-center justify-center">
                <User className="w-10 h-10 text-gray-300" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full p-1 shadow-lg shadow-green-500/30 ring-2 ring-emerald-900">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center align-middle justify-center gap-2">
              <h1 className="text-2xl font-bold text-white">
                {user?.username ? (
                  user?.username
                ) : (
                  <div className="h-9 w-32 bg-gray-700/50 rounded-lg animate-pulse mb-1"></div>
                )}
              </h1>
              <ChevronDown className="w-4 h-4 text-slate-200/70 mt-1" />
            </div>
            <p className="text-gray-400">{truncateAddress(account?.address.toStringLong())}</p>
          </div>
        </div>
        <div className="flex justify-center mb-6 pb-2 border-b border-gray-800">
          <div className="flex gap-1 w-full max-w-md">
            {[
              { id: "summary", icon: BriefcaseBusiness, label: "Summary" },
              { id: "positions", icon: Presentation, label: "Positions" },
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
        <AnimatePresence mode="wait">{renderTabContent()}</AnimatePresence>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default ProfilePage;
