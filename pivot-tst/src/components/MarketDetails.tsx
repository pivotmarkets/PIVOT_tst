import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  BarChart3,
  Minus,
  Wallet,
  ArrowUp,
  ArrowDown,
  Trophy,
  DollarSign,
  Heart,
  Users,
  CandlestickChart,
  BaggageClaim,
  DollarSignIcon,
  Clock,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import {
  formatTimestamp,
  getLatestTrades,
  getMarketAnalytics,
  getMarketDetails,
  getUserPositionDetails,
  TradeRecord,
  UserPosition,
} from "@/app/view-functions/markets";
import { WalletSelector } from "./WalletSelector";
import { useRouter } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { buyPosition, claimWinnings, sellPosition } from "@/app/entry-functions/trade";
import { aptosClient } from "@/utils/aptosClient";
import { convertAmountFromHumanReadableToOnChain } from "@/utils/helpers";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

// Types
interface Position {
  id: string;
  user: string;
  outcome: number;
  shares: number;
  avgPrice: number;
  timestamp: number;
}

interface MarketPoolBalances {
  yesPoolBalance: number;
  noPoolBalance: number;
  liquidityPoolBalance: number;
  totalValueLocked: number;
}

interface MarketDetailPageProps {
  market: any;
}

interface MarketDetails {
  id: string;
  title: string;
  description: string;
  creationTime: string;
  creator: string;
  endTime: string;
  noPoolValue: string;
  noPrice: string;
  oracle: string;
  outcome: { vec: string };
  participantCount: string;
  resolutionCriteria: string;
  resolved: boolean;
  totalLiquidity: string;
  totalNoShares: string;
  totalValueLocked: string;
  totalYesShares: string;
  yesPoolValue: string;
  yesPrice: string;
}

