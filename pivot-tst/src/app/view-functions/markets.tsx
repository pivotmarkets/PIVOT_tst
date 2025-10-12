import { MODULE_ADDRESS } from "@/constants";
import { aptosClient } from "@/utils/aptosClient";

// TradeRecord structure for price history and trade history
export interface TradeRecord {
  tradeId: string;
  user: string;
  tradeType: number; // 1=BUY, 2=SELL, 3=ADD_LIQ, 4=REMOVE_LIQ, 5=CLAIM, 6=RESOLVE
  outcome: number | null; // 1=YES, 2=NO, null for liquidity ops
  amount: string;
  shares: string | null;
  price: string;
  yesPriceBefore: string;
  noPriceBefore: string;
  yesPriceAfter: string;
  noPriceAfter: string;
  timestamp: string;
  gasUsed: string | null;
}

// Market analytics summary
export interface MarketAnalytics {
  totalVolume: string;
  totalTrades: string;
  yesVolume: string;
  noVolume: string;
  liquidityVolume: string;
  uniqueTraderCount: string;
}
// Type definitions for return values
export interface UserPosition {
  user: string;
  outcome: number; // 1 for Yes, 2 for No
  shares: string;
  avgPrice: string;
  timestamp: string;
}

export interface MarketDetails {
  id: string;
  title: string; // Added
  description: string;
  resolutionCriteria: string; // Added
  endTime: string;
  yesPoolValue: string;
  noPoolValue: string;
  totalLiquidity: string;
  resolved: boolean;
  outcome: number | null;
  oracle: string;
  creator: string;
  totalYesShares: string;
  totalNoShares: string;
  participantCount: string;
  yesPrice: string;
  noPrice: string;
  creationTime: string;
  totalValueLocked: string;
}

export interface MarketSummary {
  id: string;
  title: string;
  description: string;
  endTime: string;
  resolved: boolean;
  yesPrice: string;
  noPrice: string;
  totalValueLocked: string;
  participantCount: string;
  totalVolume: string;
  timeLeft: string;
  category: string;
  status: string;
}

export interface Position {
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

interface PlatformStats {
  totalMarkets: number;
  totalTvl: number;
  activeMarkets: number;
}

/**
 * Get positions of a user in a market
 */
export const getUserPositions = async (marketId: number, userAddress: string): Promise<number[]> => {
  try {
    const response = await aptosClient().view<string[][]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_user_positions`,
        functionArguments: [marketId.toString(), userAddress],
      },
    });

    // Flatten [["0", "2"]] → ["0","2"] → [0,2]
    return response.flat().map((id) => Number(id));
  } catch (error: any) {
    console.error("Error getting user positions:", error);
    return [];
  }
};

export const getUserPositionDetails = async (marketId: number, userAddress: string): Promise<Position[]> => {
  try {
    const positionIds = await getUserPositions(marketId, userAddress);
    console.log(" efff Position IDs:", positionIds); // should now log: [0, 2]

    if (positionIds.length === 0) return [];

    const results = await Promise.allSettled(
      positionIds.map((positionId) =>
        aptosClient().view<[string, string, string, string, string]>({
          payload: {
            function: `${MODULE_ADDRESS}::y::get_position`,
            functionArguments: [marketId.toString(), positionId.toString()],
          },
        }),
      ),
    );

    const positions: Position[] = results
      .filter(
        (res): res is PromiseFulfilledResult<[string, string, string, string, string]> => res.status === "fulfilled",
      )
      .map((res, i) => {
        const [user, outcome, shares, avgPrice, timestamp] = res.value;
        return {
          id: positionIds[i], // keep the ID too
          user,
          outcome: Number(outcome),
          shares: Number(shares),
          avgPrice: Number(avgPrice),
          timestamp: Number(timestamp),
        };
      });

    return positions;
  } catch (error: any) {
    console.error("Error getting user position details:", error);
    return [];
  }
};

export const getMarketTotalValueLocked = async (marketId: number): Promise<number> => {
  try {
    if (!Number.isInteger(marketId) || marketId < 0) {
      console.error("Invalid marketId:", marketId);
      return 0;
    }

    const response = await aptosClient().view<string[]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_total_value_locked`,
        functionArguments: [marketId.toString()],
      },
    });
    console.log("Raw response from get_market_total_value_locked:", response);

    return Number(response[0]);
  } catch (error: any) {
    console.error("Error getting market TVL:", error);
    return 0;
  }
};

