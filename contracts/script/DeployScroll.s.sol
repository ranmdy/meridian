// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {MeridianStrategyRegistry} from "../src/MeridianStrategyRegistry.sol";
import {MeridianVault} from "../src/MeridianVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Meridian core contracts on Scroll (chain ID 534352).
///
///   USDC on Scroll: 0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4
///   Aave v3 Pool:   0x11fCfe756c05AD438e312a7fd934381537D3cFfe
///   Layerbank:      0x009a0b7C38B542208936F1179151CD08E2943833
///
/// Usage:
///   RELAYER_ADDRESS=0x... TREASURY_ADDRESS=0x... \
///   forge script script/DeployScroll.s.sol \
///     --rpc-url https://rpc.scroll.io \
///     --broadcast --verify \
///     --verifier-url https://api.scrollscan.com/api \
///     --etherscan-api-key $SCROLLSCAN_API_KEY
contract DeployScroll is Script {
    /// @dev Scroll USDC — bridged via official Scroll bridge from Ethereum
    address constant USDC_SCROLL = 0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4;

    function run() external {
        require(block.chainid == 534352, "DeployScroll: wrong chain");

        address relayer  = vm.envAddress("RELAYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast();

        // 1. Router
        MeridianRouter router = new MeridianRouter(relayer, treasury);
        console.log("MeridianRouter (Scroll)  :", address(router));

        // 2. Strategy Registry
        MeridianStrategyRegistry registry = new MeridianStrategyRegistry();
        registry.setRouterAuthorized(address(router), true);
        console.log("StrategyRegistry (Scroll):", address(registry));

        // 3. Vault — USDC
        MeridianVault vault = new MeridianVault(
            IERC20(USDC_SCROLL),
            "Meridian USDC Vault (Scroll)",
            "mUSDC-SCR"
        );
        vault.setRouterAuthorized(address(router), true);
        console.log("Vault(USDC) (Scroll)     :", address(vault));

        vm.stopBroadcast();

        console.log("\n=== Scroll Deployment Summary ===");
        console.log("Chain ID   :", block.chainid);   // 534352
        console.log("Router     :", address(router));
        console.log("Registry   :", address(registry));
        console.log("Vault(USDC):", address(vault));
        console.log("Relayer    :", relayer);
        console.log("Treasury   :", treasury);
    }
}
