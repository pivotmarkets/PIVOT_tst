import React, { useState, useEffect } from "react";
import {
  Activity,
  BarChart3,
  Minus,
  Wallet,
  ArrowUp,
  ArrowDown,
  Trophy,
  DollarSign,
  Users,
  CandlestickChart,
  DollarSignIcon,
  Clock,
  TrendingDown,
  TrendingUp,
  User,
  Calendar,
  Droplets,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import {
  getLatestTrades,
  getMarketAnalytics,
  getMarketDetails,
  getUserPositionDetails,
  TradeRecord,
} from "@/app/view-functions/markets";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { WalletSelector } from "./WalletSelector";
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
  const [side, setSide] = useState<"YES" | "NO">(null as any);
  const [amountUSDC, setAmountUSDC] = useState("");
  const [selectedTimeFilter, setSelectedTimeFilter] = useState("ALL");
  const [priceHistory, setPriceHistory] = useState<any>([]);
  const [latestTrades, setLatestTrades] = useState<any>([]);
  const [marketAnalytics, setMarketAnalytics] = useState<any>(null);
  const [claimedPositions, setClaimedPositions] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "positions" | "activity">("overview");
  const USDC_ASSET_ADDRESS: string = "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832";

  const [sellLoading] = useState<{ [key: string]: boolean }>({});
  const queryClient = useQueryClient();
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
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
          console.log("marketDetails:", marketDetails);
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
  const calculatePayout = (betSide: string, amount: number) => {
    if (!betSide || !amount || amount <= 0) return 0;

    // Apply 1% trading fee
    const feeRate = 0.01; // 1%
    const amountAfterFee = amount * (1 - feeRate);

    // Calculate payout using your contract's logic
    const price = betSide === "YES" ? yesPrice : noPrice;
    const payout = (amountAfterFee * 10000) / (price * 10000); // Matching your contract format

    return payout;
  };

  const handleBuy = async () => {
    if (!account || !side) return;
    if (sliderValue > balance) {
      alert(`Insufficient balance. Your balance is ${balance} USDC`);
      return;
    }
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
      setSide(null as any);
      setAmountUSDC("");
    } catch (error) {
      console.error(`Error buying ${side} position:`, error);
    }
  };

  const setValidatedAmount = (value: string) => {
    const numValue = parseFloat(value) || 0;
    const cappedValue = Math.min(numValue, balance);
    setAmountUSDC(cappedValue > 0 ? cappedValue.toString() : "");
  };

  // Handle input change with validation
  const handleAmountChange = (e: { target: { value: any } }) => {
    const value = e.target.value;
    if (value === "" || value === "0") {
      setAmountUSDC("");
      return;
    }
    setValidatedAmount(value);
  };

  // Handle slider change
  const handleSliderChange = (e: { target: { value: string } }) => {
    const value = parseFloat(e.target.value);
    setAmountUSDC(value > 0 ? value.toString() : "");
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
      await refetchUSDCBalance();

      queryClient.refetchQueries();

      // Correct success toast message
      toast.success(`Successfully bought ${outcome} position for ${amountUSDC.toFixed(2)} USDC`, {
        style: {
          backgroundColor: "#064e3b",
          color: "#6ee7b7",
          fontWeight: "bold",
          border: "1px solid #10b981",
        },
        duration: 6000,
      });

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

      // Add error toast
      toast.error("Failed to buy position. Please try again.", {
        style: {
          backgroundColor: "#7f1d1d",
          color: "#fca5a5",
          fontWeight: "bold",
          border: "1px solid #fca5a5",
        },
        duration: 6000,
      });

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
      .map((trade) => {
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

  const { balance, refetch: refetchUSDCBalance } = useUSDCBalance();

  const getTradeTypeLabel = (tradeType: number) => {
    // trade_type: 1 = buy, 2 = sell, 3 = add liquidity, 4 = remove liquidity, 5 = claim winnings, 6 = resolve
    const action =
      tradeType === 1
        ? "Bought"
        : tradeType === 2
          ? "Sold"
          : tradeType === 3
            ? "Added Liquidity"
            : tradeType === 4
              ? "Removed Liquidity"
              : tradeType === 5
                ? "Claimed Winnings"
                : tradeType === 6
                  ? "Resolved"
                  : "Unknown";

    const side = "Funded";
    const isYes = false;

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

  const formatShares = (shares: number): string => {
    return (shares / 1000000).toLocaleString(undefined, { minimumFractionDigits: 0 });
  };

  const formatDate = (timestamp: string): string => {
    return new Date(parseInt(timestamp) * 1000).toLocaleDateString();
  };

  function getTimeLeft(endTimeEpoch: string) {
    const now = Date.now() / 1000; // current time in seconds
    const secondsLeft = parseInt(endTimeEpoch) - now;

    if (secondsLeft <= 0) return "Ended";

    const days = Math.floor(secondsLeft / (3600 * 24));
    const hours = Math.floor((secondsLeft % (3600 * 24)) / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

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
      await refetchUSDCBalance();

      queryClient.refetchQueries();

      // Success toast message
      toast.success(`Successfully sold ${formatShares(sharesToSell)} shares`, {
        style: {
          backgroundColor: "#064e3b",
          color: "#6ee7b7",
          fontWeight: "bold",
          border: "1px solid #10b981",
        },
        duration: 6000,
      });

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

      // Error toast message
      toast.error("Failed to sell position. Please try again.", {
        style: {
          backgroundColor: "#7f1d1d",
          color: "#fca5a5",
          fontWeight: "bold",
          border: "1px solid #fca5a5",
        },
        duration: 6000,
      });

      throw error;
    }
  };

  const onClaimWinningsClick = async (marketId: any, positionId: any) => {
    if (!account) return;

    const claimKey = `${marketId}-${positionId}`;

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

      // Mark position as claimed
      setClaimedPositions((prev) => new Set(prev).add(claimKey));

      await refetchUSDCBalance();
      queryClient.refetchQueries();

      // Success toast message
      toast.success("🎉 Winnings claimed successfully!", {
        style: {
          backgroundColor: "#064e3b",
          color: "#6ee7b7",
          fontWeight: "bold",
          border: "1px solid #10b981",
        },
        duration: 8000,
      });

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
      toast.error("Failed to claim winnings. Please check your position and try again.", {
        style: {
          backgroundColor: "#7f1d1d",
          color: "#fca5a5",
          fontWeight: "bold",
          border: "1px solid #fca5a5",
        },
        duration: 6000,
      });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#232328]">
        <header className="bg-[#1a1a1e2c] sticky top-0 z-40 overflow-hidden animate-fadeInUp border-b border-b-[var(--Stroke-Dark,#2c2c2f)]">
          <div className="max-w-7xl mx-auto py-4 px-3 sm:px-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <h1 className="text-2xl font-bold text-white">
                  <Link href="/">
                    <img
                      src="/icons/p-lg.png"
                      alt="Pivot Logo"
                      className="ml-1 sm:ml-2 h-10 w-10 sm:h-12 sm:w-12 text-blue-400"
                    />
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

        <div className="max-w-6xl pb-12 mx-3 lg:mx-auto mt-12">
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
  const currentAmount = parseFloat(amountUSDC) || 0;
  const isOverBalance = currentAmount > balance;
  const sliderValue = Math.min(currentAmount, balance);

  const calculateProgress = () => {
    const now = new Date();
    const created = new Date(marketDetails.creationTime);
    const end = new Date(marketDetails.endTime);

    if (marketDetails.resolved) return 100;
    if (now >= end) return 75;
    if (now < created) return 0;

    const total = end.getTime() - created.getTime();
    const elapsed = now.getTime() - created.getTime();
    return Math.min((elapsed / total) * 33.33, 33.33); // First phase is 33.33%
  };

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
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
  console.log("resolution", resolutionOutcome);
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
        <div className="max-w-7xl mx-auto py-4 px-3 sm:px-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-white">
                <Link href="/">
                  <img
                    src="/icons/p-lg.png"
                    alt="Pivot Logo"
                    className="ml-1 sm:ml-2 h-10 w-10 sm:h-12 sm:w-12 text-blue-400"
                  />
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

      <div className="max-w-6xl px-3 sm:mx-auto mt-12 pb-16">
        {/* Market Info Card */}
        <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl mb-5 p-5 sm:p-6">
          {/* Market Header Section */}
          <div className="mb-6">
            {/* Market title */}
            <h1 className="text-2xl md:text-3xl mb-5 font-bold text-white ">{marketDetails.title}</h1>

            {/* Creator + Market stats row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              {/* Creator info */}
              <div className="flex items-center gap-3">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=32&h=32&fit=crop&crop=face"
                  alt="Creator"
                  className="w-6 h-6 sm:w-5 sm:h-5 rounded-full"
                />
                <span className="text-gray-400 text-sm sm:text-md">
                  {marketDetails.creator
                    ? `${marketDetails.creator.slice(0, 6)}...${marketDetails.creator.slice(-4)}`
                    : ""}
                </span>
              </div>

              {/* Market stats row */}
              <div className="flex flex-wrap items-center gap-3 mt-4 sm:gap-4 text-gray-400 text-xs sm:text-md">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{marketDetails.participantCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSignIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{(Number(market.totalValueLocked) / 1e6).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <CandlestickChart className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  <span className="whitespace-nowrap">{(Number(market.totalVolume) / 1e6).toLocaleString()} USDC</span>
                </div>
                <span
                  className={`flex gap-1 sm:gap-2 items-center whitespace-nowrap ${
                    marketDetails.resolved
                      ? `px-2 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-semibold ${
                          resolutionOutcome === "YES"
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                        }`
                      : "text-gray-500"
                  }`}
                >
                  {marketDetails.resolved ? (
                    <>
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="">Resolved </span>
                      {resolutionOutcome}
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                      {getTimeLeft(marketDetails.endTime)}
                    </>
                  )}
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
            <div className="flex bg-[#2f2f33] border border-gray-700 rounded-lg p-0.5 sm:p-1 overflow-x-auto">
              {["1H", "6H", "1D", "1W", "1M", "ALL"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedTimeFilter(filter)}
                  className={`px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap min-w-0 ${
                    selectedTimeFilter === filter ? "bg-emerald-500 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="h-64 sm:h-80 w-full -translate-x-[20px] sm:translate-x-0 transform sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={priceHistory}
                margin={{
                  top: 10,
                  right: window.innerWidth < 640 ? 10 : 30,
                  left: window.innerWidth < 640 ? 10 : 20,
                  bottom: 20,
                }}
              >
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

                <XAxis
                  dataKey="time"
                  tick={{ fill: "#9CA3AF", fontSize: window.innerWidth < 640 ? 10 : 12 }}
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#9CA3AF", fontSize: window.innerWidth < 640 ? 10 : 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}%`}
                  width={window.innerWidth < 640 ? 40 : 60}
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
                    r: window.innerWidth < 640 ? 3 : 4,
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
              className="bg-[#008259] hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
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
            <div className="bg-[#232328] text-white pb-8 pt-4 px-4 rounded-2xl shadow-lg w-[400px] max-w-[90vw]">
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
                      setSide(null as any);
                      setAmountUSDC("");
                    }}
                    className="w-6 h-6 flex items-center justify-center bg-[#3a3d4a] rounded-md text-xl hover:bg-[#2d2f37]"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Bet Amount Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-gray-300 text-sm font-medium">Bet amount</label>
                  {/* <button
            onClick={setMaxAmount}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Max: {balance} USDC
          </button> */}
                </div>

                <div className="relative">
                  <div
                    className={`flex items-center bg-[#1e2028] border-2 rounded-lg p-3 focus-within:border-[#008259] ${
                      isOverBalance ? "border-red-500" : "border-[#4a5568]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mr-3">
                      <img src="/icons/usdc-logo.png" alt="USDC Logo" className="w-6 h-6 rounded-full" />
                      <input
                        type="number"
                        value={amountUSDC}
                        onChange={handleAmountChange}
                        className="bg-transparent text-white text-lg font-semibold outline-none min-w-0 flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0"
                        max={balance}
                      />
                    </div>
                    {/* <div className="flex -ml-28 gap-2">
              <button
                onClick={() => adjustAmount(-10)}
                className="px-3 py-1 bg-[#3a3d4a] rounded text-sm hover:bg-[#4a4d5a] transition-colors"
              >
                -10
              </button>
              <button
                onClick={() => adjustAmount(10)}
                className="px-3 py-1 bg-[#3a3d4a] rounded text-sm hover:bg-[#4a4d5a] transition-colors"
              >
                +10
              </button>
              <button
                onClick={() => adjustAmount(50)}
                className="px-3 py-1 bg-[#3a3d4a] rounded text-sm hover:bg-[#4a4d5a] transition-colors"
              >
                +50
              </button>
            </div> */}
                  </div>

                  {/* Error message */}
                  {isOverBalance && (
                    <p className="text-red-400 text-xs mt-1">Amount exceeds your balance of {balance} USDC</p>
                  )}
                </div>

                {/* Amount Slider */}
                <div className="mt-4">
                  <input
                    type="range"
                    min="0"
                    max={balance}
                    step="0.1"
                    value={sliderValue}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-[#1e2028] rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, ${side === "YES" ? "#008259" : "#8b4444"} 0%, ${side === "YES" ? "#008259" : "#8b4444"} ${(sliderValue / balance) * 100}%, #1e2028 ${(sliderValue / balance) * 100}%, #1e2028 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>$0</span>
                    <span>${balance}</span>
                  </div>
                </div>
              </div>

              {/* Probability and Payout Info */}
              <div className="mb-6 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Current probability</span>
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
                            {isPriceIncrease ? "↑" : "↓"} {(Math.abs(priceChange) / 100).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">0%</span>
                        );
                      })()}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">To win</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-lg font-bold">
                      ${amountUSDC ? calculatePayout(side, parseFloat(amountUSDC)).toFixed(2) : "0"}
                    </span>
                    <span className="text-emerald-400 text-sm font-medium">
                      +
                      {amountUSDC
                        ? (
                            (calculatePayout(side, parseFloat(amountUSDC)) / parseFloat(amountUSDC || "1") - 1) *
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
                disabled={!side || !amountUSDC || isOverBalance || currentAmount === 0}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition-colors ${
                  side === "NO"
                    ? "bg-[#d32f2f] hover:bg-[#b71c1c] text-white"
                    : "bg-[#008259] hover:bg-[#006b47] text-white"
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                {isOverBalance
                  ? "Insufficient Balance"
                  : `Buy ${side || "NO"} to win $${amountUSDC ? calculatePayout(side, parseFloat(amountUSDC)).toFixed(1) : "0"}`}
              </button>

              {/* Balance */}
              <div className="mt-6 flex justify-between items-center text-sm">
                <span className="text-gray-400">Your Balance:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{balance} USDC</span>
                </div>
              </div>

              <style jsx>{`
                .slider::-webkit-slider-thumb {
                  appearance: none;
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  background: ${side === "YES" ? "#008259" : "#8b4444"};
                  cursor: pointer;
                  border: 2px solid white;
                }

                .slider::-moz-range-thumb {
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  background: ${side === "YES" ? "#008259" : "#8b4444"};
                  cursor: pointer;
                  border: 2px solid white;
                }
              `}</style>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-[#2f2f33] border border-gray-700/20 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 py-2 px-2 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-[#008259] text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("positions")}
            className={`flex-1 py-2 px-2 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "positions"
                ? "bg-[#008259] text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            <span className="hidden sm:inline">Your </span>Positions
            {userPositions.length > 0 && (
              <span className="ml-1 sm:ml-2 bg-[#008259] text-white text-xs px-1.5 sm:px-2 py-1 rounded-full">
                {userPositions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`flex-1 py-2 px-2 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "activity"
                ? "bg-[#008259] text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-700/50"
            }`}
          >
            Trades
            {marketAnalytics && (
              <span className="ml-1 sm:ml-2 bg-[#008259] text-white text-xs px-1.5 sm:px-2 py-1 rounded-full">
                {marketAnalytics?.totalTrades}
              </span>
            )}
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-400">TVL</h3>
                </div>
                <div className="text-lg sm:text-2xl font-bold text-slate-400">
                  {(parseFloat(marketDetails.totalValueLocked) / 1e6).toFixed(2)} USDC
                </div>
              </div>

              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <Droplets className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-400">Total Liquidity</h3>
                </div>
                <div className="text-lg sm:text-2xl font-bold text-slate-400">
                  {(parseFloat(marketAnalytics?.liquidityVolume) / 1e6).toFixed(2)} USDC
                </div>
              </div>

              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-400">Created</h3>
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-400">
                  {formatDate(marketDetails.creationTime)}
                </div>
              </div>

              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-400">YES Shares</h3>
                </div>
                <div className="text-base sm:text-lg font-bold text-green-400">
                  {(parseInt(marketDetails.totalYesShares) / 1000000).toLocaleString()}
                </div>
              </div>

              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-400">NO Shares</h3>
                </div>
                <div className="text-base sm:text-lg font-bold text-red-400">
                  {(parseInt(marketDetails.totalNoShares) / 1000000).toLocaleString()}
                </div>
              </div>

              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  <h3 className="text-base sm:text-lg font-semibold text-slate-400">Market Ends</h3>
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-400">{formatDate(marketDetails.endTime)}</div>
              </div>
            </div>

            <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Resolution Criteria</h3>
              <div className="text-sm sm:text-base font-medium text-slate-200 break-words whitespace-pre-wrap">
                {marketDetails.resolutionCriteria.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
                  if (part.match(/^https?:\/\//)) {
                    return (
                      <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline break-all"
                      >
                        {part}
                      </a>
                    );
                  }
                  return part;
                })}
              </div>
            </div>

            <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
              {/* Horizontal Progress Bar */}
              <div className="mb-8 mx-4 mt-6">
                <div className="relative h-1 bg-gray-700 rounded-full">
                  <div
                    className="absolute top-0 left-0 h-full bg-[#008259] transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${calculateProgress()}%` }}
                  ></div>
                  {/* Progress Ball */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#008259] rounded-full transition-all duration-500 ease-out shadow-lg"
                    style={{ left: `calc(${calculateProgress()}% - 6px)` }}
                  ></div>
                </div>
              </div>

              <div className="relative pl-8">
                {/* Vertical Line - Full height */}
                <div className="absolute left-[24px] h-[82%] top-0 bottom-0 w-[3px] bg-gray-700"></div>

                {/* Progress Indicator - Dynamic height */}
                <div
                  className="absolute left-[24px] top-0 h-[82%] w-[3px] bg-[#008259] transition-all duration-500 ease-out"
                  style={{
                    height: marketDetails.resolved
                      ? "82%"
                      : new Date() >= new Date(marketDetails.endTime)
                        ? "66.66%"
                        : new Date() >= new Date(marketDetails.creationTime)
                          ? "33.33%"
                          : "0%",
                  }}
                ></div>

                <div className="space-y-8">
                  {/* Market Created */}
                  <div className="flex items-start gap-4 relative">
                    <div className="w-6 h-6 rounded-full bg-[#008259] border-4 border-[#2f2f33] flex-shrink-0 z-10 -ml-[19px]"></div>
                    <div className="flex-1 pt-1">
                      <h4 className="text-base sm:text-lg font-semibold text-white mb-1">Market Created</h4>
                      <p className="text-sm sm:text-base text-slate-400">{formatDate(marketDetails.creationTime)}</p>
                    </div>
                  </div>

                  {/* Market End */}
                  <div className="flex items-start gap-4 relative">
                    <div
                      className={`w-6 h-6 rounded-full ${
                        Date.now() >= parseInt(marketDetails.endTime) * 1000 ? "bg-[#008259]" : "bg-gray-600"
                      } border-4 border-[#2f2f33] flex-shrink-0 z-10 -ml-[19px]`}
                    ></div>
                    <div className="flex-1 pt-1">
                      <h4 className="text-base sm:text-lg font-semibold text-white mb-1">Market End</h4>
                      <p className="text-sm sm:text-base text-slate-400">{formatDate(marketDetails.endTime)}</p>
                      {new Date().getTime() < new Date(marketDetails.endTime).getTime() && (
                        <p className="text-xs sm:text-sm text-slate-500 mt-1">Trading closes at this time</p>
                      )}
                    </div>
                  </div>

                  {/* Market Resolved */}
                  <div className="flex items-start gap-4 relative">
                    <div
                      className={`w-6 h-6 rounded-full ${marketDetails.resolved ? "bg-[#008259]" : "bg-gray-600"} border-4 border-[#2f2f33] flex-shrink-0 z-10 -ml-[19px]`}
                    ></div>
                    <div className="flex-1 pt-1">
                      <h4 className="text-base sm:text-lg font-semibold text-white mb-1">Market Resolved</h4>
                      {marketDetails.resolved ? (
                        <p className="text-sm sm:text-base text-slate-400">
                          {marketDetails.endTime
                            ? formatDate(marketDetails.endTime)
                            : formatDate(marketDetails.endTime)}
                        </p>
                      ) : (
                        <p className="text-sm sm:text-base text-slate-500">Awaiting resolution</p>
                      )}
                    </div>
                  </div>

                  {/* Claim Tokens */}
                  <div className="flex items-start gap-4 relative">
                    <div
                      className={`w-6 h-6 rounded-full ${marketDetails.resolved ? "bg-[#008259]" : "bg-gray-600"} border-4 border-[#2f2f33] flex-shrink-0 z-10 -ml-[19px]`}
                    ></div>
                    <div className="flex-1 pt-1">
                      <h4 className="text-base sm:text-lg font-semibold text-white mb-1">Claim Tokens</h4>
                      {marketDetails.resolved ? (
                        <p className="text-sm sm:text-base text-[#008259] font-medium">Available to claim</p>
                      ) : (
                        <p className="text-sm sm:text-base text-slate-500">Claim after resolution</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Positions Tab */}
        {activeTab === "positions" && (
          <div className="space-y-6">
            {!account?.address ? (
              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-8 text-center">
                <div className="text-gray-400 mb-4">
                  <Wallet className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="lg:text-lg text-base font-semibold mb-2">Connect Your Wallet</h3>
                  <p className="text-sm">Connect your wallet to view your positions in this market.</p>
                </div>
              </div>
            ) : userPositions.length === 0 ? (
              <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-8 text-center">
                <div className="text-gray-400">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="lg:text-lg text-base font-semibold mb-2">No Positions Yet</h3>
                  <p className="text-sm">
                    You don't have any positions in this market. Start trading to see your positions here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Position Summary */}
                <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                    <div>
                      <div className="text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Total Value</div>
                      <div className="text-sm sm:text-xl lg:text-2xl font-bold text-slate-400">
                        {totalPositionValue.toFixed(2)} USDC
                      </div>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Total Positions</div>
                      <div className="text-sm sm:text-xl lg:text-2xl font-bold text-slate-400">
                        {userPositions.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Total Shares</div>
                      <div className="text-sm sm:text-xl lg:text-2xl font-bold text-slate-400">
                        {formatShares(userPositions.reduce((sum, pos) => sum + pos.shares, 0))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Individual Positions */}
                {userPositions
                  .filter((position) => {
                    // Filter logic remains the same
                    if (!marketDetails.resolved) {
                      return true;
                    }
                    const getResolutionOutcome = (outcome: { vec: any }) => {
                      if (!outcome || !outcome.vec) return null;
                      return outcome.vec === "0x01" ? 1 : 0;
                    };
                    const marketResolution = marketDetails.resolved
                      ? getResolutionOutcome(marketDetails.outcome)
                      : null;
                    const positionWon = marketDetails.resolved && position.outcome === marketResolution;
                    return positionWon;
                  })
                  .map((position, index) => {
                    const claimKey = `${marketDetails.id}-${position.id}`;
                    const isClaimed = claimedPositions.has(claimKey);
                    const pnl = calculatePnL(position);
                    const sellKey = `${position.outcome}-${position.user}`;
                    const isLoading = sellLoading[sellKey];
                    const outcomeText = position.outcome === 1 ? "YES" : "NO";
                    const currentPrice = position.outcome === 1 ? yesPrice : noPrice;

                    const getResolutionOutcome = (outcome: { vec: any }) => {
                      if (!outcome || !outcome.vec) return null;
                      return outcome.vec === "0x01" ? 1 : 0;
                    };

                    const marketResolution = marketDetails.resolved
                      ? getResolutionOutcome(marketDetails.outcome)
                      : null;
                    const positionWon = marketDetails.resolved && position.outcome === marketResolution;

                    return (
                      <div key={index} className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-4 sm:p-6">
                        {/* Mobile-first header layout */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                          {/* Position info */}
                          <div className="flex items-center gap-3">
                            <div
                              className={`px-3 py-1 rounded-full text-sm font-semibold flex-shrink-0 ${
                                position.outcome === 1
                                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                  : "bg-red-500/20 text-red-400 border border-red-500/30"
                              }`}
                            >
                              {outcomeText}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-base sm:text-lg font-semibold text-white truncate">
                                {formatShares(position.shares)} shares
                              </h4>
                              <p className="text-sm text-gray-400">Bought at {(position.avgPrice / 100).toFixed(1)}¢</p>
                            </div>
                          </div>

                          {/* Action button - full width on mobile, auto on desktop */}
                          <div className="w-full sm:w-auto sm:flex-shrink-0">
                            {!marketDetails.resolved && !isClosed ? (
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
                                className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                                  isLoading
                                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                    : "bg-[#008259] hover:bg-emerald-500/70 text-white"
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
                              <button
                                onClick={() => onClaimWinningsClick(marketDetails.id, position.id)}
                                disabled={isLoading}
                                className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                                  isLoading
                                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                    : "bg-emerald-600 hover:bg-green-800/80 text-white"
                                }`}
                              >
                                {isClaimed ? (
                                  <>
                                    <Trophy className="w-4 h-4" />
                                    Claimed
                                  </>
                                ) : isLoading ? (
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
                              <div className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium text-center">
                                Lost Bet
                              </div>
                            ) : (
                              <div className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium text-center">
                                Market Closed
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stats grid - 2 columns on mobile, 4 on desktop */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm mb-4">
                          <div className="text-center sm:text-left">
                            <div className="text-gray-400 text-xs sm:text-sm mb-1">Current Price</div>
                            <div className="text-white font-semibold text-sm sm:text-base">
                              {(currentPrice * 100).toFixed(1)}¢
                            </div>
                          </div>
                          <div className="text-center sm:text-left">
                            <div className="text-gray-400 text-xs sm:text-sm mb-1">Current Value</div>
                            <div className="text-white font-semibold text-sm sm:text-base">
                              ${calculatePositionValue(position).toFixed(2)}
                            </div>
                          </div>
                          <div className="text-center sm:text-left">
                            <div className="text-gray-400 text-xs sm:text-sm mb-1">P&L</div>
                            <div
                              className={`font-semibold text-sm sm:text-base ${pnl.value >= 0 ? "text-green-400" : "text-red-400"}`}
                            >
                              {pnl.value >= 0 ? "+" : ""}${pnl.value.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-center sm:text-left">
                            <div className="text-gray-400 text-xs sm:text-sm mb-1">P&L %</div>
                            <div
                              className={`font-semibold text-sm sm:text-base ${pnl.percentage >= 0 ? "text-green-400" : "text-red-400"}`}
                            >
                              {pnl.percentage >= 0 ? "+" : ""}
                              {pnl.percentage.toFixed(1)}%
                            </div>
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
            <div className="bg-[#2f2f33] border border-gray-700/20 rounded-xl p-3 sm:p-6">
              {latestTrades && Array.isArray(latestTrades) && latestTrades.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No recent trading activity</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3 max-h-96 overflow-y-auto">
                  {latestTrades &&
                    Array.isArray(latestTrades) &&
                    latestTrades.slice(0, 20).map((trade, index) => {
                      const { action } = getTradeTypeLabel(trade.tradeType);
                      const priceChange = parseFloat(trade.yesPriceAfter) - parseFloat(trade.yesPriceBefore);
                      const isPriceIncrease = priceChange > 0;
                      const marketResolution = marketDetails.resolved
                        ? getResolutionOutcome(marketDetails.outcome)
                        : null;

                      const isYesTrade = parseFloat(trade.yesPriceAfter) > parseFloat(trade.yesPriceBefore);
                      const isSelling = action === "Sold";
                      const actualSide = isSelling ? (isYesTrade ? "No" : "Yes") : isYesTrade ? "Yes" : "No";
                      const isClaimOrResolve = action === "Added Liquidity" || action === "Resolved";
                      const isClaim = action === "Claimed Winnings";

                      return (
                        <div
                          key={trade.tradeId || index}
                          className="flex items-center justify-between p-2 sm:p-4 rounded-lg bg-[#2f2f33] border border-gray-700/20"
                        >
                          {/* Left side - User info and action */}
                          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                            {/* Action Icon - smaller on mobile */}
                            <div
                              className={`p-1.5 sm:p-2 rounded-full flex-shrink-0 ${
                                action === "Added Liquidity"
                                  ? "bg-blue-100/80"
                                  : action === "Claimed Winnings"
                                    ? "bg-amber-100/80"
                                    : isYesTrade
                                      ? "bg-emerald-100/80"
                                      : "bg-rose-100/80"
                              }`}
                            >
                              <User
                                className={`w-3 h-3 sm:w-4 sm:h-4 ${
                                  action === "Added Liquidity"
                                    ? "text-teal-600"
                                    : action === "Claimed Winnings"
                                      ? "text-amber-600"
                                      : action === "Resolved"
                                        ? "text-yellow-600"
                                        : isYesTrade
                                          ? "text-emerald-600"
                                          : "text-rose-600"
                                }`}
                              />
                            </div>

                            {/* Trade Details */}
                            <div className="min-w-0 flex-1">
                              {/* Mobile: Stack vertically, Desktop: Inline */}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                                <div className="flex items-center space-x-1 sm:space-x-2">
                                  <span className="font-medium text-slate-300 text-xs sm:text-sm truncate">
                                    {truncateAddress(trade.user)}
                                  </span>
                                  <span className="text-slate-500 text-xs sm:text-sm hidden sm:inline">{action}</span>
                                </div>

                                {/* Mobile: Show action and side on second line */}
                                <div className="flex items-center space-x-1 sm:space-x-0">
                                  <span className="text-slate-500 text-xs sm:hidden">{action}</span>
                                  <span
                                    className={`font-semibold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs ${
                                      action === "Added Liquidity"
                                        ? "bg-blue-100/80 text-teal-700"
                                        : action === "Claimed Winnings"
                                          ? "bg-amber-100/80 text-amber-700"
                                          : action === "Resolved"
                                            ? "bg-emerald-100/80 text-emerald-700"
                                            : isYesTrade
                                              ? "bg-emerald-100/80 text-emerald-700"
                                              : "bg-rose-100/70 text-rose-700"
                                    }`}
                                  >
                                    {isClaimOrResolve ? marketResolution : actualSide}
                                  </span>
                                </div>
                              </div>

                              {/* Date - smaller on mobile */}
                              <div className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-0">
                                {formatDate(trade.timestamp)}
                              </div>
                            </div>
                          </div>

                          {/* Right side - Trade value and price impact */}
                          {!isClaimOrResolve && (
                            <div className="text-right flex-shrink-0 ml-2">
                              <div className="text-xs sm:text-sm text-slate-400 font-medium">
                                {formatPrice((trade.amount / 100).toString())} USDC
                              </div>
                              {priceChange !== 0 && !isClaimOrResolve && (
                                <div
                                  className={`text-xs flex items-center justify-end mt-0.5 ${
                                    isPriceIncrease ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {isPriceIncrease ? "+" : ""}
                                  {isClaim ? "" : `${(priceChange / 100).toFixed(2)}%`}
                                </div>
                              )}
                            </div>
                          )}
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
