// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {MeridianStrategyRegistry} from "../src/MeridianStrategyRegistry.sol";
import {MeridianVault} from "../src/MeridianVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys Meridian core contracts on Optimism (chain ID 10).
///
///   Native USDC on Optimism mainnet: 0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85
///   Aave v3 Pool on Optimism:        0x794a61358D6845594F94dc1DB02A252b5b4814aD
///   Compound v3 (USDC):              0x2e44e174f7D53F0212823acC11C01A11d58c5bCb
///
/// Usage:
///   RELAYER_ADDRESS=0x... TREASURY_ADDRESS=0x... \
///   forge script script/DeployOptimism.s.sol \
///     --rpc-url $OPT_RPC_URL \
///     --broadcast --verify \
///     --etherscan-api-key $OPTIMISM_ETHERSCAN_API_KEY
contract DeployOptimism is Script {
    address constant USDC_OPTIMISM = 0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85;

    function run() external {
        require(block.chainid == 10, "DeployOptimism: wrong chain");

        address relayer  = vm.envAddress("RELAYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast();

        MeridianRouter router = new MeridianRouter(relayer, treasury);
        console.log("MeridianRouter (Optimism)  :", address(router));

        MeridianStrategyRegistry registry = new MeridianStrategyRegistry();
        registry.setRouterAuthorized(address(router), true);
        console.log("StrategyRegistry (Optimism):", address(registry));

        MeridianVault vault = new MeridianVault(
            IERC20(USDC_OPTIMISM),
            "Meridian USDC Vault (Optimism)",
            "mUSDC-OPT"
        );
        vault.setRouterAuthorized(address(router), true);
        console.log("Vault(USDC) (Optimism)     :", address(vault));

        vm.stopBroadcast();

        console.log("\n=== Optimism Deployment Summary ===");
        console.log("Chain ID   :", block.chainid);   // 10
        console.log("Router     :", address(router));
        console.log("Registry   :", address(registry));
        console.log("Vault(USDC):", address(vault));
        console.log("Relayer    :", relayer);
        console.log("Treasury   :", treasury);
    }
}
