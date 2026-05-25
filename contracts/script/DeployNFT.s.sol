// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianStrategyNFT} from "../src/MeridianStrategyNFT.sol";

/// @notice Deploys MeridianStrategyNFT.
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY  — deployer wallet
///   MINTER_ADDRESS        — Meridian backend relayer address (authorised to mint)
///   OWNER_ADDRESS         — multisig or deployer as initial owner
///
/// Usage:
///   forge script script/DeployNFT.s.sol --broadcast --rpc-url $ETH_RPC_URL
contract DeployNFT is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner  = vm.envAddress("OWNER_ADDRESS");
        address minter = vm.envAddress("MINTER_ADDRESS");

        vm.startBroadcast(deployerKey);

        MeridianStrategyNFT nft = new MeridianStrategyNFT(owner, minter);

        console.log("MeridianStrategyNFT deployed at:", address(nft));
        console.log("  Owner  :", owner);
        console.log("  Minter :", minter);

        vm.stopBroadcast();
    }
}