export const getMarketPoolBalances = async (marketId: number): Promise<MarketPoolBalances> => {
  try {
    const response = await aptosClient().view<string[]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_pool_balances`,
        functionArguments: [marketId.toString()],
      },
    });
    console.log("Raw response from get_market_pool_balances:", response);

    const [yesPoolBalance, noPoolBalance, liquidityPoolBalance, totalValueLocked] = response;
    return {
      yesPoolBalance: Number(yesPoolBalance),
      noPoolBalance: Number(noPoolBalance),
      liquidityPoolBalance: Number(liquidityPoolBalance),
      totalValueLocked: Number(totalValueLocked),
    };
  } catch (error: any) {
    console.error("Error getting market pool balances:", error);
    return { yesPoolBalance: 0, noPoolBalance: 0, liquidityPoolBalance: 0, totalValueLocked: 0 };
  }
};

export const getAllMarketsWithTvl = async (): Promise<{ marketIds: number[]; tvlValues: number[] }> => {
  try {
    const response = await aptosClient().view<[string[], string[]]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_all_markets_with_tvl`,
        functionArguments: [],
      },
    });
    console.log("Raw response from get_all_markets_with_tvl:", response);

    const [marketIds, tvlValues] = response;
    return {
      marketIds: marketIds.map((id) => Number(id)).filter((id) => !isNaN(id)),
      tvlValues: tvlValues.map((tvl) => Number(tvl)).filter((tvl) => !isNaN(tvl)),
    };
  } catch (error: any) {
    console.error("Error getting all markets with TVL:", error);
    return { marketIds: [], tvlValues: [] };
  }
};

export const getPlatformStats = async (): Promise<PlatformStats> => {
  try {
    const response = await aptosClient().view<string[]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_platform_stats`,
        functionArguments: [],
      },
    });
    console.log("Raw response from get_platform_stats:", response);

    const [totalMarkets, totalTvl, activeMarkets] = response;
    return {
      totalMarkets: Number(totalMarkets),
      totalTvl: Number(totalTvl),
      activeMarkets: Number(activeMarkets),
    };
  } catch (error: any) {
    console.error("Error getting platform stats:", error);
    return { totalMarkets: 0, totalTvl: 0, activeMarkets: 0 };
  }
};

/**
 * Get detailed information about a specific market (updated with title and resolution criteria)
 */
export const getMarketDetails = async (marketId: number): Promise<MarketDetails | null> => {
  try {
    const response = await aptosClient().view<
      [
        string, // id
        string, // title
        string, // description
        string, // resolution_criteria
        string, // end_time
        string, // yes_pool_value
        string, // no_pool_value
        string, // total_liquidity
        boolean, // resolved
        number | null, // outcome
        string, // oracle
        string, // creator
        string, // total_yes_shares
        string, // total_no_shares
        string, // participant_count
        string, // yes_price
        string, // no_price
        string, // creation_time
        string, // total_value_locked
      ]
    >({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_details`,
        functionArguments: [marketId.toString()],
      },
    });

    return {
      id: response[0],
      title: response[1], // Added
      description: response[2],
      resolutionCriteria: response[3], // Added
      endTime: response[4],
      yesPoolValue: response[5],
      noPoolValue: response[6],
      totalLiquidity: response[7],
      resolved: response[8],
      outcome: response[9],
      oracle: response[10],
      creator: response[11],
      totalYesShares: response[12],
      totalNoShares: response[13],
      participantCount: response[14],
      yesPrice: response[15],
      noPrice: response[16],
      creationTime: response[17],
      totalValueLocked: response[18],
    };
  } catch (error: any) {
    console.error("Error getting market details:", error);
    return null;
  }
};

/**
 * Get all market IDs that exist
 */
export const getAllMarketIds = async (): Promise<string[]> => {
  try {
    const response = await aptosClient().view<[string[]]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_all_market_ids`,
        functionArguments: [],
      },
    });

    return response[0];
  } catch (error: any) {
    console.error("Error getting all market IDs:", error);
    return [];
  }
};

/**
 * Get markets in a paginated way
 */
export const getMarketsPaginated = async (
  offset: number,
  limit: number,
  coinType: string = "0x1::aptos_coin::AptosCoin",
): Promise<string[]> => {
  try {
    const response = await aptosClient().view<[string[]]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_markets_paginated`,
        typeArguments: [coinType],
        functionArguments: [offset.toString(), limit.toString()],
      },
    });

    return response[0];
  } catch (error: any) {
    console.error("Error getting paginated markets:", error);
    return [];
  }
};

