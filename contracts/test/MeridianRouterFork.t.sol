// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {IMeridianRouter} from "../src/IMeridianRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice Foundry fork tests for MeridianRouter against mainnet state.
///
/// These tests exercise the router with real on-chain token contracts (USDC) to verify:
///   - Native ETH SETTLE on Ethereum mainnet fork
///   - ERC20 USDC SETTLE on Ethereum mainnet fork
///   - BRIDGE pause + emergencyExit on Ethereum mainnet fork
///   - Native ETH SETTLE on Arbitrum One fork
///
/// Run individually:
///   forge test --match-contract MeridianRouterForkTest --fork-url $ETH_RPC_URL -vvvv
///   forge test --match-contract MeridianRouterArbForkTest --fork-url $ARB_RPC_URL -vvvv
///
/// Or via CI profile:
///   forge test --match-contract Fork --fork-url $ETH_RPC_URL

// ─── Ethereum Mainnet Fork Tests ──────────────────────────────────────────────

contract MeridianRouterForkTest is Test {
    // Mainnet token addresses
    address constant USDC_MAINNET = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    MeridianRouter public router;

    // Use vm.addr() with known private keys so addresses are deterministic EOAs
    // with no code on any chain. makeAddr() can collide with real mainnet contracts.
    uint256 constant OWNER_PK    = 0xA001;
    uint256 constant RELAYER_PK  = 0xA002;
    uint256 constant TREASURY_PK = 0xA003;
    uint256 constant USER_PK     = 0xA004;

    address public owner;
    address public relayer;
    address public treasury;
    address public user;

    // Destination: we hold the private key for signature generation
    uint256 constant DEST_PK = 0xBEEF_CAFE_DEAD_1234_5678_9ABC_DEF0_1234_5678_9ABC_DEF0_1234_5678_9ABC_DEF0;
    address public destination;

    uint256 constant SEND_ETH   = 0.1 ether;
    uint256 constant SEND_USDC  = 500e6; // 500 USDC

    function setUp() public {
        owner    = vm.addr(OWNER_PK);
        relayer  = vm.addr(RELAYER_PK);
        treasury = vm.addr(TREASURY_PK);
        user     = vm.addr(USER_PK);
        destination = vm.addr(DEST_PK);

        vm.startPrank(owner);
        router = new MeridianRouter(relayer, treasury);
        vm.stopPrank();

        // Fund user with ETH and mainnet USDC (via deal — works on forks)
        vm.deal(user, 10 ether);
        deal(USDC_MAINNET, user, 10_000e6);
        // Zero balances: vm.addr() addresses are fresh EOAs but zero them on fork to be safe.
        vm.deal(treasury, 0);
        vm.deal(destination, 0);
    }

    // ─── Test 1: Native ETH SETTLE ────────────────────────────────────────────

    function test_fork_eth_settle() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory destSig = _signDest(DEST_PK, destination, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          address(0),
            sourceAmount:         SEND_ETH,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator: address(0)
        });

        bytes32 sid = _predictId(user, strategy);

        vm.prank(user);
        router.executeStrategy{value: SEND_ETH}(strategy);

        // Verify strategy is complete (not active, not failed)
        (uint256 step, bool isActive, bool isFailed) = router.strategyStatus(sid);
        assertFalse(isActive,  "strategy should be inactive after settle");
        assertFalse(isFailed,  "strategy should not be failed");
        assertEq(step, 1,      "step counter should be 1");

        // Verify fee went to treasury and net went to destination.
        // treasury and destination balances were zeroed in setUp (vm.deal) so absolute checks work.
        uint256 fee = (SEND_ETH * router.FEE_BPS()) / router.BPS_DENOMINATOR();
        assertEq(treasury.balance, fee, "treasury fee mismatch");
        assertEq(destination.balance, SEND_ETH - fee, "destination amount mismatch");

        console.log("Fork ETH SETTLE: fee=%s wei, net=%s wei", fee, SEND_ETH - fee);
    }

    // ─── Test 2: ERC20 USDC SETTLE ────────────────────────────────────────────

    function test_fork_usdc_settle() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory destSig = _signDest(DEST_PK, destination, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: USDC_MAINNET
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          USDC_MAINNET,
            sourceAmount:         SEND_USDC,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator: address(0)
        });

        bytes32 sid = _predictId(user, strategy);

        // Approve router
        vm.startPrank(user);
        IERC20(USDC_MAINNET).approve(address(router), SEND_USDC);
        router.executeStrategy(strategy);
        vm.stopPrank();

        (uint256 step, bool isActive, bool isFailed) = router.strategyStatus(sid);
        assertFalse(isActive, "strategy should be inactive after ERC20 settle");
        assertFalse(isFailed, "strategy should not be failed");
        assertEq(step, 1,     "step counter should be 1");

        uint256 fee = (SEND_USDC * router.FEE_BPS()) / router.BPS_DENOMINATOR();
        uint256 destBal = IERC20(USDC_MAINNET).balanceOf(destination);
        assertEq(destBal, SEND_USDC - fee, "destination USDC amount mismatch");
        assertEq(IERC20(USDC_MAINNET).balanceOf(treasury), fee, "treasury USDC fee mismatch");

        console.log("Fork USDC SETTLE: fee=%s units, net=%s units", fee, SEND_USDC - fee);
    }

    // ─── Test 3: BRIDGE pause + emergency exit ────────────────────────────────

    function test_fork_bridge_then_emergencyExit() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory destSig = _signDest(DEST_PK, destination, user, deadline);

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
            sourceAmount:         SEND_ETH,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator: address(0)
        });

        bytes32 sid = _predictId(user, strategy);

        vm.prank(user);
        router.executeStrategy{value: SEND_ETH}(strategy);

        // Strategy should be paused (active, waiting for bridge relayer)
        (, bool isActiveMid,) = router.strategyStatus(sid);
        assertTrue(isActiveMid, "strategy should be paused at BRIDGE step");

        uint256 userBalBefore = user.balance;

        // User exits — funds should come back
        vm.prank(user);
        router.emergencyExit(sid);

        (, bool isActivePost, bool isFailedPost) = router.strategyStatus(sid);
        assertFalse(isActivePost, "strategy should not be active after exit");
        assertTrue(isFailedPost,  "strategy should be marked failed after exit");

        // Fee was already taken, but remaining working amount returned
        uint256 fee     = (SEND_ETH * router.FEE_BPS()) / router.BPS_DENOMINATOR();
        uint256 working = SEND_ETH - fee;
        assertEq(user.balance - userBalBefore, working, "returned amount mismatch");

        console.log("Fork BRIDGE+Exit: fee=%s wei, returned=%s wei", fee, working);
    }

    // ─── Test 4: Replay protection — same strategy twice ─────────────────────

    function test_fork_noReplay() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory destSig = _signDest(DEST_PK, destination, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          address(0),
            sourceAmount:         SEND_ETH,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator: address(0)
        });

        vm.prank(user);
        router.executeStrategy{value: SEND_ETH}(strategy);

        // Second execution should use a new nonce, so it succeeds (not a replay)
        bytes32 sid2 = _predictId(user, strategy); // nonce is now 1
        vm.deal(user, 10 ether);
        vm.prank(user);
        router.executeStrategy{value: SEND_ETH}(strategy);

        (, bool isActive2,) = router.strategyStatus(sid2);
        assertFalse(isActive2, "second strategy should also complete");
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _signDest(
        uint256 pk,
        address dest,
        address usr,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 message = keccak256(abi.encodePacked(
            "Meridian destination verification\n",
            "Chain: ", block.chainid, "\n",
            "I confirm this wallet is mine: ", dest,
            "\nUser: ", usr,
            "\nDeadline: ", deadline
        ));
        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSigned);
        return abi.encodePacked(r, s, v);
    }

    function _predictId(
        address usr,
        IMeridianRouter.Strategy memory strategy
    ) internal view returns (bytes32) {
        uint256 nonce = router.userNonces(usr);
        return keccak256(abi.encode(
            usr,
            strategy.sourceAsset,
            strategy.sourceAmount,
            strategy.destinationWallet,
            strategy.deadline,
            block.chainid,
            nonce
        ));
    }
}

