// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {MeridianStrategyRegistry} from "../src/MeridianStrategyRegistry.sol";
import {MeridianVault} from "../src/MeridianVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Meridian core contracts.
///         Set env vars before running:
///           RELAYER_ADDRESS   — relayer hot wallet
///           TREASURY_ADDRESS  — fee recipient multisig
///           USDC_ADDRESS      — USDC on target chain (for Vault)
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
contract DeployMeridian is Script {
    function run() external {
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy Router
        MeridianRouter router = new MeridianRouter(relayer, treasury);
        console.log("MeridianRouter deployed at:", address(router));

        // 2. Deploy Strategy Registry + authorize Router
        MeridianStrategyRegistry registry = new MeridianStrategyRegistry();
        registry.setRouterAuthorized(address(router), true);
        console.log("MeridianStrategyRegistry deployed at:", address(registry));

        // 3. Deploy Vault (USDC) + authorize Router
        MeridianVault vault = new MeridianVault(
            IERC20(usdc),
            "Meridian USDC Vault",
            "mUSDC"
        );
        vault.setRouterAuthorized(address(router), true);
        console.log("MeridianVault (USDC) deployed at:", address(vault));

        vm.stopBroadcast();

        // Print summary for deployment manifest
        console.log("\n=== Deployment Summary ===");
        console.log("Chain ID:   ", block.chainid);
        console.log("Router:     ", address(router));
        console.log("Registry:   ", address(registry));
        console.log("Vault(USDC):", address(vault));
        console.log("Relayer:    ", relayer);
        console.log("Treasury:   ", treasury);
    }
}
