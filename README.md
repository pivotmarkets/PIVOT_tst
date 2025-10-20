# Pivot Market - Smart Contract

A decentralized prediction market platform built on the Aptos blockchain using the Move programming language. This smart contract enables users to create and trade on binary outcome markets (YES/NO) with automated market-making using a **Constant Product Market Maker (CPMM)** and transparent settlement.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Core Concepts](#core-concepts)
- [Installation](#installation)
- [Usage](#usage)
- [Contract Functions](#contract-functions)
- [Fee Structure](#fee-structure)
- [Analytics & Data](#analytics--data)

## Overview

This prediction market platform allows users to:
- Create markets on any future event with binary outcomes (YES/NO)
- Buy and sell positions (shares) on YES or NO outcomes
- Provide liquidity to earn fees
- Track comprehensive market analytics and history
- Claim winnings after market resolution

The contract uses a **Constant Product Market Maker (CPMM)** with the formula `x * y = k` for automated market making, ensuring continuous liquidity and price discovery.

## Features

### 🎯 Market Creation
- Create custom prediction markets with titles, descriptions, and resolution criteria
- Set market end times and designate oracles
- Require initial liquidity provision
- Customizable market parameters

### 💱 Trading
- Buy YES or NO positions using a fungible asset (e.g., USDC)
- Sell positions before market resolution
- Dynamic pricing based on CPMM algorithm
- Slippage protection (max 10% price impact)
- Real-time price updates

### 💧 Liquidity Provision
- Add liquidity to earn trading fees
- Remove liquidity before market resolution
- Receive LP tokens representing pool share
- Claim principal after market resolution

### 📊 Advanced Analytics
- Comprehensive trade history tracking
- Volume metrics (total, daily, hourly)
- Price history for charting
- OHLC (Open/High/Low/Close) candlestick data
- Unique trader statistics
- Volume Weighted Average Price (VWAP)

### ✅ Resolution & Settlement
- Oracle-based market resolution
- Automated payout distribution
- Platform and creator fee collection
- Transparent settlement process

### 🔐 Security Features
- Permission controls (admin/oracle/creator for resolution)
- Slippage protection
- Balance validation
- Market state checks
- Zero-amount and division-by-zero prevention

## Architecture

### Data Structures

#### `Market`
Core market structure containing:
- Market metadata (title, description, criteria)
- Trading pools (YES/NO reserves)
- Position tracking
- Analytics data
- Resolution status

#### `Position`
User position in a market:
- User address
- Outcome (YES=1, NO=2)
- Number of shares
- Average purchase price
- Timestamp

#### `TradeRecord`
Historical trade data:
- Trade type (BUY, SELL, ADD_LIQUIDITY, etc.)
- Amount and shares
- Prices before/after
- Timestamp and fees

#### `MarketAnalytics`
Comprehensive market metrics:
- Volume statistics
- Trade counts
- Unique traders
- Price history
- Fee totals

#### `MarketPool`
Market-specific liquidity pool:
- YES and NO reserves
- Total LP tokens
- LP provider balances
- Virtual reserves for price stability

### AMM Pricing (CPMM)

The contract uses a **Constant Product Market Maker (CPMM)** for pricing, based on the formula:

```
x * y = k
```

Where:
- `x` = YES reserve
- `y` = NO reserve
- `k` = constant product

The price for an outcome is calculated as:

```
Price(outcome) = outcome_reserve / (yes_reserve + no_reserve) * PRICE_PRECISION
```

This ensures:
- ✅ Continuous liquidity
- ✅ Prices sum to ~100%
- ✅ Smooth price discovery
- ✅ Stable market maker behavior

## Core Concepts

### Market States

1. **Active**: Market is open for trading
2. **Ended**: Past end time, awaiting resolution
3. **Resolved**: Oracle has determined outcome

### Outcomes

- **YES (1)**: Event will occur
- **NO (2)**: Event will not occur

### Trade Types

- `BUY`: Purchase position shares
- `SELL`: Sell position shares
- `ADD_LIQUIDITY`: Provide liquidity
- `REMOVE_LIQUIDITY`: Withdraw liquidity
- `CLAIM_WINNINGS`: Claim winning position payout
- `RESOLVE`: Resolve market outcome
- `CLAIM_LIQUIDITY`: Claim LP principal after resolution

## Installation

### Prerequisites

- Aptos CLI installed
- Move compiler
- Fungible asset (e.g., USDC) deployed

### Deployment

```bash
# Initialize the contract
aptos move run \
  --function-id 'YOUR_ADDRESS::y::initialize' \
  --args object:ASSET_METADATA_ADDRESS

# Compile the module
aptos move compile

# Publish the module
aptos move publish
```

## Usage

### Creating a Market

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::create_market' \
  --args \
    string:"Will Bitcoin reach $100K by EOY 2025?" \
    string:"Market description" \
    string:"Resolution criteria" \
    u64:1735689600 \
    address:ORACLE_ADDRESS \
    u64:100000
```

### Buying a Position

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::buy_position' \
  --args \
    u64:MARKET_ID \
    u8:1 \
    u64:10000 \
    u64:1000
```

### Selling a Position

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::sell_position' \
  --args \
    u64:MARKET_ID \
    u64:POSITION_ID \
    u64:SHARES_TO_SELL \
    u64:MIN_PRICE
```

### Adding Liquidity

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::add_liquidity' \
  --args \
    u64:MARKET_ID \
    u64:AMOUNT
```

### Resolving a Market

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::resolve_market' \
  --args \
    u64:MARKET_ID \
    u8:OUTCOME
```

### Claiming Winnings

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::claim_winnings' \
  --args \
    u64:MARKET_ID \
    u64:POSITION_ID
```

### Claiming Liquidity Principal

```bash
aptos move run \
  --function-id 'YOUR_ADDRESS::y::claim_lp_principal' \
  --args \
    u64:MARKET_ID
```

## Contract Functions

### Entry Functions (State-Changing)

| Function | Description | Parameters |
|----------|-------------|------------|
| `initialize` | Initialize the platform | `asset_metadata` |
| `create_market` | Create a new market | `title, description, criteria, end_time, oracle, initial_liquidity` |
| `buy_position` | Buy YES/NO shares | `market_id, outcome, amount, max_slippage` |
| `sell_position` | Sell position shares | `market_id, position_id, shares, min_price` |
| `add_liquidity` | Add liquidity to pool | `market_id, amount` |
| `remove_liquidity` | Remove liquidity | `market_id, lp_tokens` |
| `resolve_market` | Resolve market outcome | `market_id, outcome` |
| `claim_winnings` | Claim winning position | `market_id, position_id` |
| `claim_lp_principal` | Claim LP principal | `market_id` |
| `update_platform_params` | Update platform parameters | `platform_fee_rate, market_creation_fee, min_initial_liquidity, min_market_duration` |
| `update_max_price_history` | Update max price history length | `market_id, new_max` |

### View Functions (Read-Only)

| Function | Description | Returns |
|----------|-------------|---------|
| `get_market_details` | Get full market info | Market metadata and stats |
| `get_market_pool_state` | Get pool reserves and prices | Reserves, LP tokens, prices |
| `get_user_positions` | Get user's position IDs | Vector of position IDs |
| `get_position` | Get position details | User, outcome, shares, price, timestamp |
| `get_market_analytics` | Get market analytics | Volume, trades, fees |
| `get_trade_history` | Get recent trades | Vector of trade records |
| `get_price_history` | Get price chart data | Vector of price points |
| `get_market_ohlc_data` | Get OHLC candlestick data | Vector of OHLC data |
| `calculate_trade_output` | Simulate trade result | Shares/amount, price, impact |
| `get_platform_stats` | Get platform-wide stats | Markets, TVL, active markets |
| `get_user_lp_balance` | Get user's LP token balance | LP tokens |
| `get_all_market_ids` | Get all market IDs | Vector of market IDs |
| `get_markets_paginated` | Get paginated market IDs | Vector of market IDs |
| `get_market_summary` | Get market summary | ID, title, description, etc. |
| `get_market_count` | Get total market count | Number of markets |
| `get_platform_params` | Get platform parameters | Fee rates, minimums |
| `get_asset_metadata` | Get asset metadata | Asset metadata object |
| `get_market_depth` | Get market depth info | Reserves, bid/ask prices |
| `get_latest_trades` | Get recent trades feed | Vector of trade records |
| `get_price_at_timestamp` | Get historical price | Price at timestamp |
| `get_volume_weighted_average_price` | Calculate VWAP | VWAP for outcome |
| `get_daily_volume` | Get volume for a specific day | Daily volume |
| `get_hourly_volume` | Get volume for a specific hour | Hourly volume |
| `get_trade_by_id` | Get trade by ID | Trade record |
| `get_user_trade_history` | Get user's trade history | Vector of trade records |
| `get_volume_by_time_range` | Get volume in date range | Volume, trade count |

## Fee Structure

### Trading Fees
- **Trade Fee**: 1% (100 basis points)
- Applied on buy and sell transactions
- Distributed to platform and creators

### Platform Fees
- **Platform Fee**: 0.5% (50 basis points)
- Collected on market resolution
- Sent to platform admin

### Creator Fees
- **Creator Fee**: 20% of total trading fees
- Rewarded to market creator
- Incentivizes quality market creation

### Market Creation
- **Creation Fee**: 10,000 units (0.01 USDC)
- Minimum initial liquidity: 100,000 units (0.1 USDC)
- Minimum market duration: 3,600 seconds (1 hour)

## Analytics & Data

### Available Metrics

- **Total Volume**: Cumulative trading volume
- **Trade Count**: Number of trades executed
- **YES/NO Volume**: Separate volume tracking
- **Liquidity Volume**: Volume from liquidity operations
- **Unique Traders**: Count of unique participants
- **Daily/Hourly Volume**: Time-series volume data
- **Price History**: Historical price points
- **OHLC Data**: Candlestick chart data
- **VWAP**: Volume-weighted average price

### Data Storage

- Last 1,000 trades stored per market (configurable)
- Efficient table-based storage
- Indexed by timestamp for queries

## Security

### Access Controls

- **Admin only**: Platform parameter updates
- **Oracle/Admin/Creator**: Market resolution
- **Position owner only**: Sell positions, claim winnings
- **LP provider only**: Remove liquidity, claim principal

### Safety Features

- ✅ Slippage protection (max 10% price impact)
- ✅ Balance validation before transfers
- ✅ Market state checks (resolved, ended)
- ✅ Outcome validation (1 or 2 only)
- ✅ Zero-amount guards
- ✅ Division by zero prevention
- ✅ Overflow protection

### Error Codes

| Code | Error | Description |
|------|-------|-------------|
| `E_NOT_ADMIN` | 0 | Caller not authorized |
| `E_MARKET_ENDED` | 1 | Market past end time |
| `E_MARKET_NOT_ENDED` | 2 | Market still active |
| `E_MARKET_RESOLVED` | 3 | Market already resolved |
| `E_MARKET_NOT_RESOLVED` | 4 | Market not yet resolved |
| `E_INVALID_OUTCOME` | 5 | Invalid outcome value |
| `E_NO_WINNINGS` | 6 | No winnings to claim |
| `E_INVALID_BET_AMOUNT` | 7 | Invalid amount provided |
| `E_MARKET_NOT_FOUND` | 8 | Market does not exist |
| `E_ALREADY_INITIALIZED` | 9 | Contract already initialized |
| `E_POSITION_NOT_FOUND` | 10 | Position does not exist |
| `E_INSUFFICIENT_LIQUIDITY` | 11 | Insufficient funds |
| `E_INVALID_PRICE` | 12 | Price below minimum |
| `E_SLIPPAGE_EXCEEDED` | 13 | Price moved too much |
| `E_INVALID_END_TIME` | 14 | Invalid market end time |
| `E_ASSET_NOT_REGISTERED` | 15 | Asset not registered |
| `E_ZERO_PRICE` | 16 | Price is zero |
| `E_ZERO_SHARES` | 17 | Zero shares in trade |
| `E_ZERO_TOTAL_SHARES` | 18 | No shares in pool |
| `E_INSUFFICIENT_POOL_BALANCE` | 19 | Pool balance too low |
| `E_INVALID_LIQUIDITY` | 20 | Invalid liquidity amount |

## Example Use Cases

### Sports Betting
```
"Will Team A win the championship?"
- Users bet YES or NO
- Oracle resolves after game
- Winners claim proportional payouts
```

### Price Predictions
```
"Will BTC reach $100K by Dec 2025?"
- Prices adjust based on market sentiment
- Real-time trading until deadline
- Transparent settlement
```

### Event Outcomes
```
"Will the product launch happen on time?"
- Company creates market
- Employees/public trade
- Aggregates collective wisdom
```

## Roadmap

- [ ] Multi-outcome markets (>2 options)
- [ ] Automated oracle integration (Chainlink, Pyth)
- [ ] Advanced order types (limit orders)
- [ ] Market maker incentives
- [ ] Cross-market arbitrage tools
- [ ] Mobile SDK integration
- [ ] Governance token for platform decisions

---

**⚠️ Disclaimer**: This is experimental software. Use at your own risk. Prediction markets may be subject to legal restrictions in your jurisdiction.