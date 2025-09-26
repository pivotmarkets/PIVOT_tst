module pivot_markets::y
 {
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore};
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use std::signer;
    use std::string::String;
    use std::error;
    use std::option::{Self, Option};
    use std::vector;

    // Errors
    const E_NOT_ADMIN: u64 = 0;
    const E_MARKET_ENDED: u64 = 1;
    const E_MARKET_NOT_ENDED: u64 = 2;
    const E_MARKET_RESOLVED: u64 = 3;
    const E_MARKET_NOT_RESOLVED: u64 = 4;
    const E_INVALID_OUTCOME: u64 = 5;
    const E_NO_WINNINGS: u64 = 6;
    const E_INVALID_BET_AMOUNT: u64 = 7;
    const E_MARKET_NOT_FOUND: u64 = 8;
    const E_ALREADY_INITIALIZED: u64 = 9;
    const E_POSITION_NOT_FOUND: u64 = 10;
    const E_INSUFFICIENT_LIQUIDITY: u64 = 11;
    const E_INVALID_PRICE: u64 = 12;
    const E_SLIPPAGE_EXCEEDED: u64 = 13;
    const E_INVALID_END_TIME: u64 = 14;
    const E_ASSET_NOT_REGISTERED: u64 = 15;
    const E_ZERO_PRICE: u64 = 16;
    const E_ZERO_SHARES: u64 = 17;
    const E_ZERO_TOTAL_SHARES: u64 = 18;
    const E_INSUFFICIENT_POOL_BALANCE: u64 = 19;
    const E_INVALID_LIQUIDITY: u64 = 20;

    // Constants for AMM calculations
    const PRICE_PRECISION: u64 = 10000; // 100.00%
    const MIN_LIQUIDITY: u64 = 1000; // Minimum liquidity to prevent division by zero
    const MAX_PRICE_IMPACT: u64 = 1000; // 10% maximum price impact per trade

    // Trade types for analytics
    const TRADE_TYPE_BUY: u8 = 1;
    const TRADE_TYPE_SELL: u8 = 2;
    const TRADE_TYPE_ADD_LIQUIDITY: u8 = 3;
    const TRADE_TYPE_REMOVE_LIQUIDITY: u8 = 4;
    const TRADE_TYPE_CLAIM_WINNINGS: u8 = 5;
    const TRADE_TYPE_RESOLVE: u8 = 6;

    // Trade record for order book and analytics
    struct TradeRecord has store, copy, drop {
        trade_id: u64,
        user: address,
        trade_type: u8, // 1=BUY, 2=SELL, 3=ADD_LIQ, 4=REMOVE_LIQ, 5=CLAIM, 6=RESOLVE
        outcome: Option<u8>, // Some(1 or 2) for position trades, None for liquidity ops
        amount: u64, // Amount in base asset
        shares: Option<u64>, // Shares bought/sold (None for liquidity ops)
        price: u64, // Price per share (scaled by PRICE_PRECISION)
        yes_price_before: u64, // YES price before trade
        no_price_before: u64, // NO price before trade  
        yes_price_after: u64, // YES price after trade
        no_price_after: u64, // NO price after trade
        timestamp: u64,
        gas_used: Option<u64>, // Future extension for gas tracking
    }

    // OHLC data structure
    struct OHLCData has store, copy, drop {
        timestamp: u64,
        open: u64,
        high: u64,
        low: u64,
        close: u64,
        volume: u64,
    }

    // Market volume and analytics data
    struct MarketAnalytics has store {
        total_volume: u64, // Total volume traded in base asset
        total_trades: u64, // Total number of trades
        yes_volume: u64, // Volume for YES positions
        no_volume: u64, // Volume for NO positions
        liquidity_volume: u64, // Volume from liquidity operations
        unique_traders: Table<address, bool>, // Track unique participants
        unique_trader_count: u64, // Manual counter for unique traders
        daily_volume: Table<u64, u64>, // day_timestamp -> volume
        hourly_volume: Table<u64, u64>, // hour_timestamp -> volume
        price_history: vector<TradeRecord>, // Store recent price points for charting
        max_price_history: u64, // Maximum number of price points to store
    }

    // Position represents a user's stake in a particular outcome
    struct Position has store, copy, drop {
        user: address,
        outcome: u8, // 1 for Yes, 2 for No
        shares: u64, // Number of shares owned
        avg_price: u64, // Average price per share (scaled by PRICE_PRECISION)
        timestamp: u64,
    }

    // Market-specific liquidity pool
    struct MarketPool has store {
        yes_reserve: u64,
        no_reserve: u64,
        total_lp_tokens: u64,
        lp_providers: Table<address, u64>,
        virtual_yes: u64,
        virtual_no: u64,
    }

    struct Market has store {
        id: u64,
        title: String,
        description: String,
        resolution_criteria: String,
        end_time: u64,
        asset_metadata: Object<Metadata>,
        yes_pool: Object<FungibleStore>,
        no_pool: Object<FungibleStore>,
        yes_pool_extend_ref: ExtendRef,
        no_pool_extend_ref: ExtendRef,
        amm_pool: MarketPool,
        positions: Table<u64, Position>,
        user_positions: Table<address, vector<u64>>,
        next_position_id: u64,
        resolved: bool,
        outcome: Option<u8>,
        oracle: address,
        creator: address,
        total_yes_shares: u64,
        total_no_shares: u64,
        participant_count: u64,
        creation_time: u64,
        trade_history: Table<u64, TradeRecord>,
        next_trade_id: u64,
        analytics: MarketAnalytics,
    }

    struct MarketStore has key {
        admin: address,
        asset_metadata: Object<Metadata>,
        markets: Table<u64, Market>,
        next_id: u64,
        platform_fee_rate: u64,
        market_creation_fee: u64,
        min_initial_liquidity: u64,
        min_market_duration: u64,
    }

    // Helper function to get day timestamp (midnight UTC)
    fun get_day_timestamp(timestamp: u64): u64 {
        timestamp - (timestamp % 86400) // 86400 seconds in a day
    }

    // Helper function to get hour timestamp
    fun get_hour_timestamp(timestamp: u64): u64 {
        timestamp - (timestamp % 3600) // 3600 seconds in an hour
    }

    // Helper function to record a trade and update analytics
    fun record_trade(
        market: &mut Market,
        user: address,
        trade_type: u8,
        outcome: Option<u8>,
        amount: u64,
        shares: Option<u64>,
        yes_price_before: u64,
        no_price_before: u64
    ) {
        let timestamp = timestamp::now_seconds();
        let day_ts = get_day_timestamp(timestamp);
        let hour_ts = get_hour_timestamp(timestamp);
        
        // Calculate prices after trade
        let yes_price_after = calculate_outcome_price(
            market.amm_pool.yes_reserve,
            market.amm_pool.no_reserve,
            1
        );
        let no_price_after = calculate_outcome_price(
            market.amm_pool.yes_reserve,
            market.amm_pool.no_reserve,
            2
        );
        
        // Calculate effective price for the trade
        let trade_price = if (option::is_some(&shares) && option::is_some(&outcome)) {
            let shares_val = *option::borrow(&shares);
            let outcome_val = *option::borrow(&outcome);
            if (shares_val > 0) {
                if (trade_type == TRADE_TYPE_BUY) {
                    (amount * PRICE_PRECISION) / shares_val
                } else if (trade_type == TRADE_TYPE_SELL) {
                    (amount * PRICE_PRECISION) / shares_val
                } else {
                    if (outcome_val == 1) yes_price_after else no_price_after
                }
            } else {
                if (outcome_val == 1) yes_price_after else no_price_after
            }
        } else {
            // For liquidity operations, use average price
            (yes_price_after + no_price_after) / 2
        };

        let trade_record = TradeRecord {
            trade_id: market.next_trade_id,
            user,
            trade_type,
            outcome,
            amount,
            shares,
            price: trade_price,
            yes_price_before,
            no_price_before,
            yes_price_after,
            no_price_after,
            timestamp,
            gas_used: option::none(),
        };

        // Store trade record
        table::add(&mut market.trade_history, market.next_trade_id, trade_record);
        market.next_trade_id = market.next_trade_id + 1;

        // Update analytics
        let analytics = &mut market.analytics;
        analytics.total_volume = analytics.total_volume + amount;
        analytics.total_trades = analytics.total_trades + 1;

        // Update volume by outcome type
        if (option::is_some(&outcome)) {
            let outcome_val = *option::borrow(&outcome);
            if (outcome_val == 1) {
                analytics.yes_volume = analytics.yes_volume + amount;
            } else {
                analytics.no_volume = analytics.no_volume + amount;
            };
        } else {
            analytics.liquidity_volume = analytics.liquidity_volume + amount;
        };

        // Track unique traders
        if (!table::contains(&analytics.unique_traders, user)) {
            table::add(&mut analytics.unique_traders, user, true);
            analytics.unique_trader_count = analytics.unique_trader_count + 1;
        };

        // Update daily volume
        if (table::contains(&analytics.daily_volume, day_ts)) {
            let daily_vol = table::borrow_mut(&mut analytics.daily_volume, day_ts);
            *daily_vol = *daily_vol + amount;
        } else {
            table::add(&mut analytics.daily_volume, day_ts, amount);
        };

        // Update hourly volume
        if (table::contains(&analytics.hourly_volume, hour_ts)) {
            let hourly_vol = table::borrow_mut(&mut analytics.hourly_volume, hour_ts);
            *hourly_vol = *hourly_vol + amount;
        } else {
            table::add(&mut analytics.hourly_volume, hour_ts, amount);
        };

        // Store price history for charting (keep only recent entries)
        vector::push_back(&mut analytics.price_history, trade_record);
        
        // Limit price history size to prevent excessive storage
        while (vector::length(&analytics.price_history) > analytics.max_price_history) {
            vector::remove(&mut analytics.price_history, 0);
        };
    }

    // Initialize the contract with a specific fungible asset
    public entry fun initialize(
        admin: &signer,
        asset_metadata: Object<Metadata>
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @pivot_markets, error::permission_denied(E_NOT_ADMIN));
        assert!(!exists<MarketStore>(admin_addr), error::already_exists(E_ALREADY_INITIALIZED));

        primary_fungible_store::ensure_primary_store_exists(admin_addr, asset_metadata);

        move_to(admin, MarketStore {
            admin: admin_addr,
            asset_metadata,
            markets: table::new(),
            next_id: 0,
            platform_fee_rate: 50,
            market_creation_fee: 10000,
            min_initial_liquidity: 100000,
            min_market_duration: 3600,
        });
    }

    // Create market-specific fungible stores with extend refs
    fun create_market_pools(creator: &signer, asset_metadata: Object<Metadata>): (Object<FungibleStore>, Object<FungibleStore>, ExtendRef, ExtendRef) {
        let constructor_ref1 = object::create_object(signer::address_of(creator));
        let constructor_ref2 = object::create_object(signer::address_of(creator));
        
        let yes_store = fungible_asset::create_store(&constructor_ref1, asset_metadata);
        let no_store = fungible_asset::create_store(&constructor_ref2, asset_metadata);
        
        let yes_extend_ref = object::generate_extend_ref(&constructor_ref1);
        let no_extend_ref = object::generate_extend_ref(&constructor_ref2);
        
        (yes_store, no_store, yes_extend_ref, no_extend_ref)
    }

    // Calculate current price using Constant Product Market Maker (x * y = k)
    fun calculate_outcome_price(yes_reserve: u64, no_reserve: u64, outcome: u8): u64 {
        let total_reserve = yes_reserve + no_reserve;
        
        if (total_reserve == 0) {
            return PRICE_PRECISION / 2;
        };

        let outcome_reserve = if (outcome == 1) yes_reserve else no_reserve;
        
        let price = (outcome_reserve * PRICE_PRECISION) / total_reserve;
        
        if (price < 100) {
            100
        } else if (price > 9900) {
            9900
        } else {
            price
        }
    }

    // Create a new market with proper AMM pools
    public entry fun create_market(
        creator: &signer,
        title: String,
        description: String,
        resolution_criteria: String,
        end_time: u64,
        oracle: address,
        initial_liquidity: u64
    ) acquires MarketStore {
        let creator_addr = signer::address_of(creator);
        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        
        let current_time = timestamp::now_seconds();
        assert!(end_time > current_time + store.min_market_duration, error::invalid_argument(E_INVALID_END_TIME));
        assert!(initial_liquidity >= store.min_initial_liquidity, error::invalid_argument(E_INVALID_LIQUIDITY));

        // Ensure creator has sufficient balance for USDC
        assert!(primary_fungible_store::balance(creator_addr, store.asset_metadata) >= store.market_creation_fee + initial_liquidity, error::invalid_argument(E_INSUFFICIENT_LIQUIDITY));

        primary_fungible_store::ensure_primary_store_exists(creator_addr, store.asset_metadata);

        // Withdraw creation fee + initial liquidity
        let total_required = store.market_creation_fee + initial_liquidity;
        let payment = primary_fungible_store::withdraw(creator, store.asset_metadata, total_required);
        
        // Send creation fee to admin
        let creation_fee = fungible_asset::extract(&mut payment, store.market_creation_fee);
        dispatchable_fungible_asset::deposit(primary_fungible_store::primary_store(store.admin, store.asset_metadata), creation_fee);
        
        // Create dedicated pools for this market
        let (yes_pool, no_pool, yes_pool_extend_ref, no_pool_extend_ref) = create_market_pools(creator, store.asset_metadata);
        
        // Split initial liquidity equally between yes and no pools
        let half = initial_liquidity / 2;
        let yes_liquidity = fungible_asset::extract(&mut payment, half);
        let no_liquidity = payment;
        
        // Deposit initial liquidity into market pools
        dispatchable_fungible_asset::deposit(yes_pool, yes_liquidity);
        dispatchable_fungible_asset::deposit(no_pool, no_liquidity);

        let id = store.next_id;
        store.next_id = id + 1;
        
        let amm_pool = MarketPool {
            yes_reserve: half,
            no_reserve: half,
            total_lp_tokens: initial_liquidity,
            lp_providers: table::new(),
            virtual_yes: half,
            virtual_no: half,
        };
        
        table::add(&mut amm_pool.lp_providers, creator_addr, initial_liquidity);
        
        // Initialize analytics
        let analytics = MarketAnalytics {
            total_volume: initial_liquidity,
            total_trades: 1,
            yes_volume: 0,
            no_volume: 0,
            liquidity_volume: initial_liquidity,
            unique_traders: table::new(),
            unique_trader_count: 1, // Initialize with creator as first trader
            daily_volume: table::new(),
            hourly_volume: table::new(),
            price_history: vector::empty(),
            max_price_history: 1000, // Store last 1000 trades for charting
        };
        
        let market = Market {
            id,
            title,
            description,
            resolution_criteria,
            end_time,
            asset_metadata: store.asset_metadata,
            yes_pool,
            no_pool,
            yes_pool_extend_ref,
            no_pool_extend_ref,
            amm_pool,
            positions: table::new(),
            user_positions: table::new(),
            next_position_id: 0,
            resolved: false,
            outcome: option::none(),
            oracle,
            creator: creator_addr,
            total_yes_shares: 0,
            total_no_shares: 0,
            participant_count: 0,
            creation_time: current_time,
            trade_history: table::new(),
            next_trade_id: 0,
            analytics,
        };

        table::add(&mut store.markets, id, market);
        
        // Record initial liquidity as a trade
        let market_mut = table::borrow_mut(&mut store.markets, id);
        record_trade(
            market_mut,
            creator_addr,
            TRADE_TYPE_ADD_LIQUIDITY,
            option::none(),
            initial_liquidity,
            option::none(),
            PRICE_PRECISION / 2, // Initial prices are 50/50
            PRICE_PRECISION / 2
        );
    }

    // Add liquidity to a specific market's AMM pool
    public entry fun add_liquidity(
        provider: &signer,
        market_id: u64,
        amount: u64
    ) acquires MarketStore {
        assert!(amount > 0, error::invalid_argument(E_INVALID_BET_AMOUNT));

        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));

        let provider_addr = signer::address_of(provider);
        assert!(primary_fungible_store::balance(provider_addr, market.asset_metadata) >= amount, error::invalid_argument(E_INSUFFICIENT_LIQUIDITY));

        // Record prices before trade
        let yes_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
        let no_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);

        let fa = primary_fungible_store::withdraw(provider, market.asset_metadata, amount);
        
        let half = amount / 2;
        let yes_liquidity = fungible_asset::extract(&mut fa, half);
        let no_liquidity = fa;
        
        dispatchable_fungible_asset::deposit(market.yes_pool, yes_liquidity);
        dispatchable_fungible_asset::deposit(market.no_pool, no_liquidity);
        
        let amm_pool = &mut market.amm_pool;
        amm_pool.yes_reserve = amm_pool.yes_reserve + half;
        amm_pool.no_reserve = amm_pool.no_reserve + half;
        amm_pool.virtual_yes = amm_pool.virtual_yes + half;
        amm_pool.virtual_no = amm_pool.virtual_no + half;
        
        let lp_tokens_to_mint = if (amm_pool.total_lp_tokens == 0) {
            amount
        } else {
            let total_reserve_before = (amm_pool.yes_reserve - half) + (amm_pool.no_reserve - half);
            (amount * amm_pool.total_lp_tokens) / total_reserve_before
        };
        
        if (!table::contains(&amm_pool.lp_providers, provider_addr)) {
            table::add(&mut amm_pool.lp_providers, provider_addr, 0);
        };
        let provider_tokens = table::borrow_mut(&mut amm_pool.lp_providers, provider_addr);
        *provider_tokens = *provider_tokens + lp_tokens_to_mint;
        amm_pool.total_lp_tokens = amm_pool.total_lp_tokens + lp_tokens_to_mint;

        // Record the trade
        record_trade(
            market,
            provider_addr,
            TRADE_TYPE_ADD_LIQUIDITY,
            option::none(),
            amount,
            option::none(),
            yes_price_before,
            no_price_before
        );
    }

    // Buy position using AMM pricing
    public entry fun buy_position(
        user: &signer,
        market_id: u64,
        outcome: u8,
        amount: u64,
        max_slippage: u64
    ) acquires MarketStore {
        assert!(amount > 0, error::invalid_argument(E_INVALID_BET_AMOUNT));

        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
        assert!(timestamp::now_seconds() < market.end_time, error::invalid_state(E_MARKET_ENDED));
        assert!(outcome == 1 || outcome == 2, error::invalid_argument(E_INVALID_OUTCOME));

        // Record prices before trade
        let yes_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
        let no_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);

        let amm_pool = &market.amm_pool;
        let (effective_shares, outcome_reserve) = if (outcome == 1) {
            (market.total_yes_shares + amm_pool.virtual_yes, amm_pool.yes_reserve)
        } else {
            (market.total_no_shares + amm_pool.virtual_no, amm_pool.no_reserve)
        };
        let shares = if (outcome_reserve == 0) {
            amount
        } else {
            (amount * effective_shares) / outcome_reserve
        };
        assert!(shares > 0, error::invalid_argument(E_ZERO_SHARES));
        
        let current_price = calculate_outcome_price(
            amm_pool.yes_reserve, 
            amm_pool.no_reserve, 
            outcome
        );
        
        let new_yes_reserve = if (outcome == 1) {
            amm_pool.yes_reserve + amount
        } else {
            amm_pool.yes_reserve
        };
        let new_no_reserve = if (outcome == 2) {
            amm_pool.no_reserve + amount
        } else {
            amm_pool.no_reserve
        };
        
        let new_price = calculate_outcome_price(new_yes_reserve, new_no_reserve, outcome);
        let price_impact = if (new_price > current_price) {
            new_price - current_price
        } else {
            current_price - new_price
        };
        
        assert!(price_impact <= max_slippage, error::invalid_argument(E_SLIPPAGE_EXCEEDED));

        let user_addr = signer::address_of(user);
        assert!(primary_fungible_store::balance(user_addr, market.asset_metadata) >= amount, error::invalid_argument(E_INSUFFICIENT_LIQUIDITY));

        let fa = primary_fungible_store::withdraw(user, market.asset_metadata, amount);
        
        if (outcome == 1) {
            dispatchable_fungible_asset::deposit(market.yes_pool, fa);
            market.amm_pool.yes_reserve = market.amm_pool.yes_reserve + amount;
            market.total_yes_shares = market.total_yes_shares + shares;
        } else {
            dispatchable_fungible_asset::deposit(market.no_pool, fa);
            market.amm_pool.no_reserve = market.amm_pool.no_reserve + amount;
            market.total_no_shares = market.total_no_shares + shares;
        };

        let position_id = market.next_position_id;
        market.next_position_id = position_id + 1;

        let position = Position {
            user: user_addr,
            outcome,
            shares,
            avg_price: current_price,
            timestamp: timestamp::now_seconds(),
        };

        table::add(&mut market.positions, position_id, position);

        if (!table::contains(&market.user_positions, user_addr)) {
            table::add(&mut market.user_positions, user_addr, vector::empty<u64>());
            market.participant_count = market.participant_count + 1;
        };
        let user_position_ids = table::borrow_mut(&mut market.user_positions, user_addr);
        vector::push_back(user_position_ids, position_id);

        // Record the trade
        record_trade(
            market,
            user_addr,
            TRADE_TYPE_BUY,
            option::some(outcome),
            amount,
            option::some(shares),
            yes_price_before,
            no_price_before
        );
    }

    // Sell position using AMM pricing
