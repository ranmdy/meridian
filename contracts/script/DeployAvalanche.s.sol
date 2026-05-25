// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {MeridianStrategyRegistry} from "../src/MeridianStrategyRegistry.sol";
import {MeridianVault} from "../src/MeridianVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Meridian core contracts on Avalanche C-Chain (chain ID 43114).
///
///   Native USDC on Avalanche mainnet: 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E
///   Aave v3 Pool on Avalanche:        0x794a61358D6845594F94dc1DB02A252b5b4814aD
///   GMX:                              0x18c11FD286C5EC11c3b683Caa813B77f5163A122
///
/// Verification (Snowtrace):
///   --verify --etherscan-api-key $SNOWTRACE_API_KEY
///
/// Usage:
///   RELAYER_ADDRESS=0x... TREASURY_ADDRESS=0x... \
///   forge script script/DeployAvalanche.s.sol \
///     --rpc-url $AVAX_RPC_URL \
///     --broadcast --verify \
///     --etherscan-api-key $SNOWTRACE_API_KEY
contract DeployAvalanche is Script {
    address constant USDC_AVALANCHE = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;

    function run() external {
        require(block.chainid == 43114, "DeployAvalanche: wrong chain");

        address relayer  = vm.envAddress("RELAYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast();

        MeridianRouter router = new MeridianRouter(relayer, treasury);
        console.log("MeridianRouter (Avalanche)  :", address(router));

        MeridianStrategyRegistry registry = new MeridianStrategyRegistry();
        registry.setRouterAuthorized(address(router), true);
        console.log("StrategyRegistry (Avalanche):", address(registry));

        MeridianVault vault = new MeridianVault(
            IERC20(USDC_AVALANCHE),
            "Meridian USDC Vault (Avalanche)",
            "mUSDC-AVAX"
        );
        vault.setRouterAuthorized(address(router), true);
        console.log("Vault(USDC) (Avalanche)     :", address(vault));

        vm.stopBroadcast();

        console.log("\n=== Avalanche Deployment Summary ===");
        console.log("Chain ID   :", block.chainid);   // 43114
        console.log("Router     :", address(router));
        console.log("Registry   :", address(registry));
        console.log("Vault(USDC):", address(vault));
        console.log("Relayer    :", relayer);
        console.log("Treasury   :", treasury);
    }
}
