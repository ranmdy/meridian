// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {AaveV3LendAdapter} from "../src/adapters/AaveV3LendAdapter.sol";
import {UniswapV3SwapAdapter} from "../src/adapters/UniswapV3SwapAdapter.sol";
import {AcrossBridgeAdapter} from "../src/adapters/AcrossBridgeAdapter.sol";

/// @notice Deploy protocol adapters and register them in the MeridianRouter.
///
/// @dev Usage:
///
///   Sepolia:
///     forge script script/DeployAdapters.s.sol:DeployAdapters \
///       --rpc-url $ETH_SEPOLIA_RPC_URL \
///       --broadcast \
///       --verify \
///       --etherscan-api-key $ETHERSCAN_API_KEY \
///       -vvv
///
///   Required env vars (in contracts/.env):
///     PRIVATE_KEY               — deployer private key
///     ROUTER_ADDRESS            — deployed MeridianRouter address
///     AAVE_V3_POOL              — Aave V3 Pool proxy on this chain
///     UNISWAP_V3_SWAP_ROUTER    — Uniswap V3 SwapRouter02 on this chain
///     ACROSS_SPOKE_POOL         — Across v3 SpokePool on this chain
contract DeployAdapters is Script {
    function run() external {
        uint256 deployerKey    = vm.envUint("PRIVATE_KEY");
        address routerAddr     = vm.envAddress("ROUTER_ADDRESS");
        address aavePool       = vm.envAddress("AAVE_V3_POOL");
        address uniSwapRouter  = vm.envAddress("UNISWAP_V3_SWAP_ROUTER");
        address acrossSpokePool = vm.envAddress("ACROSS_SPOKE_POOL");

        MeridianRouter router = MeridianRouter(payable(routerAddr));

        vm.startBroadcast(deployerKey);

        // 1. Deploy AaveV3LendAdapter
        AaveV3LendAdapter aaveAdapter = new AaveV3LendAdapter(aavePool, routerAddr);
        router.setProtocolApproved(address(aaveAdapter), true);
        console.log("AaveV3LendAdapter deployed:", address(aaveAdapter));

        // 2. Deploy UniswapV3SwapAdapter
        UniswapV3SwapAdapter uniAdapter = new UniswapV3SwapAdapter(uniSwapRouter, routerAddr);
        router.setProtocolApproved(address(uniAdapter), true);
        console.log("UniswapV3SwapAdapter deployed:", address(uniAdapter));

        // 3. Deploy AcrossBridgeAdapter
        AcrossBridgeAdapter acrossAdapter = new AcrossBridgeAdapter(acrossSpokePool, routerAddr);
        router.setProtocolApproved(address(acrossAdapter), true);
        console.log("AcrossBridgeAdapter deployed:", address(acrossAdapter));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("Chain ID:                ", block.chainid);
        console.log("Router:                  ", routerAddr);
        console.log("Aave V3 Pool:            ", aavePool);
        console.log("AaveV3LendAdapter:       ", address(aaveAdapter));
        console.log("Uniswap V3 SwapRouter:   ", uniSwapRouter);
        console.log("UniswapV3SwapAdapter:    ", address(uniAdapter));
        console.log("Across SpokePool:        ", acrossSpokePool);
        console.log("AcrossBridgeAdapter:     ", address(acrossAdapter));
    }
}