public entry fun sell_position(
    user: &signer,
    market_id: u64,
    position_id: u64,
    shares_to_sell: u64,
    min_price: u64
) acquires MarketStore {
    let store = borrow_global_mut<MarketStore>(@pivot_markets);
    assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
    let market = table::borrow_mut(&mut store.markets, market_id);

    assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
    assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));

    let position = table::borrow_mut(&mut market.positions, position_id);
    let user_addr = signer::address_of(user);
    assert!(position.user == user_addr, error::permission_denied(E_NOT_ADMIN));
    assert!(position.shares >= shares_to_sell, error::invalid_argument(E_INSUFFICIENT_LIQUIDITY));

    // Record prices before trade
    let yes_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
    let no_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);

    let amm_pool = &mut market.amm_pool;
    let (total_shares, virtual_s, outcome_reserve) = if (position.outcome == 1) {
        (market.total_yes_shares, amm_pool.virtual_yes, amm_pool.yes_reserve)
    } else {
        (market.total_no_shares, amm_pool.virtual_no, amm_pool.no_reserve)
    };
    
    let denom = total_shares + virtual_s;
    let payout_amount = if (denom == 0) {
        0
    } else {
        (shares_to_sell * outcome_reserve) / denom
    };
    
    let effective_price = if (shares_to_sell > 0) {
        (payout_amount * PRICE_PRECISION) / shares_to_sell
    } else {
        0
    };
    assert!(effective_price >= min_price, error::invalid_argument(E_INVALID_PRICE));
    
    let pool_balance = if (position.outcome == 1) {
        fungible_asset::balance(market.yes_pool)
    } else {
        fungible_asset::balance(market.no_pool)
    };
    assert!(pool_balance >= payout_amount, error::invalid_state(E_INSUFFICIENT_POOL_BALANCE));

    position.shares = position.shares - shares_to_sell;

    // Store outcome before potential removal
    let outcome = position.outcome;

    if (position.outcome == 1) {
        market.total_yes_shares = market.total_yes_shares - shares_to_sell;
        market.amm_pool.yes_reserve = market.amm_pool.yes_reserve - payout_amount;
        let pool_signer = object::generate_signer_for_extending(&market.yes_pool_extend_ref);
        let payout_fa = dispatchable_fungible_asset::withdraw(&pool_signer, market.yes_pool, payout_amount);
        dispatchable_fungible_asset::deposit(primary_fungible_store::primary_store(user_addr, market.asset_metadata), payout_fa);
    } else {
        market.total_no_shares = market.total_no_shares - shares_to_sell;
        market.amm_pool.no_reserve = market.amm_pool.no_reserve - payout_amount;
        let pool_signer = object::generate_signer_for_extending(&market.no_pool_extend_ref);
        let payout_fa = dispatchable_fungible_asset::withdraw(&pool_signer, market.no_pool, payout_amount);
        dispatchable_fungible_asset::deposit(primary_fungible_store::primary_store(user_addr, market.asset_metadata), payout_fa);
    };

    if (position.shares == 0) {
        table::remove(&mut market.positions, position_id);
        let user_position_ids = table::borrow_mut(&mut market.user_positions, user_addr);
        let (found, index) = vector::index_of(user_position_ids, &position_id);
        if (found) {
            vector::remove(user_position_ids, index);
        };
    };

    // Record the trade using stored outcome
    record_trade(
        market,
        user_addr,
        TRADE_TYPE_SELL,
        option::some(outcome), // Use stored outcome instead of position.outcome
        payout_amount,
        option::some(shares_to_sell),
        yes_price_before,
        no_price_before
    );
}

    // Resolve a market
    public entry fun resolve_market(
        resolver: &signer,
        market_id: u64,
        outcome: u8
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        let resolver_addr = signer::address_of(resolver);
        assert!(
            resolver_addr == store.admin || 
            resolver_addr == market.oracle || 
            resolver_addr == market.creator, 
            error::permission_denied(E_NOT_ADMIN)
        );

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
        assert!(timestamp::now_seconds() >= market.end_time, error::invalid_state(E_MARKET_NOT_ENDED));
        assert!(outcome == 1 || outcome == 2, error::invalid_argument(E_INVALID_OUTCOME));

        // Record prices before resolution
        let yes_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
        let no_price_before = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);

        let total_pool_value = fungible_asset::balance(market.yes_pool) + fungible_asset::balance(market.no_pool);
        let platform_fee_amount = (total_pool_value * store.platform_fee_rate) / 10000;

        if (platform_fee_amount > 0) {
            let losing_pool = if (outcome == 1) market.no_pool else market.yes_pool;
            let losing_pool_extend_ref = if (outcome == 1) &market.no_pool_extend_ref else &market.yes_pool_extend_ref;
            let losing_pool_balance = fungible_asset::balance(losing_pool);
            
            if (losing_pool_balance >= platform_fee_amount) {
                let pool_signer = object::generate_signer_for_extending(losing_pool_extend_ref);
                let platform_fee = dispatchable_fungible_asset::withdraw(&pool_signer, losing_pool, platform_fee_amount);
                dispatchable_fungible_asset::deposit(primary_fungible_store::primary_store(store.admin, market.asset_metadata), platform_fee);
            };
        };

        market.outcome = option::some(outcome);
        market.resolved = true;

        // Record the resolution as a trade
        record_trade(
            market,
            resolver_addr,
            TRADE_TYPE_RESOLVE,
            option::some(outcome),
            platform_fee_amount,
            option::none(),
            yes_price_before,
            no_price_before
        );
    }

    // Claim winnings for resolved positions
    public entry fun claim_winnings(
        user: &signer,
        market_id: u64,
        position_id: u64
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(market.resolved, error::invalid_state(E_MARKET_NOT_RESOLVED));
        assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));

        let position = table::remove(&mut market.positions, position_id);
        let user_addr = signer::address_of(user);
        assert!(position.user == user_addr, error::permission_denied(E_NOT_ADMIN));

        let outcome = *option::borrow(&market.outcome);
        let payout_amount = 0;

        // Record prices before claim (final prices)
        let yes_price_before = if (outcome == 1) PRICE_PRECISION else 0;
        let no_price_before = if (outcome == 2) PRICE_PRECISION else 0;
        
        if (position.outcome == outcome) {
            let winning_pool = if (outcome == 1) market.yes_pool else market.no_pool;
            let losing_pool = if (outcome == 1) market.no_pool else market.yes_pool;
            let winning_pool_extend_ref = if (outcome == 1) &market.yes_pool_extend_ref else &market.no_pool_extend_ref;
            let losing_pool_extend_ref = if (outcome == 1) &market.no_pool_extend_ref else &market.yes_pool_extend_ref;
            let total_winning_shares = if (outcome == 1) market.total_yes_shares else market.total_no_shares;
            
            if (total_winning_shares > 0) {
                let winning_pool_balance = fungible_asset::balance(winning_pool);
                let losing_pool_balance = fungible_asset::balance(losing_pool);
                let total_payout_pool = winning_pool_balance + losing_pool_balance;
                
                payout_amount = (position.shares * total_payout_pool) / total_winning_shares;
                
                let from_winning = if (payout_amount <= winning_pool_balance) {
                    payout_amount
                } else {
                    winning_pool_balance
                };
                let from_losing = payout_amount - from_winning;
                
                let winning_pool_signer = object::generate_signer_for_extending(winning_pool_extend_ref);
                let payout_fa = dispatchable_fungible_asset::withdraw(&winning_pool_signer, winning_pool, from_winning);
                
                if (from_losing > 0 && losing_pool_balance >= from_losing) {
                    let losing_pool_signer = object::generate_signer_for_extending(losing_pool_extend_ref);
                    let losing_fa = dispatchable_fungible_asset::withdraw(&losing_pool_signer, losing_pool, from_losing);
                    fungible_asset::merge(&mut payout_fa, losing_fa);
                };
                
                dispatchable_fungible_asset::deposit(primary_fungible_store::primary_store(user_addr, market.asset_metadata), payout_fa);
            }
        };

        if (table::contains(&market.user_positions, user_addr)) {
            let user_position_ids = table::borrow_mut(&mut market.user_positions, user_addr);
            let (found, index) = vector::index_of(user_position_ids, &position_id);
            if (found) {
                vector::remove(user_position_ids, index);
            };
        };

        // Record the claim as a trade
        record_trade(
            market,
            user_addr,
            TRADE_TYPE_CLAIM_WINNINGS,
            option::some(position.outcome),
            payout_amount,
            option::some(position.shares),
            yes_price_before,
            no_price_before
        );
    }

    // Remove liquidity from AMM pool
    public entry fun remove_liquidity(
        provider: &signer,
        market_id: u64,
        lp_tokens_to_burn: u64
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));

        let provider_addr = signer::address_of(provider);
        let amm_pool = &mut market.amm_pool;

        // Record prices before trade
        let yes_price_before = calculate_outcome_price(amm_pool.yes_reserve, amm_pool.no_reserve, 1);
        let no_price_before = calculate_outcome_price(amm_pool.yes_reserve, amm_pool.no_reserve, 2);

        let yes_reserve = amm_pool.yes_reserve;
        let no_reserve = amm_pool.no_reserve;
        let total_lp_tokens = amm_pool.total_lp_tokens;

        let yes_amount = (lp_tokens_to_burn * yes_reserve) / total_lp_tokens;
        let no_amount = (lp_tokens_to_burn * no_reserve) / total_lp_tokens;
        let total_amount = yes_amount + no_amount;

        assert!(fungible_asset::balance(market.yes_pool) >= yes_amount, error::invalid_state(E_INSUFFICIENT_POOL_BALANCE));
        assert!(fungible_asset::balance(market.no_pool) >= no_amount, error::invalid_state(E_INSUFFICIENT_POOL_BALANCE));

        assert!(table::contains(&amm_pool.lp_providers, provider_addr), error::not_found(E_POSITION_NOT_FOUND));
        
        let new_tokens = {
            let provider_tokens = table::borrow_mut(&mut amm_pool.lp_providers, provider_addr);
            assert!(*provider_tokens >= lp_tokens_to_burn, error::invalid_argument(E_INSUFFICIENT_LIQUIDITY));
            *provider_tokens = *provider_tokens - lp_tokens_to_burn;
            *provider_tokens
        };

        let v_yes_out = (lp_tokens_to_burn * amm_pool.virtual_yes) / total_lp_tokens;
        let v_no_out = (lp_tokens_to_burn * amm_pool.virtual_no) / total_lp_tokens;
        amm_pool.virtual_yes = amm_pool.virtual_yes - v_yes_out;
        amm_pool.virtual_no = amm_pool.virtual_no - v_no_out;

        amm_pool.total_lp_tokens = amm_pool.total_lp_tokens - lp_tokens_to_burn;
        amm_pool.yes_reserve = amm_pool.yes_reserve - yes_amount;
        amm_pool.no_reserve = amm_pool.no_reserve - no_amount;

        let yes_pool_signer = object::generate_signer_for_extending(&market.yes_pool_extend_ref);
        let no_pool_signer = object::generate_signer_for_extending(&market.no_pool_extend_ref);
        let yes_fa = dispatchable_fungible_asset::withdraw(&yes_pool_signer, market.yes_pool, yes_amount);
        let no_fa = dispatchable_fungible_asset::withdraw(&no_pool_signer, market.no_pool, no_amount);
        fungible_asset::merge(&mut yes_fa, no_fa);

        dispatchable_fungible_asset::deposit(primary_fungible_store::primary_store(provider_addr, market.asset_metadata), yes_fa);

        if (new_tokens == 0) {
            table::remove(&mut amm_pool.lp_providers, provider_addr);
        };

        // Record the trade
        record_trade(
            market,
            provider_addr,
            TRADE_TYPE_REMOVE_LIQUIDITY,
            option::none(),
            total_amount,
            option::none(),
            yes_price_before,
            no_price_before
        );
    }

    // View functions
    #[view]
    public fun get_market_details(market_id: u64): (
        u64, String, String, String, u64, u64, u64, u64, bool, Option<u8>, 
        address, address, u64, u64, u64, u64, u64, u64, u64
    ) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_price = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
        let no_price = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);
        let total_value_locked = fungible_asset::balance(market.yes_pool) + fungible_asset::balance(market.no_pool);

        (
            market.id, market.title, market.description, market.resolution_criteria, market.end_time,
            fungible_asset::balance(market.yes_pool), fungible_asset::balance(market.no_pool),
            market.amm_pool.total_lp_tokens, market.resolved, market.outcome,
            market.oracle, market.creator, market.total_yes_shares, market.total_no_shares,
            market.participant_count, yes_price, no_price, market.creation_time, total_value_locked
        )
    }

    #[view]
    public fun get_market_pool_state(market_id: u64): (u64, u64, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_price = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
        let no_price = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);

        (
            market.amm_pool.yes_reserve,
            market.amm_pool.no_reserve,
            market.amm_pool.total_lp_tokens,
            yes_price,
            no_price
        )
    }

    #[view]
    public fun get_user_lp_balance(market_id: u64, user: address): u64 acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        if (table::contains(&market.amm_pool.lp_providers, user)) {
            *table::borrow(&market.amm_pool.lp_providers, user)
        } else {
            0
        }
    }

    #[view]
    public fun calculate_trade_output(
        market_id: u64,
        outcome: u8,
        amount_in: u64,
        is_buy: bool
    ): (u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let amm_pool = &market.amm_pool;
        let current_price = calculate_outcome_price(
            amm_pool.yes_reserve,
            amm_pool.no_reserve,
            outcome
        );

        if (is_buy) {
            let (effective_shares, outcome_reserve) = if (outcome == 1) {
                (market.total_yes_shares + amm_pool.virtual_yes, amm_pool.yes_reserve)
            } else {
                (market.total_no_shares + amm_pool.virtual_no, amm_pool.no_reserve)
            };
            let shares = if (outcome_reserve == 0) {
                amount_in
            } else {
                (amount_in * effective_shares) / outcome_reserve
            };

            let new_yes_reserve = if (outcome == 1) {
                amm_pool.yes_reserve + amount_in
            } else {
                amm_pool.yes_reserve
            };
            let new_no_reserve = if (outcome == 2) {
                amm_pool.no_reserve + amount_in
            } else {
                amm_pool.no_reserve
            };

            let new_price = calculate_outcome_price(new_yes_reserve, new_no_reserve, outcome);
            let price_impact = if (new_price > current_price) {
                new_price - current_price
            } else {
                current_price - new_price
            };

            (shares, new_price, price_impact)
        } else {
            let (total_shares, virtual_s, outcome_reserve) = if (outcome == 1) {
                (market.total_yes_shares, amm_pool.virtual_yes, amm_pool.yes_reserve)
            } else {
                (market.total_no_shares, amm_pool.virtual_no, amm_pool.no_reserve)
            };
            let denom = total_shares + virtual_s;
            let amount_out = if (denom == 0) {
                0
            } else {
                (amount_in * outcome_reserve) / denom
            };

            let effective_price = if (amount_in > 0) {
                (amount_out * PRICE_PRECISION) / amount_in
            } else {
                0
            };

            (amount_out, effective_price, 0)
        }
    }

    // NEW ANALYTICS AND TRADE HISTORY VIEW FUNCTIONS

    #[view]
    public fun get_market_analytics(market_id: u64): (u64, u64, u64, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);
        let analytics = &market.analytics;

        (
            analytics.total_volume,
            analytics.total_trades,
            analytics.yes_volume,
            analytics.no_volume,
            analytics.liquidity_volume,
            analytics.unique_trader_count
        )
    }

    #[view]
    public fun get_trade_history(market_id: u64, offset: u64, limit: u64): vector<TradeRecord> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let trades = vector::empty<TradeRecord>();
        let trade_id = if (offset >= market.next_trade_id) {
            return trades
        } else {
            market.next_trade_id - 1 - offset
        };
        let count = 0;

        while (count < limit && trade_id < market.next_trade_id) {
            if (table::contains(&market.trade_history, trade_id)) {
                let trade = *table::borrow(&market.trade_history, trade_id);
                vector::push_back(&mut trades, trade);
                count = count + 1;
            };
            if (trade_id == 0) break;
            trade_id = trade_id - 1;
        };

        trades
    }

    #[view]
    public fun get_price_history(market_id: u64): vector<TradeRecord> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        market.analytics.price_history
    }

    #[view]
    public fun get_daily_volume(market_id: u64, day_timestamp: u64): u64 acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let day_ts = get_day_timestamp(day_timestamp);
        if (table::contains(&market.analytics.daily_volume, day_ts)) {
            *table::borrow(&market.analytics.daily_volume, day_ts)
        } else {
            0
        }
    }

    #[view]
    public fun get_hourly_volume(market_id: u64, hour_timestamp: u64): u64 acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let hour_ts = get_hour_timestamp(hour_timestamp);
        if (table::contains(&market.analytics.hourly_volume, hour_ts)) {
            *table::borrow(&market.analytics.hourly_volume, hour_ts)
        } else {
            0
        }
    }

    #[view]
    public fun get_trade_by_id(market_id: u64, trade_id: u64): TradeRecord acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);
        assert!(table::contains(&market.trade_history, trade_id), error::not_found(E_POSITION_NOT_FOUND));

        *table::borrow(&market.trade_history, trade_id)
    }

    #[view]
    public fun get_user_trade_history(market_id: u64, user: address, limit: u64): vector<TradeRecord> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let user_trades = vector::empty<TradeRecord>();
        let trade_id = if (market.next_trade_id == 0) {
            return user_trades
        } else {
            market.next_trade_id - 1
        };
        let count = 0;

        while (count < limit && trade_id < market.next_trade_id) {
            if (table::contains(&market.trade_history, trade_id)) {
                let trade = table::borrow(&market.trade_history, trade_id);
                if (trade.user == user) {
                    vector::push_back(&mut user_trades, *trade);
                    count = count + 1;
                };
            };
            if (trade_id == 0) break;
            trade_id = trade_id - 1;
        };

        user_trades
    }

    #[view]
    public fun get_volume_by_time_range(
        market_id: u64, 
        start_time: u64, 
        end_time: u64
    ): (u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let volume = 0;
        let trade_count = 0;
        let trade_id = 0;

        while (trade_id < market.next_trade_id) {
            if (table::contains(&market.trade_history, trade_id)) {
                let trade = table::borrow(&market.trade_history, trade_id);
                if (trade.timestamp >= start_time && trade.timestamp <= end_time) {
                    volume = volume + trade.amount;
                    trade_count = trade_count + 1;
                };
            };
            trade_id = trade_id + 1;
        };

        (volume, trade_count)
    }

    #[view]
    public fun get_market_ohlc_data(
        market_id: u64,
        outcome: u8,
        time_interval: u64, // in seconds (e.g., 3600 for hourly, 86400 for daily)
        periods: u64
    ): vector<OHLCData> acquires MarketStore {
        // Returns vector of OHLCData structs
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let ohlc_data = vector::empty<OHLCData>();
        let current_time = timestamp::now_seconds();
        let period_count = 0;

        while (period_count < periods) {
            let period_start = current_time - (period_count + 1) * time_interval;
            let period_end = current_time - period_count * time_interval;
            
            let period_trades = vector::empty<TradeRecord>();
            let trade_id = 0;
            
            // Collect trades in this period
            while (trade_id < market.next_trade_id) {
                if (table::contains(&market.trade_history, trade_id)) {
                    let trade = table::borrow(&market.trade_history, trade_id);
                    if (trade.timestamp >= period_start && trade.timestamp < period_end) {
                        // Only include trades that affect the specific outcome price
                        if (option::is_some(&trade.outcome)) {
                            let trade_outcome = *option::borrow(&trade.outcome);
                            if (trade_outcome == outcome) {
                                vector::push_back(&mut period_trades, *trade);
                            };
                        } else {
                            // Include liquidity operations as they affect all prices
                            vector::push_back(&mut period_trades, *trade);
                        };
                    };
                };
                trade_id = trade_id + 1;
            };

            // Calculate OHLC from trades
            if (!vector::is_empty(&period_trades)) {
                let open_price = if (outcome == 1) {
                    vector::borrow(&period_trades, 0).yes_price_before
                } else {
                    vector::borrow(&period_trades, 0).no_price_before
                };
                
                let mut_high = open_price;
                let mut_low = open_price;
                let mut_volume = 0;
                let i = 0;
                
                while (i < vector::length(&period_trades)) {
                    let trade = vector::borrow(&period_trades, i);
                    let price_after = if (outcome == 1) {
                        trade.yes_price_after
                    } else {
                        trade.no_price_after
                    };
                    
                    if (price_after > mut_high) mut_high = price_after;
                    if (price_after < mut_low) mut_low = price_after;
                    mut_volume = mut_volume + trade.amount;
                    i = i + 1;
                };
                
                let close_price = if (outcome == 1) {
                    vector::borrow(&period_trades, vector::length(&period_trades) - 1).yes_price_after
                } else {
                    vector::borrow(&period_trades, vector::length(&period_trades) - 1).no_price_after
                };
                
                vector::push_back(&mut ohlc_data, OHLCData {
                    timestamp: period_start,
                    open: open_price,
                    high: mut_high,
                    low: mut_low,
                    close: close_price,
                    volume: mut_volume
                });
            } else {
                // No trades in this period, use previous close or current market price
                let current_price = calculate_outcome_price(
                    market.amm_pool.yes_reserve,
                    market.amm_pool.no_reserve,
                    outcome
                );
                vector::push_back(&mut ohlc_data, OHLCData {
                    timestamp: period_start,
                    open: current_price,
                    high: current_price,
                    low: current_price,
                    close: current_price,
                    volume: 0
                });
            };
            
            period_count = period_count + 1;
        };

        // Reverse to get chronological order (oldest first)
        vector::reverse(&mut ohlc_data);
        ohlc_data
    }

    // Existing view functions continue...

    #[view]
    public fun get_all_market_ids(): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        let market_ids = vector::empty<u64>();
        let market_id = 0;
        
        while (market_id < store.next_id) {
            if (table::contains(&store.markets, market_id)) {
                vector::push_back(&mut market_ids, market_id);
            };
            market_id = market_id + 1;
        };
        
        market_ids
    }

    #[view]
    public fun get_markets_paginated(offset: u64, limit: u64): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        let market_ids = vector::empty<u64>();
        let market_id = 0;
        let count = 0;
        let added = 0;
        
        while (market_id < store.next_id && added < limit) {
            if (table::contains(&store.markets, market_id)) {
                if (count >= offset) {
                    vector::push_back(&mut market_ids, market_id);
                    added = added + 1;
                };
                count = count + 1;
            };
            market_id = market_id + 1;
        };
        
        market_ids
    }

    #[view]
    public fun get_market_summary(market_id: u64): (
        u64, String, String, u64, bool, u64, u64, u64, u64, u64
    ) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_price = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 1);
        let no_price = calculate_outcome_price(market.amm_pool.yes_reserve, market.amm_pool.no_reserve, 2);
        let total_value_locked = fungible_asset::balance(market.yes_pool) + fungible_asset::balance(market.no_pool);
        let total_volume = market.analytics.total_volume;

        (
            market.id,
            market.title,
            market.description,
            market.end_time,
            market.resolved,
            yes_price,
            no_price,
            total_value_locked,
            market.participant_count,
            total_volume
        )
    }

    #[view]
    public fun get_market_count(): u64 acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        store.next_id
    }

    #[view]
    public fun get_user_positions(market_id: u64, user: address): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        if (table::contains(&market.user_positions, user)) {
            *table::borrow(&market.user_positions, user)
        } else {
            vector::empty<u64>()
        }
    }

    #[view]
    public fun get_position(market_id: u64, position_id: u64): (address, u8, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);
        assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));
        
        let position = table::borrow(&market.positions, position_id);
        (position.user, position.outcome, position.shares, position.avg_price, position.timestamp)
    }

    #[view]
    public fun get_platform_stats(): (u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        let total_markets = 0;
        let total_tvl = 0;
        let active_markets = 0;
        let market_id = 0;
        let current_time = timestamp::now_seconds();
        
        while (market_id < store.next_id) {
            if (table::contains(&store.markets, market_id)) {
                let market = table::borrow(&store.markets, market_id);
                total_markets = total_markets + 1;
                
                let market_tvl = fungible_asset::balance(market.yes_pool) + fungible_asset::balance(market.no_pool);
                total_tvl = total_tvl + market_tvl;
                
                if (!market.resolved && current_time < market.end_time) {
                    active_markets = active_markets + 1;
                };
            };
            market_id = market_id + 1;
        };
        
        (total_markets, total_tvl, active_markets)
    }

    // Admin function to update platform parameters
    public entry fun update_platform_params(
        admin: &signer,
        platform_fee_rate: u64,
        market_creation_fee: u64,
        min_initial_liquidity: u64,
        min_market_duration: u64
    ) acquires MarketStore {
        let admin_addr = signer::address_of(admin);
        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(admin_addr == store.admin, error::permission_denied(E_NOT_ADMIN));

        store.platform_fee_rate = platform_fee_rate;
        store.market_creation_fee = market_creation_fee;
        store.min_initial_liquidity = min_initial_liquidity;
        store.min_market_duration = min_market_duration;
    }

    #[view]
    public fun get_platform_params(): (u64, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        (
            store.platform_fee_rate,
            store.market_creation_fee,
            store.min_initial_liquidity,
            store.min_market_duration
        )
    }

    #[view]
    public fun get_asset_metadata(): Object<Metadata> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        store.asset_metadata
    }

    // Additional utility functions for advanced analytics

    #[view]
    public fun get_market_depth(market_id: u64, outcome: u8): (u64, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        // Store reserves before calling calculate_trade_output
        let reserves = if (outcome == 1) {
            market.amm_pool.yes_reserve
        } else {
            market.amm_pool.no_reserve
        };

        // Simulate small trades to get bid/ask prices
        let small_trade = 1000; // 0.01 USDC equivalent
        
        let (_, bid_price, _) = calculate_trade_output(market_id, outcome, small_trade, false);
        let (_, ask_price, _) = calculate_trade_output(market_id, outcome, small_trade, true);
        
        (reserves, reserves, bid_price, ask_price)
    }

    #[view]
    public fun get_latest_trades(market_id: u64, limit: u64): vector<TradeRecord> acquires MarketStore {
        // Get most recent trades for real-time feed
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let latest_trades = vector::empty<TradeRecord>();
        if (market.next_trade_id == 0) return latest_trades;
        
        let trade_id = market.next_trade_id - 1;
        let count = 0;

        while (count < limit && trade_id < market.next_trade_id) {
            if (table::contains(&market.trade_history, trade_id)) {
                let trade = *table::borrow(&market.trade_history, trade_id);
                vector::push_back(&mut latest_trades, trade);
                count = count + 1;
            };
            if (trade_id == 0) break;
            trade_id = trade_id - 1;
        };

        latest_trades
    }

    #[view]
    public fun get_price_at_timestamp(market_id: u64, outcome: u8, target_timestamp: u64): u64 acquires MarketStore {
        // Get the price of an outcome at a specific timestamp (useful for historical analysis)
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let trade_id = 0;
        let last_valid_price = PRICE_PRECISION / 2; // Default to 50%

        while (trade_id < market.next_trade_id) {
            if (table::contains(&market.trade_history, trade_id)) {
                let trade = table::borrow(&market.trade_history, trade_id);
                if (trade.timestamp <= target_timestamp) {
                    last_valid_price = if (outcome == 1) {
                        trade.yes_price_after
                    } else {
                        trade.no_price_after
                    };
                } else {
                    break;
                };
            };
            trade_id = trade_id + 1;
        };

        last_valid_price
    }

    #[view]
    public fun get_volume_weighted_average_price(
        market_id: u64,
        outcome: u8,
        time_period: u64
    ): u64 acquires MarketStore {
        // Calculate VWAP for a specific outcome over a time period
        let store = borrow_global<MarketStore>(@pivot_markets);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let current_time = timestamp::now_seconds();
        let start_time = current_time - time_period;
        
        let total_volume = 0;
        let weighted_price_sum = 0;
        let trade_id = 0;

        while (trade_id < market.next_trade_id) {
            if (table::contains(&market.trade_history, trade_id)) {
                let trade = table::borrow(&market.trade_history, trade_id);
                if (trade.timestamp >= start_time && option::is_some(&trade.outcome)) {
                    let trade_outcome = *option::borrow(&trade.outcome);
                    if (trade_outcome == outcome) {
                        total_volume = total_volume + trade.amount;
                        weighted_price_sum = weighted_price_sum + (trade.price * trade.amount);
                    };
                };
            };
            trade_id = trade_id + 1;
        };

        if (total_volume > 0) {
            weighted_price_sum / total_volume
        } else {
            calculate_outcome_price(
                market.amm_pool.yes_reserve,
                market.amm_pool.no_reserve,
                outcome
            )
        }
    }

    // Admin function to update max price history length
    public entry fun update_max_price_history(
        admin: &signer,
        market_id: u64,
        new_max: u64
    ) acquires MarketStore {
        let admin_addr = signer::address_of(admin);
        let store = borrow_global_mut<MarketStore>(@pivot_markets);
        assert!(admin_addr == store.admin, error::permission_denied(E_NOT_ADMIN));
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        
        let market = table::borrow_mut(&mut store.markets, market_id);
        market.analytics.max_price_history = new_max;
        
        // Trim existing history if needed
        while (vector::length(&market.analytics.price_history) > new_max) {
            vector::remove(&mut market.analytics.price_history, 0);
        };
    }
}