/**
 * Get basic market info for listing (lighter version)
 */
export const getMarketSummary = async (marketId: number): Promise<MarketSummary | null> => {
  try {
    const response = await aptosClient().view<
      [
        string, // id
        string, // title
        string, // description
        string, // end_time
        boolean, // resolved
        string, // yes_price
        string, // no_price
        string, // total_value_locked
        string, // participant_count
        string, // total_volume
      ]
    >({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_summary`,
        functionArguments: [marketId.toString()],
      },
    });

    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
    const endTime = Number(response[3]);
    const timeLeft = response[4] || currentTime >= endTime ? "0" : (endTime - currentTime).toString();

    return {
      id: response[0],
      title: response[1],
      description: response[2],
      endTime: response[3],
      resolved: response[4],
      yesPrice: response[5],
      noPrice: response[6],
      totalValueLocked: response[7],
      participantCount: response[8],
      totalVolume: response[9],
      timeLeft,
      category: "General", // Placeholder, set based on your app's logic
      status: response[4] ? "Resolved" : currentTime < endTime ? "Active" : "Ended",
    };
  } catch (error: any) {
    console.error("Error getting market summary:", error);
    return null;
  }
};

/**
 * Get all markets with their summaries - efficient for listing
 */
export const getAllMarketSummaries = async (): Promise<MarketSummary[]> => {
  try {
    const marketIds = await getAllMarketIds();

    const summaryPromises = marketIds.map((id) => getMarketSummary(parseInt(id)));

    const summaries = await Promise.all(summaryPromises);

    return summaries.filter((summary) => summary !== null) as MarketSummary[];
  } catch (error: any) {
    console.error("Error getting all market summaries:", error);
    return [];
  }
};

/**
 * Get paginated market summaries
 */
export const getMarketSummariesPaginated = async (
  offset: number,
  limit: number,
  coinType: string = "0x1::aptos_coin::AptosCoin",
): Promise<MarketSummary[]> => {
  try {
    // Get paginated market IDs
    const marketIds = await getMarketsPaginated(offset, limit, coinType);

    // Then get summary for each market
    const summaryPromises = marketIds.map((id) => getMarketSummary(parseInt(id)));

    const summaries = await Promise.all(summaryPromises);

    // Filter out any null results
    return summaries.filter((summary) => summary !== null) as MarketSummary[];
  } catch (error: any) {
    console.error("Error getting paginated market summaries:", error);
    return [];
  }
};

/**
 * Get details of a specific position
 */
export const getPositionDetails = async (
  marketId: number,
  positionId: number,
  coinType: string = "0x1::aptos_coin::AptosCoin",
): Promise<UserPosition | null> => {
  try {
    const response = await aptosClient().view<
      [
        string, // user
        number, // outcome
        string, // shares
        string, // avg_price
        string, // timestamp
      ]
    >({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_user_positions`,
        typeArguments: [coinType],
        functionArguments: [marketId.toString(), positionId.toString()],
      },
    });

    return {
      user: response[0],
      outcome: response[1],
      shares: response[2],
      avgPrice: response[3],
      timestamp: response[4],
    };
  } catch (error: any) {
    console.error("Error getting position details:", error);
    return null;
  }
};

/**
 * Get market creation parameters
 */
export const getMarketCreationParams = async (
  coinType: string = "0x1::aptos_coin::AptosCoin",
): Promise<{
  creationFee: string;
  minInitialLiquidity: string;
  minMarketDuration: string;
} | null> => {
  try {
    const response = await aptosClient().view<[string, string, string]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_creation_params`,
        typeArguments: [coinType],
        functionArguments: [],
      },
    });

    return {
      creationFee: response[0],
      minInitialLiquidity: response[1],
      minMarketDuration: response[2],
    };
  } catch (error: any) {
    console.error("Error getting market creation params:", error);
    return null;
  }
};

/**
 * Get market count
 */
export const getMarketCount = async (coinType: string = "0x1::aptos_coin::AptosCoin"): Promise<number> => {
  try {
    const response = await aptosClient().view<[string]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_count`,
        typeArguments: [coinType],
        functionArguments: [],
      },
    });

    return parseInt(response[0]);
  } catch (error: any) {
    console.error("Error getting market count:", error);
    return 0;
  }
};

