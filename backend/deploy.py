#!/usr/bin/env python3
"""
Deployment script for the AI Market Generator Backend
Handles contract deployment and initial setup
"""

import os
import asyncio
import json
from aptos_sdk.async_client import RestClient
from aptos_sdk.account import Account
from aptos_sdk.package_publisher import PackagePublisher
from aptos_sdk.transactions import EntryFunction, TransactionArgument

class ContractDeployer:
    def __init__(self):
        self.client = RestClient(os.getenv("APTOS_NODE_URL", "https://fullnode.mainnet.aptoslabs.com/v1"))
        
        # Create admin account or load from private key
        private_key = os.getenv("ADMIN_PRIVATE_KEY")
        if private_key:
            self.admin_account = Account.load_key(private_key)
        else:
            self.admin_account = Account.generate()
            print(f"Generated new admin account: {self.admin_account.address()}")
            print(f"Private key: {self.admin_account.private_key}")
            print("⚠️  SAVE THIS PRIVATE KEY SECURELY!")
    
    async def deploy_contract(self, package_dir: str) -> str:
        """Deploy the prediction market contract"""
        try:
            print("Deploying prediction market contract...")
            
            # Fund account if on devnet/testnet
            if "devnet" in self.client.base_url or "testnet" in self.client.base_url:
                print("Funding admin account...")
                await self.client.fund_account(self.admin_account.address(), 100_000_000)
            
            # Publish the package
            publisher = PackagePublisher(self.client)
            package_hash = await publisher.publish_package(
                self.admin_account,
                package_dir
            )
            
            contract_address = self.admin_account.address()
            print(f"Contract deployed at: {contract_address}")
            return str(contract_address)
            
        except Exception as e:
            print(f"Error deploying contract: {e}")
            raise
    
    async def initialize_contract(self, contract_address: str):
        """Initialize the deployed contract"""
        try:
            print("Initializing contract...")
            
            payload = EntryFunction.natural(
                f"{contract_address}::pivot_markets",
                "initialize",
                [],
                []
            )
            
            signed_txn = await self.client.create_bcs_signed_transaction(
                self.admin_account, 
                payload
            )
            
            result = await self.client.submit_bcs_transaction(signed_txn)
            await self.client.wait_for_transaction(result)
            
            print("Contract initialized successfully!")
            
        except Exception as e:
            print(f"Error initializing contract: {e}")
            raise
    
    async def create_test_market(self, contract_address: str):
        """Create a test market to verify functionality"""
        try:
            print("Creating test market...")
            
            from datetime import datetime, timedelta
            end_time = int((datetime.now() + timedelta(days=7)).timestamp())
            
            payload = EntryFunction.natural(
                f"{contract_address}::pivot_markets",
                "create_market",
                [],
                [
                    TransactionArgument("Will Bitcoin reach $100k by end of year?", str),
                    TransactionArgument(end_time, int),
                    TransactionArgument(str(self.admin_account.address()), str)
                ]
            )
            
            signed_txn = await self.client.create_bcs_signed_transaction(
                self.admin_account, 
                payload
            )
            
            result = await self.client.submit_bcs_transaction(signed_txn)
            await self.client.wait_for_transaction(result)
            
            print("Test market created successfully!")
            
        except Exception as e:
            print(f"Error creating test market: {e}")
            raise

async def main():
    """Main deployment function"""
    deployer = ContractDeployer()
    
    # Check if contract is already deployed
    contract_address = "0x986a7c58eca5fe84a7fdf73b02953bc3faab2c9778f82aeab7eefa43242168a2"
    
    if not contract_address:
        print("No contract address found. Deploying new contract...")
        
        # Deploy contract (assumes Move package is in ./contract directory)
        package_dir = "./contract"
        if not os.path.exists(package_dir):
            print(f"❌ Contract package directory not found: {package_dir}")
            print("Please ensure your Move package is in the ./contract directory")
            return
        
        contract_address = await deployer.deploy_contract(package_dir)
        
        # Update environment file
        with open(".env", "a") as f:
            f.write(f"\nCONTRACT_ADDRESS={contract_address}\n")
        
        print(f"✅ Contract deployed! Add this to your .env file:")
        print(f"CONTRACT_ADDRESS={contract_address}")
    
    # Initialize contract
    # try:
    #     await deployer.initialize_contract(contract_address)
    # except Exception as e:
    #     if "E_ALREADY_INITIALIZED" in str(e):
    #         print("Contract already initialized, skipping...")
    #     else:
    #         raise
    
    # Create test market
    await deployer.create_test_market(contract_address)
    
    print(f"""
🎉 Deployment completed successfully!

Configuration:
- Contract Address: {contract_address}
- Admin Address: {deployer.admin_account.address()}
- Network: {deployer.client.base_url}

Next steps:
1. Update your .env file with the contract address
2. Set up Twitter API credentials
3. Run the AI market generator: python ai_market_backend.py
    """)

if __name__ == "__main__":
    asyncio.run(main())