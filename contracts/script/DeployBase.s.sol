// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {MeridianStrategyRegistry} from "../src/MeridianStrategyRegistry.sol";
import {MeridianVault} from "../src/MeridianVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Meridian core contracts on Base (chain ID 8453) or Base Sepolia (84532).
///
///   Native USDC on Base mainnet:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
///   Native USDC on Base Sepolia:  0x036CbD53842c5426634e7929541eC2318f3dCF7e
///
///   Verification:
///     --verify --etherscan-api-key $BASESCAN_API_KEY
///
/// Usage (testnet):
///   RELAYER_ADDRESS=0x... TREASURY_ADDRESS=0x... USDC_ADDRESS=0x036C... \
///   forge script script/DeployBase.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
///
/// Usage (mainnet):
///   RELAYER_ADDRESS=0x... TREASURY_ADDRESS=0x... USDC_ADDRESS=0x8335... \
///   forge script script/DeployBase.s.sol \
///     --rpc-url $BASE_RPC_URL \
///     --broadcast --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
contract DeployBase is Script {
    function run() external {
        require(
            block.chainid == 8453 || block.chainid == 84532,
            "DeployBase: wrong chain - must be Base (8453) or Base Sepolia (84532)"
        );

        address relayer  = vm.envAddress("RELAYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address usdc     = vm.envAddress("USDC_ADDRESS");

        bool isTestnet = block.chainid == 84532;
        string memory suffix = isTestnet ? " (Base Sepolia)" : " (Base)";

        vm.startBroadcast();

        // 1. Router
        MeridianRouter router = new MeridianRouter(relayer, treasury);
        console.log(string.concat("MeridianRouter", suffix, " :"), address(router));

        // 2. Strategy Registry
        MeridianStrategyRegistry registry = new MeridianStrategyRegistry();
        registry.setRouterAuthorized(address(router), true);
        console.log(string.concat("StrategyRegistry", suffix, ":"), address(registry));

        // 3. Vault — USDC
        string memory vaultName   = isTestnet ? "Meridian USDC Vault (Base Sepolia)" : "Meridian USDC Vault (Base)";
        string memory vaultSymbol = isTestnet ? "mUSDC-BASE-SEP" : "mUSDC-BASE";

        MeridianVault vault = new MeridianVault(
            IERC20(usdc),
            vaultName,
            vaultSymbol
        );
        vault.setRouterAuthorized(address(router), true);
        console.log(string.concat("Vault(USDC)", suffix, "   :"), address(vault));

        vm.stopBroadcast();

        console.log(string.concat("\n=== Base", isTestnet ? " Sepolia" : "", " Deployment Summary ==="));
        console.log("Chain ID   :", block.chainid);
        console.log("Router     :", address(router));
        console.log("Registry   :", address(registry));
        console.log("Vault(USDC):", address(vault));
        console.log("Relayer    :", relayer);
        console.log("Treasury   :", treasury);
        console.log("USDC       :", usdc);
    }
}
