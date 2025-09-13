module pivot_market_tab::pivot_market_tab {
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore};
    use aptos_framework::object::{Self, Object};
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

    // Position represents a user's stake in a particular outcome
    struct Position has store, copy, drop {
        user: address,
        outcome: u8, // 1 for Yes, 2 for No
        shares: u64, // Number of shares owned
        avg_price: u64, // Average price per share (scaled by 10000)
        timestamp: u64,
    }

    struct Market has store {
        id: u64,
        title: String,
        description: String,
        resolution_criteria: String,
        end_time: u64,
        asset_metadata: Object<Metadata>, // The fungible asset being used
        yes_pool: Object<FungibleStore>,
        no_pool: Object<FungibleStore>,
        liquidity_pool: Object<FungibleStore>,
        positions: Table<u64, Position>,
        user_positions: Table<address, vector<u64>>,
        next_position_id: u64,
        resolved: bool,
        outcome: Option<u8>, // 1 for Yes, 2 for No
        oracle: address,
        creator: address, // Track who created the market
        total_yes_shares: u64,
        total_no_shares: u64,
        liquidity_providers: Table<address, u64>, // LP -> liquidity amount
        total_liquidity: u64,
        participant_count: u64,
        creation_time: u64,
    }

    struct MarketStore has key {
        admin: address,
        asset_metadata: Object<Metadata>, // The fungible asset this store uses
        markets: Table<u64, Market>,
        next_id: u64,
        platform_fee_rate: u64, // Basis points (e.g., 50 = 0.5%)
        lp_fee_rate: u64, // Basis points (e.g., 200 = 2%)
        market_creation_fee: u64, // Fee required to create a market
        min_initial_liquidity: u64, // Minimum liquidity required to create market
        min_market_duration: u64, // Minimum duration for a market (in seconds)
    }

    // Initialize the contract with a specific fungible asset
    public entry fun initialize(
        admin: &signer,
        asset_metadata: Object<Metadata>
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @pivot_market_tab, error::permission_denied(E_NOT_ADMIN));
        assert!(!exists<MarketStore>(admin_addr), error::already_exists(E_ALREADY_INITIALIZED));

        // Ensure the admin can receive the fungible asset
        primary_fungible_store::ensure_primary_store_exists(admin_addr, asset_metadata);

        move_to(admin, MarketStore {
            admin: admin_addr,
            asset_metadata,
            markets: table::new(),
            next_id: 0,
            platform_fee_rate: 50, // 0.5%
            lp_fee_rate: 200, // 2%
            market_creation_fee: 10000, // 0.01 tokens (assuming 6 decimals)
            min_initial_liquidity: 2000000, // 0.1 tokens minimum
            min_market_duration: 3600, // 1 hour minimum
        });
    }

    // Create a new market
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
    let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
    
    // Validate market parameters
    let current_time = timestamp::now_seconds();
    assert!(end_time > current_time + store.min_market_duration, error::invalid_argument(E_INVALID_END_TIME));
    assert!(initial_liquidity >= store.min_initial_liquidity, error::invalid_argument(E_INVALID_BET_AMOUNT));

    // Ensure creator can receive and send the fungible asset
    primary_fungible_store::ensure_primary_store_exists(creator_addr, store.asset_metadata);

    // Collect creation fee + initial liquidity from creator
    let total_required = store.market_creation_fee + initial_liquidity;
    let payment = primary_fungible_store::withdraw(creator, store.asset_metadata, total_required);
    
    // Send creation fee to admin
    let creation_fee = fungible_asset::extract(&mut payment, store.market_creation_fee);
    primary_fungible_store::deposit(store.admin, creation_fee);
    
    // Use existing or create primary stores for the pools
    let yes_pool = primary_fungible_store::primary_store(creator_addr, store.asset_metadata);
    let no_pool = primary_fungible_store::primary_store(creator_addr, store.asset_metadata);
    let liquidity_pool = primary_fungible_store::primary_store(creator_addr, store.asset_metadata);
    
    // Deposit initial liquidity to liquidity_pool
    primary_fungible_store::deposit(object::object_address(&liquidity_pool), payment);

    let id = store.next_id;
    store.next_id = id + 1;
    
    let market = Market {
        id,
        title,
        description,
        resolution_criteria,
        end_time,
        asset_metadata: store.asset_metadata,
        yes_pool,
        no_pool,
        liquidity_pool,
        positions: table::new(),
        user_positions: table::new(),
        next_position_id: 0,
        resolved: false,
        outcome: option::none(),
        oracle,
        creator: creator_addr,
        total_yes_shares: 0,
        total_no_shares: 0,
        liquidity_providers: table::new(),
        total_liquidity: initial_liquidity,
        participant_count: 0,
        creation_time: current_time,
    };

    // Track creator as initial liquidity provider
    table::add(&mut market.liquidity_providers, creator_addr, initial_liquidity);
    table::add(&mut store.markets, id, market);
}
    // Admin function to update market creation parameters
    public entry fun update_market_creation_params(
        admin: &signer,
        market_creation_fee: u64,
        min_initial_liquidity: u64,
        min_market_duration: u64
    ) acquires MarketStore {
        let admin_addr = signer::address_of(admin);
        let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
        assert!(admin_addr == store.admin, error::permission_denied(E_NOT_ADMIN));

        store.market_creation_fee = market_creation_fee;
        store.min_initial_liquidity = min_initial_liquidity;
        store.min_market_duration = min_market_duration;
    }

    // Add liquidity to a market
    public entry fun add_liquidity(
        provider: &signer,
        market_id: u64,
        amount: u64
    ) acquires MarketStore {
        assert!(amount > 0, error::invalid_argument(E_INVALID_BET_AMOUNT));

        let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));

        let fa = primary_fungible_store::withdraw(provider, market.asset_metadata, amount);
        primary_fungible_store::deposit(object::object_address(&market.liquidity_pool), fa);
        
        let provider_addr = signer::address_of(provider);
        if (!table::contains(&market.liquidity_providers, provider_addr)) {
            table::add(&mut market.liquidity_providers, provider_addr, 0);
        };
        let provider_liquidity = table::borrow_mut(&mut market.liquidity_providers, provider_addr);
        *provider_liquidity = *provider_liquidity + amount;
        
        market.total_liquidity = market.total_liquidity + amount;
    }

    // FIXED: Calculate current price for an outcome based on AMM formula
    fun calculate_price(market: &Market, outcome: u8): u64 {
        let total_shares = market.total_yes_shares + market.total_no_shares;
        
        // If no shares exist, return 50% price for both outcomes
        if (total_shares == 0) {
            return 5000; // 50% initial price (scaled by 10000)
        };

        let outcome_shares = if (outcome == 1) market.total_yes_shares else market.total_no_shares;
        let price = (outcome_shares * 10000) / total_shares;
        
        // Ensure price is never exactly 0 or 10000 to prevent division by zero
        if (price == 0) {
            100 // Minimum 1% (100 basis points)
        } else if (price >= 10000) {
            9900 // Maximum 99% (9900 basis points)
        } else {
            price
        }
    }

    // FIXED: Buy position in a market with proper safety checks
    public entry fun buy_position(
        user: &signer,
        market_id: u64,
        outcome: u8,
        amount: u64,
        max_slippage: u64 // Basis points
    ) acquires MarketStore {
        assert!(amount > 0, error::invalid_argument(E_INVALID_BET_AMOUNT));

        let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
        assert!(timestamp::now_seconds() < market.end_time, error::invalid_state(E_MARKET_ENDED));
        assert!(outcome == 1 || outcome == 2, error::invalid_argument(E_INVALID_OUTCOME));

        let current_price = calculate_price(market, outcome);
        assert!(current_price > 0, error::invalid_state(E_ZERO_PRICE));
        
        let shares = (amount * 10000) / current_price;
        assert!(shares > 0, error::invalid_argument(E_ZERO_SHARES));
        
        // Check slippage with safety for division by zero
        let new_total_shares = market.total_yes_shares + market.total_no_shares + shares;
        assert!(new_total_shares > 0, error::invalid_state(E_ZERO_TOTAL_SHARES));
        
        let new_outcome_shares = if (outcome == 1) market.total_yes_shares + shares else market.total_no_shares + shares;
        let new_price = (new_outcome_shares * 10000) / new_total_shares;
        let price_impact = if (new_price > current_price) new_price - current_price else current_price - new_price;
        assert!(price_impact <= max_slippage, error::invalid_argument(E_SLIPPAGE_EXCEEDED));

        let fa = primary_fungible_store::withdraw(user, market.asset_metadata, amount);
        let user_addr = signer::address_of(user);

        // Deposit to appropriate pool
        if (outcome == 1) {
            primary_fungible_store::deposit(object::object_address(&market.yes_pool), fa);
        } else {
            primary_fungible_store::deposit(object::object_address(&market.no_pool), fa);
        };

        // Create position
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

        // Track user positions
        if (!table::contains(&market.user_positions, user_addr)) {
            table::add(&mut market.user_positions, user_addr, vector::empty<u64>());
            market.participant_count = market.participant_count + 1;
        };
        let user_position_ids = table::borrow_mut(&mut market.user_positions, user_addr);
        vector::push_back(user_position_ids, position_id);

        // Update share counts
        if (outcome == 1) {
            market.total_yes_shares = market.total_yes_shares + shares;
        } else {
            market.total_no_shares = market.total_no_shares + shares;
        };
    }

    // Sell position in the market
    public entry fun sell_position(
        user: &signer,
        market_id: u64,
        position_id: u64,
        shares_to_sell: u64,
        min_price: u64 // Minimum acceptable price per share
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
        assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));

        // First, get the position outcome and calculate price BEFORE borrowing mutably
        let position_outcome;
        {
            let position_preview = table::borrow(&market.positions, position_id);
            position_outcome = position_preview.outcome;
        };
        
        let current_price = calculate_price(market, position_outcome);
        assert!(current_price >= min_price, error::invalid_argument(E_INVALID_PRICE));

        // Now borrow the position mutably for modification
        let position = table::borrow_mut(&mut market.positions, position_id);
        let user_addr = signer::address_of(user);
        assert!(position.user == user_addr, error::permission_denied(E_NOT_ADMIN));
        assert!(position.shares >= shares_to_sell, error::invalid_argument(E_INSUFFICIENT_LIQUIDITY));

        let payout_amount = (shares_to_sell * current_price) / 10000;
        
        // Check if liquidity pool has enough funds
        assert!(primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata) >= payout_amount, error::invalid_state(E_INSUFFICIENT_LIQUIDITY));

        // Update position
        position.shares = position.shares - shares_to_sell;

        // Update share counts
        if (position.outcome == 1) {
            market.total_yes_shares = market.total_yes_shares - shares_to_sell;
        } else {
            market.total_no_shares = market.total_no_shares - shares_to_sell;
        };

        // Pay user from liquidity pool
        let payout_fa = primary_fungible_store::withdraw(user, market.liquidity_pool, payout_amount);
        primary_fungible_store::deposit(user_addr, payout_fa);

        // Remove position if no shares left
        if (position.shares == 0) {
            table::remove(&mut market.positions, position_id);
            let user_position_ids = table::borrow_mut(&mut market.user_positions, user_addr);
            let (found, index) = vector::index_of(user_position_ids, &position_id);
            if (found) {
                vector::remove(user_position_ids, index);
            };
        };
    }

    // Resolve a market - can be called by admin, oracle, or market creator
    public entry fun resolve_market(
        resolver: &signer,
        market_id: u64,
        outcome: u8
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
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

        // Calculate total pot and fees
        let total_pot = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata) + 
                        primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata) + 
                        primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);
        let platform_fee_amount = (total_pot * store.platform_fee_rate) / 10000;

        // Extract platform fee from liquidity pool
        if (primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata) >= platform_fee_amount) {
            let platform_fee = primary_fungible_store::withdraw(resolver, market.liquidity_pool, platform_fee_amount);
            primary_fungible_store::deposit(store.admin, platform_fee);
        };

        market.outcome = option::some(outcome);
        market.resolved = true;
    }

    // Claim winnings for resolved positions
    public entry fun claim_winnings(
        user: &signer,
        market_id: u64,
        position_id: u64
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(market.resolved, error::invalid_state(E_MARKET_NOT_RESOLVED));
        assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));

        let position = table::remove(&mut market.positions, position_id);
        let user_addr = signer::address_of(user);
        assert!(position.user == user_addr, error::permission_denied(E_NOT_ADMIN));

        let outcome = *option::borrow(&market.outcome);
        
        if (position.outcome == outcome) {
            // Calculate winnings based on shares owned
            let winning_pool = if (outcome == 1) market.yes_pool else market.no_pool;
            let total_winning_shares = if (outcome == 1) market.total_yes_shares else market.total_no_shares;
            
            if (total_winning_shares > 0) {
                let total_payout = primary_fungible_store::balance(object::object_address(&winning_pool), market.asset_metadata) + 
                                   primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);
                let payout_amount = (position.shares * total_payout) / total_winning_shares;
                
                let payout_fa = if (primary_fungible_store::balance(object::object_address(&winning_pool), market.asset_metadata) >= payout_amount) {
                    primary_fungible_store::withdraw(user, winning_pool, payout_amount)
                } else {
                    let remaining_amount = primary_fungible_store::balance(object::object_address(&winning_pool), market.asset_metadata);
                    let remaining = primary_fungible_store::withdraw(user, winning_pool, remaining_amount);
                    let additional_amount = payout_amount - remaining_amount;
                    let additional = primary_fungible_store::withdraw(user, market.liquidity_pool, additional_amount);
                    fungible_asset::merge(&mut remaining, additional);
                    remaining
                };
                
                primary_fungible_store::deposit(user_addr, payout_fa);
            }
        };

        // Remove position from user's position list
        if (table::contains(&market.user_positions, user_addr)) {
            let user_position_ids = table::borrow_mut(&mut market.user_positions, user_addr);
            let (found, index) = vector::index_of(user_position_ids, &position_id);
            if (found) {
                vector::remove(user_position_ids, index);
            };
        };
    }

    // View function to get the asset metadata being used
    #[view]
    public fun get_asset_metadata(): Object<Metadata> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        store.asset_metadata
    }

    // View function to get market creation parameters
    #[view]
    public fun get_market_creation_params(): (u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        (store.market_creation_fee, store.min_initial_liquidity, store.min_market_duration)
    }

    // View function to get comprehensive market details
    #[view]
    public fun get_market_details(market_id: u64): (
        u64, // id
        String, // title
        String, // description
        String, // resolution_criteria
        u64, // end_time
        u64, // yes_pool_value
        u64, // no_pool_value
        u64, // total_liquidity
        bool, // resolved
        Option<u8>, // outcome
        address, // oracle
        address, // creator
        u64, // total_yes_shares
        u64, // total_no_shares
        u64, // participant_count
        u64, // yes_price
        u64, // no_price
        u64, // creation_time
        u64 // total_value_locked
    ) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_price = calculate_price(market, 1);
        let no_price = calculate_price(market, 2);
        let total_value_locked = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata) + 
                                 primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata) + 
                                 primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);

        (
            market.id,
            market.title,
            market.description,
            market.resolution_criteria,
            market.end_time,
            primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata),
            primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata),
            primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata),
            market.resolved,
            market.outcome,
            market.oracle,
            market.creator,
            market.total_yes_shares,
            market.total_no_shares,
            market.participant_count,
            yes_price,
            no_price,
            market.creation_time,
            total_value_locked
        )
    }

    // Get all market IDs that exist
    #[view]
    public fun get_all_market_ids(): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
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

    // Get markets in a paginated way - returns market IDs for a specific range
    #[view]
    public fun get_markets_paginated(offset: u64, limit: u64): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
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

    // Get basic market info for listing (lighter version)
    #[view]
    public fun get_market_summary(market_id: u64): (
        u64, // id
        String, // title
        String, // description
        u64, // end_time
        bool, // resolved
        u64, // yes_price
        u64, // no_price
        u64, // total_value_locked
        u64 // participant_count
    ) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_price = calculate_price(market, 1);
        let no_price = calculate_price(market, 2);
        let total_value_locked = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata) + 
                                 primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata) + 
                                 primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);

        (
            market.id,
            market.title,
            market.description,
            market.end_time,
            market.resolved,
            yes_price,
            no_price,
            total_value_locked,
            market.participant_count
        )
    }

    // Additional view function to get market count for easier pagination
    #[view]
    public fun get_market_count(): u64 acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        store.next_id
    }

    // View function to get user positions in a market
    #[view]
    public fun get_user_positions(market_id: u64, user: address): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        if (table::contains(&market.user_positions, user)) {
            *table::borrow(&market.user_positions, user)
        } else {
            vector::empty<u64>()
        }
    }

    // View function to get position details
    #[view]
    public fun get_position(market_id: u64, position_id: u64): (address, u8, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);
        assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));
        
        let position = table::borrow(&market.positions, position_id);
        (position.user, position.outcome, position.shares, position.avg_price, position.timestamp)
    }

    // Dedicated view function to get total value locked in a specific market
    #[view]
    public fun get_market_total_value_locked(market_id: u64): u64 acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_pool_balance = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata);
        let no_pool_balance = primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata);
        let liquidity_pool_balance = primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);

        yes_pool_balance + no_pool_balance + liquidity_pool_balance
    }

    // View function to get detailed pool balances for a market
    #[view]
    public fun get_market_pool_balances(market_id: u64): (u64, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_pool_balance = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata);
        let no_pool_balance = primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata);
        let liquidity_pool_balance = primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);
        let total_value_locked = yes_pool_balance + no_pool_balance + liquidity_pool_balance;

        (yes_pool_balance, no_pool_balance, liquidity_pool_balance, total_value_locked)
    }

    // View function to get all markets with their total values (for overview/dashboard)
    #[view]
    public fun get_all_markets_with_tvl(): (vector<u64>, vector<u64>) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        let market_ids = vector::empty<u64>();
        let tvl_values = vector::empty<u64>();
        let market_id = 0;
        
        while (market_id < store.next_id) {
            if (table::contains(&store.markets, market_id)) {
                let market = table::borrow(&store.markets, market_id);
                let total_value_locked = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata) + 
                                         primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata) + 
                                         primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);
                
                vector::push_back(&mut market_ids, market_id);
                vector::push_back(&mut tvl_values, total_value_locked);
            };
            market_id = market_id + 1;
        };
        
        (market_ids, tvl_values)
    }

    // View function to get platform-wide statistics
    #[view]
    public fun get_platform_stats(): (u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore>(@pivot_market_tab);
        let total_markets = 0;
        let total_tvl = 0;
        let active_markets = 0;
        let market_id = 0;
        let current_time = timestamp::now_seconds();
        
        while (market_id < store.next_id) {
            if (table::contains(&store.markets, market_id)) {
                let market = table::borrow(&store.markets, market_id);
                total_markets = total_markets + 1;
                
                let market_tvl = primary_fungible_store::balance(object::object_address(&market.yes_pool), market.asset_metadata) + 
                                 primary_fungible_store::balance(object::object_address(&market.no_pool), market.asset_metadata) + 
                                 primary_fungible_store::balance(object::object_address(&market.liquidity_pool), market.asset_metadata);
                total_tvl = total_tvl + market_tvl;
                
                // Count active markets (not resolved and not ended)
                if (!market.resolved && current_time < market.end_time) {
                    active_markets = active_markets + 1;
                };
            };
            market_id = market_id + 1;
        };
        
        (total_markets, total_tvl, active_markets)
    }
}