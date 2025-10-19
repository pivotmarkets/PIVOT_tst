"use client";

import React, { useEffect, useState } from "react";
import { Trophy, Medal, Award, CircleUser, User, CheckCircle2, Twitter } from "lucide-react";
import { useWalletAuth } from "@/app/hooks/useWalletAuth";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import Link from "next/link";
import MobileBottomNav from "./MobileBottomNav";
import { WalletSelector } from "../WalletSelector";
import { toast } from "sonner";

const MobileLeaderboardPage = ({ leaderboard }: any) => {
  const [activeTab, setActiveTab] = useState("daily");
  const { account } = useWallet();
  const address = account?.address.toStringLong();
  const [completedTasks, setCompletedTasks] = useState({
    twitter: false,
    telegram: false,
  });
  const { getLeaderboard } = useWalletAuth();
  const { awardPoints } = useWalletAuth();
  const [leaderboardData, setLeaderboardData] = useState<any>({
    daily: [],
    weekly: [],
    allTime: [],
  });
  const { user } = useWalletAuth();
  // Pixelated Coin SVG Icon
  const PixelCoins = (props: any) => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...props} className={"w-4 h-4 " + props.className}>
      <rect x="5" y="1" width="6" height="6" fill="#FFD700" />
      <rect x="5" y="2" width="6" height="6" fill="#DAA520" />
      <rect x="5" y="3" width="6" height="6" fill="#B8860B" />
      <rect x="3" y="5" width="6" height="6" fill="#FFD700" />
      <rect x="3" y="6" width="6" height="6" fill="#DAA520" />
      <rect x="3" y="7" width="6" height="6" fill="#B8860B" />
      <rect x="7" y="5" width="6" height="6" fill="#FFD700" />
      <rect x="7" y="6" width="6" height="6" fill="#DAA520" />
      <rect x="7" y="7" width="6" height="6" fill="#B8860B" />
      <rect x="5" y="9" width="6" height="6" fill="#FFD700" />
      <rect x="5" y="10" width="6" height="6" fill="#DAA520" />
      <rect x="5" y="11" width="6" height="6" fill="#B8860B" />
      <path fill="none" stroke="#8B4513" strokeWidth="1" d="M5 1h6v6h-6zM3 5h6v6h-6zM7 5h6v6h-6zM5 9h6v6h-6z" />
    </svg>
  );

  useEffect(() => {
    const fetchAndFormatLeaderboard = async () => {
      try {
        const rawLeaderboard = await getLeaderboard(50);
        if (!rawLeaderboard || rawLeaderboard.length === 0) return;

        const sortedLeaderboard = [...rawLeaderboard].sort(
          (a, b) => (b.total_profit_loss ?? 0) - (a.total_profit_loss ?? 0),
        );

        const addRanksAndCurrentUser = (data: any[]) =>
          data.map(
            (
              entry: {
                id: any;
                username: any;
                total_profit_loss: any;
                points: any;
                updated_at: any;
                games_played: any;
                wallet_address: string;
              },
              index: number,
            ) => ({
              id: entry.id,
              name: entry.username || "Player",
              total_profit_loss: entry.total_profit_loss ?? 0,
              rank: index + 1,
              points: entry.points,
              updated_at: entry.updated_at,
              games_played: entry.games_played,
              isCurrentUser: entry.wallet_address?.toLowerCase() === address?.toLowerCase(),
            }),
          );

        const structuredData: any = {
          daily: addRanksAndCurrentUser(sortedLeaderboard),
          weekly: addRanksAndCurrentUser(sortedLeaderboard),
          allTime: addRanksAndCurrentUser(sortedLeaderboard),
        };

        setLeaderboardData(structuredData);
      } catch (error) {
        console.error("Failed to fetch leaderboard:", error);
      }
    };

    fetchAndFormatLeaderboard();
  }, []);

  useEffect(() => {
    if (!leaderboard || leaderboard.length === 0) return;

    const addRanksAndCurrentUser = (data: any[]) => {
      return data.map(
        (
          entry: {
            id: any;
            username: any;
            total_profit_loss: any;
            points: any;
            updated_at: any;
            games_played: any;
            wallet_address: string;
          },
          index: number,
        ) => ({
          id: entry.id,
          name: entry.username || "Player",
          total_profit_loss: entry.total_profit_loss ?? 0,
          rank: index + 1,
          points: entry.points,
          updated_at: entry.updated_at,
          games_played: entry.games_played,
          isCurrentUser: entry.wallet_address.toLowerCase() === address?.toLowerCase(),
        }),
      );
    };

    const sortedLeaderboard = [...leaderboard].sort((a, b) => (b.total_profit_loss ?? 0) - (a.total_profit_loss ?? 0));

    const structuredData: any = {
      daily: addRanksAndCurrentUser(sortedLeaderboard),
      weekly: addRanksAndCurrentUser(sortedLeaderboard),
      allTime: addRanksAndCurrentUser(sortedLeaderboard),
    };

    setLeaderboardData(structuredData);
  }, [leaderboard, address]);

  const getRankIcon = (rank: any) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-400" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return (
          <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-gray-400">#{rank}</span>
        );
    }
  };

  const getLevel = (gamesPlayed: number) => {
    let level = 1;
    let totalGamesNeeded = 0;

    for (let i = 1; i <= 10; i++) {
      const gamesForThisLevel = i * 10;
      totalGamesNeeded += gamesForThisLevel;

      if (gamesPlayed >= totalGamesNeeded) {
        level = i + 1;
      } else {
        break;
      }
    }

    level = Math.min(level, 10);

    const gameRanks = [
      {
        level: 1,
        title: "Copper",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-500" />
          </div>
        ),
      },
      {
        level: 2,
        title: "Bronze",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600" />
          </div>
        ),
      },
      {
        level: 3,
        title: "Silver",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-gray-700/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-300" />
          </div>
        ),
      },
      {
        level: 4,
        title: "Gold",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400" />
          </div>
        ),
      },
      {
        level: 5,
        title: "Platinum",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-slate-700/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-200" />
          </div>
        ),
      },
      {
        level: 6,
        title: "Emerald",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
          </div>
        ),
      },
      {
        level: 7,
        title: "Ruby",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-400" />
          </div>
        ),
      },
      {
        level: 8,
        title: "Sapphire",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
          </div>
        ),
      },
      {
        level: 9,
        title: "Diamond",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-cyan-900/30 flex items-center justify-center flex-shrink-0 relative">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-300" />
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-blue-400/20 rounded"></div>
          </div>
        ),
      },
      {
        level: 10,
        title: "Obsidian",
        badge: (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-black/50 flex items-center justify-center flex-shrink-0 relative border border-purple-700/30">
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400" />
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-black/40 rounded"></div>
          </div>
        ),
      },
    ];

    const rankIndex = Math.min(level - 1, gameRanks.length - 1);
    return gameRanks[rankIndex];
  };

  const currentData = leaderboardData[activeTab];

  const currentUser = leaderboard?.find(
    (player: { wallet_address: string }) => player.wallet_address?.toLowerCase() === address?.toLowerCase(),
  );

  const currentUserData = currentData.find((player: { isCurrentUser: boolean }) => player.isCurrentUser === true);

  const currentLevel = getLevel(currentUserData?.games_played);

  const handleTaskComplete = (task: "twitter" | "telegram") => {
    // Open the respective link
    if (task === "twitter") {
      window.open("https://x.com/intent/follow?screen_name=pivotmarketsHQ", "_blank");
    } else {
      window.open("https://t.me/pivotmarkets", "_blank");
    }

    // Mark task as completed (in production, verify this on backend)
    setCompletedTasks((prev: any) => ({ ...prev, [task]: true }));

    // Award points asynchronously
    const taskPoints = task === "twitter" ? 100 : 100; // Adjust points when needed
    awardPoints({
      points: taskPoints,
      action_type: `social_task_${task}`,
      description: `User earned ${taskPoints} pts for completing ${task} task`,
    }).catch((error) => {
      console.error(`Failed to award points for ${task} task (non-critical):`, error);
    });

    // Optional: Show success toast
    toast.success(`You earned ${taskPoints} points for following on ${task === "twitter" ? "X" : "Telegram"}!`, {
      style: {
        backgroundColor: "#064e3b",
        color: "#6ee7b7",
        fontWeight: "bold",
        border: "1px solid #10b981",
      },
      duration: 4000,
    });
  };

  return (
    <div className="min-h-screen bg-[#232328] flex flex-col">
      {/* Header - Desktop & Mobile compatible */}
      <header className="bg-[#1a1a1e2c] sticky top-0 z-40 overflow-hidden border-b border-b-[#2c2c2f] px-3 sm:px-4 lg:px-4">
        <div className="max-w-7xl mx-auto py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-6">
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                <Link href="/">
                  <img src="/icons/p-lg.png" alt="Pivot Logo" className="ml-1 sm:ml-2 h-10 w-10 sm:h-12 sm:w-12" />
                </Link>
              </h1>
              <Link href="/" className="hidden lg:block group relative ml-6">
                <span className="text-gray-300 font-medium transition-colors relative inline-block pb-1">
                  Explore
                  <span className="absolute bottom-0 transition-all duration-300 left-1/2 transform -translate-x-1/2 w-0 group-hover:w-3/4 h-[2px] bg-[#008259]"></span>
                </span>
              </Link>
              {/* Leaderboard Link - Desktop Only - Active State */}
              <Link href="/leaderboard" className="hidden lg:block">
                <span className="text-gray-300 font-medium ml-6 transition-colors relative inline-block pb-1">
                  Leaderboard
                  <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-3/4 h-[2px] bg-[#008259]"></span>
                </span>
              </Link>
            </div>

            {/* Right Side Actions */}
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

      {/* Main Content */}
      <div className="flex-1 max-w-6xl px-4 sm:mx-auto w-full py-6 mb-16 pb-32 sm:pb-8 mx-auto">
        {/* Top Section - Title & User Info */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Leaderboard</h1>
            <p className="text-gray-400">Discover the top-ranked traders globally</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="w-full flex gap-2 text-white p-2 rounded-lg mb-8 bg-[#2f2f33] border border-gray-700/20">
          <div
            className={`flex-1 flex flex-col bg-[#232328]/50 p-3 sm:p-4 rounded-lg items-center justify-center space-y-2 border ${
              account?.address ? "border-gray-700/10" : "border-gray-700/5"
            }`}
          >
            <User width={20} height={20} className={account?.address ? "text-[#008259]" : "text-gray-700"} />
            <div className="text-center">
              <div className="text-[10px] sm:text-xs text-gray-400">
                {account?.address ? "You're Ranked" : "Your Rank"}
              </div>
              <div className={`text-lg sm:text-xl font-bold ${account?.address ? "text-[#008259]" : "text-gray-600"}`}>
                {account?.address ? `#${currentUserData?.rank || "-"}` : "---"}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-[#232328]/50 p-3 sm:p-4 rounded-lg items-center justify-center space-y-2 border border-gray-700/10">
            <PixelCoins className="text-green-200" />
            <div className="text-center">
              <div className="text-[10px] sm:text-xs text-gray-400">Coins</div>
              <div className="text-lg sm:text-xl font-bold text-[#008259]">{currentUser?.points ?? 0}</div>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-[#232328]/50 p-3 sm:p-4 rounded-lg items-center justify-center space-y-2 border border-gray-700/10">
            <div className="flex items-center justify-center">{currentLevel.badge}</div>
            <div className="text-center">
              <div className="text-[10px] sm:text-xs text-gray-400">{currentLevel.title}</div>
              <div className="text-lg sm:text-xl font-bold text-[#008259]">{currentLevel.level}</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#2f2f33] border border-gray-700/20 rounded-md px-1 py-1 mb-8 flex-shrink-0">
          <div className="flex space-x-1">
            {[
              { key: "daily", label: "Daily" },
              { key: "weekly", label: "Weekly" },
              { key: "allTime", label: "All Time" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-[#008259] text-white border border-[#008259]"
                    : "bg-[#232328] text-gray-400 border border-gray-700/20 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard List */}
        <div className="space-y-2">
          {currentData?.slice(0, 50).map((player: any) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-200 bg-[#2f2f33] ${
                player.isCurrentUser
                  ? "border-[#008259] bg-[#008259]/10 ring-2 ring-[#008259]/30"
                  : "border-gray-700/20 hover:border-gray-700/40"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-[#008259] font-bold min-w-fit flex items-center justify-center gap-2">
                  {getRankIcon(player.rank)}
                  <span>#{player.rank}</span>
                </div>
                <CircleUser className="w-8 h-8 text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div
                    className={`font-medium truncate text-sm ${player.isCurrentUser ? "text-[#008259]" : "text-white"}`}
                  >
                    {player.name}
                    {player.isCurrentUser && <span className="text-xs text-[#008259] ml-2">(You)</span>}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-400">
                    {player.total_profit_loss > 0 ? "+" : ""}{" "}
                    {player.total_profit_loss?.toLocaleString(undefined, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}{" "}
                    USDC
                  </div>
                </div>
              </div>
              <div className="text-right flex items-center gap-2 ml-2">
                <div className="text-sm text-gray-400">{player?.points ?? 0}</div>
                <PixelCoins className="text-green-200 flex-shrink-0" />
              </div>
            </div>
          ))}

          {(!currentData || currentData.length === 0) && (
            <div className="text-center py-12 bg-[#2f2f33] rounded-xl border border-gray-700/20">
              <div className="flex justify-center items-center gap-2">
                <div
                  className="w-2 h-2 bg-[#008259] rounded-full animate-bounce"
                  style={{ animationDelay: "0s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-[#008259] rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-[#008259] rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Current User Rank (if not in top 50) */}
        {currentUserData && currentUserData.rank > 50 && (
          <div className="mt-8 bg-[#2f2f33] border border-[#008259]/30 rounded-xl px-4 py-4 flex-shrink-0">
            <div className="text-center text-sm text-gray-400 mb-3">Your Rank</div>
            <div className="flex items-center justify-between p-4 rounded-lg border border-[#008259] bg-[#008259]/10">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-[#008259]" />
                <div>
                  <div className="font-medium text-[#008259]">#{currentUserData.rank}</div>
                  <div className="text-sm text-gray-400">
                    +{" "}
                    {currentUser?.total_profit_loss?.toLocaleString(undefined, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}{" "}
                    USDC
                  </div>
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <div className="text-sm text-gray-400">{currentUserData?.points ?? 0}</div>
                <PixelCoins className="text-green-200" />
              </div>
            </div>
          </div>
        )}

        {/* Earn More Points Section */}
        <div className="mb-3 mt-8 bg-[#2f2f33] border border-[#008259]/30 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <PixelCoins className="w-6 h-6 text-[#008259]" />
            <h2 className="text-xl font-bold text-white">Earn More Coins</h2>
          </div>
          <p className="text-gray-400 text-sm mb-6">Complete these tasks to boost your ranking</p>

          <div className="space-y-3">
            {/* Twitter Task */}
            <div
              className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                completedTasks.twitter
                  ? "bg-[#008259]/10 border-[#008259]/50"
                  : "bg-[#2f2f33] border-gray-700/20 hover:border-gray-700/40"
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-[#1DA1F2]/10 flex items-center justify-center">
                  <Twitter className="w-5 h-5 text-[#1DA1F2]" />
                </div>
                <div>
                  <div className="font-medium text-white text-sm">Follow us on Twitter</div>
                  <div className="text-xs text-gray-400">+50 coins</div>
                </div>
              </div>
              <button
                onClick={() => handleTaskComplete("twitter")}
                disabled={completedTasks.twitter}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  completedTasks.twitter
                    ? "bg-[#008259]/20 text-[#008259] cursor-not-allowed"
                    : "bg-[#008259] text-white hover:bg-[#016244]"
                }`}
              >
                {completedTasks.twitter ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Completed</span>
                  </>
                ) : (
                  <span>Follow</span>
                )}
              </button>
            </div>

            {/* Telegram Task */}
            {/* <div
              className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                completedTasks.telegram
                  ? "bg-[#008259]/10 border-[#008259]/50"
                  : "bg-[#2f2f33] border-gray-700/20 hover:border-gray-700/40"
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-[#0088cc]/10 flex items-center justify-center">
                  <Send className="w-5 h-5 text-[#0088cc]" />
                </div>
                <div>
                  <div className="font-medium text-white text-sm">Join our Telegram</div>
                  <div className="text-xs text-gray-400">Earn 100 points</div>
                </div>
              </div>
              <button
                onClick={() => handleTaskComplete("telegram")}
                disabled={completedTasks.telegram}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  completedTasks.telegram
                    ? "bg-[#008259]/20 text-[#008259] cursor-not-allowed"
                    : "bg-[#0088cc] text-white hover:bg-[#006699]"
                }`}
              >
                {completedTasks.telegram ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Completed</span>
                  </>
                ) : (
                  <span>Join</span>
                )}
              </button>
            </div> */}
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default MobileLeaderboardPage;
