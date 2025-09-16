"use client";

import React, { useState, useEffect } from "react";
import { Plus, MessageCircle, Search, Clock, Users, DollarSign, Sparkles, Target, ChevronDown } from "lucide-react";
import { WalletSelector } from "../components/WalletSelector";
import { useRouter } from "next/navigation";
import { aptosClient } from "@/utils/aptosClient";
import { getAllMarketSummaries, getUserPositions, getUserPositionsWithDetails } from "./view-functions/markets";
import { convertAmountFromHumanReadableToOnChain } from "@/utils/helpers";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { buyPosition, sellPosition } from "./entry-functions/trade";
import { useQueryClient } from "@tanstack/react-query";
import MarketDetailPage from "@/components/MarketDetails";

const categories = ["All markets", "Crypto", "Technology", "Climate", "Space", "Finance", "Politics"];
const statusFilters = ["All Status", "Live", "Ended"];
const sortOptions = ["Latest", "Volume", "Participants", "Ending Soon"];

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

const MarketCard = ({ market }: any) => {
  const router = useRouter();

  const handleMarketClick = () => {
    // Create a URL-friendly slug from the market title
    const slug = market.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim();

    router.push(`/market/${slug}/${market.id}`);
  };

  const getStatusColor = (status: any) => {
    switch (status) {
      case "Live":
        return "bg-green-500 text-white";
      case "Resolved":
        return "bg-gray-500 text-white";
      default:
        return "bg-blue-500 text-white";
    }
  };

  return (
    <div
      className="bg-[#2f2f33]/60 border border-gray-700/50 rounded-xl p-6  hover:shadow-lg transition-all duration-300 cursor-pointer group animate-fadeInUp"
      onClick={handleMarketClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 pr-4">
          <h3 className="text-white font-semibold text-xl transition-colors">{market.title}</h3>
          <p className="text-gray-400 text-sm line-clamp-2">{market.description}</p>
        </div>
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
            market.status,
          )} shadow-sm`}
        >
          {market.status}
        </span>
      </div>

      {/* Market Info */}
      <div className="mb-4">
        <div className="text-lg font-bold text-blue-400 mb-1">
          {market.minBet} {market.maxBet}
        </div>
        <div className="text-sm text-gray-400">{market.type}</div>
      </div>

      {/* Price Display */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <div className="text-green-400 text-sm font-medium mb-1">YES</div>
          <div className="text-green-300 text-xl font-bold">{(market.yesPrice * 100).toFixed(0)}%</div>
          <div className="text-green-400/70 text-xs">
            {market.trend === "up" ? "↗" : "↘"} {Math.round(market.confidence * 100)}%
          </div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <div className="text-red-400 text-sm font-medium mb-1">NO</div>
          <div className="text-red-300 text-xl font-bold">{(market.noPrice * 100).toFixed(0)}%</div>
          <div className="text-red-400/70 text-xs">
            {market.trend === "down" ? "↗" : "↘"} {100 - Math.round(market.confidence * 100)}%
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-between items-center text-sm text-gray-300">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <DollarSign className="w-4 h-4 text-gray-400" />
            {market.volume}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4 text-gray-400" />
            {market.participants.toLocaleString()}
          </span>
        </div>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4 text-gray-400" />
          {market.timeLeft}
        </span>
      </div>
      {/* <button
        onClick={() =>
          onSellPositionClick(
            0, // marketId
            2, // positionId
            2000000, // 2 USDC worth of shares
            3200, // minPrice (0.32 USDC per share, slightly above current price)
          )
        }
        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg"
      >
        Sell
      </button> */}
    </div>
  );
};

const AIAssistantPanel = ({ isVisible, onClose }: any) => {
  if (!isVisible) return null;

  return (
    <div className="fixed right-4 top-20 bottom-4 w-80 bg-gray-900/95 backdrop-blur-lg border border-gray-700/50 rounded-lg z-50 flex flex-col animate-slideInRight">
      <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-medium">AI Market Assistant</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">
          x
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <h4 className="text-blue-300 font-medium mb-2">Market Insights</h4>
          <p className="text-blue-200 text-sm">
            Current sentiment shows high volatility in crypto markets. AI-related predictions are gaining significant
            traction with increased trading volume this week.
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-gray-700/50">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask about market trends..."
            className="flex-1 bg-[#2f2f33] border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
          <button className="px-4 py-2 bg-[#008259] hover:bg-blue-500 text-white rounded transition-colors">
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default function PivotMarketApp() {
  const [markets, setMarkets] = useState<any[]>([]);
  const [filteredMarkets, setFilteredMarkets] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All markets");
  const [selectedStatus, setSelectedStatus] = useState("All Status");
  const [sortBy, setSortBy] = useState("Latest");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<any>(null);

  const { account } = useWallet();

  // Get market details
  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const marketData = await getAllMarketSummaries();
        const userPositions = await getUserPositions(0, account?.address.toString() as any);
        console.log("markets--", marketData);
        console.log("userPositions--", userPositions, account?.address.toString());

        setMarkets(marketData);
      } catch (error) {
        console.error("Failed to fetch markets:", error);
      }
    };

    fetchMarkets();
  }, [account?.address]);

  // Filter and sort markets
  useEffect(() => {
    let filtered = markets.filter((market) => {
      const matchesSearch =
        market.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        market.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All markets" || market.category === selectedCategory;
      const matchesStatus = selectedStatus === "All Status" || market.status === selectedStatus.toLowerCase();

      return matchesSearch && matchesCategory && matchesStatus;
    });

    // Sort markets
    switch (sortBy) {
      case "Volume":
        filtered.sort(
          (a, b) => parseFloat(b.volume.replace(/[$MK,]/g, "")) - parseFloat(a.volume.replace(/[$MK,]/g, "")),
        );
        break;
      case "Participants":
        filtered.sort((a, b) => b.participants - a.participants);
        break;
      case "Ending Soon":
        filtered.sort((a, b) => {
          const aTime =
            parseInt(a.timeLeft.split("d")[0]) * 24 + parseInt(a.timeLeft.split("h")[0].split(" ")[1] || "0");
          const bTime =
            parseInt(b.timeLeft.split("d")[0]) * 24 + parseInt(b.timeLeft.split("h")[0].split(" ")[1] || "0");
          return aTime - bTime;
        });
        break;
      default:
        // Latest - default order
        break;
    }
    if (filtered) {
      setFilteredMarkets(filtered);
    }
  }, [markets, searchQuery, selectedCategory, selectedStatus, sortBy]);

  const handlePredictMarket = (market: any) => {
    setSelectedMarket(market);
  };

  // If a market is selected, show the detail page
  if (selectedMarket) {
    return <MarketDetailPage market={selectedMarket} />;
  }

  const totalMarkets = filteredMarkets.length;
  const router = useRouter();

  return (
    <div className="min-h-screen overflow-hidden bg-[#232328]">
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(300px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out forwards;
        }

        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out forwards;
        }

        .animate-pulse {
          animation: pulse 2s infinite;
        }
      `}</style>

      {/* Header */}
      <header className="bg-[#1a1a1e57] sticky top-0 z-40 overflow-hidden animate-fadeInUp border-b border-b-[var(--Stroke-Dark,#2c2c2f)]">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-white">
                Pivot<span className="text-blue-400"></span>
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAIAssistant(!showAIAssistant)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                  showAIAssistant ? "bg-[#008259] text-white" : "bg-[#2f2f33] text-gray-300 hover:bg-gray-700"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                AI Assistant
              </button>

              <div className="flex gap-2 items-center flex-wrap">
                <WalletSelector />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="mb-12 mt-6 animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-4">Prediction Markets</h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                Trade predictions on future events. Maximize your returns by participating in the world's most advanced
                prediction markets powered by AI insights.
              </p>

              <div className="flex items-center mt-6 gap-4">
                <button
                  className="flex items-center gap-2 px-6 py-3 bg-[#008259] hover:bg-[#00553A] text-white rounded-lg transition-colors"
                  onClick={() => router.push("/create")}
                >
                  <Plus className="w-5 h-5" />
                  Create Market
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="mb-8 animate-fadeInUp" style={{ animationDelay: "0.4s" }}>
          {/* Category Tabs */}
          <div className="flex items-center gap-1 mb-6 flex-wrap">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? "bg-[#008259] text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#2f2f33]"
                }`}
              >
                {category}
                {category === "All markets" && (
                  <span className="ml-2 px-2 py-1 bg-[#00553A] text-white text-xs rounded-full">{totalMarkets}</span>
                )}
              </button>
            ))}
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
            <div className="flex-1 relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#2f2f33] border border-gray-700/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 text-gray-400">
                <span className="text-sm">Filter by</span>
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-[#2f2f33] border border-gray-700/50 rounded-lg px-3 py-2 pr-8 text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                  >
                    {statusFilters.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-400">
                <span className="text-sm">Sort by</span>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-[#2f2f33] border border-gray-700/50 rounded-lg px-3 py-2 pr-8 text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                  >
                    {sortOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Markets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredMarkets.map((rawMarket: any, index) => {
            // Determine market status
            const currentTime = new Date("2025-09-12T20:00:00+01:00").getTime() / 1000;
            const endTime = parseInt(rawMarket.endTime);
            const status = rawMarket.resolved || currentTime >= endTime ? "Resolved" : "Live";

            const transformedMarket = {
              ...rawMarket,
              yesPrice: parseFloat(rawMarket.yesPrice) / 10000,
              noPrice: parseFloat(rawMarket.noPrice) / 10000,
              volume: (parseFloat(rawMarket.totalValueLocked) / 1000000).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }), // "12000000" → "$12.00"
              participants: parseInt(rawMarket.participantCount),
              confidence: 0.5, // Placeholder, maybe calculated later
              trend: "up", // Placeholder
              minBet: "", // Placeholder
              maxBet: "", // Placeholder
              type: "", // Placeholder
              timeLeft: getTimeLeft(rawMarket.endTime),
              status,
            };

            return (
              <div key={rawMarket.id} className="animate-fadeInUp" style={{ animationDelay: `${0.6 + index * 0.1}s` }}>
                <MarketCard market={transformedMarket} onPredict={handlePredictMarket} />
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredMarkets.length === 0 && (
          <div className="text-center py-12 animate-fadeInUp">
            <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No markets found</h3>
            <p className="text-gray-400">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>

      {/* AI Assistant Panel */}
      <AIAssistantPanel isVisible={showAIAssistant} onClose={() => setShowAIAssistant(false)} />
    </div>
  );
}