const MarketDetailPage: React.FC<MarketDetailPageProps> = ({ market }) => {
  const [userPositions, setUserPositions] = useState<Position[]>([]);
  const [marketDetails, setMarketDetails] = useState<MarketDetails>(null as any);
  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState<"YES" | "NO" | null>(null);
  const [amountUSDC, setAmountUSDC] = useState("5");
  const [selectedTimeFilter, setSelectedTimeFilter] = useState("ALL");
  const [priceHistory, setPriceHistory] = useState<any>([]);
  const [latestTrades, setLatestTrades] = useState<any>([]);
  const [marketAnalytics, setMarketAnalytics] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "positions" | "activity">("overview");
  const [sellLoading, setSellLoading] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signAndSubmitTransaction, account } = useWallet();

  useEffect(() => {
    const fetchMarketData = async () => {
      if (!market?.id || !account?.address) return;

      setLoading(true);

      try {
        // 1. Fetch market details
        const marketDetails = await getMarketDetails(market.id);
        fetchPriceHistory();
        if (marketDetails) {
          setMarketDetails(marketDetails as any);
        }

        // 2. Fetch user positions if wallet connected
        const positions: any = await getUserPositionDetails(market.id, account.address.toString());

        console.log("User positions:", positions);
        setUserPositions(positions || []);
      } catch (error) {
        console.error("Error fetching market data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketData();
  }, [market?.id, account?.address]);

  useEffect(() => {
    const refetchMissingData = async () => {
      if (!market?.id || !account?.address) return;

      // Check if critical data is missing
      const isMarketDetailsMissing =
        !marketDetails ||
        marketDetails.yesPrice === undefined ||
        marketDetails.noPrice === undefined ||
        marketDetails.totalYesShares === undefined ||
        marketDetails.totalNoShares === undefined;

      const isUserPositionsMissing = userPositions === null || userPositions === undefined;

      if (isMarketDetailsMissing || isUserPositionsMissing) {
        console.log("Missing data detected, refetching...", {
          isMarketDetailsMissing,
          isUserPositionsMissing,
        });

        try {
          if (isMarketDetailsMissing) {
            const marketDetails = await getMarketDetails(market.id);
            fetchPriceHistory();
            if (marketDetails) {
              setMarketDetails(marketDetails as any);
            }
          }

          if (isUserPositionsMissing) {
            const positions: any = await getUserPositionDetails(market.id, account.address.toString());
            setUserPositions(positions || []);
          }
        } catch (error) {
          console.error("Error refetching missing data:", error);
        }
      }
    };

    // Only run if we have the required dependencies
    if (market?.id && account?.address) {
      refetchMissingData();
    }
  }, [marketDetails, userPositions, market?.id, account?.address]);

  // helper
  const calculatePayout = (side: "YES" | "NO", amountUSDC: number) => {
    if (!amountUSDC || amountUSDC <= 0) return 0;
    const price: any = side === "YES" ? marketDetails.yesPrice : marketDetails.noPrice;
    const payout = (amountUSDC * 10000) / price;
    return payout;
  };

  const handleBuy = async () => {
    if (!account || !side) return;

    try {
      const marketId = marketDetails.id;
      const amount = parseFloat(amountUSDC);

      if (isNaN(amount) || amount <= 0) return;

      // Ensure prices are numbers
      const yesPrice = Number(marketDetails?.yesPrice) || 0;
      const noPrice = Number(marketDetails?.noPrice) || 0;

      // Pick correct side's price & shares
      const currentPrice = (side === "YES" ? yesPrice : noPrice) * 10000;
      const currentShares = Number(side === "YES" ? marketDetails.totalYesShares : marketDetails.totalNoShares) || 0;
      const oppositeShares = Number(side === "YES" ? marketDetails.totalNoShares : marketDetails.totalYesShares) || 0;

      if (currentPrice <= 0) {
        console.error("Invalid price for side", { side, currentPrice });
        return;
      }

      // Calculate shares
      const shares = Math.floor((amount * 10000) / currentPrice);
      const existingTotalShares = currentShares + oppositeShares;

      let maxSlippagePercent;

      // Handle slippage calculation based on whether market has existing shares
      if (existingTotalShares === 0) {
        // New market case: use high slippage tolerance since price can change significantly
        maxSlippagePercent = 5000; // 50% slippage tolerance for new markets
        console.log("New market detected, using high slippage tolerance");
      } else {
        // Existing market case: calculate price impact
        const totalShares = existingTotalShares + shares;
        const newPrice = Math.floor(((currentShares + shares) * 10000) / totalShares);
        const impact = Math.abs(newPrice - currentPrice);
        const suggestedSlippage = impact + 50;
        maxSlippagePercent = Math.max(suggestedSlippage, 100);
      }

      await onBuyPositionClick(marketId as any, side, amount, maxSlippagePercent);

      // Reset & close
      setIsOpen(false);
      setSide(null);
      setAmountUSDC("");
    } catch (error) {
      console.error(`Error buying ${side} position:`, error);
    }
  };

  const onBuyPositionClick = async (
    marketId: number,
    outcome: "YES" | "NO",
    amountUSDC: number,
    maxSlippageBasisPoints: number,
  ) => {
    if (!account) return;

    const USDC_DECIMALS = 6;
    const outcomeValue = outcome === "YES" ? 1 : 2;
    const maxSlippage = Math.max(maxSlippageBasisPoints, 100);

    try {
      console.log("Max slippage (basis points):", maxSlippage);

      const response = await signAndSubmitTransaction(
        buyPosition({
          marketId,
          outcome: outcomeValue,
          amount: convertAmountFromHumanReadableToOnChain(amountUSDC, USDC_DECIMALS),
          maxSlippage: maxSlippage,
        }),
      );

      await aptosClient().waitForTransaction({
        transactionHash: response.hash,
      });

      queryClient.refetchQueries();

      // Refetch market data after buying
      const marketDetails = await getMarketDetails(market.id);
      fetchPriceHistory();
      if (marketDetails) {
        setMarketDetails(marketDetails as any);
      }

      const positions: any = await getUserPositionDetails(market.id, account.address.toString());
      setUserPositions(positions || []);

      console.log("Buy position response:", response);
      return response;
    } catch (error) {
      console.error("Error buying position:", error);
      throw error;
    }
  };

  const transformTradeRecordsToProbabilityChart = (
    trades: TradeRecord[],
  ): Array<{ date: string; time: string; yesPrice: number; noPrice: number; timestamp: number }> => {
    if (!trades || trades.length === 0) {
      return [];
    }

    return trades
      .map((trade, index) => {
        const yesPriceAfter = parseFloat(trade.yesPriceAfter) / 100;
        const noPriceAfter = parseFloat(trade.noPriceAfter) / 100;

        const timestamp = parseInt(trade.timestamp);
        const date = new Date(timestamp * 1000);

        // Handle invalid timestamps
        const validDate = isNaN(date.getTime()) ? new Date() : date;

        return {
          date: validDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          time: validDate.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
          yesPrice: Math.max(0, Math.min(100, yesPriceAfter)),
          noPrice: Math.max(0, Math.min(100, noPriceAfter)),
          timestamp: timestamp || Date.now() / 1000,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount) / 1000000; // Convert from micro units
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getTradeTypeLabel = (tradeType: number, outcome: any) => {
    // trade_type: 0 = buy, 1 = sell, 2 = ?
    const action = tradeType === 0 ? "Bought" : tradeType === 1 ? "Bought" : tradeType === 2 ? "Sold" : "Funded";

    const side = "Funded";
    const isYes = false; // Default fallback

    return { action, side, isYes };
  };

  const truncateAddress = (address: string | any[]) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // function to fetch price history
  const fetchPriceHistory = async () => {
    try {
      const trades = await getLatestTrades(parseFloat(market.id), 100);
      const analytics = await getMarketAnalytics(market.id);

      console.log("analytics", analytics);
      console.log("latest trades", trades);

      // Set the analytics and trades data
      setMarketAnalytics(analytics as any);
      setLatestTrades(Array.isArray(trades) ? trades : []);

      const history = transformTradeRecordsToProbabilityChart(trades);
      setPriceHistory(history as any);
    } catch (error) {
      console.error("Error fetching price history:", error);
    }
  };

  // Helper functions to format the data
  const formatPrice = (price: string): number => {
    return parseInt(price) / 10000; // Convert from basis points to decimal
  };

  const formatCurrency = (value: string): string => {
    const numValue = parseInt(value) / 1000000;
    return `$${numValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const formatShares = (shares: number): string => {
    return (shares / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2 });
  };

  const formatDate = (timestamp: string): string => {
    return new Date(parseInt(timestamp) * 1000).toLocaleDateString();
  };

  const getTimeLeft = (endTime: string): string => {
    const endDate = new Date(parseInt(endTime) * 1000);
    const now = new Date();
    const timeDiff = endDate.getTime() - now.getTime();

    if (timeDiff <= 0) return "Market closed";

    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    return `${days} days left`;
  };

  const onSellPositionClick = async (marketId: any, positionId: any, sharesToSell: any, minPrice: number) => {
    if (!account) return;

    try {
      const response = await signAndSubmitTransaction(
        sellPosition({
          marketId,
          positionId,
          sharesToSell,
          minPrice,
        }),
      );

      await aptosClient().waitForTransaction({
        transactionHash: response.hash,
      });

      queryClient.refetchQueries();

      // Refetch market data after selling
      const marketDetails = await getMarketDetails(market.id);
      fetchPriceHistory();
      if (marketDetails) {
        setMarketDetails(marketDetails as any);
      }

      const positions: any = await getUserPositionDetails(market.id, account.address.toString());
      setUserPositions(positions || []);
      return response;
    } catch (error) {
      console.error("Error selling position:", error);
      throw error;
    }
  };

  const onClaimWinningsClick = async (marketId: any, positionId: any) => {
    if (!account) return;

    try {
      const response = await signAndSubmitTransaction(
        claimWinnings({
          marketId,
          positionId,
        }),
      );

      await aptosClient().waitForTransaction({
        transactionHash: response.hash,
      });

      queryClient.refetchQueries();

      // Refetch market data after claiming
      const marketDetails = await getMarketDetails(market.id);
      fetchPriceHistory();
      if (marketDetails) {
        setMarketDetails(marketDetails as any);
      }

      const positions: any = await getUserPositionDetails(market.id, account.address.toString());
      setUserPositions(positions || []);

      console.log("Claim winnings response:", response);
      return response;
    } catch (error) {
      console.error("Error claiming winnings:", error);
      throw error;
    }
  };

  const calculatePositionValue = (position: Position): number => {
    if (!marketDetails) return 0;

    const currentPrice =
      position.outcome === 1 ? formatPrice(marketDetails.yesPrice) : formatPrice(marketDetails.noPrice);

    return (position.shares / 1000000) * currentPrice;
  };

  const calculatePnL = (position: Position): { value: number; percentage: number } => {
    const currentValue = calculatePositionValue(position);
    const avgPricePaid = position.avgPrice / 10000; // Convert from basis points
    const initialValue = (position.shares / 1000000) * avgPricePaid;
    const pnlValue = currentValue - initialValue;
    const pnlPercentage = initialValue > 0 ? (pnlValue / initialValue) * 100 : 0;

    return { value: pnlValue, percentage: pnlPercentage };
  };

  const transformTradeRecordsToChart = (trades: any) => {
    return trades.map((trade: { yesPriceAfter: string; noPriceAfter: string; timestamp: string }) => {
      const yesPrice = formatPrice(trade.yesPriceAfter);
      const noPrice = formatPrice(trade.noPriceAfter);
      const date = formatTimestamp(trade.timestamp);

      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        time: date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
        yesPrice: yesPrice,
        noPrice: noPrice,
        timestamp: parseInt(trade.timestamp),
      };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#232328]">
        <header className="bg-[#1a1a1e2c] sticky top-0 z-40 overflow-hidden animate-fadeInUp border-b border-b-[var(--Stroke-Dark,#2c2c2f)]">
          <div className="max-w-7xl mx-auto py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <h1 className="text-2xl font-bold text-white">
                  <Link href="/">
                    <img src="/icons/p-lg.png" alt="Pivot Logo" className="ml-2 h-12 w-12 cursor-pointer" />
                  </Link>
                </h1>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex gap-2 items-center flex-wrap">
                  <WalletSelector />
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto mt-12">
          <div className="animate-pulse">
            <div className="h-8 bg-[#2f2f33] rounded-lg w-1/3 mb-6"></div>
            <div className="h-64 bg-[#2f2f33] rounded-lg mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-32 bg-[#2f2f33] rounded-lg"></div>
              <div className="h-32 bg-[#2f2f33] rounded-lg"></div>
              <div className="h-32 bg-[#2f2f33] rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-[#232328] p-6 flex items-center justify-center">
        <div className="text-white text-xl">Market not found</div>
      </div>
    );
  }

  const getResolutionOutcome = (outcome: { vec: any }) => {
    if (!outcome || !outcome.vec) return null;

    // Assuming '0x01' represents YES and '0x00' represents NO
    return outcome.vec === "0x01" ? "YES" : "NO";
  };

  // Determine which outcome is dominating
  const isDominatingYes = market.yesPrice > market.noPrice;
  const dominatingOutcome = isDominatingYes ? "YES" : "NO";

  // Transform data to show only the dominating outcome

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const color = isDominatingYes ? "#10b981" : "#ef4444";

      return (
        <div className="bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-xl">
          <p className="text-gray-300 text-sm font-medium mb-2">{data.time}</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
            <p className="text-sm" style={{ color }}>
              {dominatingOutcome}: {payload[0].value.toFixed(1)}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const resolutionOutcome = marketDetails.resolved ? getResolutionOutcome(marketDetails.outcome) : null;

  const yesPrice = formatPrice(marketDetails.yesPrice);
  const noPrice = formatPrice(marketDetails.noPrice);
  const currentTime = Date.now() / 1000; // current epoch in seconds
  const endTime = parseInt(marketDetails.endTime);

  const isClosed = currentTime >= endTime;

  // Calculate user's total position value
  const totalPositionValue = userPositions.reduce((total, position) => {
    return total + calculatePositionValue(position);
  }, 0);

  return (
    <div className="min-h-screen bg-[#232328] ">
      <header className="bg-[#1a1a1e2c] sticky top-0 z-40 overflow-hidden animate-fadeInUp border-b border-b-[var(--Stroke-Dark,#2c2c2f)]">
        <div className="max-w-7xl mx-auto py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-white">
                <Link href="/">
                  <img src="/icons/p-lg.png" alt="Pivot Logo" className="ml-2 h-12 w-12 cursor-pointer" />
                </Link>
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-2 items-center flex-wrap">
                <WalletSelector />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto mt-12 mb-5 pb-6">
        {/* Market Info Card */}
        <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl mb-5 p-6">
          {/* Market Header Section */}
          <div className="mb-6">
            {/* Market title */}
            <h1 className="text-2xl md:text-3xl mb-5 font-bold text-white ">{marketDetails.title}</h1>

            {/* Creator + Market stats row */}
            <div className="flex items-center justify-between mb-6">
              {/* Creator info */}
              <div className="flex items-center gap-3">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=32&h=32&fit=crop&crop=face"
                  alt="Creator"
                  className="w-5 h-5 rounded-full"
                />
                <span className="text-gray-400">
                  {marketDetails.creator
                    ? `${marketDetails.creator.slice(0, 6)}...${marketDetails.creator.slice(-4)}`
                    : ""}
                </span>
                {/* <span className="text-blue-400 text-sm">👑</span> */}
              </div>

              {/* Market stats row */}
              <div className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{marketDetails.participantCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSignIcon className="w-4 h-4" />
                  <span>{(Number(market.totalValueLocked) / 1e6).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CandlestickChart className="w-4 h-4 text-gray-400" />
                  <span>{(Number(market.totalVolume) / 1e6).toLocaleString()} USDC</span>
                </div>
                <span className="text-gray-500">
                  {marketDetails.resolved
                    ? `resolved ${new Date(parseInt(marketDetails.endTime) * 1000).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}`
                    : `${getTimeLeft(marketDetails.endTime)}`}
                </span>
              </div>
            </div>

            {/* Current probability display */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl md:text-5xl font-bold ${yesPrice > noPrice ? "text-green-400" : "text-red-400"}`}
                >
                  {yesPrice > noPrice ? (yesPrice * 100).toFixed(1) : (noPrice * 100).toFixed(1)}%
                </span>
                <span className="text-gray-400 text-lg">chance</span>

                {/* Price change indicator */}
                <div className="flex items-baseline gap-1 text-sm">
                  {/* You can add price change calculation here */}
                  <span className="text-red-400">
                    {latestTrades &&
                      Array.isArray(latestTrades) &&
                      latestTrades.length > 0 &&
                      (() => {
                        const latestTrade = latestTrades[0];
                        const priceChange =
                          parseFloat(latestTrade.yesPriceAfter) - parseFloat(latestTrade.yesPriceBefore);
                        const isPriceIncrease = priceChange > 0;

                        return priceChange !== 0 ? (
                          <div
                            className={`flex items-center ${isPriceIncrease ? "text-emerald-600" : "text-rose-600"}`}
                          >
                            <span className="text-sm font-medium">
                              {isPriceIncrease ? "↑" : "↓"} {(priceChange / 100).toFixed(2)}
                            </span>
                          </div>
                        ) : null;
                      })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Time filter buttons - positioned top right */}
          <div className="flex justify-end mb-4">
            <div className="flex bg-[#2f2f33] border border-gray-700 rounded-lg p-1">
              {["1H", "6H", "1D", "1W", "1M", "ALL"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedTimeFilter(filter)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    selectedTimeFilter === filter ? "bg-emerald-500 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceHistory} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                <defs>
                  <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="50%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="50%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="1 1" stroke="#374151" horizontal={true} vertical={false} />

                <XAxis dataKey="time" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />

                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}%`}
                />

                <Tooltip content={<CustomTooltip />} />

                {/* Show only the dominating outcome */}
                <Area
                  type="stepAfter"
                  dataKey={yesPrice > noPrice ? "yesPrice" : "noPrice"}
                  stroke={yesPrice > noPrice ? "#10b981" : "#ef4444"}
                  strokeWidth={2}
                  fill={yesPrice > noPrice ? "url(#yesGradient)" : "url(#noGradient)"}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: yesPrice > noPrice ? "#10b981" : "#ef4444",
                    stroke: "#2f2f33",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Current Dominating Price Indicator */}
          <div className="mt-4">
            {/* Dominance Bar showing split between Yes and No */}
            <div className="mt-4">
              <div className="">
                {/* Dominance Bar */}
                <div className="relative h-4 bg-slate-100/70 rounded-md overflow-hidden">
                  {/* Yes side (left) */}
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-300/80 to-emerald-400/80 transition-all duration-500 ease-out"
                    style={{ width: `${yesPrice * 100}%` }}
                  />

                  {/* No side (right) */}
                  <div
                    className="absolute right-0 top-0 h-full bg-gradient-to-l from-rose-300/80 to-rose-400/80 transition-all duration-500 ease-out"
                    style={{ width: `${noPrice * 100}%` }}
                  />

                  {/* Center divider line */}
                  <div className="absolute left-1/2 top-0 w-px h-full bg-slate-300/40 transform -translate-x-0.5" />
                </div>

                {/* Percentage Labels */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-md bg-gradient-to-r from-emerald-300/80 to-emerald-400/80" />
                    <span className="text-sm font-medium text-emerald-600">Yes {(yesPrice * 100).toFixed(1)}%</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-rose-600">No {(noPrice * 100).toFixed(1)}%</span>
                    <div className="w-3 h-3 rounded-md bg-gradient-to-l from-rose-300/80 to-rose-400/80" />
                  </div>
                </div>
              </div>
            </div>

            {/* Additional context */}
            <div className="mt-2 text-center">
              <span className="text-gray-500 text-sm">
                Market confidence: {Math.abs((yesPrice - noPrice) * 100).toFixed(1)}% spread
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {!marketDetails.resolved && !isClosed && (
          <div className="grid grid-cols-1 mb-6 md:grid-cols-2 gap-4">
            <button
              className="bg-[#008259] hover:bg-green-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              onClick={() => {
                setSide("YES");
                setIsOpen(true);
              }}
            >
              <ArrowUp className="w-5 h-5" />
              Buy YES
            </button>

            <button
              className="bg-[#d32f2f] hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              onClick={() => {
                setSide("NO");
                setIsOpen(true);
              }}
            >
              <ArrowDown className="w-5 h-5" />
              Buy NO
            </button>
          </div>
        )}

        {isOpen && (
          <div className="fixed inset-0 flex items-center backdrop-blur-sm justify-center bg-black/50 z-50">
            <div className="bg-[#232328] text-white pb-8 pt-6 px-6 rounded-xl shadow-lg w-[400px] max-w-[90vw]">
              {/* Header with Yes/No buttons */}
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setSide("YES")}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                    side === "YES" ? "bg-[#008259] text-white" : "bg-[#4a4a4a] text-gray-300 hover:bg-[#5a5a5a]"
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => setSide("NO")}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                    side === "NO" ? "bg-[#8b4444] text-white" : "bg-[#4a4a4a] text-gray-300 hover:bg-[#5a5a5a]"
                  }`}
                >
                  No
                </button>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setSide(null);
                      setAmountUSDC("");
                    }}
                    className="px-3 py-2 bg-[#3a3d4a] rounded-lg text-lg hover:bg-[#4a4d5a]"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Bet Amount Section */}
              <div className="mb-6">
                <label className="block mb-3 text-gray-300 text-sm font-medium">Bet amount</label>
                <div className="relative">
                  <div className="flex items-center bg-[#1e2028] border-2 border-[#4a5568] rounded-lg p-3 focus-within:border-[#008259]">
                    <div className="flex items-center gap-2 mr-3">
                      <div className="w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={amountUSDC}
                        onChange={(e) => setAmountUSDC(e.target.value)}
                        className="bg-transparent text-white text-lg font-semibold outline-none min-w-0 flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="5"
                      />
                    </div>
                    <div className="flex -ml-28 gap-2">
                      <button
                        onClick={() => setAmountUSDC((prev) => Math.max(0, (parseFloat(prev) || 0) - 10).toString())}
                        className="px-3 py-1 bg-[#3a3d4a] rounded text-sm hover:bg-[#4a4d5a] transition-colors"
                      >
                        -10
                      </button>
                      <button
                        onClick={() => setAmountUSDC((prev) => ((parseFloat(prev) || 0) + 10).toString())}
                        className="px-3 py-1 bg-[#3a3d4a] rounded text-sm hover:bg-[#4a4d5a] transition-colors"
                      >
                        +10
                      </button>
                      <button
                        onClick={() => setAmountUSDC((prev) => ((parseFloat(prev) || 0) + 50).toString())}
                        className="px-3 py-1 bg-[#3a3d4a] rounded text-sm hover:bg-[#4a4d5a] transition-colors"
                      >
                        +50
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Probability and Payout Info */}
              <div className="mb-6 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">New probability</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-lg font-bold">
                      {side === "YES" ? `${(yesPrice * 100).toFixed(2)}%` : `${(noPrice * 100).toFixed(2)}%`}
                    </span>
                    {latestTrades &&
                      Array.isArray(latestTrades) &&
                      latestTrades.length > 0 &&
                      (() => {
                        const latestTrade = latestTrades[0];
                        const priceChange =
                          parseFloat(latestTrade.yesPriceAfter) - parseFloat(latestTrade.yesPriceBefore);
                        const isPriceIncrease = priceChange > 0;

                        return priceChange !== 0 ? (
                          <span className={`text-sm ${isPriceIncrease ? "text-emerald-400" : "text-rose-400"}`}>
                            {isPriceIncrease ? "↑" : "↓"} {(Math.abs(priceChange) / 100).toFixed(2)}% 🔒
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">No change 🔒</span>
                        );
                      })()}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">To win</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-lg font-bold">
                      ${amountUSDC ? calculatePayout(side as any, parseFloat(amountUSDC)).toFixed(1) : "0"}
                    </span>
                    <span className="text-emerald-400 text-sm font-medium">
                      +
                      {amountUSDC
                        ? (
                            (calculatePayout(side as any, parseFloat(amountUSDC)) / parseFloat(amountUSDC || "1") - 1) *
                            100
                          ).toFixed(1)
                        : "0"}
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleBuy}
                disabled={!side || !amountUSDC}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition-colors ${
                  side === "NO"
                    ? "bg-[#d32f2f] hover:bg-[#b71c1c] text-white"
                    : "bg-[#008259] hover:bg-[#006b47] text-white"
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                Buy {side || "NO"} to win $
                {amountUSDC ? calculatePayout(side as any, parseFloat(amountUSDC)).toFixed(1) : "0"}
              </button>

              {/* Balance */}
              <div className="mt-6 flex justify-between items-center text-sm">
                <span className="text-gray-400">bal:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">0 USDC</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-[#2f2f33] border border-gray-700/50 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-[#008259] text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("positions")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "positions"
                ? "bg-[#008259] text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            Your Positions
            {userPositions.length > 0 && (
              <span className="ml-2 bg-[#008259] text-white text-xs px-2 py-1 rounded-full">
                {userPositions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "activity"
                ? "bg-[#008259] text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            Trades
            {userPositions.length > 0 && (
              <span className="ml-2 bg-[#008259] text-white text-xs px-2 py-1 rounded-full">
                {marketAnalytics?.totalTrades}
              </span>
            )}
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">TVL</h3>
                <div className="text-2xl font-bold text-slate-400">
                  {formatCurrency(marketDetails.totalValueLocked)}
                </div>
              </div>
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Total Liquidity</h3>
                <div className="text-2xl font-bold text-slate-400">{formatCurrency(marketDetails?.totalLiquidity)}</div>
              </div>
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Created</h3>
                <div className="text-lg font-bold text-gray-300">{formatDate(marketDetails.creationTime)}</div>
              </div>

              {/* Additional stats */}
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">YES Shares</h3>
                <div className="text-lg font-bold text-green-400">
                  {(parseInt(marketDetails.totalYesShares) / 1000000).toLocaleString()}
                </div>
              </div>
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">NO Shares</h3>
                <div className="text-lg font-bold text-red-400">
                  {(parseInt(marketDetails.totalNoShares) / 1000000).toLocaleString()}
                </div>
              </div>
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Market Ends</h3>
                <div className="text-lg font-bold text-gray-300">{formatDate(marketDetails.endTime)}</div>
              </div>
            </div>

            {/* Resolution Criteria */}
            <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Resolution Criteria</h3>
              <div className="text-sm font-bold text-slate-200">{marketDetails.resolutionCriteria}</div>
            </div>
          </div>
        )}

        {/* Positions Tab */}
        {activeTab === "positions" && (
          <div className="space-y-6">
            {!account?.address ? (
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-8 text-center">
                <div className="text-gray-400 mb-4">
                  <Wallet className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
                  <p>Connect your wallet to view your positions in this market.</p>
                </div>
              </div>
            ) : userPositions.length === 0 ? (
              <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-8 text-center">
                <div className="text-gray-400">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Positions Yet</h3>
                  <p>You don't have any positions in this market. Start trading to see your positions here.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Position Summary */}
                <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Position Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-400">${totalPositionValue.toFixed(2)}</div>
                      <div className="text-sm text-gray-400">Total Value</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-400">{userPositions.length}</div>
                      <div className="text-sm text-gray-400">Total Positions</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-300">
                        {formatShares(userPositions.reduce((sum, pos) => sum + pos.shares, 0))}
                      </div>
                      <div className="text-sm text-gray-400">Total Shares</div>
                    </div>
                  </div>
                </div>

                {/* Individual Positions */}
                {userPositions.map((position, index) => {
                  const pnl = calculatePnL(position);
                  const sellKey = `${position.outcome}-${position.user}`;
                  const isLoading = sellLoading[sellKey];
                  const outcomeText = position.outcome === 1 ? "YES" : "NO";
                  const outcomeColor = position.outcome === 1 ? "green" : "red";
                  const currentPrice = position.outcome === 1 ? yesPrice : noPrice;
                  console.log("current price", currentPrice);
                  // Helper function to get resolution outcome
                  const getResolutionOutcome = (outcome: { vec: any }) => {
                    if (!outcome || !outcome.vec) return null;
                    return outcome.vec === "0x01" ? 1 : 0; // 1 for YES, 0 for NO
                  };

                  // Check if this position won (only relevant when market is resolved)
                  const marketResolution = marketDetails.resolved ? getResolutionOutcome(marketDetails.outcome) : null;
                  const positionWon = marketDetails.resolved && position.outcome === marketResolution;

                  console.log("position--", position);

                  return (
                    <div key={index} className="bg-[#2f2f33] border border-gray-700/80 rounded-xl p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              position.outcome === 1
                                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                            }`}
                          >
                            {outcomeText}
                          </div>
                          <div>
                            <h4 className="text-lg font-semibold text-white">{formatShares(position.shares)} shares</h4>
                            <p className="text-sm text-gray-400">Bought at {(position.avgPrice / 100).toFixed(1)}¢</p>
                          </div>
                        </div>

                        {/* Conditional Action Button */}
                        {!marketDetails.resolved && !isClosed ? (
                          // Market is live - show sell button
                          <button
                            onClick={() =>
                              onSellPositionClick(
                                marketDetails.id,
                                position.id,
                                position.shares,
                                Math.floor(currentPrice * 10000),
                              )
                            }
                            disabled={isLoading}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                              isLoading
                                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                : "bg-[#008259] hover:bg-blue-500 text-white"
                            }`}
                          >
                            {isLoading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                Selling...
                              </>
                            ) : (
                              <>
                                <Minus className="w-4 h-4" />
                                Sell All
                              </>
                            )}
                          </button>
                        ) : marketDetails.resolved && positionWon ? (
                          // Market is resolved and this position won - show claim button
                          <button
                            onClick={() => onClaimWinningsClick(marketDetails.id, position.id)}
                            disabled={isLoading}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                              isLoading
                                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                : "bg-green-600 hover:bg-green-500 text-white"
                            }`}
                          >
                            {isLoading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                Claiming...
                              </>
                            ) : (
                              <>
                                <Trophy className="w-4 h-4" />
                                Claim Winnings
                              </>
                            )}
                          </button>
                        ) : marketDetails.resolved && !positionWon ? (
                          // Market is resolved and this position lost - show status
                          <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                            Lost Bet
                          </div>
                        ) : (
                          // Market is closed but not resolved - show status
                          <div className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
                            Market Closed
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Current Price</div>
                          <div className="text-white font-semibold">{(currentPrice * 100).toFixed(1)}¢</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Current Value</div>
                          <div className="text-white font-semibold">${calculatePositionValue(position).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">P&L</div>
                          <div className={`font-semibold ${pnl.value >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {pnl.value >= 0 ? "+" : ""}${pnl.value.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">P&L %</div>
                          <div className={`font-semibold ${pnl.percentage >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {pnl.percentage >= 0 ? "+" : ""}
                            {pnl.percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-700/50">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Position opened: {new Date(position.timestamp * 1000).toLocaleDateString()}</span>
                          <span>
                            User: {position.user.slice(0, 6)}...{position.user.slice(-4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && (
          <div className="space-y-6">
            {/* Market Analytics Summary */}

            {/* Recent Trades */}
            <div className="bg-[#2f2f33] border border-gray-700/50 rounded-xl p-6">
              {latestTrades && Array.isArray(latestTrades) && latestTrades.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No recent trading activity</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {latestTrades &&
                    Array.isArray(latestTrades) &&
                    latestTrades.slice(0, 20).map((trade, index) => {
                      const { action, side, isYes } = getTradeTypeLabel(trade.tradeType, trade.outcome);
                      const priceChange = parseFloat(trade.yesPriceAfter) - parseFloat(trade.yesPriceBefore);
                      const isPriceIncrease = priceChange > 0;

                      // Determine if this is a Yes or No trade from price movement
                      const isYesTrade = parseFloat(trade.yesPriceAfter) > parseFloat(trade.yesPriceBefore);
                      const actualSide = isYesTrade ? "Yes" : "No";

                      return (
                        <div
                          key={trade.tradeId || index}
                          className="flex items-center justify-between p-4 rounded-lg bg-[#2f2f33] border border-gray-700/50"
                        >
                          <div className="flex items-center space-x-3">
                            {/* Action Icon */}
                            <div className={`p-2 rounded-full ${isYesTrade ? "bg-emerald-100/80" : "bg-rose-100/80"}`}>
                              <User className={`w-4 h-4 ${isYesTrade ? "text-emerald-600" : "text-rose-600"}`} />
                            </div>

                            {/* Trade Details */}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-slate-300">{truncateAddress(trade.user)}</span>
                                <span className="text-slate-500">{action}</span>
                                <span
                                  className={`font-semibold px-2 py-1 rounded text-xs ${
                                    isYesTrade ? "bg-emerald-100/80 text-emerald-700" : "bg-rose-100/70 text-rose-700"
                                  }`}
                                >
                                  {actualSide}
                                </span>
                              </div>
                              <div className="text-sm text-slate-500">{formatDate(trade.timestamp)}</div>
                            </div>
                          </div>

                          {/* Trade Value & Price Impact */}
                          <div className="text-right">
                            <div className="text-sm text-slate-500">
                              {formatPrice((trade.amount / 100).toString())} USDC
                            </div>
                            {priceChange !== 0 && (
                              <div
                                className={`text-xs flex items-center ${
                                  isPriceIncrease ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {isPriceIncrease ? "+" : ""}
                                {(priceChange / 100).toFixed(2)}%
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketDetailPage;
