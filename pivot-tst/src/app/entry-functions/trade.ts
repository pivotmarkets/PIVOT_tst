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

/**
 * Buy a position in a market
 */
export const buyPosition = (args: BuyPositionArguments): InputTransactionData => {
  const { marketId, outcome, amount, maxSlippage } = args;

  return {
    data: {
      function: `${MODULE_ADDRESS}::pivot_market_pool::buy_position`,
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
      function: `${MODULE_ADDRESS}::pivot_market_pool::sell_position`,
      functionArguments: [marketId, positionId, sharesToSell, minPrice],
    },
  };
};