/**
 * Get all positions for a user with their details
 */
export const getUserPositionsWithDetails = async (
  marketId: number,
  userAddress: string,
  coinType: string = "2",
): Promise<UserPosition[]> => {
  try {
    // First get the position IDs
    const positionIds = await getUserPositions(marketId, userAddress);

    // Then get details for each position
    const positionPromises = positionIds.map((id) => getPositionDetails(marketId, parseInt(id as any), coinType));

    const positions = await Promise.all(positionPromises);

    // Filter out any null results
    return positions.filter((position) => position !== null) as UserPosition[];
  } catch (error: any) {
    console.error("Error getting user positions with details:", error);
    return [];
  }
};

/**
 * Get market analytics (total volume, trades, etc.)
 */
export const getMarketAnalytics = async (marketId: number): Promise<MarketAnalytics | null> => {
  try {
    const response = await aptosClient().view<string[]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_market_analytics`,
        functionArguments: [marketId.toString()],
      },
    });
    console.log("Raw response from get_market_analytics:", response);

    const [totalVolume, totalTrades, yesVolume, noVolume, liquidityVolume, uniqueTraderCount] = response;
    return {
      totalVolume,
      totalTrades,
      yesVolume,
      noVolume,
      liquidityVolume,
      uniqueTraderCount,
    };
  } catch (error: any) {
    console.error("Error getting market analytics:", error);
    return null;
  }
};

/**
 * Get daily trading volume for a specific market and day
 * @param marketId The market ID
 * @param dayTimestamp Timestamp (in seconds) of the day (midnight UTC)
 */
export const getDailyVolume = async (marketId: number, dayTimestamp: number): Promise<string> => {
  try {
    const response = await aptosClient().view<[string]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_daily_volume`,
        functionArguments: [marketId.toString(), dayTimestamp.toString()],
      },
    });
    console.log("Raw response from get_daily_volume:", response);

    return response[0];
  } catch (error: any) {
    console.error("Error getting daily volume:", error);
    return "0";
  }
};

/**
 * Get hourly trading volume for a specific market and hour
 * @param marketId The market ID
 * @param hourTimestamp Timestamp (in seconds) of the hour
 */
export const getHourlyVolume = async (marketId: number, hourTimestamp: number): Promise<string> => {
  try {
    const response = await aptosClient().view<[string]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_hourly_volume`,
        functionArguments: [marketId.toString(), hourTimestamp.toString()],
      },
    });
    console.log("Raw response from get_hourly_volume:", response);

    return response[0];
  } catch (error: any) {
    console.error("Error getting hourly volume:", error);
    return "0";
  }
};

/**
 * Get volume and trade count for a specific time range
 * @param marketId The market ID
 * @param startTime Start timestamp (in seconds)
 * @param endTime End timestamp (in seconds)
 */
export const getVolumeByTimeRange = async (
  marketId: number,
  startTime: number,
  endTime: number,
): Promise<{ volume: string; tradeCount: string } | null> => {
  try {
    const response = await aptosClient().view<string[]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_volume_by_time_range`,
        functionArguments: [marketId.toString(), startTime.toString(), endTime.toString()],
      },
    });
    console.log("Raw response from get_volume_by_time_range:", response);

    const [volume, tradeCount] = response;
    return { volume, tradeCount };
  } catch (error: any) {
    console.error("Error getting volume by time range:", error);
    return null;
  }
};

/**
 * Get latest trades for a market (for real-time feed)
 * @param marketId The market ID
 * @param limit Maximum number of trades to return
 */
