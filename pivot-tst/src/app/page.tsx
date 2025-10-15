"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  Users,
  ChevronDown,
  CandlestickChart,
  PlusCircle,
  SearchIcon,
  Loader,
  ScanEye,
  LoaderCircle,
  InfoIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { WalletSelector } from "../components/WalletSelector";
import { useRouter } from "next/navigation";

import { getAllMarketSummaries } from "./view-functions/markets";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import MarketDetailPage from "@/components/MarketDetails";
import { PredictionMarketsResponse, QuickPredictionResponse } from "./serve";
import MobileBottomNav from "@/components/ui/MobileBottomNav";
import Link from "next/link";
import { UsernameModal } from "@/components/ui/UsernameModal";

interface AIAssistantPanelProps {
  isVisible: boolean;
  onClose: () => void;
  apiBaseUrl?: string;
}

interface NewsItem {
  upvote_ratio: number;
  summary: string;
  timestamp: string;
  title: string;
  category: string;
  impact_level: string;
  market_potential: number;
  num_comments: number;
  score: number;
  subreddit: string;
  url: string;
  suggested_market_questions: string[];
  real_data_context: {
    reddit_post: {
      author: string;
      category: string;
      created_utc: number;
      num_comments: number;
      score: number;
      selftext: string;
      subreddit: string;
      title: string;
      upvote_ratio: number;
      url: string;
    };
    time_ago: string;
    upvote_ratio: number;
  };
}

interface TrendingNewsResponse {
  error: string;
  success: boolean;
  timestamp: string;
  news_count: number;
  categories: string[];
  trending_news: NewsItem[];
  categorized_news: { [category: string]: NewsItem[] };
  note: string;
  data_sources: { [category: string]: string[] };
}

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

class PredictionMarketsAPI {
  private baseUrl: string;
  public sessionId: string | null = null;

  constructor(baseUrl: string = "https://pivot-tst.onrender.com") {
    this.baseUrl = baseUrl;
  }