// ─── Arbitrum One Fork Tests ──────────────────────────────────────────────────

contract MeridianRouterArbForkTest is Test {
    // Arbitrum native USDC (Circle's official USDC on Arbitrum)
    address constant USDC_ARB = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    MeridianRouter public router;

    // Use vm.addr() with known private keys — guaranteed to be fresh EOAs on any fork.
    uint256 constant OWNER_PK_A    = 0xB001;
    uint256 constant RELAYER_PK_A  = 0xB002;
    uint256 constant TREASURY_PK_A = 0xB003;
    uint256 constant USER_PK_A     = 0xB004;

    address public owner;
    address public relayer;
    address public treasury;
    address public user;

    uint256 constant DEST_PK_ARB = 0xC0DE_CAFE_BABE_1234_5678_9ABC_DEF0_1234_5678_9ABC_DEF0_1234_5678_9ABC_DEF0;
    address public destination;

    uint256 constant SEND_ETH  = 0.05 ether;
    uint256 constant SEND_USDC = 200e6;

    function setUp() public {
        owner    = vm.addr(OWNER_PK_A);
        relayer  = vm.addr(RELAYER_PK_A);
        treasury = vm.addr(TREASURY_PK_A);
        user     = vm.addr(USER_PK_A);
        destination = vm.addr(DEST_PK_ARB);

        vm.startPrank(owner);
        router = new MeridianRouter(relayer, treasury);
        vm.stopPrank();

        vm.deal(user, 5 ether);
        deal(USDC_ARB, user, 5_000e6);
        // Zero out treasury and destination for absolute balance checks.
        vm.deal(treasury, 0);
        vm.deal(destination, 0);
    }

    // ─── Test 1: Native ETH SETTLE on Arbitrum ────────────────────────────────

    function test_arbFork_eth_settle() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory destSig = _signDest(DEST_PK_ARB, destination, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          address(0),
            sourceAmount:         SEND_ETH,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator: address(0)
        });

        bytes32 sid = _predictId(user, strategy);

        vm.prank(user);
        router.executeStrategy{value: SEND_ETH}(strategy);

        (, bool isActive, bool isFailed) = router.strategyStatus(sid);
        assertFalse(isActive, "arb: strategy should be complete");
        assertFalse(isFailed, "arb: strategy should not be failed");

        // destination was zeroed in setUp so absolute balance check works.
        uint256 fee = (SEND_ETH * router.FEE_BPS()) / router.BPS_DENOMINATOR();
        assertEq(destination.balance, SEND_ETH - fee, "arb: destination amount mismatch");

        console.log("Arbitrum Fork ETH SETTLE: chain=%s, fee=%s wei", block.chainid, fee);
    }

    // ─── Test 2: USDC SETTLE on Arbitrum ─────────────────────────────────────

    function test_arbFork_usdc_settle() public {
        uint256 deadline = block.timestamp + 3600;
        bytes memory destSig = _signDest(DEST_PK_ARB, destination, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType:    IMeridianRouter.StepType.SETTLE,
            protocol:    address(0),
            params:      "",
            minOutput:   0,
            outputAsset: USDC_ARB
        });

        IMeridianRouter.Strategy memory strategy = IMeridianRouter.Strategy({
            sourceAsset:          USDC_ARB,
            sourceAmount:         SEND_USDC,
            steps:                steps,
            destinationWallet:    destination,
            destinationSignature: destSig,
            deadline:             deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        IERC20(USDC_ARB).approve(address(router), SEND_USDC);
        router.executeStrategy(strategy);
        vm.stopPrank();

        uint256 fee     = (SEND_USDC * router.FEE_BPS()) / router.BPS_DENOMINATOR();
        uint256 destBal = IERC20(USDC_ARB).balanceOf(destination);
        assertEq(destBal, SEND_USDC - fee, "arb: USDC destination amount mismatch");
        assertEq(IERC20(USDC_ARB).balanceOf(treasury), fee, "arb: USDC treasury fee mismatch");

        console.log("Arbitrum Fork USDC SETTLE: fee=%s units, net=%s units", fee, SEND_USDC - fee);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _signDest(
        uint256 pk,
        address dest,
        address usr,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 message = keccak256(abi.encodePacked(
            "Meridian destination verification\n",
            "Chain: ", block.chainid, "\n",
            "I confirm this wallet is mine: ", dest,
            "\nUser: ", usr,
            "\nDeadline: ", deadline
        ));
        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethSigned);
        return abi.encodePacked(r, s, v);
    }

    function _predictId(
        address usr,
        IMeridianRouter.Strategy memory strategy
    ) internal view returns (bytes32) {
        uint256 nonce = router.userNonces(usr);
        return keccak256(abi.encode(
            usr,
            strategy.sourceAsset,
            strategy.sourceAmount,
            strategy.destinationWallet,
            strategy.deadline,
            block.chainid,
            nonce
        ));
    }
}
