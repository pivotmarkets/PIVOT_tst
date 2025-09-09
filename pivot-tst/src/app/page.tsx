"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  MessageCircle,
  Search,
  Filter,
  BarChart3,
  Clock,
  Users,
  DollarSign,
  Sparkles,
  Target,
  Activity,
  ChevronRight,
  Info,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

// Mock data for trending topics and markets
const trendingTopics = [
  { id: 1, topic: "AI regulation", volume: "+234%", category: "Technology" },
  { id: 2, topic: "Climate summit", volume: "+156%", category: "Environment" },
  { id: 3, topic: "Election polls", volume: "+189%", category: "Politics" },
  { id: 4, topic: "Crypto adoption", volume: "+298%", category: "Finance" },
];

const activeMarkets = [
  {
    id: 1,
    title: "Will Bitcoin reach $100k by end of 2025?",
    category: "Crypto",
    yesPrice: 0.67,
    noPrice: 0.33,
    volume: "$2.4M",
    participants: 1247,
    timeLeft: "23d 4h",
    trend: "up",
    confidence: 0.78,
  },
  {
    id: 2,
    title: "Will AI achieve AGI breakthrough in 2025?",
    category: "Technology",
    yesPrice: 0.23,
    noPrice: 0.77,
    volume: "$890K",
    participants: 892,
    timeLeft: "11d 16h",
    trend: "up",
    confidence: 0.65,
  },
  {
    id: 3,
    title: "Will global temperature rise exceed 1.5°C by 2030?",
    category: "Climate",
    yesPrice: 0.84,
    noPrice: 0.16,
    volume: "$1.6M",
    participants: 2156,
    timeLeft: "2d 8h",
    trend: "down",
    confidence: 0.91,
  },
];

const aiSuggestions = [
  {
    id: 1,
    title: "US Presidential Election Outcome",
    confidence: 0.85,
    reason: "High search volume + trending political discussions",
    category: "Politics",
  },
  {
    id: 2,
    title: "Next Federal Reserve Interest Rate Decision",
    confidence: 0.72,
    reason: "Economic indicators showing volatility",
    category: "Finance",
  },
  {
    id: 3,
    title: "SpaceX Mars Mission Timeline",
    confidence: 0.68,
    reason: "Recent aerospace developments trending",
    category: "Space",
  },
];

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
};

const MarketCard = ({ market, onPredict }: any) => {
  const isYesTrending = market.trend === "up";

  return (
    <motion.div
      variants={itemVariants}
      className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4 hover:border-gray-600/50 transition-all duration-300 group cursor-pointer"
      onClick={() => onPredict(market)}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">{market.category}</span>
            <div className="flex items-center gap-1">
              {isYesTrending ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
              )}
              <span className="text-xs text-gray-400">{Math.round(market.confidence * 100)}% confidence</span>
            </div>
          </div>
          <h3 className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors">{market.title}</h3>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-green-500/10 border border-green-500/20 rounded p-2">
          <div className="text-green-400 text-xs font-medium">YES</div>
          <div className="text-green-300 text-lg font-bold">{(market.yesPrice * 100).toFixed(0)}$</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2">
          <div className="text-red-400 text-xs font-medium">NO</div>
          <div className="text-red-300 text-lg font-bold">{(market.noPrice * 100).toFixed(0)}$</div>
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {market.volume}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {market.participants}
          </span>
        </div>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {market.timeLeft}
        </span>
      </div>
    </motion.div>
  );
};

const TrendingCard = ({ topic }: any) => (
  <motion.div
    variants={itemVariants}
    className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg p-3 cursor-pointer group"
  >
    <div className="flex justify-between items-center">
      <div>
        <h4 className="text-white font-medium text-sm group-hover:text-purple-400 transition-colors">{topic.topic}</h4>
        <p className="text-gray-400 text-xs">{topic.category}</p>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-1">
          <ArrowUp className="w-3 h-3 text-green-400" />
          <span className="text-green-400 font-medium text-sm">{topic.volume}</span>
        </div>
      </div>
    </div>
  </motion.div>
);

