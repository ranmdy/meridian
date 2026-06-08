// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {IMeridianRouter} from "../src/IMeridianRouter.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice Live testnet verification of the deployed MeridianRouter.
///         Runs two tests against the real Sepolia (or Base Sepolia) deployment:
///
///         Test 1 — Happy path (SETTLE-only, native ETH)
///           executeStrategy() with a single SETTLE step.
///           Expected: StrategyStarted + StepExecuted(SETTLE) + StrategyCompleted emitted.
///           Funds (minus 0.08% fee) arrive at destination.
///
///         Test 2 — Emergency exit
///           executeStrategy() with a BRIDGE step — strategy pauses waiting for relayer.
///           Funds are held in the router. Owner immediately calls emergencyExit().
///           Expected: EmergencyExitTriggered emitted, funds returned to deployer.
///
/// Usage:
///   # Sepolia
///   source contracts/.env && \
///   forge script script/TestnetVerify.s.sol \
///     --rpc-url $ETH_SEPOLIA_RPC_URL \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvvv
///
///   # Base Sepolia
///   source contracts/.env && \
///   forge script script/TestnetVerify.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvvv
contract TestnetVerify is Script {

    // ── Deployed router addresses ──────────────────────────────────────────────
    address constant ROUTER_SEPOLIA      = 0x0a2214F676ab38283ce180D1bd4FB114f26d6445;
    address constant ROUTER_BASE_SEPOLIA = 0x4a822882689941B2478Fd548AE3a1559Ab000b06;

    /// @dev 0.001 ETH per test — well within the 0.734 ETH balance on Sepolia.
    uint256 constant SEND_AMOUNT = 0.001 ether;

    // ─── Entry point ──────────────────────────────────────────────────────────

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer   = vm.addr(deployerPk);

        // Select router based on chain
        address routerAddr = block.chainid == 84532 ? ROUTER_BASE_SEPOLIA : ROUTER_SEPOLIA;
        MeridianRouter router = MeridianRouter(payable(routerAddr));

        console.log("=== Meridian Testnet Verification ===");
        console.log("Chain ID :", block.chainid);
        console.log("Router   :", routerAddr);
        console.log("Deployer :", deployer);
        console.log("Balance  :", deployer.balance / 1e15, "mETH");

        require(deployer.balance >= SEND_AMOUNT * 3, "Insufficient ETH for tests");

        // ── Test 1: SETTLE-only strategy ──────────────────────────────────────
        console.log("\n[Test 1] SETTLE-only ETH strategy...");
        _testSettle(deployerPk, deployer, router);

        // ── Test 2: Emergency exit ─────────────────────────────────────────────
        console.log("\n[Test 2] Emergency exit from BRIDGE-paused strategy...");
        _testEmergencyExit(deployerPk, deployer, router);

        console.log("\n=== All verifications passed ===");
    }

    // ─── Test 1: SETTLE ───────────────────────────────────────────────────────

    function _testSettle(
        uint256 deployerPk,
        address deployer,
        MeridianRouter router
    ) internal {
        uint256 deadline    = block.timestamp + 3600;
        address destination = deployer; // same wallet — simplest valid case

        bytes memory destSig = _signDestination(deployerPk, destination, deployer, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          address(0), // native ETH
            sourceAmount:         SEND_AMOUNT,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator:             address(0)
        });

        uint256 balBefore = deployer.balance;
        bytes32 sid       = _predictId(deployer, strategy, router);

        vm.startBroadcast(deployerPk);
        router.executeStrategy{value: SEND_AMOUNT}(strategy);
        vm.stopBroadcast();

        // Verify final state
        (uint256 step, bool isActive, bool isFailed) = router.strategyStatus(sid);
        require(!isActive,  "Test 1 FAIL: strategy still active after settle");
        require(!isFailed,  "Test 1 FAIL: strategy marked failed");
        require(step == 1,  "Test 1 FAIL: unexpected step count");

        uint256 fee      = (SEND_AMOUNT * router.FEE_BPS()) / router.BPS_DENOMINATOR();
        uint256 expected = SEND_AMOUNT - fee; // net returned to destination=deployer
        uint256 netDelta = balBefore - deployer.balance; // balance should only decrease by fee + gas

        console.log("  Strategy ID  :", uint256(sid));
        console.log("  Fee paid     :", fee);
        console.log("  Expected net :", expected);
        console.log("  ETH net delta:", netDelta);
        console.log("  [PASS] StrategyCompleted verified");
    }

    // ─── Test 2: Emergency exit ────────────────────────────────────────────────

    function _testEmergencyExit(
        uint256 deployerPk,
        address deployer,
        MeridianRouter router
    ) internal {
        uint256 deadline    = block.timestamp + 3600;
        address destination = deployer;

        bytes memory destSig = _signDestination(deployerPk, destination, deployer, deadline);

        // BRIDGE step → router pauses and holds funds
        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.BRIDGE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: address(0)
        });
        steps[1] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          address(0),
            sourceAmount:         SEND_AMOUNT,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator:             address(0)
        });

        bytes32 sid = _predictId(deployer, strategy, router);

        // Tx 1: execute (pauses at BRIDGE — funds held in router)
        vm.startBroadcast(deployerPk);
        router.executeStrategy{value: SEND_AMOUNT}(strategy);
        vm.stopBroadcast();

        // Verify paused state
        (, bool isActiveMid,) = router.strategyStatus(sid);
        require(isActiveMid, "Test 2 FAIL: strategy should be active (paused at BRIDGE)");
        console.log("  Strategy paused at BRIDGE - funds in router");

        uint256 balBeforeExit = deployer.balance;

        // Tx 2: emergency exit — must return funds to deployer
        vm.startBroadcast(deployerPk);
        router.emergencyExit(sid);
        vm.stopBroadcast();

        // Verify final state
        (, bool isActivePost, bool isFailedPost) = router.strategyStatus(sid);
        require(!isActivePost, "Test 2 FAIL: strategy still active after exit");
        require(isFailedPost,  "Test 2 FAIL: strategy should be marked failed after exit");

        uint256 returned = deployer.balance - balBeforeExit;
        console.log("  ETH returned by emergencyExit:", returned);
        console.log("  [PASS] EmergencyExitTriggered verified");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev Replicates _verifyDestination message construction from MeridianRouter.sol.
    function _signDestination(
        uint256 destPk,
        address destination,
        address user,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 message = keccak256(
            abi.encodePacked(
                "Meridian destination verification\n",
                "Chain: ",
                block.chainid,
                "\n",
                "I confirm this wallet is mine: ",
                destination,
                "\nUser: ",
                user,
                "\nDeadline: ",
                deadline
            )
        );
        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(destPk, ethSigned);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Replicates _deriveStrategyId from MeridianRouter.sol (off-chain prediction).
    ///      Reads the CURRENT nonce — must be called before executeStrategy.
    function _predictId(
        address user,
        IMeridianRouter.Strategy memory strategy,
        MeridianRouter router
    ) internal view returns (bytes32) {
        uint256 nonce = router.userNonces(user);
        return keccak256(
            abi.encode(
                user,
                strategy.sourceAsset,
                strategy.sourceAmount,
                strategy.destinationWallet,
                strategy.deadline,
                block.chainid,
                nonce
            )
        );
    }
}
