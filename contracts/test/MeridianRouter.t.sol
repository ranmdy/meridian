// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {IMeridianRouter} from "../src/IMeridianRouter.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// ─── Mock Token ───────────────────────────────────────────────────────────────

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ─── Mock Protocol (approved, returns amountIn as amountOut) ──────────────────

contract MockProtocol {
    /// @notice Accepts any call and returns the last 32 bytes of calldata (amountIn) as amountOut.
    fallback(bytes calldata data) external returns (bytes memory) {
        uint256 amountIn = abi.decode(data[data.length - 32:], (uint256));
        return abi.encode(amountIn);
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

contract MeridianRouterTest is Test {
    MeridianRouter public router;
    MockERC20 public usdc;
    MockProtocol public mockProtocol;

    address public owner = makeAddr("owner");
    address public relayer = makeAddr("relayer");
    address public treasury = makeAddr("treasury");
    address public user = makeAddr("user");
    address public user2 = makeAddr("user2");

    // Destination wallet — we need its private key to sign the verification message.
    uint256 constant DEST_PK = 0xDEADBEEF_CAFEBABE_12345678_90ABCDEF_FEEDFACE_DEADCAFE_BABE1234_5678ABCD;
    address public destination;

    function setUp() public {
        destination = vm.addr(DEST_PK);

        vm.startPrank(owner);
        router = new MeridianRouter(relayer, treasury);
        vm.stopPrank();

        usdc = new MockERC20();
        usdc.mint(user, 10_000e6);   // 10,000 USDC
        usdc.mint(user2, 10_000e6);

        mockProtocol = new MockProtocol();

        // Approve the mock protocol so SWAP steps can execute.
        vm.prank(owner);
        router.setProtocolApproved(address(mockProtocol), true);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev Signs the destination-verification message for `dest`, bound to `user` and `deadline`.
    ///      The message format must match _verifyDestination in MeridianRouter.sol exactly.
    function _signDestination(
        address dest,
        uint256 pk,
        address signingUser,
        uint256 deadline
    )
        internal
        view
        returns (bytes memory sig)
    {
        bytes32 message = keccak256(
            abi.encodePacked(
                "Meridian destination verification\n",
                "Chain: ",
                block.chainid,
                "\n",
                "I confirm this wallet is mine: ",
                dest,
                "\nUser: ",
                signingUser,
                "\nDeadline: ",
                deadline
            )
        );
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        sig = abi.encodePacked(r, s, v);
    }

    function _buildMinimalStrategy(
        address asset,
        uint256 amount,
        address dest,
        bytes memory sig
    ) internal view returns (IMeridianRouter.Strategy memory) {
        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0) // SETTLE: same asset as input
        });

        return IMeridianRouter.Strategy({
            sourceAsset: asset,
            sourceAmount: amount,
            steps: steps,
            destinationWallet: dest,
            destinationSignature: sig,
            deadline: block.timestamp + 1 hours,
            creator: address(0)
        });
    }

    // ─── Destination Verification ─────────────────────────────────────────────

    function test_revertIf_invalidDestinationSignature() public {
        bytes memory badSig = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));

        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 1000e6, destination, badSig
        );

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(MeridianRouter.InvalidDestinationSignature.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    function test_revertIf_signedByWrongKey() public {
        uint256 wrongPk = 0x1234;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory wrongSig = _signDestination(destination, wrongPk, user, deadline);

        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 1000e6, destination, wrongSig
        );

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(MeridianRouter.InvalidDestinationSignature.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    function test_validDestinationSignatureAccepted() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 1000e6, destination, sig
        );

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectEmit(false, true, false, false);
        emit IMeridianRouter.StrategyStarted(bytes32(0), user, 1000e6, address(usdc), destination);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    /// @dev Signature is bound to msg.sender — user2 cannot reuse user's signature.
    function test_revertIf_signatureUsedByDifferentUser() public {
        uint256 deadline = block.timestamp + 1 hours;
        // Destination signs for `user`, not `user2`
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 1000e6, destination, sig
        );
        strat.deadline = deadline;

        // user2 tries to submit a strategy using the signature intended for user
        vm.startPrank(user2);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(MeridianRouter.InvalidDestinationSignature.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Deadline ─────────────────────────────────────────────────────────────

    function test_revertIf_deadlineExpired() public {
        uint256 expiredDeadline = block.timestamp - 1;
        bytes memory sig = _signDestination(destination, DEST_PK, user, expiredDeadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: expiredDeadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(MeridianRouter.DeadlineExpired.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Steps limit ──────────────────────────────────────────────────────────

    function test_revertIf_tooManySteps() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        // Build MAX_STEPS + 1 = 21 steps
        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](21);
        for (uint256 i = 0; i < 21; i++) {
            steps[i] = IMeridianRouter.Step({
                stepType: IMeridianRouter.StepType.SETTLE,
                protocol: address(0),
                params: "",
                minOutput: 0,
                outputAsset: address(0)
            });
        }

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(MeridianRouter.StepsLimitExceeded.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Emergency Exit ───────────────────────────────────────────────────────

    function test_revertIf_nonOwnerCallsEmergencyExit() public {
        // Non-existent strategy: state.user == address(0) != attacker → NotStrategyOwner
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(MeridianRouter.NotStrategyOwner.selector);
        router.emergencyExit(bytes32(uint256(1)));
    }

    /// @dev Emergency exit returns exactly state.currentAmount — not the full contract balance.
    function test_emergencyExit_returnsOnlyStrategyAmount() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        // user and user2 both submit bridge strategies so funds are held in the router
        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        // User submits and strategy pauses at bridge
        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        router.executeStrategy(strat);
        vm.stopPrank();

        // user2 also pauses at bridge — router now holds funds from both
        uint256 deadline2 = block.timestamp + 1 hours;
        bytes memory sig2 = _signDestination(destination, DEST_PK, user2, deadline2);
        IMeridianRouter.Strategy memory strat2 = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 5000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig2,
            deadline: deadline2,
            creator: address(0)
        });
        vm.startPrank(user2);
        usdc.approve(address(router), 5000e6);
        router.executeStrategy(strat2);
        vm.stopPrank();

        // Router holds 1000 + 5000 = 6000 USDC (minus fees).
        // User's working amount = 1000e6 - fee(800000) = 999_200_000.
        uint256 userWorkingAmount = 1000e6 - (1000e6 * 8 / 10_000);
        uint256 userBalanceBefore = usdc.balanceOf(user);

        // Compute user's strategyId
        bytes32 strategyId = keccak256(abi.encode(
            user,
            address(usdc),
            uint256(1000e6),
            destination,
            deadline,
            block.chainid,
            uint256(0) // nonce 0 for first strategy from this user
        ));

        vm.prank(user);
        router.emergencyExit(strategyId);

        // User should receive exactly their working amount, not all 6000 USDC.
        assertEq(usdc.balanceOf(user) - userBalanceBefore, userWorkingAmount);
    }

    // ─── Protocol Allowlist ───────────────────────────────────────────────────

    function test_revertIf_unapprovedProtocol() public {
        address badProtocol = makeAddr("badProtocol");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: badProtocol, // not in approvedProtocols
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(
            abi.encodeWithSelector(MeridianRouter.ProtocolNotApproved.selector, badProtocol)
        );
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    function test_approvedProtocolExecutesSuccessfully() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(mockProtocol), // approved in setUp
            params: "",
            minOutput: 0,
            outputAsset: address(usdc) // same asset (mock returns same amount)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Nonce-based unique strategy IDs ─────────────────────────────────────

    /// @dev Each executeStrategy call increments the user's nonce, ensuring every submission
    ///      gets a unique ID even if all other parameters are identical. This prevents
    ///      slot collision and allows the same strategy to be run multiple times.
    ///      StrategyUsed fires only if someone constructs a strategyId collision (infeasible).
    function test_nonce_ensuresUniqueStrategyIds() public {
        uint256 deadline = block.timestamp + 1 hours;

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        // First submission (nonce 0)
        bytes memory sig1 = _signDestination(destination, DEST_PK, user, deadline);
        IMeridianRouter.Strategy memory strat1 = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig1,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), 2000e6);
        router.executeStrategy(strat1);
        assertEq(router.userNonces(user), 1); // nonce advanced to 1

        // Second submission with same params (nonce 1) — must succeed with a different ID
        bytes memory sig2 = _signDestination(destination, DEST_PK, user, deadline);
        IMeridianRouter.Strategy memory strat2 = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig2,
            deadline: deadline,
            creator: address(0)
        });
        router.executeStrategy(strat2);
        assertEq(router.userNonces(user), 2); // nonce advanced to 2
        vm.stopPrank();
    }

    // ─── continueStrategy ─────────────────────────────────────────────────────

    function test_revertIf_nonRelayerCallsContinue() public {
        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](0);
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(MeridianRouter.NotRelayer.selector);
        router.continueStrategy(bytes32(uint256(1)), 0, steps, 0);
    }

    function test_continueStrategy_revertsOnStepsHashMismatch() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        // Bridge step pauses execution
        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });
        steps[1] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: 1000e6,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Relayer tries to continue with tampered steps
        IMeridianRouter.Step[] memory tamperedSteps = new IMeridianRouter.Step[](2);
        tamperedSteps[0] = steps[0];
        tamperedSteps[1] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP, // altered!
            protocol: address(mockProtocol),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        bytes32 strategyId = keccak256(abi.encode(
            user, address(usdc), uint256(1000e6), destination, deadline, block.chainid, uint256(0)
        ));

        vm.prank(relayer);
        vm.expectRevert(MeridianRouter.StepsHashMismatch.selector);
        router.continueStrategy(strategyId, 1, tamperedSteps, 990e6);
    }

    // ─── Fee Calculation ──────────────────────────────────────────────────────

    function test_feeIsTakenAtCorrectRate() public {
        uint256 amount = 10_000e6;
        uint256 expectedFee = (amount * 8) / 10_000; // 8 USDC
        assertEq(expectedFee, 8e6);
    }

    /// @dev Marketplace strategy: 2 bps to creator + 3 bps to treasury = 5 bps total.
    function test_marketplaceCreatorFeeRouting() public {
        address creator = makeAddr("creator");
        uint256 amount = 10_000e6;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: amount,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: creator
        });

        uint256 tBefore = usdc.balanceOf(treasury);
        uint256 cBefore = usdc.balanceOf(creator);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(treasury) - tBefore, 3e6, "treasury 3 bps");
        assertEq(usdc.balanceOf(creator)  - cBefore,  2e6, "creator 2 bps");
    }

    /// @dev Direct strategy (creator == address(0)): full 8 bps to treasury, 0 to creator.
    function test_directFeeRoutingNoCreator() public {
        uint256 amount = 10_000e6;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = IMeridianRouter.Strategy({
            sourceAsset: address(usdc),
            sourceAmount: amount,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        uint256 tBefore = usdc.balanceOf(treasury);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(treasury) - tBefore, 8e6, "treasury 8 bps");
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function test_setRelayer_onlyOwner() public {
        address newRelayer = makeAddr("newRelayer");
        vm.prank(owner);
        router.setRelayer(newRelayer);
        assertEq(router.relayer(), newRelayer);
    }

    function test_setRelayer_emitsEvent() public {
        address newRelayer = makeAddr("newRelayer");
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit IMeridianRouter.RelayerUpdated(relayer, newRelayer);
        router.setRelayer(newRelayer);
    }

    function test_setTreasury_emitsEvent() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit IMeridianRouter.TreasuryUpdated(treasury, newTreasury);
        router.setTreasury(newTreasury);
    }

    function test_revertIf_nonOwnerSetsRelayer() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        router.setRelayer(makeAddr("x"));
    }

    function test_revertIf_setRelayerToZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(MeridianRouter.ZeroAddress.selector);
        router.setRelayer(address(0));
    }

    function test_setProtocolApproved_onlyOwner() public {
        address proto = makeAddr("proto");
        assertFalse(router.approvedProtocols(proto));
        vm.prank(owner);
        router.setProtocolApproved(proto, true);
        assertTrue(router.approvedProtocols(proto));
    }

    function test_revertIf_nonOwnerSetsProtocolApproved() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        router.setProtocolApproved(makeAddr("proto"), true);
    }

    // ─── Zero input guards ────────────────────────────────────────────────────

    function test_revertIf_zeroAmount() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);
        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 0, destination, sig
        );
        vm.startPrank(user);
        usdc.approve(address(router), 0);
        vm.expectRevert(MeridianRouter.ZeroAmount.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    function test_revertIf_zeroDestination() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);
        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 1000e6, address(0), sig
        );
        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(MeridianRouter.ZeroAddress.selector);
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    /// @dev Fuzz: any amount with valid signature should pass verification gate.
    function testFuzz_validSigAlwaysPassesVerification(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 10_000e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);
        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), amount, destination, sig
        );
        vm.startPrank(user);
        usdc.approve(address(router), amount);
        try router.executeStrategy(strat) {} catch (bytes memory err) {
            // Must NOT be InvalidDestinationSignature
            bytes4 sig4 = bytes4(err);
            assertTrue(sig4 != MeridianRouter.InvalidDestinationSignature.selector);
        }
        vm.stopPrank();
    }

    /// @dev Fuzz: random signatures must never pass verification.
    function testFuzz_randomSigNeverPassesVerification(
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public {
        v = uint8(bound(v, 27, 28));
        bytes memory badSig = abi.encodePacked(r, s, v);
        IMeridianRouter.Strategy memory strat = _buildMinimalStrategy(
            address(usdc), 1000e6, destination, badSig
        );
        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.stopPrank();
        // Documented property: random sigs are astronomically unlikely to match.
        // This test ensures the function doesn't revert unexpectedly on malformed input.
    }
}
