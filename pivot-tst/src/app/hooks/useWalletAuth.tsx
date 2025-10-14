import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState, useEffect } from "react";

interface User {
  id: string;
  wallet_address: string;
  username: string;
  coins: number;
  gems: number;
  energy: number;
  level: number;
  experience: number;
  total_wins: number;
  total_losses: number;
  total_matches: number;
  win_streak: number;
  best_win_streak: number;
  is_active: boolean;
  is_premium: boolean;
  created_at: string;
  last_login: string;
  settings: any;
  points?: number;
  total_profit_loss?: number;
  games_played?: number;
  updated_at?: string;
}

interface GameHistoryItem {
  id: string;
  user_id: string;
  game_type: string;
  bet_amount: number;
  profit_loss: number;
  result: string;
  created_at: string;
  game_data?: any;
}

interface GameHistoryPagination {
  limit: number;
  offset: number;
  total_count: number | null;
  has_more: boolean;
}

interface GameHistorySummary {
  total_games: number;
  total_wins: number;
  total_losses: number;
  total_profit_loss: number;
  win_rate: number;
}

interface GameHistoryResponse {
  games: GameHistoryItem[];
  pagination: GameHistoryPagination;
  summary: GameHistorySummary;
}

interface GameHistoryParams {
  limit?: number;
  offset?: number;
  game_type?: string;
  sort_order?: "asc" | "desc";
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isNewUser: boolean;
  showUsernameModal: boolean;
  error: string | null;
}

export const useWalletAuth = () => {
  const { account } = useWallet();
  const address = account?.address.toStringLong() as `0x${string}` | undefined;
  const isConnected = address;
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: false,
    isNewUser: false,
    showUsernameModal: false,
    error: null,
  });

  // API Helper
  const makeApiRequest = async (endpoint: string, data: any) => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const functionUrl = `${baseUrl}/functions/v1/${endpoint}`;

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!result.success) throw new Error(result.error || "API request failed");
    return result;
  };

  // Check if user exists
  const checkUserExists = async (walletAddress: string) => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await makeApiRequest("check-user", {
        wallet_address: walletAddress,
      });

      if (result.user_exists) {
        setAuthState((prev) => ({
          ...prev,
          user: result.user,
          isLoading: false,
          isNewUser: false,
          showUsernameModal: false,
        }));
      } else {
        setAuthState((prev) => ({
          ...prev,
          user: null,
          isLoading: false,
          isNewUser: true,
          showUsernameModal: true,
        }));
      }
    } catch (error) {
      console.error("Error checking user:", error);
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to check user status",
      }));
    }
  };

  // Register new user
  const registerUser = async (username: string) => {
    if (!address) throw new Error("Wallet not connected");

    try {
      const result = await makeApiRequest("register-user", {
        wallet_address: address,
        username,
      });

      setAuthState((prev) => ({
        ...prev,
        user: result.user,
        isNewUser: false,
        showUsernameModal: false,
        error: null,
      }));
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  };

  // Update username
  const updateUsername = async (newUsername: string) => {
    if (!address) throw new Error("Wallet not connected");

    try {
      const result = await makeApiRequest("update-user", {
        wallet_address: address,
        new_username: newUsername,
        action: "update_username",
      });

      setAuthState((prev) => ({
        ...prev,
        user: result.user,
        error: null,
      }));

      return result.user;
    } catch (error) {
      console.error("Username update error:", error);
      throw error;
    }
  };

  // Submit game result
  const updateGameResult = async ({
    profit_loss,
    game_type,
    bet_amount,
  }: {
    profit_loss: number;
    game_type?: string;
    bet_amount?: number;
  }) => {
    if (!address) throw new Error("Wallet not connected");

    try {
      const result = await makeApiRequest("update-user", {
        action: "update_game_result",
        wallet_address: address,
        profit_loss,
        game_type,
        bet_amount,
      });

      setAuthState((prev) => ({
        ...prev,
        user: result.user,
        error: null,
      }));

      return result;
    } catch (error) {
      console.error("Game result update error:", error);
      throw error;
    }
  };

  // Get game history
  const getGameHistory = async (params?: GameHistoryParams): Promise<GameHistoryResponse> => {
    if (!address) throw new Error("Wallet not connected");

    try {
      const result = await makeApiRequest("game-history", {
        wallet_address: address,
        limit: params?.limit || 50,
        offset: params?.offset || 0,
        game_type: params?.game_type,
        sort_order: params?.sort_order || "desc",
      });

      return result.data;
    } catch (error) {
      console.error("Game history fetch error:", error);
      throw error;
    }
  };

  // Get leaderboard
  const getLeaderboard = async (limit: any) => {
    try {
      const result = await makeApiRequest("update-user", { action: "get_leaderboard", limit });

      return result.leaderboard;
    } catch (error) {
      console.error("Leaderboard fetch error:", error);
      throw error;
    }
  };

  // Award points
  const awardPoints = async ({
    points,
    action_type,
    description,
  }: {
    points: number;
    action_type: string;
    description?: string;
  }) => {
    if (!address) throw new Error("Wallet not connected");

    try {
      const result = await makeApiRequest("update-user", {
        wallet_address: address,
        action: "award_points",
        points,
        action_type,
        description,
      });

      setAuthState((prev) => ({
        ...prev,
        user: result.user,
        error: null,
      }));

      return result;
    } catch (error) {
      console.error("Award points error:", error);
      throw error;
    }
  };

  // Close modal
  const closeUsernameModal = () => {
    setAuthState((prev) => ({
      ...prev,
      showUsernameModal: false,
    }));
  };

  const updateUser = (partialUser: Partial<User>) => {
    setAuthState((prev) => ({
      ...prev,
      user: prev.user ? { ...prev.user, ...partialUser } : null,
    }));
  };

  // Logout
  const logout = () => {
    setAuthState({
      user: null,
      isLoading: false,
      isNewUser: false,
      showUsernameModal: false,
      error: null,
    });
  };

  // React to wallet changes
  useEffect(() => {
    if (isConnected && address) {
      console.log("connected address", address)
      checkUserExists(address);
    } else {
      logout();
    }
  }, [address, isConnected]);

  return {
    // State
    user: authState.user,
    isLoading: authState.isLoading,
    isNewUser: authState.isNewUser,
    showUsernameModal: authState.showUsernameModal,
    error: authState.error,
    isAuthenticated: !!authState.user,
    walletAddress: address,

    // Actions
    registerUser,
    updateUsername,
    updateGameResult,
    getGameHistory,
    getLeaderboard,
    awardPoints,
    updateUser,
    closeUsernameModal,
    setAuthState,
    logout,
    refreshUser: () => address && checkUserExists(address),
  };
};
