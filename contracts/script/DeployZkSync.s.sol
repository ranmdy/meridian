// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {MeridianStrategyRegistry} from "../src/MeridianStrategyRegistry.sol";
import {MeridianVault} from "../src/MeridianVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Meridian core contracts on zkSync Era (chain ID 324).
///
///   USDC on zkSync: 0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4 (native USDC)
///   ZeroLend Pool:  0x767B53bde5d4723e97b726D3D3f4CbA1D70CfFCc
///
/// zkSync Era notes:
///   - Uses era-compatible Foundry (`foundry-zksync` fork) for deployment.
///   - CREATE2 factory differs from EVM; the --zksync flag handles this.
///   - Contract verification uses the zkSync Era block explorer API.
///
/// Usage:
///   RELAYER_ADDRESS=0x... TREASURY_ADDRESS=0x... \
///   forge script script/DeployZkSync.s.sol \
///     --rpc-url https://mainnet.era.zksync.io \
///     --zksync \
///     --broadcast --verify \
///     --verifier-url https://zksync2-mainnet.zkscan.io/api \
///     --etherscan-api-key $ZKSYNC_ETHERSCAN_API_KEY
contract DeployZkSync is Script {
    /// @dev Native USDC on zkSync Era (Circle-issued, not bridged)
    address constant USDC_ZKSYNC = 0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4;

    function run() external {
        require(block.chainid == 324, "DeployZkSync: wrong chain");

        address relayer  = vm.envAddress("RELAYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast();

        // 1. Router
        MeridianRouter router = new MeridianRouter(relayer, treasury);
        console.log("MeridianRouter (zkSync Era)  :", address(router));

        // 2. Strategy Registry
        MeridianStrategyRegistry registry = new MeridianStrategyRegistry();
        registry.setRouterAuthorized(address(router), true);
        console.log("StrategyRegistry (zkSync Era):", address(registry));

        // 3. Vault — USDC
        MeridianVault vault = new MeridianVault(
            IERC20(USDC_ZKSYNC),
            "Meridian USDC Vault (zkSync Era)",
            "mUSDC-ERA"
        );
        vault.setRouterAuthorized(address(router), true);
        console.log("Vault(USDC) (zkSync Era)     :", address(vault));

        vm.stopBroadcast();

        console.log("\n=== zkSync Era Deployment Summary ===");
        console.log("Chain ID   :", block.chainid);   // 324
        console.log("Router     :", address(router));
        console.log("Registry   :", address(registry));
        console.log("Vault(USDC):", address(vault));
        console.log("Relayer    :", relayer);
        console.log("Treasury   :", treasury);
    }
}