export const getLatestTrades = async (marketId: number, limit: number): Promise<TradeRecord[]> => {
  try {
    const response = await aptosClient().view<any>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_latest_trades`,
        functionArguments: [marketId.toString(), limit.toString()],
      },
    });

    console.log("Raw response from get_latest_trades:", response);

    // Handle the nested array structure - extract the first (and likely only) inner array
    const tradesArray = Array.isArray(response) && response.length > 0 ? response[0] : [];

    if (!Array.isArray(tradesArray)) {
      console.error("Expected trades array, got:", tradesArray);
      return [];
    }

    return tradesArray.map((trade: any) => ({
      tradeId: trade.trade_id || generateTradeId(),
      user: trade.user || "unknown",
      tradeType: trade.trade_type ? Number(trade.trade_type) : 1,
      outcome: trade.outcome ? Number(trade.outcome) : null,
      amount: trade.amount || "0",
      shares: trade.shares || null,
      price: trade.price || "0",
      yesPriceBefore: trade.yes_price_before || "0",
      noPriceBefore: trade.no_price_before || "0",
      yesPriceAfter: trade.yes_price_after || "0",
      noPriceAfter: trade.no_price_after || "0",
      timestamp: trade.timestamp || Math.floor(Date.now() / 1000).toString(),
      gasUsed: trade.gas_used || null,
    }));
  } catch (error: any) {
    console.error("Error getting latest trades:", error);
    return [];
  }
};

// Helper function to generate a trade ID if missing
const generateTradeId = () => {
  return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get trade history for a specific user in a market
 * @param marketId The market ID
 * @param userAddress The user's address
 * @param limit Maximum number of trades to return
 */
export const getUserTradeHistory = async (
  marketId: number,
  userAddress: string,
  limit: number,
): Promise<TradeRecord[]> => {
  try {
    const response = await aptosClient().view<TradeRecord[]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_user_trade_history`,
        functionArguments: [marketId.toString(), userAddress, limit.toString()],
      },
    });
    console.log("Raw response from get_user_trade_history:", response);

    return response.map((trade: any) => ({
      tradeId: trade.trade_id,
      user: trade.user,
      tradeType: Number(trade.trade_type),
      outcome: trade.outcome ? Number(trade.outcome) : null,
      amount: trade.amount,
      shares: trade.shares || null,
      price: trade.price,
      yesPriceBefore: trade.yes_price_before,
      noPriceBefore: trade.no_price_before,
      yesPriceAfter: trade.yes_price_after,
      noPriceAfter: trade.no_price_after,
      timestamp: trade.timestamp,
      gasUsed: trade.gas_used || null,
    }));
  } catch (error: any) {
    console.error("Error getting user trade history:", error);
    return [];
  }
};

/**
 * Get price of an outcome at a specific timestamp
 * @param marketId The market ID
 * @param outcome The outcome (1 for YES, 2 for NO)
 * @param timestamp The target timestamp (in seconds)
 */
export const getPriceAtTimestamp = async (marketId: number, outcome: number, timestamp: number): Promise<string> => {
  try {
    const response = await aptosClient().view<[string]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_price_at_timestamp`,
        functionArguments: [marketId.toString(), outcome.toString(), timestamp.toString()],
      },
    });
    console.log("Raw response from get_price_at_timestamp:", response);

    return response[0];
  } catch (error: any) {
    console.error("Error getting price at timestamp:", error);
    return "0";
  }
};

/**
 * Get volume-weighted average price (VWAP) for an outcome over a time period
 * @param marketId The market ID
 * @param outcome The outcome (1 for YES, 2 for NO)
 * @param timePeriod Time period in seconds (e.g., 86400 for 24 hours)
 */
export const getVolumeWeightedAveragePrice = async (
  marketId: number,
  outcome: number,
  timePeriod: number,
): Promise<string> => {
  try {
    const response = await aptosClient().view<[string]>({
      payload: {
        function: `${MODULE_ADDRESS}::y::get_volume_weighted_average_price`,
        functionArguments: [marketId.toString(), outcome.toString(), timePeriod.toString()],
      },
    });
    console.log("Raw response from get_volume_weighted_average_price:", response);

    return response[0];
  } catch (error: any) {
    console.error("Error getting VWAP:", error);
    return "0";
  }
};

/**
 * Convert price from contract format to human readable percentage
 */
export const formatPrice = (price: string): number => {
  return parseInt(price) / 100; // Convert from basis points to percentage
};

/**
 * Convert shares from contract format to human readable
 */
export const formatShares = (shares: string, decimals: number = 8): number => {
  return parseInt(shares) / Math.pow(10, decimals);
};

/**
 * Convert timestamp to Date
 */
export const formatTimestamp = (timestamp: string): Date => {
  return new Date(parseInt(timestamp) * 1000);
};
