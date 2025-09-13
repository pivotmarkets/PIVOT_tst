import { MODULE_ADDRESS } from "@/constants";
import { InputTransactionData } from "@aptos-labs/wallet-adapter-react";

export type CreateMarketArguments = {
  title: string;
  description: string;
  resolution_criteria: string;
  endTime: number;
  oracle: string;
  initialLiquidity: number;
  coinType: string;
};

/**
 * Create a new market in the pivot_market_tab contract
 */
export const createMarket = (args: CreateMarketArguments): InputTransactionData => {
  const { title, description, resolution_criteria, endTime, oracle, initialLiquidity, coinType } = args;

  return {
    data: {
      function: `${MODULE_ADDRESS}::pivot_market_tab::create_market`,
      functionArguments: [title, description, resolution_criteria, endTime, oracle, initialLiquidity],
    },
  };
};
