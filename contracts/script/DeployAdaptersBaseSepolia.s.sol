// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {UniswapV3SwapAdapter} from "../src/adapters/UniswapV3SwapAdapter.sol";
import {AcrossBridgeAdapter} from "../src/adapters/AcrossBridgeAdapter.sol";

/// @notice Deploy adapters on Base Sepolia (no Aave V3 on this chain).
contract DeployAdaptersBaseSepolia is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // Base Sepolia addresses
        address routerAddr      = 0x4DCAD84159755062c9384c9Cb7d515adCF0Bc314;
        address uniSwapRouter   = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
        address acrossSpokePool = 0x82B564983aE7274c86695917BBf8C99ECb6F0F8F;

        MeridianRouter router = MeridianRouter(payable(routerAddr));

        vm.startBroadcast(deployerKey);

        UniswapV3SwapAdapter uniAdapter = new UniswapV3SwapAdapter(uniSwapRouter, routerAddr);
        router.setProtocolApproved(address(uniAdapter), true);
        console.log("UniswapV3SwapAdapter deployed:", address(uniAdapter));

        AcrossBridgeAdapter acrossAdapter = new AcrossBridgeAdapter(acrossSpokePool, routerAddr);
        router.setProtocolApproved(address(acrossAdapter), true);
        console.log("AcrossBridgeAdapter deployed:", address(acrossAdapter));

        vm.stopBroadcast();

        console.log("\n=== Base Sepolia Deployment Summary ===");
        console.log("Chain ID:                ", block.chainid);
        console.log("Router:                  ", routerAddr);
        console.log("UniswapV3SwapAdapter:    ", address(uniAdapter));
        console.log("AcrossBridgeAdapter:     ", address(acrossAdapter));
    }
}
