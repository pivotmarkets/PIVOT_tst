module pivot_market_sst::pivot_market_sst {
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use aptos_std::table::{Self, Table};
    use std::signer;
    use std::string::{Self, String};
    use std::error;
    use std::option::{Self, Option};
    use std::vector;

    // Generic stablecoin type - can be instantiated with USDC, USDT, etc.
    struct StableCoin<phantom CoinType> has copy, drop, store {}

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

    // Position represents a user's stake in a particular outcome
    struct Position has store, copy, drop {
        user: address,
        outcome: u8, // 1 for Yes, 2 for No
        shares: u64, // Number of shares owned
        avg_price: u64, // Average price per share (scaled by 10000)
        timestamp: u64,
    }

    struct Market<phantom CoinType> has store {
        id: u64,
        description: String,
        end_time: u64,
        yes_pool: Coin<CoinType>,
        no_pool: Coin<CoinType>,
        liquidity_pool: Coin<CoinType>,
        positions: Table<u64, Position>, // position_id -> Position
        user_positions: Table<address, vector<u64>>, // user -> position_ids
        next_position_id: u64,
        resolved: bool,
        outcome: Option<u8>, // 1 for Yes, 2 for No
        oracle: address,
        total_yes_shares: u64,
        total_no_shares: u64,
        liquidity_providers: Table<address, u64>, // LP -> liquidity amount
        total_liquidity: u64,
        participant_count: u64,
        creation_time: u64,
    }

    struct MarketStore<phantom CoinType> has key {
        admin: address,
        markets: Table<u64, Market<CoinType>>,
        next_id: u64,
        platform_fee_rate: u64, // Basis points (e.g., 50 = 0.5%)
        lp_fee_rate: u64, // Basis points (e.g., 200 = 2%)
    }

    // Initialize the contract
    public entry fun initialize<CoinType>(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @pivot_market_sst, error::permission_denied(E_NOT_ADMIN));
        assert!(!exists<MarketStore<CoinType>>(admin_addr), error::already_exists(E_ALREADY_INITIALIZED));

        move_to(admin, MarketStore<CoinType> {
            admin: admin_addr,
            markets: table::new(),
            next_id: 0,
            platform_fee_rate: 50, // 0.5%
            lp_fee_rate: 200, // 2%
        });

        // Ensure the account can receive the stablecoin
        if (!coin::is_account_registered<CoinType>(admin_addr)) {
            account::create_account_if_does_not_exist(admin_addr);
            coin::register<CoinType>(admin);
        }
    }

    // Create a new market
    public entry fun create_market<CoinType>(
        admin: &signer,
        description: String,
        end_time: u64,
        oracle: address,
        initial_liquidity: u64
    ) acquires MarketStore {
        let admin_addr = signer::address_of(admin);
        let store = borrow_global_mut<MarketStore<CoinType>>(@pivot_market_sst);
        assert!(admin_addr == store.admin, error::permission_denied(E_NOT_ADMIN));

        let id = store.next_id;
        store.next_id = id + 1;

        let liquidity_coin = coin::withdraw<CoinType>(admin, initial_liquidity);
        
        let market = Market<CoinType> {
            id,
            description,
            end_time,
            yes_pool: coin::zero<CoinType>(),
            no_pool: coin::zero<CoinType>(),
            liquidity_pool: liquidity_coin,
            positions: table::new(),
            user_positions: table::new(),
            next_position_id: 0,
            resolved: false,
            outcome: option::none(),
            oracle,
            total_yes_shares: 0,
            total_no_shares: 0,
            liquidity_providers: table::new(),
            total_liquidity: initial_liquidity,
            participant_count: 0,
            creation_time: timestamp::now_seconds(),
        };

        // Track admin as initial liquidity provider
        table::add(&mut market.liquidity_providers, admin_addr, initial_liquidity);
        table::add(&mut store.markets, id, market);
    }

    // Add liquidity to a market
    public entry fun add_liquidity<CoinType>(
        provider: &signer,
        market_id: u64,
        amount: u64
    ) acquires MarketStore {
        assert!(amount > 0, error::invalid_argument(E_INVALID_BET_AMOUNT));

        let store = borrow_global_mut<MarketStore<CoinType>>(@pivot_market_sst);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));

        let coins = coin::withdraw<CoinType>(provider, amount);
        coin::merge(&mut market.liquidity_pool, coins);
        
        let provider_addr = signer::address_of(provider);
        if (!table::contains(&market.liquidity_providers, provider_addr)) {
            table::add(&mut market.liquidity_providers, provider_addr, 0);
        };
        let provider_liquidity = table::borrow_mut(&mut market.liquidity_providers, provider_addr);
        *provider_liquidity = *provider_liquidity + amount;
        
        market.total_liquidity = market.total_liquidity + amount;
    }

    // Calculate current price for an outcome based on AMM formula
    fun calculate_price<CoinType>(market: &Market<CoinType>, outcome: u8): u64 {
        let total_shares = market.total_yes_shares + market.total_no_shares;
        if (total_shares == 0) {
            return 5000; // 50% initial price (scaled by 10000)
        };

        let outcome_shares = if (outcome == 1) market.total_yes_shares else market.total_no_shares;
        // Price = (outcome_shares / total_shares) * 10000
        if (total_shares == 0) {
            5000
        } else {
            ((outcome_shares * 10000) / total_shares)
        }
    }

    // Buy position in a market
    public entry fun buy_position<CoinType>(
        user: &signer,
        market_id: u64,
        outcome: u8,
        amount: u64,
        max_slippage: u64 // Basis points
    ) acquires MarketStore {
        assert!(amount > 0, error::invalid_argument(E_INVALID_BET_AMOUNT));

        let store = borrow_global_mut<MarketStore<CoinType>>(@pivot_market_sst);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
        assert!(timestamp::now_seconds() < market.end_time, error::invalid_state(E_MARKET_ENDED));
        assert!(outcome == 1 || outcome == 2, error::invalid_argument(E_INVALID_OUTCOME));

        let current_price = calculate_price(market, outcome);
        let shares = (amount * 10000) / current_price;
        
        // Check slippage
        let new_total_shares = market.total_yes_shares + market.total_no_shares + shares;
        let new_outcome_shares = if (outcome == 1) market.total_yes_shares + shares else market.total_no_shares + shares;
        let new_price = (new_outcome_shares * 10000) / new_total_shares;
        let price_impact = if (new_price > current_price) new_price - current_price else current_price - new_price;
        assert!(price_impact <= max_slippage, error::invalid_argument(E_SLIPPAGE_EXCEEDED));

        let coins = coin::withdraw<CoinType>(user, amount);
        let user_addr = signer::address_of(user);

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
            coin::merge(&mut market.yes_pool, coins);
        } else {
            market.total_no_shares = market.total_no_shares + shares;
            coin::merge(&mut market.no_pool, coins);
        };
    }

    // Sell position in the market
