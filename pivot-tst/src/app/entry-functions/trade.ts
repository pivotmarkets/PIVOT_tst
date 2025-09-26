import { MODULE_ADDRESS } from "@/constants";
import { InputTransactionData } from "@aptos-labs/wallet-adapter-react";

export type BuyPositionArguments = {
  marketId: number;
  outcome: number;
  amount: number;
  maxSlippage: number; // Maximum slippage in basis points (e.g., 100 = 1%)
};

interface SellPositionArguments {
  marketId: number;
  positionId: number;
  sharesToSell: number;
  minPrice: number;
}

interface ClaimWinningsArguments {
  marketId: any;
  positionId: any;
}

/**
 * Buy a position in a market
 */
export const buyPosition = (args: BuyPositionArguments): InputTransactionData => {
  const { marketId, outcome, amount, maxSlippage } = args;

  return {
    data: {
      function: `${MODULE_ADDRESS}::y::buy_position`,
      functionArguments: [marketId, outcome, amount, maxSlippage],
    },
  };
};

/**
 * sell a position in a market
 */
export const sellPosition = (args: SellPositionArguments): InputTransactionData => {
  const { marketId, positionId, sharesToSell, minPrice } = args;

  return {
    data: {
      function: `${MODULE_ADDRESS}::y::sell_position`,
      functionArguments: [marketId, positionId, sharesToSell, minPrice],
    },
  };
};

/**
 * claim winnings
 */
export const claimWinnings = (args: ClaimWinningsArguments): InputTransactionData => {
  const { marketId, positionId } = args;

  return {
    data: {
      function: `${MODULE_ADDRESS}::y::claim_winnings`,
      functionArguments: [marketId, positionId],
    },
  };
};
