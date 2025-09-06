module pivot_markets::pivot_markets_tests {
    use aptos_framework::coin::{Self, Coin, MintCapability, BurnCapability};
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use aptos_std::table;
    use std::signer;
    use std::string::{Self, String};
    use std::option;
    use std::vector;
    use pivot_markets::pivot_markets;

    // Test coin for simulation
    struct TestCoin has key {}

    // Error codes from pivot_markets
    const E_NOT_ADMIN: u64 = 0;
    const E_MARKET_ENDED: u64 = 1;
    const E_MARKET_NOT_ENDED: u64 = 2;
    const E_MARKET_RESOLVED: u64 = 3;
    const E_MARKET_NOT_RESOLVED: u64 = 4;
    const E_INVALID_OUTCOME: u64 = 5;
    const E_INVALID_BET_AMOUNT: u64 = 7;
    const E_MARKET_NOT_FOUND: u64 = 8;
    const E_ALREADY_INITIALIZED: u64 = 9;
    const E_POSITION_NOT_FOUND: u64 = 10;
    const E_INSUFFICIENT_LIQUIDITY: u64 = 11;
    const E_INVALID_PRICE: u64 = 12;
    const E_SLIPPAGE_EXCEEDED: u64 = 13;

    // Setup function to initialize test environment
    fun setup(aptos: &signer, admin: &signer, user1: &signer, user2: &signer, oracle: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<TestCoin>(
            aptos,
            string::utf8(b"Test Coin"),
            string::utf8(b"TST"),
            8,
            true
        );

        // Mint coins to admin, user1, and user2
        account::create_account_for_test(signer::address_of(admin));
        account::create_account_for_test(signer::address_of(user1));
        account::create_account_for_test(signer::address_of(user2));
        account::create_account_for_test(signer::address_of(oracle));

        coin::register<TestCoin>(admin);
        coin::register<TestCoin>(user1);
        coin::register<TestCoin>(user2);
        coin::register<TestCoin>(oracle);

        let coins = coin::mint<TestCoin>(1000000, &mint_cap);
        coin::deposit(signer::address_of(admin), coins);
        let coins = coin::mint<TestCoin>(1000000, &mint_cap);
        coin::deposit(signer::address_of(user1), coins);
        let coins = coin::mint<TestCoin>(1000000, &mint_cap);
        coin::deposit(signer::address_of(user2), coins);

        // Set up timestamp for testing
        timestamp::set_time_has_started_for_testing(aptos);

        // Clean up capabilities
        coin::destroy_mint_cap(mint_cap);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_freeze_cap(freeze_cap);
    }

    // Test contract initialization
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123)]
    #[expected_failure(abort_code = E_NOT_ADMIN)]
    fun test_initialize_non_admin_fails(aptos: &signer, admin: &signer, user: &signer) {
        setup(aptos, admin, user, user, user);
        pivot_markets::initialize<TestCoin>(user);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123)]
    fun test_initialize_success(aptos: &signer, admin: &signer, user: &signer) {
        setup(aptos, admin, user, user, user);
        pivot_markets::initialize<TestCoin>(admin);
        assert!(exists<pivot_markets::MarketStore<TestCoin>>(@pivot_markets), 0);
        let store = borrow_global<pivot_markets::MarketStore<TestCoin>>(@pivot_markets);
        assert!(store.admin == @pivot_markets, 1);
        assert!(store.next_id == 0, 2);
        assert!(store.platform_fee_rate == 50, 3);
        assert!(store.lp_fee_rate == 200, 4);
    }

    #[test(aptos = @0x1, admin = @pivot_markets)]
    #[expected_failure(abort_code = E_ALREADY_INITIALIZED)]
    fun test_initialize_twice_fails(aptos: &signer, admin: &signer) {
        setup(aptos, admin, admin, admin, admin);
        pivot_markets::initialize<TestCoin>(admin);
        pivot_markets::initialize<TestCoin>(admin);
    }

    // Test market creation
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_create_market_success(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400; // 1 day
        pivot_markets::create_market<TestCoin>(
            admin,
            string::utf8(b"Will it rain tomorrow?"),
            end_time,
            signer::address_of(oracle),
            10000
        );

        let (
            id, description, end_time_ret, yes_pool, no_pool, liquidity, resolved,
            outcome, oracle_addr, total_yes_shares, total_no_shares,
            participant_count, yes_price, no_price, creation_time, total_value_locked
        ) = pivot_markets::get_market_details<TestCoin>(0);

        assert!(id == 0, 0);
        assert!(description == string::utf8(b"Will it rain tomorrow?"), 1);
        assert!(end_time_ret == end_time, 2);
        assert!(yes_pool == 0, 3);
        assert!(no_pool == 0, 4);
        assert!(liquidity == 10000, 5);
        assert!(!resolved, 6);
        assert!(option::is_none(&outcome), 7);
        assert!(oracle_addr == signer::address_of(oracle), 8);
        assert!(total_yes_shares == 0, 9);
        assert!(total_no_shares == 0, 10);
        assert!(participant_count == 0, 11);
        assert!(yes_price == 5000, 12);
        assert!(no_price == 5000, 13);
        assert!(total_value_locked == 10000, 14);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_NOT_ADMIN)]
    fun test_create_market_non_admin_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(
            user,
            string::utf8(b"Will it rain tomorrow?"),
            end_time,
            signer::address_of(oracle),
            10000
        );
    }

    // Test adding liquidity
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_add_liquidity_success(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::add_liquidity<TestCoin>(user, 0, 5000);

        let (_, _, _, _, _, liquidity, _, _, _, _, _, _, _, _, _, total_value_locked) = pivot_markets::get_market_details<TestCoin>(0);
        assert!(liquidity == 15000, 0);
        assert!(total_value_locked == 15000, 1);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_INVALID_BET_AMOUNT)]
    fun test_add_liquidity_zero_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::add_liquidity<TestCoin>(user, 0, 0);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_MARKET_NOT_FOUND)]
    fun test_add_liquidity_nonexistent_market_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        pivot_markets::add_liquidity<TestCoin>(user, 0, 5000);
    }

    // Test buying a position
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_buy_position_success(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000); // Buy Yes position

        let (user_addr, outcome, shares, avg_price, _) = pivot_markets::get_position<TestCoin>(0, 0);
        assert!(user_addr == signer::address_of(user), 0);
        assert!(outcome == 1, 1);
        assert!(shares == 2000, 2); // 1000 * 10000 / 5000 = 2000 shares
        assert!(avg_price == 5000, 3);

        let (_, _, _, yes_pool, _, _, _, _, _, total_yes_shares, _, participant_count, _, _, _, _) = pivot_markets::get_market_details<TestCoin>(0);
        assert!(yes_pool == 1000, 4);
        assert!(total_yes_shares == 2000, 5);
        assert!(participant_count == 1, 6);

        let user_positions = pivot_markets::get_user_positions<TestCoin>(0, signer::address_of(user));
        assert!(vector::length(&user_positions) == 1, 7);
        assert!(*vector::borrow(&user_positions, 0) == 0, 8);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_INVALID_OUTCOME)]
    fun test_buy_position_invalid_outcome_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 3, 1000, 1000);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_MARKET_ENDED)]
    fun test_buy_position_market_ended_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds();
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        timestamp::fast_forward_seconds(86401);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_SLIPPAGE_EXCEEDED)]
    fun test_buy_position_slippage_exceeded_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 10000, 0); // High amount, zero slippage tolerance
    }

    // Test selling a position
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_sell_position_success(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000); // Buy 2000 shares
        let balance_before = coin::balance<TestCoin>(signer::address_of(user));
        pivot_markets::sell_position<TestCoin>(user, 0, 0, 1000, 4000); // Sell 1000 shares

        let (user_addr, outcome, shares, _, _) = pivot_markets::get_position<TestCoin>(0, 0);
        assert!(user_addr == signer::address_of(user), 0);
        assert!(outcome == 1, 1);
        assert!(shares == 1000, 2); // Remaining shares

        let balance_after = coin::balance<TestCoin>(signer::address_of(user));
        assert!(balance_after == balance_before + 500, 3); // 1000 shares * 5000 / 10000 = 500

        let (_, _, _, _, _, liquidity, _, _, _, total_yes_shares, _, _, _, _, _, _) = pivot_markets::get_market_details<TestCoin>(0);
        assert!(total_yes_shares == 1000, 4);
        assert!(liquidity == 9500, 5); // 10000 - 500 payout
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_sell_position_remove_empty(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000); // Buy 2000 shares
        pivot_markets::sell_position<TestCoin>(user, 0, 0, 2000, 4000); // Sell all shares

        let user_positions = pivot_markets::get_user_positions<TestCoin>(0, signer::address_of(user));
        assert!(vector::length(&user_positions) == 0, 0);

        let store = borrow_global<pivot_markets::MarketStore<TestCoin>>(@pivot_markets);
        let market = table::borrow(&store.markets, 0);
        assert!(!table::contains(&market.positions, 0), 1);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_INSUFFICIENT_LIQUIDITY)]
    fun test_sell_position_insufficient_liquidity_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 1000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000); // Buy 2000 shares
        pivot_markets::sell_position<TestCoin>(user, 0, 0, 2000, 5000); // Try to sell for 1000 (2000 * 5000 / 10000)
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_INVALID_PRICE)]
    fun test_sell_position_low_price_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000);
        pivot_markets::sell_position<TestCoin>(user, 0, 0, 1000, 6000); // Min price too high
    }

    // Test resolving a market
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_resolve_market_success(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        timestamp::fast_forward_seconds(86401);
        let admin_balance_before = coin::balance<TestCoin>(@pivot_markets);
        pivot_markets::resolve_market<TestCoin>(oracle, 0, 1);

        let (_, _, _, _, _, _, resolved, outcome, _, _, _, _, _, _, _, _) = pivot_markets::get_market_details<TestCoin>(0);
        assert!(resolved, 0);
        assert!(*option::borrow(&outcome) == 1, 1);
        let admin_balance_after = coin::balance<TestCoin>(@pivot_markets);
        assert!(admin_balance_after == admin_balance_before + 50, 2); // 0.5% of 10000 = 50
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_NOT_ADMIN)]
    fun test_resolve_market_non_oracle_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        timestamp::fast_forward_seconds(86401);
        pivot_markets::resolve_market<TestCoin>(user, 0, 1);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_MARKET_NOT_ENDED)]
    fun test_resolve_market_not_ended_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::resolve_market<TestCoin>(oracle, 0, 1);
    }

    // Test claiming winnings
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_claim_winnings_success(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000); // Buy 2000 Yes shares
        pivot_markets::buy_position<TestCoin>(user, 0, 2, 1000, 1000); // Buy 2000 No shares
        timestamp::fast_forward_seconds(86401);
        pivot_markets::resolve_market<TestCoin>(oracle, 0, 1); // Resolve to Yes
        let balance_before = coin::balance<TestCoin>(signer::address_of(user));
        pivot_markets::claim_winnings<TestCoin>(user, 0, 0); // Claim Yes position

        let balance_after = coin::balance<TestCoin>(signer::address_of(user));
        assert!(balance_after == balance_before + 10950, 0); // (2000 * (1000 + 9950)) / 2000 = 10950

        let user_positions = pivot_markets::get_user_positions<TestCoin>(0, signer::address_of(user));
        assert!(vector::length(&user_positions) == 1, 1); // Only No position remains
        assert!(*vector::borrow(&user_positions, 0) == 1, 2);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_claim_winnings_no_payout(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 2, 1000, 1000); // Buy 2000 No shares
        timestamp::fast_forward_seconds(86401);
        pivot_markets::resolve_market<TestCoin>(oracle, 0, 1); // Resolve to Yes
        let balance_before = coin::balance<TestCoin>(signer::address_of(user));
        pivot_markets::claim_winnings<TestCoin>(user, 0, 0); // Claim No position
        let balance_after = coin::balance<TestCoin>(signer::address_of(user));
        assert!(balance_after == balance_before, 0); // No payout for losing position
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_MARKET_NOT_RESOLVED)]
    fun test_claim_winnings_not_resolved_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user, 0, 1, 1000, 1000);
        pivot_markets::claim_winnings<TestCoin>(user, 0, 0);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user1 = @0x123, user2 = @0x456, oracle = @0x789)]
    #[expected_failure(abort_code = E_NOT_ADMIN)]
    fun test_claim_winnings_wrong_user_fails(aptos: &signer, admin: &signer, user1: &signer, user2: &signer, oracle: &signer) {
        setup(aptos, admin, user1, user2, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::buy_position<TestCoin>(user1, 0, 1, 1000, 1000);
        timestamp::fast_forward_seconds(86401);
        pivot_markets::resolve_market<TestCoin>(oracle, 0, 1);
        pivot_markets::claim_winnings<TestCoin>(user2, 0, 0);
    }

    // Test view functions
    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    fun test_get_user_positions_empty(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        let user_positions = pivot_markets::get_user_positions<TestCoin>(0, signer::address_of(user));
        assert!(vector::length(&user_positions) == 0, 0);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_MARKET_NOT_FOUND)]
    fun test_get_market_details_nonexistent_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        pivot_markets::get_market_details<TestCoin>(0);
    }

    #[test(aptos = @0x1, admin = @pivot_markets, user = @0x123, oracle = @0x456)]
    #[expected_failure(abort_code = E_POSITION_NOT_FOUND)]
    fun test_get_position_nonexistent_fails(aptos: &signer, admin: &signer, user: &signer, oracle: &signer) {
        setup(aptos, admin, user, user, oracle);
        pivot_markets::initialize<TestCoin>(admin);
        let end_time = timestamp::now_seconds() + 86400;
        pivot_markets::create_market<TestCoin>(admin, string::utf8(b"Test Market"), end_time, signer::address_of(oracle), 10000);
        pivot_markets::get_position<TestCoin>(0, 0);
    }
}