const AIAssistantPanel = ({ isVisible, onClose, onCreateMarket }: any) => {
  const [message, setMessage] = useState("");

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className="fixed right-4 top-20 bottom-4 w-80 bg-gray-900/95 backdrop-blur-lg border border-gray-700/50 rounded-lg z-50 flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h3 className="text-white font-medium">AI Market Assistant</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              ×
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto">
            <div className="mb-4">
              <h4 className="text-white text-sm font-medium mb-3">Trending Opportunities</h4>
              <div className="space-y-2">
                {aiSuggestions.map((suggestion) => (
                  <motion.div
                    key={suggestion.id}
                    className="bg-white/5 border border-gray-700/30 rounded p-3 cursor-pointer group"
                    onClick={() => onCreateMarket(suggestion)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="text-white text-xs font-medium group-hover:text-blue-400 transition-colors">
                        {suggestion.title}
                      </h5>
                      <span className="text-blue-400 text-xs">{Math.round(suggestion.confidence * 100)}%</span>
                    </div>
                    <p className="text-gray-400 text-xs mb-2">{suggestion.reason}</p>
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                      {suggestion.category}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-white text-sm font-medium mb-3">Market Analysis</h4>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3">
                <p className="text-blue-300 text-xs">
                  Current market sentiment is bullish on tech stocks, with AI-related predictions showing increased
                  volume. Consider creating markets around upcoming tech earnings.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-700/50">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask about market trends..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function PredictionMarketApp() {
  const [activeTab, setActiveTab] = useState("markets");
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [connected, setConnected] = useState(true); // Mock wallet connection

  const tabs = [
    { id: "markets", label: "Active Markets", icon: Target },
    { id: "trending", label: "Trending", icon: TrendingUp },
    { id: "portfolio", label: "My Positions", icon: BarChart3 },
    { id: "history", label: "History", icon: Activity },
  ];

  const handlePredictMarket = (market: React.SetStateAction<null>) => {
    setSelectedMarket(market);
    // Open prediction modal/interface
  };

  const handleCreateMarket = (suggestion: any) => {
    console.log("Creating market from AI suggestion:", suggestion);
    // Handle market creation
  };
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <motion.header
        className="border-b border-gray-700/50 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-40"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white">
                Pivot<span className="text-blue-400">{""}AI</span>
              </h1>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Beta v0.2
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search markets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 w-64"
                />
              </div>

              <button
                onClick={() => setShowAIAssistant(!showAIAssistant)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                  showAIAssistant ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                AI Assistant
              </button>

              <button
                onClick={() => router.push("/create")}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Market
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1">
            {/* Stats Overview */}
            {/* <motion.div 
              className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {[
                { label: "Total Volume", value: "$12.4M", change: "+23%", icon: DollarSign },
                { label: "Active Markets", value: "1,247", change: "+12%", icon: Target },
                { label: "Total Users", value: "89.2K", change: "+45%", icon: Users },
                { label: "AI Accuracy", value: "87.3%", change: "+2%", icon: Sparkles }
              ].map((stat, index) => (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">{stat.label}</p>
                      <p className="text-white text-xl font-bold">{stat.value}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <stat.icon className="w-5 h-5 text-blue-400 mb-1" />
                      <span className="text-green-400 text-xs">{stat.change}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div> */}

            {/* Navigation Tabs */}
            <motion.div
              className="flex gap-1 mb-6 bg-gray-800/50 rounded-lg p-1"
              variants={itemVariants}
              initial="hidden"
              animate="visible"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-700/50"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </motion.div>

            {/* Content Area */}
            <motion.div variants={containerVariants} initial="hidden" animate="visible">
              {activeTab === "markets" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {activeMarkets.map((market) => (
                    <MarketCard key={market.id} market={market} onPredict={handlePredictMarket} />
                  ))}
                </div>
              )}

              {activeTab === "trending" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trendingTopics.map((topic) => (
                    <TrendingCard key={topic.id} topic={topic} />
                  ))}
                </div>
              )}

              {activeTab === "portfolio" && (
                <div className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6 text-center">
                  <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-white text-lg font-medium mb-2">No Positions Yet</h3>
                  <p className="text-gray-400 mb-4">Start predicting to build your portfolio</p>
                  <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
                    Browse Markets
                  </button>
                </div>
              )}

              {activeTab === "history" && (
                <div className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6 text-center">
                  <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-white text-lg font-medium mb-2">No Trading History</h3>
                  <p className="text-gray-400">Your prediction history will appear here</p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Sidebar - Hidden when AI Assistant is open */}
          {!showAIAssistant && (
            <motion.div
              className="w-80 space-y-6"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {/* Trending Topics */}
              <div className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Trending Topics
                </h3>
                <div className="space-y-3">
                  {trendingTopics.slice(0, 3).map((topic) => (
                    <TrendingCard key={topic.id} topic={topic} />
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white/5 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4">
                <h3 className="text-white font-medium mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors">
                    <Plus className="w-4 h-4" />
                    Create Custom Market
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400 hover:bg-purple-500/20 transition-colors">
                    <Sparkles className="w-4 h-4" />
                    AI Market Suggestions
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* AI Assistant Panel */}
      <AIAssistantPanel
        isVisible={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        onCreateMarket={handleCreateMarket}
      />
    </div>
  );
}