  private async makeRequest<T = any>(endpoint: string, options: any = {}): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.session_id) {
        this.sessionId = data.session_id;
      }

      return data as T;
    } catch (error) {
      console.error(`API Request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async getTrendingNews(categories?: string[] | null, limit: number = 10): Promise<TrendingNewsResponse> {
    const params = new URLSearchParams();
    if (categories && categories.length > 0) {
      params.append("categories", categories.join(","));
    }
    if (limit) {
      params.append("limit", limit.toString());
    }

    const queryString = params.toString();
    const endpoint = queryString ? `/api/news/trending?${queryString}` : "/api/news/trending";

    return await this.makeRequest<TrendingNewsResponse>(endpoint, {
      method: "GET",
    });
  }

  async getQuickPrediction(query: string): Promise<QuickPredictionResponse> {
    return await this.makeRequest<QuickPredictionResponse>("/api/market/quick-prediction", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  async generatePredictionMarkets(query: string, numSuggestions: number = 3): Promise<PredictionMarketsResponse> {
    return await this.makeRequest<PredictionMarketsResponse>("/api/predict", {
      method: "POST",
      body: JSON.stringify({
        query,
        num_suggestions: numSuggestions,
      }),
    });
  }
}

// Arc meter component for showing sentiment/odds
const ArcMeter = ({ percentage, size = 80 }: any) => {
  const radius = size / 2 - 4;
  const circumference = Math.PI * radius;
  const strokeDasharray = circumference;

  // Shared animated state
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    const duration = 1000; // ms

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const current = progress * percentage;
      setAnimatedValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [percentage]);

  const strokeDashoffset = circumference - (animatedValue / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 4 }}>
      {/* Background arc */}
      <svg width={size} height={size / 2 + 4} className="absolute top-0 left-0">
        <path
          d={`M 4 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 4} ${size / 2}`}
          fill="none"
          stroke="#374151"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M 4 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 4} ${size / 2}`}
          fill="none"
          stroke={percentage >= 50 ? "#10b981" : "#ef4444"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      {/* Percentage text */}
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <span className={`text-sm font-bold ${percentage >= 50 ? "text-green-400" : "text-red-400"}`}>
          {animatedValue.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

const MarketCard = ({ market }: any) => {
  const yesPercentage = market.yesPrice * 100;
  const router = useRouter();
  const { account } = useWallet();

  const handleMarketClick = () => {
    // Prevent navigation if user is not signed in
    // if (!account?.address) {
    //   toast.error("Please sign in to view market details", {
    //     style: {
    //       backgroundColor: "#7f1d1d",
    //       color: "#fca5a5",
    //       fontWeight: "bold",
    //       border: "1px solid #fca5a5",
    //     },
    //     duration: 6000,
    //   });
    //   // or use a toast notification instead
    //   return;
    // }
    // Create a URL-friendly slug from the market title
    const slug = market.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim();

    router.push(`/market/${slug}/${market.id}`);
  };
  return (
    <div
      className={`bg-[#2f2f33] border border-gray-700/30 rounded-2xl p-6 hover:border-[#66666765] transition-all duration-300 h-full flex flex-col ${
        account?.address ? "cursor-pointer group" : "cursor-auto"
      }`}
      onClick={handleMarketClick}
      title={market.id.toString()}
    >
      {/* Header with title and arc meter */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 pr-4">
          <h3 className="text-white text-wrap font-semibold text-lg leading-tight truncate">{market.title}</h3>
        </div>
        <ArcMeter percentage={yesPercentage} />
      </div>

      {/* YES/NO buttons with prices */}
      <div
        className={`grid grid-cols-2 gap-3 mb-6 ${
          market.title.length < 50 ? "mt-6" : market.title.length < 100 ? "mt-3" : "mt-0"
        }`}
      >
        <button className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-xl py-3 px-4 transition-all duration-200 h-[4.5rem] flex flex-col justify-center">
          <div className="text-green-400 text-sm font-medium mb-1">YES</div>
          <div className="text-green-300 text-lg font-bold">{(market.yesPrice * 100).toFixed(1)}%</div>
        </button>
        <button className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl py-3 px-4 transition-all duration-200 h-[4.5rem] flex flex-col justify-center">
          <div className="text-red-400 text-sm font-medium mb-1">NO</div>
          <div className="text-red-300 text-lg font-bold">{(market.noPrice * 100).toFixed(1)}%</div>
        </button>
      </div>

      {/* Stats */}
      <div className="flex justify-between items-center text-sm text-gray-300 mt-auto">
        <div className="flex items-center gap-4">
          {/* <span className="flex items-center gap-1">
            <DollarSign className="w-4 h-4 text-gray-400" />
            {market.volume}
          </span> */}
          <span className="flex items-center gap-1">
            <CandlestickChart className="w-4 h-4 text-gray-400" />
            {(Number(market.totalVolume) / 1e6).toLocaleString()} USDC
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4 text-gray-400" />
            {market.participants?.toLocaleString() || "0"}
          </span>
        </div>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4 text-gray-400" />
          {market.timeLeft || "30d left"}
        </span>
      </div>
    </div>
  );
};

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  isVisible,
  onClose,
  apiBaseUrl = "https://pivot-tst.onrender.com",
}) => {
  const [api] = useState(() => new PredictionMarketsAPI(apiBaseUrl));
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<
    Array<{
      type: "user" | "assistant" | "insight";
      content: string;
      data?: any;
      timestamp: Date;
    }>
  >([]);
  const [insights, setInsights] = useState<NewsItem[]>([]);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  const toggleTooltip = () => {
    setIsTooltipVisible(!isTooltipVisible);
  };

  // Load initial insights when panel opens
  useEffect(() => {
    if (isVisible) {
      loadInitialInsights();
    }
  }, [isVisible]);

  const loadInitialInsights = async () => {
    try {
      setIsLoading(true);
      const response = await api.getTrendingNews(["economics", "sports", "technology", "crypto"], 20);

      if (response.success && response.trending_news) {
        setInsights(response.trending_news);

        // Create messages with full metadata
        const insightMessages = response.trending_news.map((item: NewsItem) => ({
          type: "insight" as const,
          content: `${item.summary}`,
          data: {
            summary: item.summary,
            timestamp: item.timestamp,
          },
          metadata: {
            score: item.score,
            upvote_ratio: item.real_data_context?.upvote_ratio || item.upvote_ratio,
            num_comments: item.num_comments,
          },
          timestamp: formatDistanceToNow(new Date(item.timestamp)) as any,
        }));

        setMessages(insightMessages);
      } else {
        throw new Error("No trending news found in response");
      }
    } catch (error) {
      console.error("Failed to load initial insights:", error);
      setMessages([
        {
          type: "assistant",
          content: "Unable to load market insights. Please check your connection to the prediction markets API.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Desktop: Modal overlay */}
      <div className="hidden md:block">
        <div
          className="fixed top-16 animate-fadeInUp left-0 right-4 bottom-0 sm:right-4 sm:top-20 sm:bottom-4 sm:left-auto p-0 sm:w-96 w-full bg-[#2f2f33]/95 backdrop-blur-sm border border-[#2f2f33]/20 rounded-lg z-50 flex flex-col shadow-xl"
          style={{ animationDelay: `5s` }}
        >
          <div className="flex items-center justify-between p-4 border-b border-[#2f2f33]/20 ">
            <div className="relative">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-medium">Trending Topics</h3>
                {api.sessionId && <span className="text-xs text-[#008259]">●</span>}
                <div className="relative group">
                  <button onClick={toggleTooltip} className="focus:outline-none mt-2">
                    <InfoIcon className="w-4 h-4 text-[#008259] cursor-pointer" />
                  </button>
                  <div
                    className={`absolute -left-12 top-full mt-2 w-64 bg-gray-800 text-white text-sm rounded-lg p-3 shadow-lg z-10 transition-all duration-200 ${
                      isTooltipVisible || "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
                    }`}
                  >
                    <p className="leading-relaxed">Discover trending and viral content on social platforms</p>
                    <div className="absolute -top-2 left-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-800"></div>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors text-xl hover:bg-[#2f2f33] w-6 h-6 rounded flex items-center justify-center"
            >
              ×
            </button>
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {isLoading && messages.length === 0 && (
              <div className="flex items-center justify-center p-8">
                <LoaderCircle className="w-6 h-6 text-[#008259] animate-spin" />
              </div>
            )}

            {messages.map((message: any, index) => (
              <div key={index} className={`${message.type === "user" ? "ml-4" : "mr-4"}`}>
                <div
                  className={`rounded-lg p-3 ${
                    message.type === "user"
                      ? "bg-[#008259] text-white ml-auto max-w-[80%]"
                      : message.type === "insight"
                        ? "bg-[#008259]/20 border border-[#008259]/40 text-[#008259]"
                        : "bg-[#2f2f33] text-gray-100 border border-[#008259]/20"
                  }`}
                >
                  <div className="text-sm mb-1">{message.content}</div>

                  {/* Render specific data based on message type */}
                  {message.data && Array.isArray(message.data) && (
                    <div className="mt-2 space-y-2">
                      {message.data.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="bg-black/30 rounded p-2 text-xs border border-[#008259]/10">
                          {item.title && <div className="font-medium text-[#008259] mb-1">{item.title}</div>}
                          {item.question && <div className="font-medium text-[#008259] mb-1">{item.question}</div>}
                          {item.summary && <div className="text-gray-300 mb-1">{item.summary}</div>}
                          {item.description && <div className="text-gray-300 mb-1">{item.description}</div>}
                          {item.ai_probability && (
                            <div className="text-[#008259]">Probability: {(item.ai_probability * 100).toFixed(1)}%</div>
                          )}
                          {item.market_potential && (
                            <div className="text-[#008259]/80">
                              Market Potential: {(item.market_potential * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Metadata and timestamp for insight messages */}
                  {message.type === "insight" && message.metadata && (
                    <div className="flex items-center justify-between mt-2 text-xs text-[#008259]/70">
                      {/* Stats */}
                      <div className="flex items-center gap-3">
                        {/* Score */}
                        <div className="flex items-center gap-1" title="Score">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                          </svg>
                          <span>{message.metadata.score}</span>
                        </div>

                        {/* Upvote Ratio */}
                        <div className="flex items-center gap-1" title="Upvote Ratio">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>{(message.metadata.upvote_ratio * 100).toFixed(0)}%</span>
                        </div>

                        {/* Comments */}
                        <div className="flex items-center gap-1" title="Comments">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>{message.metadata.num_comments}</span>
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-gray-400">{message.timestamp}</div>
                    </div>
                  )}

                  {/* Timestamp for non-insight messages */}
                  {message.type !== "insight" && <div className="text-xs text-gray-400 mt-2">{message.timestamp}</div>}
                </div>
              </div>
            ))}

            {isLoading && messages.length > 0 && (
              <div className="flex items-center gap-2 text-[#008259] mr-4">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">Analyzing...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Full page view */}
      <div className="md:hidden fixed top-0 left-0 right-0 bottom-0 bg-[#232328] z-40 flex flex-col">
        {/* Header */}
        <div className="bg-[#232328] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2" onClick={toggleTooltip}>
            <h3 className="text-white font-medium text-lg">Trending Topics</h3>
            {api.sessionId && <span className="text-xs text-[#008259]">●</span>}
            <div className="relative group">
              <button className="focus:outline-none mt-2">
                <InfoIcon className="w-4 h-4 text-[#008259] cursor-pointer" />
              </button>
              <div
                className={`absolute -left-14 top-full mt-2 w-64 bg-gray-800 text-white text-sm rounded-lg p-3 shadow-lg z-10 transition-all duration-200 ${
                  isTooltipVisible || "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
                }`}
              >
                <p className="leading-relaxed">Discover trending and viral content on social platforms</p>
                <div className="absolute -top-2 left-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-800"></div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl w-8 h-8 rounded flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content - with padding for mobile nav */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 pb-24"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading && messages.length === 0 && (
            <div className="flex items-center justify-center p-8">
              <LoaderCircle className="w-6 h-6 text-[#008259] animate-spin" />
            </div>
          )}

          {messages.map((message: any, index) => (
            <div key={index}>
              <div
                className={`rounded-lg p-3 ${
                  message.type === "user"
                    ? "bg-[#008259] text-white"
                    : message.type === "insight"
                      ? "bg-[#008259]/20 border border-[#008259]/40 text-[#008259]"
                      : "bg-[#2f2f33] text-gray-100 border border-[#008259]/20"
                }`}
              >
                <div className="text-sm mb-1">{message.content}</div>

                {/* Render specific data based on message type */}
                {message.data && Array.isArray(message.data) && (
                  <div className="mt-2 space-y-2">
                    {message.data.slice(0, 3).map((item: any, idx: number) => (
                      <div key={idx} className="bg-black/30 rounded p-2 text-xs border border-[#008259]/10">
                        {item.title && <div className="font-medium text-[#008259] mb-1">{item.title}</div>}
                        {item.question && <div className="font-medium text-[#008259] mb-1">{item.question}</div>}
                        {item.summary && <div className="text-gray-300 mb-1">{item.summary}</div>}
                        {item.description && <div className="text-gray-300 mb-1">{item.description}</div>}
                        {item.ai_probability && (
                          <div className="text-[#008259]">Probability: {(item.ai_probability * 100).toFixed(1)}%</div>
                        )}
                        {item.market_potential && (
                          <div className="text-[#008259]/80">
                            Market Potential: {(item.market_potential * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Metadata and timestamp for insight messages */}
                {message.type === "insight" && message.metadata && (
                  <div className="flex items-center justify-between mt-2 text-xs text-[#008259]/70">
                    {/* Stats */}
                    <div className="flex items-center gap-3">
                      {/* Score */}
                      <div className="flex items-center gap-1" title="Score">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                        </svg>
                        <span>{message.metadata.score}</span>
                      </div>

                      {/* Upvote Ratio */}
                      <div className="flex items-center gap-1" title="Upvote Ratio">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>{(message.metadata.upvote_ratio * 100).toFixed(0)}%</span>
                      </div>

                      {/* Comments */}
                      <div className="flex items-center gap-1" title="Comments">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>{message.metadata.num_comments}</span>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="text-gray-400">{message.timestamp}</div>
                  </div>
                )}

                {/* Timestamp for non-insight messages */}
                {message.type !== "insight" && <div className="text-xs text-gray-400 mt-2">{message.timestamp}</div>}
              </div>
            </div>
          ))}

          {isLoading && messages.length > 0 && (
            <div className="flex items-center gap-2 text-[#008259]">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm">Analyzing...</span>
            </div>
          )}
        </div>
      </div>
    </>
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
    <div className="min-h-screen overflow-hidden bg-[#232328] pb-20 md:pb-0">
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

        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
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

        .animate-fadeInDown {
          animation: fadeInDown 0.6s ease-out forwards;
        }

        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out forwards;
        }

        .animate-pulse {
          animation: pulse 2s infinite;
        }
      `}</style>
      {/* Username Modal - renders on top of everything */}
      <UsernameModal />
      {/* Header */}
      <header className="bg-[#1a1a1e2c]   sticky top-0 z-40 overflow-hidden border-b border-b-[var(--Stroke-Dark,#2c2c2f)] px-3 sm:px-4 lg:px-4">
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


                <span className="text-gray-300 hidden lg:flex font-medium ml-6 transition-colors relative pb-1">
                  Explore
                  <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-3/4 h-[2px] bg-[#008259]"></span>
                </span>

              {/* Leaderboard Link - Desktop Only */}
              <Link href="/leaderboard" className="hidden lg:block group relative ml-6">
                <span className="text-gray-300 transition-colors duration-200 font-medium">
                  Leaderboard
                </span>
                <span className="absolute rounded-lg left-2 -bottom-0.5 h-[2px] w-0 bg-[#008259] transition-all duration-300 group-hover:w-[80%]"></span>
              </Link>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Insights Button */}
              <button
                onClick={() => setShowAIAssistant(!showAIAssistant)}
                className="hidden lg:flex items-center justify-center px-2 sm:px-3 py-2 rounded-lg transition-all duration-300 bg-[#2f2f33] text-gray-300 hover:bg-gray-700"
              >
                <ScanEye className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Wallet Selector */}
              <div className="flex gap-1 sm:gap-2 items-center">
                <WalletSelector />
              </div>
            </div>
          </div>
        </div>
      </header>
      {/* Hero Section */}

      <div
        className="w-full mb-8 lg:mb-12 bg-cover overflow-hidden bg-center"
        style={{
          animationDelay: "0.2s",
          backgroundImage: "url('/cover.png')",
        }}
      >
        {/* Inner content constrained to max width */}
        <div className="max-w-7xl mx-auto px-4 py-12 rounded-2xl">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 relative">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-white mb-4">Pivot Markets</h1>
              <p className="text-[#c6c6c7] text-lg max-w-2xl">
                Discover and trade future predictions with real-time insights in transparent, trustless on-chain
                markets.
              </p>
              <div className="flex items-center mt-6 gap-4">
                <button
                  className="flex items-center gap-2 px-4 py-3 bg-[#008259] hover:bg-[#095435] text-white rounded-lg transition-colors"
                  onClick={() => router.push("/create")}
                >
                  <PlusCircle className="w-5 h-5" />
                  Create Market
                </button>
              </div>
            </div>

            {/* Hero Image - positioned at bottom right */}
            <div className="absolute lg:-bottom-[246px] -bottom-[149px]  md:-bottom-[156px] -right-[130px]  lg:-right-[280px] w-full md:w-auto md:max-w-md lg:max-w-[49.5rem]">
              <img src="/hero.png" alt="Pivot Markets" className="w-full h-auto rounded-lg" />
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto lg:mb-16 mb-8 px-4 ">
        {/* Filters Section */}
        <div className="mb-8 ">
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
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 w-full ">
            <div className="flex-1 relative w-full lg:w-16 max-w-full">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#232328] border border-[#2f2f33] rounded-lg placeholder:text-[#6c6c6f] text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500/80"
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-row sm:hidden gap-3">
                <div className="flex flex-col gap-2 flex-1">
                  <span className="text-sm text-gray-400">Filter by</span>
                  <div className="relative">
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full bg-[#232328] border border-[#2f2f33] rounded-lg px-3 py-3 pr-8 text-[#c6c6c7] focus:outline-none focus:border-emerald-500/80 appearance-none cursor-pointer"
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

                <div className="flex flex-col gap-2 flex-1">
                  <span className="text-sm text-gray-400">Sort by</span>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full bg-[#232328] border border-[#2f2f33] rounded-lg px-3 py-3 pr-8 text-[#c6c6c7] focus:outline-none focus:border-emerald-500/80 appearance-none cursor-pointer"
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

              {/* Desktop: Original horizontal layout */}
              <div className="hidden sm:flex sm:flex-row items-center gap-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="text-sm">Filter by</span>
                  <div className="relative">
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="bg-[#232328] border border-[#2f2f33] rounded-lg px-3 py-3 pr-8 text-[#c6c6c7] focus:outline-none focus:border-emerald-500/80 appearance-none cursor-pointer"
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
                      className="bg-[#232328] border border-[#2f2f33] rounded-lg px-3 py-3 pr-8 text-[#c6c6c7] focus:outline-none focus:border-emerald-500/80 appearance-none cursor-pointer"
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
            {account?.address && (
              <Link
                href="/profile"
                className="bg-[#008259] hidden lg:flex hover:bg-[#006b46] text-white text-sm font-medium px-3 py-3 rounded-lg transition-colors"
              >
                My Profile
              </Link>
            )}
          </div>
        </div>

        {/* Markets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredMarkets
            .map((rawMarket: any) => {
              const currentTime = Date.now() / 1000; // current epoch time
              const endTime = parseInt(rawMarket.endTime);

              let status: "Live" | "Closed" | "Resolved";
              if (rawMarket.resolved) {
                status = "Resolved";
              } else if (currentTime >= endTime) {
                status = "Closed";
              } else {
                status = "Live";
              }

              const transformedMarket = {
                ...rawMarket,
                yesPrice: parseFloat(rawMarket.yesPrice) / 10000,
                noPrice: parseFloat(rawMarket.noPrice) / 10000,
                volume: (parseFloat(rawMarket.totalValueLocked) / 1000000).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
                participants: parseInt(rawMarket.participantCount),
                confidence: 0.5,
                trend: "up",
                minBet: "",
                maxBet: "",
                type: "",
                timeLeft: getTimeLeft(rawMarket.endTime),
                status,
              };

              return transformedMarket;
            })
            .sort((a, b) => {
              // Sort priority: Live > Closed > Resolved
              const statusPriority: any = { Live: 0, Closed: 1, Resolved: 2 };
              return statusPriority[a.status] - statusPriority[b.status];
            })
            .map((transformedMarket) => (
              <div key={transformedMarket.id} className="">
                <MarketCard market={transformedMarket} onPredict={handlePredictMarket} />
              </div>
            ))}
        </div>

        {markets && filteredMarkets.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <div key={index} className="bg-[#2f2f33] border border-gray-700/30 rounded-2xl p-6 animate-pulse">
                {/* Header skeleton */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1 pr-4">
                    <div className="h-6 bg-gray-700/50 rounded mb-2"></div>
                    <div className="h-4 bg-gray-700/30 rounded w-3/4"></div>
                  </div>
                  {/* Arc meter skeleton */}
                  <div className="w-16 h-8 bg-gray-700/50 rounded-full"></div>
                </div>

                {/* YES/NO buttons skeleton */}
                <div className="grid grid-cols-2 gap-3 mb-6 mt-3">
                  <div className="bg-gray-700/20 border border-gray-700/30 rounded-xl py-3 px-4 h-[4.5rem] flex flex-col justify-center"></div>
                  <div className="bg-gray-700/20 border border-gray-700/30 rounded-xl py-3 px-4 h-[4.5rem] flex flex-col justify-center"></div>
                </div>

                {/* Stats skeleton */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-gray-700/50 rounded"></div>
                      <div className="h-4 bg-gray-700/50 rounded w-16"></div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 bg-gray-700/50 rounded"></div>
                      <div className="h-4 bg-gray-700/50 rounded w-12"></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-gray-700/50 rounded"></div>
                    <div className="h-4 bg-gray-700/50 rounded w-16"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {/* {account && markets && markets.length === 0 && (
          <div className="text-center py-12 animate-fadeInUp">
            <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No markets found</h3>
            <p className="text-gray-400">Try adjusting your search or filter criteria</p>
          </div>
        )} */}
      </div>

      {/* AI Assistant Panel */}
      <AIAssistantPanel isVisible={showAIAssistant} onClose={() => setShowAIAssistant(false)} />
      <MobileBottomNav
        onInsightsClick={() => setShowAIAssistant(!showAIAssistant)}
        isInsightsActive={showAIAssistant}
        onInsightsClose={() => setShowAIAssistant(false)}
      />
    </div>
  );
}