public entry fun sell_position<CoinType>(
    user: &signer,
    market_id: u64,
    position_id: u64,
    shares_to_sell: u64,
    min_price: u64 // Minimum acceptable price per share
) acquires MarketStore {
    let store = borrow_global_mut<MarketStore<CoinType>>(@pivot_market_sst);
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
    assert!(coin::value(&market.liquidity_pool) >= payout_amount, error::invalid_state(E_INSUFFICIENT_LIQUIDITY));

    // Update position
    position.shares = position.shares - shares_to_sell;

    // Update share counts
    if (position.outcome == 1) {
        market.total_yes_shares = market.total_yes_shares - shares_to_sell;
    } else {
        market.total_no_shares = market.total_no_shares - shares_to_sell;
    };

    // Pay user from liquidity pool
    let payout_coin = coin::extract(&mut market.liquidity_pool, payout_amount);
    coin::deposit(user_addr, payout_coin);

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

    // Resolve a market
    public entry fun resolve_market<CoinType>(
        resolver: &signer,
        market_id: u64,
        outcome: u8
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore<CoinType>>(@pivot_market_sst);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow_mut(&mut store.markets, market_id);

        let resolver_addr = signer::address_of(resolver);
        assert!(resolver_addr == store.admin || resolver_addr == market.oracle, error::permission_denied(E_NOT_ADMIN));

        assert!(!market.resolved, error::invalid_state(E_MARKET_RESOLVED));
        assert!(timestamp::now_seconds() >= market.end_time, error::invalid_state(E_MARKET_NOT_ENDED));
        assert!(outcome == 1 || outcome == 2, error::invalid_argument(E_INVALID_OUTCOME));

        // Calculate total pot and fees
        let total_pot = coin::value(&market.yes_pool) + coin::value(&market.no_pool) + coin::value(&market.liquidity_pool);
        let platform_fee_amount = (total_pot * store.platform_fee_rate) / 10000;

        // Extract platform fee from liquidity pool
        if (coin::value(&market.liquidity_pool) >= platform_fee_amount) {
            let platform_fee = coin::extract(&mut market.liquidity_pool, platform_fee_amount);
            coin::deposit(store.admin, platform_fee);
        };

        market.outcome = option::some(outcome);
        market.resolved = true;
    }

    // Claim winnings for resolved positions
    public entry fun claim_winnings<CoinType>(
        user: &signer,
        market_id: u64,
        position_id: u64
    ) acquires MarketStore {
        let store = borrow_global_mut<MarketStore<CoinType>>(@pivot_market_sst);
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
            let winning_pool = if (outcome == 1) &mut market.yes_pool else &mut market.no_pool;
            let total_winning_shares = if (outcome == 1) market.total_yes_shares else market.total_no_shares;
            
            if (total_winning_shares > 0) {
                let total_payout = coin::value(winning_pool) + coin::value(&market.liquidity_pool);
                let payout_amount = (position.shares * total_payout) / total_winning_shares;
                
                let payout_coin = if (coin::value(winning_pool) >= payout_amount) {
                    coin::extract(winning_pool, payout_amount)
                } else {
                    let remaining = coin::extract_all(winning_pool);
                    let additional = coin::extract(&mut market.liquidity_pool, payout_amount - coin::value(&remaining));
                    coin::merge(&mut remaining, additional);
                    remaining
                };
                
                coin::deposit(user_addr, payout_coin);
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

    // View function to get comprehensive market details
    #[view]
    public fun get_market_details<CoinType>(market_id: u64): (
        u64, // id
        String, // description
        u64, // end_time
        u64, // yes_pool_value
        u64, // no_pool_value
        u64, // total_liquidity
        bool, // resolved
        Option<u8>, // outcome
        address, // oracle
        u64, // total_yes_shares
        u64, // total_no_shares
        u64, // participant_count
        u64, // yes_price
        u64, // no_price
        u64, // creation_time
        u64 // total_value_locked
    ) acquires MarketStore {
        let store = borrow_global<MarketStore<CoinType>>(@pivot_market_sst);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);

        let yes_price = calculate_price(market, 1);
        let no_price = calculate_price(market, 2);
        let total_value_locked = coin::value(&market.yes_pool) + coin::value(&market.no_pool) + coin::value(&market.liquidity_pool);

        (
            market.id,
            market.description,
            market.end_time,
            coin::value(&market.yes_pool),
            coin::value(&market.no_pool),
            coin::value(&market.liquidity_pool),
            market.resolved,
            market.outcome,
            market.oracle,
            market.total_yes_shares,
            market.total_no_shares,
            market.participant_count,
            yes_price,
            no_price,
            market.creation_time,
            total_value_locked
        )
    }

    // View function to get user positions in a market
    #[view]
    public fun get_user_positions<CoinType>(market_id: u64, user: address): vector<u64> acquires MarketStore {
        let store = borrow_global<MarketStore<CoinType>>(@pivot_market_sst);
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
    public fun get_position<CoinType>(market_id: u64, position_id: u64): (address, u8, u64, u64, u64) acquires MarketStore {
        let store = borrow_global<MarketStore<CoinType>>(@pivot_market_sst);
        assert!(table::contains(&store.markets, market_id), error::not_found(E_MARKET_NOT_FOUND));
        let market = table::borrow(&store.markets, market_id);
        assert!(table::contains(&market.positions, position_id), error::not_found(E_POSITION_NOT_FOUND));
        
        let position = table::borrow(&market.positions, position_id);
        (position.user, position.outcome, position.shares, position.avg_price, position.timestamp)
    }
}