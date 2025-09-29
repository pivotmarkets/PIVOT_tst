"use client";

import React, { useEffect, useState } from "react";
import { Send, BarChart3, DollarSign, Globe, MessageCircle, Circle, CheckCircle, Edit3 } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { convertAmountFromHumanReadableToOnChain } from "@/utils/helpers";
import { aptosClient } from "@/utils/aptosClient";
import { useQueryClient } from "@tanstack/react-query";
import { createMarket } from "@/app/entry-functions/stake";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { WalletSelector } from "./WalletSelector";
import Link from "next/link";

interface Message {
  role: "user" | "ai";
  content: string;
}

interface Suggestion {
  ai_probability: number;
  category: string;
  confidence: number;
  context: string;
  description: string;
  end_date: string;
  key_factors: string[];
  question: string;
  resolution_criteria: string;
  sentiment_score: number;
  sources: string[];
  title: string;
}

const CreateMarket = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [progress, setProgress] = useState<string>("");
  const [marketProposal, setMarketProposal] = useState<any>("");
  const [initialLiquidity, setInitialLiquidity] = useState<number>(2);
  const [error, setError] = useState("");
  const [creatingCustomMarket, setCreatingCustomMarket] = useState(false);
  const [marketCreated, setMarketCreated] = useState(false);
  const [createdMarketTitle, setCreatedMarketTitle] = useState("");

  // New states for suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [editingMarket, setEditingMarket] = useState(false);
  const queryClient = useQueryClient();
  const coinType = "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832::usdc::USDC";

  const USDC_ASSET_ADDRESS: string = "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832";

  const USDC_DECIMALS = 6; // USDC has 6 decimals

  const userId = "Creator"; // You can make this dynamic

  const [suggestedQuestions] = useState([
    "Will Bitcoin fall below $100,000 before January 1, 2026?",
    "Will Singapore establish an official national Bitcoin reserve in 2025?",
    "Will SpaceX successfully land humans on Mars by 2030?",
  ]);

  const handleSuggestedReply = () => {
    if (suggestedReply) {
      setInput(suggestedReply);
      setSuggestedReply(""); // Clear the suggestion after use
    }
  };

  const formatAIResponse = (data: any) => {
    let message = "";

    if (data.prompt) {
      message += data.prompt;
    }

    return message;
  };

  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);

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

        // filter for USDC
        const usdcBalance = balances.find((b: any) => b.asset_type.toLowerCase() === USDC_ASSET_ADDRESS.toLowerCase());

        // Convert raw amount (6 decimals)
        const formatted = usdcBalance ? Number(usdcBalance.amount) / 1e6 : 0;

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

  const { balance } = useUSDCBalance();

  const handleLiquidityChange = (e: { target: { value: any } }) => {
    let value = e.target.value;
    
    // Auto-limit to max balance if exceeded
    if (value && parseFloat(value) > balance) {
      value = Math.max(2, balance - 0.05).toFixed(2); 
      setInitialLiquidity(value);
    } else {
      setInitialLiquidity(value);
    }
  
    if (value && parseFloat(value) < 2) {
      setError("Min 2 USDC");
    } else if (value && parseFloat(value) > balance) {
      setError("Insufficient USDC balance");
    } else {
      setError("");
    }
  };

  const handleSelectSuggestion = async (index: number) => {
    // Create a temporary session ID if one doesn't exist
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(currentSessionId);
    }

    setLoading(true);

    try {
      setSelectedSuggestion(suggestions[index]);
      setShowSuggestions(false);
      setEditingMarket(true);

      // Update progress
      setCurrentStep(2);
      setProgress("Editing Market Proposal");

      // Add a message about the selection
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `You've selected: "${suggestions[index].title}". Now you can make any changes before creating the market.`,
        },
      ]);

      // Use the selected suggestion as the market proposal
      setMarketProposal(suggestions[index]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `Selected: "${suggestions[index].title}". Note: Using offline mode - you can still edit and create the market.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const { signAndSubmitTransaction, account } = useWallet();

  const onStakeClick = async () => {
    if (!account) return;
    // Add validation for custom markets
    if (creatingCustomMarket) {
      if (!marketProposal.question.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Please enter a market question before creating the market." },
        ]);
        return;
      }

      if (!marketProposal.category.trim()) {
        setMessages((prev) => [...prev, { role: "ai", content: "Please enter a category for your market." }]);
        return;
      }

      if (!marketProposal.end_date) {
        setMessages((prev) => [...prev, { role: "ai", content: "Please select an end date for your market." }]);
        return;
      }

      if (!marketProposal.resolution_criteria.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: "Please provide resolution criteria for your market." },
        ]);
        return;
      }
    }
    console.log("marketProposal", marketProposal);

    // Extract market details
    const title = marketProposal.title;
    const description = marketProposal.question;
    const resolution_criteria =
      marketProposal.resolution_criteria ||
      "This market will be resolved based on official sources and verifiable information at the specified end time.";
    const oracle = "0xb4403ce8b8163332307f98d70f26e9b0be59f51f8e6d6ea414f79944930ad81b";

    // Parse the date string "DD/MM/YYYY HH:mm"
    const endTime = marketProposal.end_date;
    let formattedEndTime;

    const [datePart, timePart] = endTime.split(" ");
    const [day, month, year] = datePart.split("/");

    const isoDateString = `${year}-${month}-${day}T${timePart || "23:59:59"}Z`;
    const endDate = new Date(isoDateString);

    // Validate date
    if (isNaN(endDate.getTime())) {
      throw new Error("Invalid date format");
    }

    formattedEndTime = Math.floor(endDate.getTime() / 1000) + 86400;

    // Validate end time is in the future
    const currentTime = Math.floor(Date.now() / 1000);
    if (formattedEndTime <= currentTime) {
      setMessages((prev) => [
        {
          role: "ai",
          content:
            "😅 The market end time needs to be sometime in the future—can't close a bet that's already over, right? Try picking a later date.",
        },
        ...prev,
      ]);
      return;
    }
    console.log(
      "creating market with--",
      title,
      description,
      resolution_criteria,
      formattedEndTime,
      initialLiquidity,
      currentStep,
      progress,
    );
    try {
      const response = await signAndSubmitTransaction(
        createMarket({
          title,
          description,
          resolution_criteria,
          endTime: formattedEndTime,
          oracle,
          initialLiquidity: convertAmountFromHumanReadableToOnChain(initialLiquidity, USDC_DECIMALS), // 2 USDC initial liquidity
          coinType,
        }),
      );

      // Wait for the transaction
      await aptosClient().waitForTransaction({
        transactionHash: response.hash,
      });

      queryClient.refetchQueries();
      console.log("Market creation response:", response);

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `🎉 Market "${title}" created successfully! It's now live for trading.`,
        },
      ]);
      setMarketCreated(true);
      setCreatedMarketTitle(title);

      setEditingMarket(false);
      setSelectedSuggestion(null);
      setMarketProposal(null);
      setCurrentStep(3);
      setProgress("Market Created!");

      // Reset input for next market
      setInput("");
    } catch (error: any) {
      console.error("Error creating market:", error);

      // Better error handling
      let errorMessage = "❌ Failed to create market. Please try again.";

      if (error.message?.includes("E_INVALID_END_TIME")) {
        errorMessage = "❌ Invalid end time. Market must run for at least 1 hour.";
      } else if (error.message?.includes("E_INVALID_BET_AMOUNT")) {
        errorMessage = "❌ Insufficient initial liquidity. Please increase the amount.";
      } else if (error.message?.includes("insufficient balance")) {
        errorMessage = "❌ Insufficient USDC balance to create market.";
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: errorMessage,
        },
      ]);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setLoading(true);

    try {
      let response;

      if (!sessionId) {
        // First message -> start market creation
        response = await fetch("https://pivot-tst.onrender.com/api/market/search-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: input, user_id: userId }),
        });
      } else {
        // Subsequent messages -> continue
        response = await fetch("https://pivot-tst.onrender.com/api/market/continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, response: input }),
        });
      }

      const data = await response.json();
      console.log("Server response:", data);

      if (data.success !== false && response.ok) {
        // IMPORTANT: Set session ID immediately from search-suggestions response
        if (data.session_id && !sessionId) {
          setSessionId(data.session_id);
        }

        // Handle suggestions from search-suggestions endpoint
        if (data.prediction_markets && data.prediction_markets.length > 0) {
          // Format the prediction_markets as suggestions
          const formattedSuggestions = data.prediction_markets.map((market: any) => ({
            ai_probability: market.ai_probability,
            category: market.category,
            confidence: market.confidence,
            context: market.context,
            description: market.description,
            end_date: market.end_date,
            key_factors: market.key_factors || [],
            question: market.question,
            resolution_criteria: market.resolution_criteria,
            sentiment_score: market.sentiment_score,
            sources: market.sources || [],
            title: market.title,
          }));

          setSuggestions(formattedSuggestions);
          setShowSuggestions(true);

          // Update progress
          setCurrentStep(1);
          setProgress("Select Market Suggestion");

          // Add a helpful message about the suggestions
          const suggestionMessage = `I found these predictions based on your query "${data.query || input}". Please select one to customize, or create a custom market.`;

          setMessages((prev) => [...prev, { role: "ai", content: suggestionMessage }]);
        }
        // Handle regular suggestions (from continue endpoint)
        else if (data.suggestions && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
          setShowSuggestions(true);

          // Update progress
          setCurrentStep(1);
          setProgress("Select Market Suggestion");

          // Add the message from the API
          if (data.message) {
            setMessages((prev) => [...prev, { role: "ai", content: data.message }]);
          }
        }
        // Handle AI suggestions for refinement
        else if (data.ai_suggestion) {
          let reply = data.ai_suggestion;

          if (reply.includes("Everything looks good")) {
            reply = "confirm";
          }

          setSuggestedReply(reply);
        }

        if (data.proposal) {
          setMarketProposal(data.proposal);
        }

        // Update progress state
        if (data.current_step) {
          setCurrentStep(data.current_step);
        }
        if (data.progress) {
          setProgress(data.progress);
        }

        // Format and display the AI response (for other types of responses)
        if (data.prompt && !data.prediction_markets) {
          const aiMessage = formatAIResponse(data);
          if (aiMessage) {
            setMessages((prev) => [...prev, { role: "ai", content: aiMessage }]);
          }
        }
      } else {
        // Handle error case
        const errorMessage = data.message || "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, { role: "ai", content: `⚠️ ${errorMessage}` }]);
      }
    } catch (err) {
      console.error("Request error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "⚠️ Network error. Please check your connection and try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const router = useRouter();

  const parseDate = (dateStr: string): string => {
    if (!dateStr) return "";

    // Handle DD/MM/YYYY format
    if (dateStr.includes("/")) {
      const [day, month, year] = dateStr.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    // If already in YYYY-MM-DD format, return as is
    return dateStr;
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "Invalid Date";

    try {
      // Remove time if present
      const [datePart] = dateStr.split(" ");

      // Handle DD/MM/YYYY format
      if (datePart.includes("/")) {
        const [day, month, year] = datePart.split("/");
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString();
      }

      // Handle YYYY-MM-DD format
      const date = new Date(datePart);
      return date.toLocaleDateString();
    } catch (error) {
      return "Invalid Date";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#232328] via-[#1a1a1f] to-[#0f0f14]">
      {" "}
      <header className="bg-[#1a1a1e2c] sticky top-0 z-40 overflow-hidden animate-fadeInUp border-b border-b-[var(--Stroke-Dark,#2c2c2f)] px-3 sm:px-4 lg:px-4">
        <div className="max-w-7xl mx-auto py-3 sm:py-4">
          <div className="flex justify-between items-center px-0">
            {/* Logo Section */}
            <div className="cursor-pointer flex flex-col" onClick={() => router.push("/")}>
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

            {/* Wallet Connect Section */}
            <div className="flex gap-2 items-center flex-wrap">
              <WalletSelector />
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {messages.length === 0 ? (
          /* Welcome State */
          <div className="text-center items-center space-y-8">
            {/* Hero Section */}
            <motion.div
              className="flex justify-center flex-col items-center"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <motion.div
                className="flex items-center justify-center gap-4 mb-8"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {[
                  { icon: BarChart3, gradient: "from-emerald-500 to-green-600" },
                  { icon: DollarSign, gradient: "from-green-500 to-emerald-600" },
                  { icon: Globe, gradient: "from-teal-500 to-green-600" },
                  {
                    icon: MessageCircle,
                    gradient: "from-lime-600 to-emerald-700",
                    onClick: () => {
                      // Hide suggestions and clear input
                      setShowSuggestions(false);
                      setInput("");

                      // Create an empty market proposal template
                      const emptyMarketProposal = {
                        title: "",
                        question: "",
                        category: "",
                        end_date: "",
                        resolution_criteria: "",
                        description: "",
                        ai_probability: 0.5,
                        confidence: 0.7,
                        sentiment_score: 0.5,
                        key_factors: [],
                        context: "Custom market",
                        sources: [],
                      };

                      // Set the empty proposal and enable editing mode
                      setMarketProposal(emptyMarketProposal);
                      setSelectedSuggestion(null);
                      setEditingMarket(true);
                      setCreatingCustomMarket(true);

                      // Update progress
                      setCurrentStep(2);
                      setProgress("Creating Custom Market");

                      // Add AI message
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "ai",
                          content:
                            "Let's create your custom market! Fill in the details below and I'll help you create a prediction market.",
                        },
                      ]);
                    },
                  },
                ].map(({ icon: Icon, onClick }, idx) => (
                  <motion.div
                    key={idx}
                    className={`w-12 h-12 rounded-2xl bg-[#29292e] flex mt-12 items-center justify-center shadow-sm shadow-black/30 ${onClick ? "cursor-pointer hover:shadow-lime-500/20" : ""}`}
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + idx * 0.1 }}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    whileTap={onClick ? { scale: 0.95 } : {}}
                    onClick={onClick}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </motion.div>
                ))}
              </motion.div>

              <motion.h2
                className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold 
             bg-slate-300 bg-clip-text text-transparent text-center leading-tight pb-1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                Greetings 👋
              </motion.h2>

              <motion.p
                className="text-sm sm:text-base md:text-lg text-gray-300 mt-4 
             max-w-md sm:max-w-lg mx-auto flex flex-wrap items-center 
             justify-center gap-2 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                Want to create a bet?
                <span
                  onClick={() => {
                    setShowSuggestions(false);
                    setInput("");

                    const emptyMarketProposal = {
                      title: "",
                      question: "",
                      category: "",
                      end_date: "",
                      resolution_criteria: "",
                      description: "",
                      ai_probability: 0,
                      confidence: 0,
                      sentiment_score: 0,
                      key_factors: [],
                      context: "--",
                      sources: [],
                    };

                    setMarketProposal(emptyMarketProposal);
                    setSelectedSuggestion(null);
                    setEditingMarket(true);
                    setCreatingCustomMarket(true);
                    setCurrentStep(2);
                    setProgress("Creating Custom Market");

                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "ai",
                        content:
                          "Let's create your custom market! Fill in the details below and I'll help you create a prediction market.",
                      },
                    ]);
                  }}
                  className="text-[#02834e] hover:text-green-800 cursor-pointer font-medium 
               transition-all duration-200 flex items-center gap-1"
                >
                  <Edit3 className="w-4 h-4" />
                  Create Manually
                </span>
              </motion.p>
            </motion.div>

            {/* Suggested Questions - Horizontal Layout with Animations */}
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <p className="text-sm text-gray-400 mb-3 font-medium">
                Or, enter a prompt to get high-quality AI-suggested markets
              </p>
              <div
                className="flex flex-nowrap gap-4 overflow-x-auto lg:overflow-x-hidden lg:justify-between pb-4"
                style={{
                  scrollbarWidth: "none", // Firefox
                  msOverflowStyle: "none", // IE/Edge
                }}
              >
                {suggestedQuestions?.map((question: any, idx: any) => (
                  <motion.button
                    key={idx}
                    onClick={() => handleSuggestedQuestion(question)}
                    className="group relative flex-shrink-0 w-64 lg:w-auto lg:flex-1 p-6 
                 bg-[#2a2a30]/90 backdrop-blur-sm rounded-2xl text-left 
                 hover:bg-[#323238]/80 transition-all duration-300 overflow-clip"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 + idx * 0.1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Background gradient on hover */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 
                   opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      initial={false}
                    />

                    <div className="relative flex items-start gap-3">
                      <motion.p
                        className="text-gray-300 group-hover:text-white transition-colors 
                     leading-relaxed text-sm break-words"
                        initial={{ opacity: 0.8 }}
                        whileHover={{ opacity: 1 }}
                      >
                        {question}
                      </motion.p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="space-y-6 mb-8">
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.1 }}
              >
                <div
                  className={`max-w-2xl px-6 py-4 rounded-2xl shadow-sm ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white ml-12"
                      : "bg-[#2a2a30]/80 backdrop-blur-sm text-gray-100 border border-gray-600/50 mr-12"
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </motion.div>
            ))}
            {marketCreated && (
              <motion.div
                className="mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 backdrop-blur-sm border border-green-500/30 rounded-2xl p-8 text-center shadow-lg">
                  <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-white" />
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-2">Market Created Successfully!</h3>
                  <p className="text-green-300 mb-6">"{createdMarketTitle}" is now live and ready for trading.</p>

                  <div className="flex gap-4 justify-center flex-wrap">
                    <button
                      onClick={() => router.push("/")}
                      className="px-8 py-3 bg-white text-black rounded-xl font-medium transition-all duration-200 flex items-center gap-2"
                    >
                      <Globe className="w-5 h-5 text-black" />
                      View All Markets
                    </button>

                    <button
                      onClick={() => {
                        // Reset states to create another market
                        setMarketCreated(false);
                        setCreatedMarketTitle("");
                        setEditingMarket(false);
                        setSelectedSuggestion(null);
                        setMarketProposal(null);
                        setCreatingCustomMarket(false);
                        setMessages([]);
                        setCurrentStep(0);
                        setProgress("");
                      }}
                      className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2"
                    >
                      <Edit3 className="w-5 h-5" />
                      Create Another Market
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
            {loading && (
              <motion.div
                className="flex justify-start"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/60 rounded-2xl px-6 py-4 mr-12">
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-700 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-slate-700 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-slate-700 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                    <span className="text-sm">AI is analyzing...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Suggestions Display */}
        {showSuggestions && suggestions.length > 0 && !editingMarket && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-[#232328] backdrop-blur-sm border border-gray-600/40 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Suggested markets:
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {suggestions.map((suggestion, index) => (
                  <motion.div
                    key={index}
                    className="bg-[#2a2a30]/80 backdrop-blur-sm border border-gray-600/50 rounded-xl p-6 hover:border-green-500/20 transition-all duration-300"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-3 py-1 bg-green-600/20 text-green-300 rounded-full text-sm capitalize">
                        {suggestion.category}
                      </span>
                      <button
                        onClick={() => handleSelectSuggestion(index)}
                        disabled={loading}
                        className="px-4 py-2 bg-white text-black rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Select
                      </button>
                    </div>

                    <h4 className="text-lg font-semibold text-white mb-2 line-clamp-2">{suggestion.title}</h4>

                    <p className="text-sm text-gray-100 mb-3 line-clamp-2">{suggestion.description}</p>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">AI Probability:</span>
                        <span className="text-green-400 font-medium">
                          {(suggestion.ai_probability * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Confidence:</span>
                        <span className="text-emerald-400 font-medium">
                          {(suggestion.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">End Date:</span>
                        <span className="text-gray-100">{formatDateForDisplay(suggestion?.end_date)}</span>
                      </div>
                    </div>

                    {suggestion.key_factors.length > 0 && (
                      <div className="mb-3">
                        <h5 className="text-xs font-semibold text-green-400 mb-1">Key Factors</h5>
                        <ul className="text-xs text-gray-400 space-y-1">
                          {suggestion.key_factors.slice(0, 2).map((factor, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span className="text-green-400">•</span>
                              <span className="line-clamp-1">{factor}</span>
                            </li>
                          ))}
                          {suggestion.key_factors.length > 2 && (
                            <li className="text-gray-500">... and {suggestion.key_factors.length - 2} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="text-xs text-gray-500 italic">{suggestion.context}</div>
                  </motion.div>
                ))}
              </div>

              {/* Custom Option */}
              <motion.div
                className="mt-6 p-4 bg-gradient-to-r from-green-600/10 to-emerald-600/10 border border-green-500/30 rounded-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      // Hide suggestions and clear input
                      setShowSuggestions(false);
                      setInput("");

                      // Create an empty market proposal template
                      const emptyMarketProposal = {
                        title: "",
                        question: "",
                        category: "",
                        end_date: "",
                        resolution_criteria: "",
                        description: "",
                        ai_probability: 0.5, // Default 50%
                        confidence: 0.7, // Default 70%
                        sentiment_score: 0.5, // Default neutral
                        key_factors: [],
                        context: "Custom market created by user",
                        sources: [],
                      };

                      // Set the empty proposal and enable editing mode
                      setMarketProposal(emptyMarketProposal);
                      setSelectedSuggestion(null);
                      setEditingMarket(true);
                      setCreatingCustomMarket(true);

                      // Update progress
                      setCurrentStep(2);
                      setProgress("Creating Custom Market");

                      // Add AI message
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "ai",
                          content:
                            "Let's create your custom market! Fill in the details below and I'll help you create a prediction market.",
                        },
                      ]);
                    }}
                    className="px-4 py-2 bg-gradient-to-b from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    Create Manually
                  </button>
                  <div className="text-sm text-green-300">Create your own market with custom parameters</div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Market Proposal Analysis (Editing Mode) */}
        {(marketProposal || selectedSuggestion) && editingMarket && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-gradient-to-r from-[#2a2a30]/80 to-[#28282f]/80 backdrop-blur-sm border border-gray-600/40 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                Market Proposal
                <Edit3 className="w-5 h-5 text-green-400" />
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Market Details */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-1">Market Question</h4>
                    <textarea
                      defaultValue={marketProposal?.question || selectedSuggestion?.question || ""}
                      className="w-full bg-[#2f2f35]/70 border border-gray-600/50 rounded-lg p-3 text-gray-100 text-sm resize-none focus:border-green-400 focus:outline-none transition-colors"
                      rows={3}
                      onChange={(e) => {
                        setMarketProposal((prev: any) => ({
                          ...prev,
                          question: e.target.value,
                          title: e.target.value.slice(0, 100),
                        }));
                      }}
                      placeholder="What would you like people to predict?"
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-1">Category</h4>
                    <input
                      defaultValue={marketProposal?.category || selectedSuggestion?.category || ""}
                      onChange={(e) => {
                        setMarketProposal((prev: any) => ({
                          ...prev,
                          category: e.target.value,
                        }));
                      }}
                      className="w-full bg-[#2f2f35]/70 border border-gray-600/50 rounded-lg p-3 text-gray-100 text-sm focus:border-green-400 focus:outline-none transition-colors"
                      placeholder="Category (e.g., Crypto, Sports, Politics, Tech)"
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-1">End Date</h4>
                    <input
                      type="date"
                      defaultValue={
                        marketProposal?.end_date
                          ? parseDate(marketProposal.end_date)
                          : selectedSuggestion?.end_date
                            ? parseDate(selectedSuggestion.end_date)
                            : ""
                      }
                      onChange={(e) => {
                        const existingDateTime = marketProposal?.end_date;
                        let timePortion = "21:18"; // default time

                        if (existingDateTime && existingDateTime.includes(" ")) {
                          timePortion = existingDateTime.split(" ")[1];
                        }

                        const dateParts = e.target.value.split("-"); // [YYYY, MM, DD]
                        const newDateTime = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timePortion}`;

                        setMarketProposal((prev: any) => ({
                          ...prev,
                          end_date: newDateTime,
                        }));
                      }}
                      className="w-full bg-[#2f2f35]/70 border border-gray-600/50 rounded-lg p-3 text-gray-100 text-sm focus:border-green-400 focus:outline-none transition-colors"
                    />
                  </div>
                  {/* New USDC Bet Amount Input */}
                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-1 flex items-center gap-2">
                      Initial Liquidity (USDC)
                      <span className="text-red-400">*</span>
                      {/* Info icon with tooltip */}
                      <div className="relative group">
                        <div className="w-4 h-4 bg-gray-600 rounded-full flex items-center justify-center text-xs text-gray-300 cursor-pointer hover:bg-gray-500 transition-colors">
                          i
                        </div>

                        {/* Tooltip */}
                        <div className="absolute -left-20 lg:left-0 top-6 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-200 w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                          More liquidity = better trading experience and higher potential creator earnings. Your contribution will be split 50/50 between YES and NO pools.
                        </div>
                      </div>
                    </h4>

                    <div className="relative">
                      <input
                        type="number"
                        min="2"
                        step="1"
                        value={initialLiquidity}
                        onChange={handleLiquidityChange}
                        placeholder={`2`}
                        className={`
        w-full bg-[#2f2f35]/70 border ${
          error ? "border-red-500" : "border-gray-600/50"
        } rounded-lg p-3 text-gray-100 text-sm pr-16
        [appearance:textfield] 
        [&::-webkit-outer-spin-button]:appearance-none 
        [&::-webkit-inner-spin-button]:appearance-none
        focus:outline-none focus:border-green-400 transition-colors
      `}
                        required
                      />
                    </div>

                    {error && <p className="text-red-400 text-xs mt-1 flex items-center">{error}</p>}
                  </div>
                </div>

                {/* AI Analysis */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-2">AI Analysis</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">AI Probability:</span>
                        <span className="text-green-300 font-medium">
                          {((marketProposal?.ai_probability || selectedSuggestion?.ai_probability || 0) * 100).toFixed(
                            1,
                          )}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Confidence:</span>
                        <span className="text-emerald-300 font-medium">
                          {((marketProposal?.confidence || selectedSuggestion?.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Sentiment Score:</span>
                        <span className="text-green-300 font-medium">
                          {(
                            (marketProposal?.sentiment_score || selectedSuggestion?.sentiment_score || 0) * 100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  {(marketProposal?.key_factors || selectedSuggestion?.key_factors) && (
                    <div>
                      <h5 className="text-xs font-semibold text-green-400 mb-1">Key Factors</h5>
                      <ul className="text-xs text-gray-300 space-y-1">
                        {(marketProposal?.key_factors || selectedSuggestion?.key_factors || []).map(
                          (factor: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span className="text-green-400">•</span>
                              {factor}
                            </li>
                          ),
                        )}
                      </ul>

                      <div>
                        <h5 className="text-xs mt-4 font-semibold text-green-400 mb-1">Context</h5>
                        <div className="text-xs text-gray-400 italic">{marketProposal.context}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Resolution Criteria */}
              <div className="mt-4 pt-4 border-t border-gray-600/30">
                <h4 className="text-sm font-semibold text-green-400 mb-1">Resolution Criteria</h4>
                <textarea
                  defaultValue={marketProposal?.resolution_criteria || selectedSuggestion?.resolution_criteria || ""}
                  onChange={(e) => {
                    setMarketProposal((prev: any) => ({
                      ...prev,
                      resolution_criteria: e.target.value,
                    }));
                  }}
                  className="w-full bg-[#2f2f35]/70 border border-gray-600/50 rounded-lg p-3 text-gray-100 text-sm resize-none focus:border-green-400 focus:outline-none transition-colors"
                  rows={3}
                  placeholder="Describe exactly how this market will be resolved. Be specific and include links to the sources that will determine the outcome."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6 flex-wrap">
                <button
                  onClick={onStakeClick}
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Create Market & Bet
                </button>
                <button
                  onClick={() => {
                    setEditingMarket(false);
                    setSelectedSuggestion(null);
                    setMarketProposal(null);
                    setCreatingCustomMarket(false);

                    // If it was a custom market, go back to welcome state
                    if (creatingCustomMarket) {
                      setMessages([]);
                      setCurrentStep(0);
                      setProgress("");
                    } else {
                      // Otherwise, show suggestions again
                      setShowSuggestions(true);
                    }
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-[#2a2a30] to-[#2f2f35] hover:from-[#2f2f35] hover:to-[#323238] text-white rounded-xl font-medium transition-all duration-200 flex items-center gap-2"
                >
                  {creatingCustomMarket ? "Cancel" : "Cancel"}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Input Area */}
        <motion.div
          className="sticky bottom-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          {/* Suggested Reply Button */}
          {suggestedReply && !showSuggestions && !editingMarket && (
            <motion.div
              className="mb-3 flex justify-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <button
                onClick={handleSuggestedReply}
                className="group px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 backdrop-blur-sm border border-cyan-500/30 rounded-xl text-cyan-300 text-sm hover:from-cyan-600/30 hover:to-blue-600/30 hover:border-cyan-400/50 transition-all duration-200 flex items-center gap-2"
              >
                <span className="text-xs opacity-70">💡 Suggested:</span>
                <span className="font-medium">"{suggestedReply}"</span>
              </button>
            </motion.div>
          )}

          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/60 rounded-2xl shadow-lg shadow-gray-900/20 p-2 pt-0">
            <div className="flex items-end gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-gray-600 to-slate-600 flex items-center justify-center flex-shrink-0">
                <Circle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-h-[40px] max-h-32">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    showSuggestions
                      ? "Search suggestions..."
                      : editingMarket
                        ? "Edit market proposal..."
                        : "Ask a question..."
                  }
                  className="w-full resize-none border-none outline-none bg-transparent text-gray-100 placeholder-gray-400 pt-3 px-2 text-base leading-relaxed"
                  style={{ minHeight: "40px" }}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 128) + "px";
                  }}
                  disabled={showSuggestions || editingMarket}
                />
              </div>
              {!showSuggestions && !editingMarket && (
                <motion.button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 flex items-center justify-center transition-all duration-200 flex-shrink-0"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Send className="w-4 h-4 text-white" />
                </motion.button>
              )}
            </div>
          </div>
          {!showSuggestions && !editingMarket && (
            <p className="text-xs text-gray-500 text-center mt-3">Press Enter to send, Shift + Enter for new line</p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default CreateMarket;
