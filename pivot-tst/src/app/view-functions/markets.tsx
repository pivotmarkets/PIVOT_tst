import { MODULE_ADDRESS, COIN_TYPE } from "@/constants";
import { aptosClient } from "@/utils/aptosClient";

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
  category: string;
  status: string;
  volume: any;
  participants: any;
  timeLeft: any;
  id: string;
  title: string;
  description: string;
  endTime: string;
  yesPrice: string; 
  noPrice: string;
  participantCount: string;
  totalValueLocked: string;
  resolved: boolean;
}

interface Position {
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
export const getUserPositions = async (
  marketId: number,
  userAddress: string
): Promise<number[]> => {
  try {
    const response = await aptosClient().view<string[][]>({
      payload: {
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_user_positions`,
        functionArguments: [marketId.toString(), userAddress],
      },
    });

    console.log("the response", response);

    // Flatten [["0", "2"]] → ["0","2"] → [0,2]
    return response.flat().map((id) => Number(id));
  } catch (error: any) {
    console.error("Error getting user positions:", error);
    return [];
  }
};


export const getUserPositionDetails = async (
  marketId: number,
  userAddress: string
): Promise<Position[]> => {
  try {
    const positionIds = await getUserPositions(marketId, userAddress);
    console.log(" efff Position IDs:", positionIds); // should now log: [0, 2]

    if (positionIds.length === 0) return [];

    const results = await Promise.allSettled(
      positionIds.map((positionId) =>
        aptosClient().view<[string, string, string, string, string]>({
          payload: {
            function: `${MODULE_ADDRESS}::pivot_market_tab::get_position`,
            functionArguments: [marketId.toString(), positionId.toString()],
          },
        })
      )
    );

    const positions: Position[] = results
      .filter(
        (res): res is PromiseFulfilledResult<[string, string, string, string, string]> =>
          res.status === "fulfilled"
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_market_total_value_locked`,
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_market_pool_balances`,
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_all_markets_with_tvl`,
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_platform_stats`,
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
export const getMarketDetails = async (
  marketId: number,
): Promise<MarketDetails | null> => {
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_market_details`,
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
export const getAllMarketIds = async (
  coinType: string = "0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832::usdc::USDC",
): Promise<string[]> => {
  try {
    const response = await aptosClient().view<[string[]]>({
      payload: {
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_all_market_ids`,
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_markets_paginated`,
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
export const getMarketSummary = async (marketId: number): Promise<any | null> => {
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
      ]
    >({
      payload: {
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_market_summary`,
        functionArguments: [marketId.toString()],
      },
    });

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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_user_positions`,
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_market_creation_params`,
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
        function: `${MODULE_ADDRESS}::pivot_market_tab::get_market_count`,
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
