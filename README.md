# Pivot: AI-Powered Prediction Markets

![Pivot Logo](https://ibb.co/VcxMc64D) 

Pivot combines **AI-powered market creation** and **social intelligence** to deliver accessible prediction markets for crypto, sports, and viral trends. Built with a robust Python backend and an Aptos blockchain-based smart contract, Pivot enables users to create, trade, and resolve prediction markets with real-time data integration from sources like Reddit, NewsAPI, and Alpha Vantage.

The platform leverages a Constant Product Market Maker (CPMM) for liquidity provision, advanced analytics for market insights, and AI-driven suggestions to identify trending topics and generate prediction markets. Whether you're speculating on cryptocurrency price movements, sports outcomes, or viral social media trends, Pivot provides a decentralized and transparent platform for engaging with prediction markets.

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Smart Contract Overview](#smart-contract-overview)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Features
- **AI-Powered Market Creation**: Generate prediction markets using real-time data from Reddit, NewsAPI, and Alpha Vantage, powered by Google's Gemini AI model.
- **Social Intelligence Integration**: Fetch trending topics and sentiment from Reddit using OAuth authentication, ensuring reliable social data.
- **Decentralized Trading on Aptos**: Trade "Yes" or "No" outcomes in prediction markets using a CPMM-based Automated Market Maker (AMM) on the Aptos blockchain.
- **Real-Time Analytics**: Access detailed market analytics, including trade history, volume-weighted average prices (VWAP), OHLC data, and liquidity pool states.
- **Secure and Transparent**: Markets are resolved by trusted oracles, with fees distributed to platform admins and market creators.

## Architecture
Pivot consists of three main components:

1. **Python Backend (Flask)**:
   - **Purpose**: Handles API requests, integrates with external data sources (Reddit, NewsAPI, Alpha Vantage), and generates AI-driven market suggestions using Gemini.
   - **Key Classes**:
     - `RealTimeDataProvider`: Fetches real-time data from Reddit, NewsAPI, and Alpha Vantage.
     - `EnhancedAIMarketAssistant`: Processes data and generates prediction market suggestions.
   - **Tech Stack**: Python, Flask, `aiohttp` for asynchronous HTTP requests, Google Gemini for AI, and `python-dotenv` for configuration.

2. **Aptos Smart Contract (Move)**:
   - **Purpose**: Manages on-chain prediction markets, including market creation, trading, liquidity provision, and resolution.
   - **Key Features**:
     - Constant Product Market Maker (CPMM) for pricing "Yes" and "No" outcomes.
     - Liquidity pools for market stability.
     - Detailed analytics tracking (total volume, trade history, OHLC data).
     - Support for platform and creator fees.
   - **Module**: `pivot_markets::y`
   - **Tech Stack**: Move language, Aptos blockchain.

3. **Frontend (React/TypeScript)**:
   - Displays trending news and market insights with a responsive UI.
   - Features a filter modal for selecting topics (crypto, tech, sports, economics), with instant refresh on selection.
   - Integrates with the backend via API calls to display real-time data.

