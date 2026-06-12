// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MeridianRouter} from "../src/MeridianRouter.sol";
import {IMeridianRouter} from "../src/IMeridianRouter.sol";
import {IProtocolAdapter} from "../src/IProtocolAdapter.sol";
import {AaveV3LendAdapter} from "../src/adapters/AaveV3LendAdapter.sol";
import {UniswapV3SwapAdapter, ISwapRouter} from "../src/adapters/UniswapV3SwapAdapter.sol";
import {AcrossBridgeAdapter} from "../src/adapters/AcrossBridgeAdapter.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// ─── Mock Token ───────────────────────────────────────────────────────────────

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ─── Mock Aave V3 Pool ───────────────────────────────────────────────────────
// Simulates Aave's supply(): pulls tokens from caller, mints aTokens to onBehalfOf.
// Uses MockERC20 as the "aToken" for simplicity — 1:1 with underlying.

contract MockAaveV3Pool {
    MockERC20 public aToken;

    constructor() {
        aToken = new MockERC20();
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 /* referralCode */
    ) external {
        // Pull the underlying from caller (the adapter, which approved us)
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        // Mint aTokens 1:1 to onBehalfOf (the router)
        aToken.mint(onBehalfOf, amount);
    }
}

// ─── Mock Adapter (implements IProtocolAdapter) ──────────────────────────────
// Configurable: can return a specific amountOut, revert, or simulate output asset change.

contract MockAdapter is IProtocolAdapter {
    error NotRouter();

    address public immutable router;
    uint256 public returnAmount;
    bool public shouldRevert;
    address public outputToken; // if set, transfers this token back to router instead

    constructor(address _router) {
        router = _router;
    }

    function setReturnAmount(uint256 _amount) external {
        returnAmount = _amount;
    }

    function setShouldRevert(bool _revert) external {
        shouldRevert = _revert;
    }

    function setOutputToken(address _token) external {
        outputToken = _token;
    }

    function execute(
        address asset,
        uint256 amountIn,
        bytes calldata /* params */
    ) external payable override returns (uint256 amountOut) {
        if (msg.sender != router) revert NotRouter();
        if (shouldRevert) revert("MockAdapter: forced revert");

        // Pull tokens from router (approve-then-call pattern)
        IERC20(asset).transferFrom(msg.sender, address(this), amountIn);

        amountOut = returnAmount > 0 ? returnAmount : amountIn;

        if (outputToken != address(0)) {
            // Simulate a swap: send output token to router
            // (output token must be pre-funded to this contract)
            IERC20(outputToken).transfer(msg.sender, amountOut);
        } else {
            // Same-asset operation (like lending): send input back to router
            IERC20(asset).transfer(msg.sender, amountOut);
        }

        return amountOut;
    }

    receive() external payable {}
}

// ─── Mock Adapter for native ETH ─────────────────────────────────────────────

contract MockETHAdapter is IProtocolAdapter {
    error NotRouter();

    address public immutable router;

    constructor(address _router) {
        router = _router;
    }

    function execute(
        address, /* asset */
        uint256 amountIn,
        bytes calldata /* params */
    ) external payable override returns (uint256 amountOut) {
        if (msg.sender != router) revert NotRouter();
        // Send ETH back to router
        (bool ok,) = msg.sender.call{value: amountIn}("");
        require(ok, "ETH return failed");
        return amountIn;
    }

    receive() external payable {}
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

// ─── AaveV3LendAdapter Unit Tests ────────────────────────────────────────────

contract AaveV3LendAdapterTest is Test {
    AaveV3LendAdapter public adapter;
    MockAaveV3Pool public pool;
    MockERC20 public usdc;

    address public router = makeAddr("router");

    function setUp() public {
        pool = new MockAaveV3Pool();
        adapter = new AaveV3LendAdapter(address(pool), router);
        usdc = new MockERC20();
    }

    // ─── Constructor ───────────────────────────────────────────────────────

    function test_constructor_setsPoolAndRouter() public view {
        assertEq(address(adapter.pool()), address(pool));
        assertEq(adapter.router(), router);
    }

    function test_constructor_revertsOnZeroPool() public {
        vm.expectRevert(AaveV3LendAdapter.ZeroAddress.selector);
        new AaveV3LendAdapter(address(0), router);
    }

    function test_constructor_revertsOnZeroRouter() public {
        vm.expectRevert(AaveV3LendAdapter.ZeroAddress.selector);
        new AaveV3LendAdapter(address(pool), address(0));
    }

    // ─── Access Control ────────────────────────────────────────────────────

    function test_execute_revertsIfNotRouter() public {
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(AaveV3LendAdapter.NotRouter.selector);
        adapter.execute(address(usdc), 1000e6, "");
    }

    function test_execute_revertsIfCalledDirectly() public {
        vm.expectRevert(AaveV3LendAdapter.NotRouter.selector);
        adapter.execute(address(usdc), 1000e6, "");
    }

    // ─── Happy Path ────────────────────────────────────────────────────────

    function test_execute_suppliesTokensToAave() public {
        uint256 amount = 1000e6;

        // Fund the router and approve adapter (simulating the router's forceApprove)
        usdc.mint(router, amount);
        vm.prank(router);
        usdc.approve(address(adapter), amount);

        vm.prank(router);
        uint256 amountOut = adapter.execute(address(usdc), amount, "");

        // Returns amountIn (1:1 at deposit)
        assertEq(amountOut, amount);

        // Pool received the tokens
        assertEq(usdc.balanceOf(address(pool)), amount);

        // aTokens minted to the router (onBehalfOf = msg.sender = router)
        assertEq(pool.aToken().balanceOf(router), amount);

        // Adapter holds no dust
        assertEq(usdc.balanceOf(address(adapter)), 0);
    }

    function test_execute_approvesExactAmount() public {
        uint256 amount = 500e6;
        usdc.mint(router, amount);
        vm.prank(router);
        usdc.approve(address(adapter), amount);

        vm.prank(router);
        adapter.execute(address(usdc), amount, "");

        // After supply, the pool consumed the full allowance.
        // Allowance should be 0 (exact amount approved, exact amount pulled).
        assertEq(usdc.allowance(address(adapter), address(pool)), 0);
    }

    // ─── Fuzz ──────────────────────────────────────────────────────────────

    function testFuzz_execute_anyAmount(uint256 amount) public {
        vm.assume(amount > 0 && amount < type(uint128).max);

        usdc.mint(router, amount);
        vm.startPrank(router);
        usdc.approve(address(adapter), amount);
        uint256 amountOut = adapter.execute(address(usdc), amount, "");
        vm.stopPrank();

        assertEq(amountOut, amount);
        assertEq(usdc.balanceOf(address(pool)), amount);
        assertEq(pool.aToken().balanceOf(router), amount);
        assertEq(usdc.balanceOf(address(adapter)), 0);
    }
}

// ─── Router + Adapter Integration Tests ──────────────────────────────────────

contract RouterAdapterIntegrationTest is Test {
    MeridianRouter public router;
    MockERC20 public usdc;
    MockERC20 public weth;
    MockAdapter public lendAdapter;
    MockAdapter public swapAdapter;
    MockAdapter public stakeAdapter;
    MockETHAdapter public ethAdapter;

    address public owner = makeAddr("owner");
    address public relayer = makeAddr("relayer");
    address public treasury = makeAddr("treasury");
    address public user = makeAddr("user");

    uint256 constant DEST_PK = 0xDEADBEEF_CAFEBABE_12345678_90ABCDEF_FEEDFACE_DEADCAFE_BABE1234_5678ABCD;
    address public destination;

    function setUp() public {
        destination = vm.addr(DEST_PK);

        vm.startPrank(owner);
        router = new MeridianRouter(relayer, treasury);
        vm.stopPrank();

        usdc = new MockERC20();
        weth = new MockERC20();

        // Create adapters pointing to the real router
        lendAdapter = new MockAdapter(address(router));
        swapAdapter = new MockAdapter(address(router));
        stakeAdapter = new MockAdapter(address(router));
        ethAdapter = new MockETHAdapter(address(router));

        // Fund user
        usdc.mint(user, 100_000e6);
        vm.deal(user, 10 ether);

        // Fund adapters so they can return tokens
        // (In production, the protocol itself provides the output. Here we pre-fund.)
        usdc.mint(address(lendAdapter), 100_000e6);
        usdc.mint(address(swapAdapter), 100_000e6);
        usdc.mint(address(stakeAdapter), 100_000e6);
        weth.mint(address(swapAdapter), 100 ether);

        // Approve all adapters on the router
        vm.startPrank(owner);
        router.setProtocolApproved(address(lendAdapter), true);
        router.setProtocolApproved(address(swapAdapter), true);
        router.setProtocolApproved(address(stakeAdapter), true);
        router.setProtocolApproved(address(ethAdapter), true);
        vm.stopPrank();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    function _signDestination(
        address dest,
        uint256 pk,
        address signingUser,
        uint256 deadline
    ) internal view returns (bytes memory sig) {
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

    function _buildStrategy(
        address asset,
        uint256 amount,
        IMeridianRouter.Step[] memory steps
    ) internal view returns (IMeridianRouter.Strategy memory) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);
        return IMeridianRouter.Strategy({
            sourceAsset: asset,
            sourceAmount: amount,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });
    }

    function _fee(uint256 amount) internal pure returns (uint256) {
        return (amount * 8) / 10_000;
    }

    // ─── Single LEND Step ──────────────────────────────────────────────────

    function test_lendStep_executesAdapterAndSettles() public {
        uint256 amount = 1000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0) // same asset
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 destBefore = usdc.balanceOf(destination);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Destination received the working amount (adapter returns 1:1)
        assertEq(usdc.balanceOf(destination) - destBefore, working);
    }

    // ─── Single SWAP Step ──────────────────────────────────────────────────

    function test_swapStep_executesAdapterAndSettles() public {
        uint256 amount = 2000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(swapAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 destBefore = usdc.balanceOf(destination);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(destination) - destBefore, working);
    }

    // ─── Single STAKE Step ─────────────────────────────────────────────────

    function test_stakeStep_executesAdapterAndSettles() public {
        uint256 amount = 3000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.STAKE,
            protocol: address(stakeAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 destBefore = usdc.balanceOf(destination);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(destination) - destBefore, working);
    }

    // ─── SWAP with Output Asset Change ─────────────────────────────────────

    function test_swapStep_changesOutputAsset() public {
        uint256 amount = 1000e6;
        uint256 working = amount - _fee(amount);

        // Configure swap adapter to return WETH instead of USDC
        swapAdapter.setOutputToken(address(weth));
        swapAdapter.setReturnAmount(working); // 1:1 for simplicity

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(swapAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(weth) // output changes to WETH
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 destWethBefore = weth.balanceOf(destination);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Destination received WETH, not USDC
        assertEq(weth.balanceOf(destination) - destWethBefore, working);
    }

    // ─── Multi-step: SWAP → LEND → SETTLE ─────────────────────────────────

    function test_multiStep_swapLendSettle() public {
        uint256 amount = 5000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](3);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(swapAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0) // same asset
        });
        steps[1] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });
        steps[2] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 destBefore = usdc.balanceOf(destination);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // All adapters return 1:1 so destination gets full working amount
        assertEq(usdc.balanceOf(destination) - destBefore, working);
    }

    // ─── Multi-step: SWAP → BRIDGE (pauses) → relayer continues → SETTLE ──

    function test_multiStep_swapBridgeSettle_withContinue() public {
        uint256 amount = 2000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](3);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(swapAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });
        steps[1] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });
        steps[2] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SETTLE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Strategy paused at BRIDGE (step 1). currentStep should be 2.
        bytes32 strategyId = keccak256(abi.encode(
            user, address(usdc), amount, destination, strat.deadline, block.chainid, uint256(0)
        ));
        (uint256 currentStep, bool isActive, bool isFailed) = router.strategyStatus(strategyId);
        assertEq(currentStep, 2);
        assertTrue(isActive);
        assertFalse(isFailed);

        // Fund the router with bridged amount (simulating bridge arrival)
        uint256 bridgedAmount = working - 1e6; // bridge took 1 USDC fee
        usdc.mint(address(router), bridgedAmount);

        // Relayer continues from step 2
        uint256 destBefore = usdc.balanceOf(destination);
        vm.prank(relayer);
        router.continueStrategy(strategyId, 2, strat.steps, bridgedAmount);

        // Strategy completed — destination received bridged amount
        assertEq(usdc.balanceOf(destination) - destBefore, bridgedAmount);

        (, bool isActiveAfter, bool isFailedAfter) = router.strategyStatus(strategyId);
        assertFalse(isActiveAfter);
        assertFalse(isFailedAfter);
    }

    // ─── Adapter Revert → Strategy Fails Gracefully ─────────────────────
    //
    // With approve-then-call, if the adapter reverts, the entire .call()
    // frame reverts (including the transferFrom inside the adapter).
    // Tokens stay in the router → _failStrategy correctly refunds the user.

    function test_adapterRevert_failsGracefully() public {
        uint256 amount = 1000e6;

        lendAdapter.setShouldRevert(true);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 userBefore = usdc.balanceOf(user);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // User gets working amount back (only fee is lost)
        uint256 fee = _fee(amount);
        assertEq(usdc.balanceOf(user), userBefore - fee);

        // Strategy marked as failed
        bytes32 strategyId = keccak256(abi.encode(
            user, address(usdc), amount, destination, strat.deadline, block.chainid, uint256(0)
        ));
        (, bool isActive, bool isFailed) = router.strategyStatus(strategyId);
        assertFalse(isActive);
        assertTrue(isFailed);
    }

    // ─── Slippage: Adapter Returns Less Than minOutput ─────────────────────
    //
    // With the fix, _failStrategy uses amountOut (what the adapter actually
    // returned) instead of currentAmount (pre-step). The router holds amountOut
    // so the refund succeeds. User gets partial amount back.

    function test_slippageExceeded_failsGracefully() public {
        uint256 amount = 1000e6;
        uint256 working = amount - _fee(amount);
        uint256 halfWorking = working / 2;

        // Adapter returns only half the input
        swapAdapter.setReturnAmount(halfWorking);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(swapAdapter),
            params: "",
            minOutput: working, // demand full amount back
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 userBefore = usdc.balanceOf(user);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // User gets back the partial amount the adapter returned (minus fee)
        // Lost: fee + the other half that the adapter consumed
        assertEq(usdc.balanceOf(user), userBefore - amount + halfWorking);

        // Strategy marked as failed
        bytes32 strategyId = keccak256(abi.encode(
            user, address(usdc), amount, destination, strat.deadline, block.chainid, uint256(0)
        ));
        (, bool isActive, bool isFailed) = router.strategyStatus(strategyId);
        assertFalse(isActive);
        assertTrue(isFailed);
    }

    // ─── Native ETH Through Adapter ────────────────────────────────────────

    function test_ethStep_executesAdapterAndSettles() public {
        uint256 amount = 1 ether;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(ethAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(0), amount, steps);

        uint256 destBefore = destination.balance;

        vm.startPrank(user);
        router.executeStrategy{value: amount}(strat);
        vm.stopPrank();

        assertEq(destination.balance - destBefore, working);
    }

    // ─── Events Emitted Correctly ──────────────────────────────────────────

    function test_lendStep_emitsStepExecuted() public {
        uint256 amount = 1000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        vm.startPrank(user);
        usdc.approve(address(router), amount);

        // Expect StepExecuted for the LEND step
        vm.expectEmit(false, false, false, true);
        emit IMeridianRouter.StepExecuted(
            bytes32(0), // don't check strategyId (it's derived)
            0,          // stepIndex
            IMeridianRouter.StepType.LEND,
            address(lendAdapter),
            working
        );

        router.executeStrategy(strat);
        vm.stopPrank();
    }

    function test_adapterRevert_emitsStrategyFailed() public {
        uint256 amount = 1000e6;

        lendAdapter.setShouldRevert(true);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        vm.startPrank(user);
        usdc.approve(address(router), amount);

        vm.expectEmit(false, false, false, true);
        emit IMeridianRouter.StrategyFailed(bytes32(0), 0, "StepFailed");

        router.executeStrategy(strat);
        vm.stopPrank();
    }

    function test_multiStep_emitsStrategyCompleted() public {
        uint256 amount = 1000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
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

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        vm.startPrank(user);
        usdc.approve(address(router), amount);

        vm.expectEmit(false, true, false, true);
        emit IMeridianRouter.StrategyCompleted(
            bytes32(0), destination, address(usdc), working
        );

        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Emergency Exit After Adapter Step ─────────────────────────────────

    function test_emergencyExit_afterAdapterThenBridge() public {
        uint256 amount = 2000e6;
        uint256 working = amount - _fee(amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });
        steps[1] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(0),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Strategy paused at bridge after LEND step succeeded
        bytes32 strategyId = keccak256(abi.encode(
            user, address(usdc), amount, destination, strat.deadline, block.chainid, uint256(0)
        ));

        (uint256 currentStep, bool isActive,) = router.strategyStatus(strategyId);
        assertEq(currentStep, 2);
        assertTrue(isActive);

        // User triggers emergency exit
        uint256 userBefore = usdc.balanceOf(user);
        vm.prank(user);
        router.emergencyExit(strategyId);

        // User gets back the working amount (post-LEND, adapter returned 1:1)
        assertEq(usdc.balanceOf(user) - userBefore, working);

        (, bool isActiveAfter, bool isFailedAfter) = router.strategyStatus(strategyId);
        assertFalse(isActiveAfter);
        assertTrue(isFailedAfter);
    }

    // ─── Unapproved Adapter Reverts ────────────────────────────────────────

    function test_revertIf_adapterNotApproved() public {
        MockAdapter unapprovedAdapter = new MockAdapter(address(router));

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(unapprovedAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), 1000e6, steps);

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                MeridianRouter.ProtocolNotApproved.selector,
                address(unapprovedAdapter)
            )
        );
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Adapter Revoked Mid-Flight ────────────────────────────────────────

    function test_revokedAdapter_preventsExecution() public {
        // Revoke the lend adapter
        vm.prank(owner);
        router.setProtocolApproved(address(lendAdapter), false);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), 1000e6, steps);

        vm.startPrank(user);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                MeridianRouter.ProtocolNotApproved.selector,
                address(lendAdapter)
            )
        );
        router.executeStrategy(strat);
        vm.stopPrank();
    }

    // ─── Fuzz: Adapter Always Settles Correct Amount ───────────────────────

    function testFuzz_lendStep_settlesCorrectAmount(uint256 amount) public {
        vm.assume(amount > 100 && amount <= 50_000e6);
        uint256 working = amount - _fee(amount);

        // Ensure adapter has enough tokens
        usdc.mint(address(lendAdapter), working);
        usdc.mint(user, amount);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(lendAdapter),
            params: "",
            minOutput: 0,
            outputAsset: address(0)
        });

        IMeridianRouter.Strategy memory strat = _buildStrategy(address(usdc), amount, steps);

        uint256 destBefore = usdc.balanceOf(destination);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(destination) - destBefore, working);
    }
}

// ─── AaveV3LendAdapter + Router Full Integration ─────────────────────────────
// Tests the REAL AaveV3LendAdapter (not MockAdapter) through the router,
// using MockAaveV3Pool as the Aave backend.

contract AaveV3RouterIntegrationTest is Test {
    MeridianRouter public router;
    AaveV3LendAdapter public adapter;
    MockAaveV3Pool public pool;
    MockERC20 public usdc;

    address public owner = makeAddr("owner");
    address public relayer = makeAddr("relayer");
    address public treasury = makeAddr("treasury");
    address public user = makeAddr("user");

    uint256 constant DEST_PK = 0xDEADBEEF_CAFEBABE_12345678_90ABCDEF_FEEDFACE_DEADCAFE_BABE1234_5678ABCD;
    address public destination;

    function setUp() public {
        destination = vm.addr(DEST_PK);

        vm.startPrank(owner);
        router = new MeridianRouter(relayer, treasury);
        vm.stopPrank();

        usdc = new MockERC20();
        pool = new MockAaveV3Pool();
        adapter = new AaveV3LendAdapter(address(pool), address(router));

        usdc.mint(user, 100_000e6);

        vm.prank(owner);
        router.setProtocolApproved(address(adapter), true);
    }

    function _signDestination(
        address dest,
        uint256 pk,
        address signingUser,
        uint256 deadline
    ) internal view returns (bytes memory sig) {
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

    function _fee(uint256 amount) internal pure returns (uint256) {
        return (amount * 8) / 10_000;
    }

    /// @dev Full flow: user → router → AaveV3LendAdapter → MockAaveV3Pool → aTokens to router → settle to destination.
    /// This tests the REAL adapter code, not a mock.
    function test_realAaveAdapter_fullFlow() public {
        uint256 amount = 5000e6;
        uint256 working = amount - _fee(amount);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(adapter),
            params: "",
            minOutput: 0,
            // outputAsset: aToken, but settlement uses currentAsset.
            // Since Aave returns amountIn and the aTokens go to the router via onBehalfOf,
            // the router's _callAdapter only sees the uint256 return. The "settlement"
            // at the end transfers currentAsset (USDC) because outputAsset is address(0).
            // NOTE: In production, the outputAsset should be set to the aToken address
            // so the router settles aTokens to destination. For this test we verify
            // the adapter mechanics work — the aTokens end up at the router.
            outputAsset: address(pool.aToken())
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

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // The Aave pool received the USDC
        assertEq(usdc.balanceOf(address(pool)), working);

        // The aTokens were minted to the router (onBehalfOf = router = msg.sender of adapter)
        // then the router settled them to destination (because outputAsset = aToken)
        assertEq(pool.aToken().balanceOf(destination), working);

        // No dust left in adapter or router
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(pool.aToken().balanceOf(address(router)), 0);
    }

    /// @dev Verify aTokens don't leak — adapter holds nothing after execution.
    function test_realAaveAdapter_noDustInAdapter() public {
        uint256 amount = 1000e6;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(adapter),
            params: "",
            minOutput: 0,
            outputAsset: address(pool.aToken())
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

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(adapter)), 0, "adapter holds USDC dust");
        assertEq(pool.aToken().balanceOf(address(adapter)), 0, "adapter holds aToken dust");
    }

    /// @dev Fuzz the full flow with real adapter.
    function testFuzz_realAaveAdapter(uint256 amount) public {
        vm.assume(amount > 100 && amount <= 50_000e6);
        uint256 working = amount - _fee(amount);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.LEND,
            protocol: address(adapter),
            params: "",
            minOutput: 0,
            outputAsset: address(pool.aToken())
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

        usdc.mint(user, amount); // extra for fuzz

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(pool)), working, "pool balance");
        assertEq(pool.aToken().balanceOf(destination), working, "destination aTokens");
        assertEq(usdc.balanceOf(address(adapter)), 0, "no USDC dust");
        assertEq(pool.aToken().balanceOf(address(adapter)), 0, "no aToken dust");
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// UniswapV3SwapAdapter Tests
// ═════════════════════════════════════════════════════════════════════════════

// ─── Mock Uniswap V3 SwapRouter ──────────────────────────────────────────────
// Simulates exactInputSingle: pulls tokenIn, sends tokenOut to recipient.
// Uses a fixed exchange rate for deterministic testing.

contract MockSwapRouter {
    // 1 tokenIn = 2 tokenOut (2:1 rate for easy assertions)
    uint256 public constant RATE_NUMERATOR = 2;

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut)
    {
        // Pull tokenIn from caller (the adapter)
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output at mock rate
        amountOut = params.amountIn * RATE_NUMERATOR;

        // Enforce slippage
        require(amountOut >= params.amountOutMinimum, "MockSwapRouter: slippage");

        // Send tokenOut directly to recipient (the router)
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
    }
}

// ─── UniswapV3SwapAdapter Unit Tests ─────────────────────────────────────────

contract UniswapV3SwapAdapterTest is Test {
    UniswapV3SwapAdapter public adapter;
    MockSwapRouter public swapRouter;
    MockERC20 public usdc;
    MockERC20 public weth;

    address public router = makeAddr("router");

    function setUp() public {
        swapRouter = new MockSwapRouter();
        adapter = new UniswapV3SwapAdapter(address(swapRouter), router);
        usdc = new MockERC20();
        weth = new MockERC20();

        // Pre-fund the swap router with output tokens
        weth.mint(address(swapRouter), 1_000_000 ether);
    }

    // ─── Constructor ───────────────────────────────────────────────────────

    function test_constructor_setsSwapRouterAndRouter() public view {
        assertEq(address(adapter.swapRouter()), address(swapRouter));
        assertEq(adapter.router(), router);
    }

    function test_constructor_revertsOnZeroSwapRouter() public {
        vm.expectRevert(UniswapV3SwapAdapter.ZeroAddress.selector);
        new UniswapV3SwapAdapter(address(0), router);
    }

    function test_constructor_revertsOnZeroRouter() public {
        vm.expectRevert(UniswapV3SwapAdapter.ZeroAddress.selector);
        new UniswapV3SwapAdapter(address(swapRouter), address(0));
    }

    // ─── Access Control ────────────────────────────────────────────────────

    function test_execute_revertsIfNotRouter() public {
        bytes memory params = abi.encode(address(weth), uint24(3000), uint256(0));
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(UniswapV3SwapAdapter.NotRouter.selector);
        adapter.execute(address(usdc), 1000e6, params);
    }

    // ─── Params Validation ─────────────────────────────────────────────────

    function test_execute_revertsOnShortParams() public {
        usdc.mint(router, 1000e6);
        vm.startPrank(router);
        usdc.approve(address(adapter), 1000e6);
        vm.expectRevert(UniswapV3SwapAdapter.InvalidParams.selector);
        adapter.execute(address(usdc), 1000e6, "");
        vm.stopPrank();
    }

    // ─── Happy Path ────────────────────────────────────────────────────────

    function test_execute_swapsTokens() public {
        uint256 amountIn = 1000e6;
        uint256 expectedOut = amountIn * 2; // MockSwapRouter 2:1 rate

        usdc.mint(router, amountIn);
        vm.startPrank(router);
        usdc.approve(address(adapter), amountIn);

        bytes memory params = abi.encode(address(weth), uint24(3000), uint256(0));
        uint256 amountOut = adapter.execute(address(usdc), amountIn, params);
        vm.stopPrank();

        // Correct output amount
        assertEq(amountOut, expectedOut);

        // SwapRouter received the input tokens
        assertEq(usdc.balanceOf(address(swapRouter)), amountIn);

        // Output tokens sent directly to router (recipient = msg.sender)
        assertEq(weth.balanceOf(router), expectedOut);

        // Adapter holds no dust
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(weth.balanceOf(address(adapter)), 0);
    }

    function test_execute_respectsAmountOutMinimum() public {
        uint256 amountIn = 1000e6;
        uint256 expectedOut = amountIn * 2;

        usdc.mint(router, amountIn);
        vm.startPrank(router);
        usdc.approve(address(adapter), amountIn);

        // Set amountOutMinimum higher than what the mock will return
        bytes memory params = abi.encode(address(weth), uint24(3000), expectedOut + 1);
        vm.expectRevert("MockSwapRouter: slippage");
        adapter.execute(address(usdc), amountIn, params);
        vm.stopPrank();
    }

    // ─── Fuzz ──────────────────────────────────────────────────────────────

    function testFuzz_execute_anyAmount(uint256 amountIn) public {
        vm.assume(amountIn > 0 && amountIn < type(uint128).max / 2);

        usdc.mint(router, amountIn);
        weth.mint(address(swapRouter), amountIn * 2); // ensure liquidity

        vm.startPrank(router);
        usdc.approve(address(adapter), amountIn);
        bytes memory params = abi.encode(address(weth), uint24(3000), uint256(0));
        uint256 amountOut = adapter.execute(address(usdc), amountIn, params);
        vm.stopPrank();

        assertEq(amountOut, amountIn * 2);
        assertEq(usdc.balanceOf(address(adapter)), 0, "no input dust");
        assertEq(weth.balanceOf(address(adapter)), 0, "no output dust");
    }
}

// ─── UniswapV3SwapAdapter + Router Full Integration ──────────────────────────

contract UniswapV3RouterIntegrationTest is Test {
    MeridianRouter public router;
    UniswapV3SwapAdapter public adapter;
    MockSwapRouter public swapRouter;
    MockERC20 public usdc;
    MockERC20 public weth;

    address public owner = makeAddr("owner");
    address public relayer = makeAddr("relayer");
    address public treasury = makeAddr("treasury");
    address public user = makeAddr("user");

    uint256 constant DEST_PK = 0xDEADBEEF_CAFEBABE_12345678_90ABCDEF_FEEDFACE_DEADCAFE_BABE1234_5678ABCD;
    address public destination;

    function setUp() public {
        destination = vm.addr(DEST_PK);

        vm.startPrank(owner);
        router = new MeridianRouter(relayer, treasury);
        vm.stopPrank();

        usdc = new MockERC20();
        weth = new MockERC20();
        swapRouter = new MockSwapRouter();
        adapter = new UniswapV3SwapAdapter(address(swapRouter), address(router));

        usdc.mint(user, 100_000e6);
        weth.mint(address(swapRouter), 1_000_000 ether);

        vm.prank(owner);
        router.setProtocolApproved(address(adapter), true);
    }

    function _signDestination(
        address dest, uint256 pk, address signingUser, uint256 deadline
    ) internal view returns (bytes memory sig) {
        bytes32 message = keccak256(abi.encodePacked(
            "Meridian destination verification\n",
            "Chain: ", block.chainid, "\n",
            "I confirm this wallet is mine: ", dest,
            "\nUser: ", signingUser,
            "\nDeadline: ", deadline
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        sig = abi.encodePacked(r, s, v);
    }

    function _fee(uint256 amount) internal pure returns (uint256) {
        return (amount * 8) / 10_000;
    }

    /// @dev Full flow: user deposits USDC → SWAP via Uniswap → receives WETH at destination.
    function test_swapUsdcToWeth_fullFlow() public {
        uint256 amount = 5000e6;
        uint256 working = amount - _fee(amount);
        uint256 expectedWeth = working * 2; // MockSwapRouter 2:1
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        bytes memory swapParams = abi.encode(address(weth), uint24(3000), uint256(0));

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(adapter),
            params: swapParams,
            minOutput: 0,
            outputAsset: address(weth)
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

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Destination received WETH (not USDC)
        assertEq(weth.balanceOf(destination), expectedWeth, "destination WETH");

        // USDC went to the mock swap router
        assertEq(usdc.balanceOf(address(swapRouter)), working, "swapRouter received USDC");

        // No dust in adapter or router
        assertEq(usdc.balanceOf(address(adapter)), 0, "adapter no USDC");
        assertEq(weth.balanceOf(address(adapter)), 0, "adapter no WETH");
        assertEq(weth.balanceOf(address(router)), 0, "router no WETH dust");
    }

    /// @dev Swap with slippage protection — minOutput on the step should catch it too.
    function test_swapSlippage_protectedByAdapter() public {
        uint256 amount = 1000e6;
        uint256 working = amount - _fee(amount);
        uint256 expectedWeth = working * 2;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        // Set amountOutMinimum impossibly high inside params
        bytes memory swapParams = abi.encode(address(weth), uint24(3000), expectedWeth + 1);

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(adapter),
            params: swapParams,
            minOutput: 0,
            outputAsset: address(weth)
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

        uint256 userBefore = usdc.balanceOf(user);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        // Adapter reverts on slippage → _callAdapter returns (false, 0)
        // → _failStrategy returns working amount to user (approve-then-call: tokens stayed)
        router.executeStrategy(strat);
        vm.stopPrank();

        // User gets working amount back (fee already taken)
        assertEq(usdc.balanceOf(user), userBefore - _fee(amount), "user refunded");
        assertEq(weth.balanceOf(destination), 0, "destination got nothing");
    }

    /// @dev Multi-step: SWAP USDC→WETH then SETTLE
    function test_swapThenSettle() public {
        uint256 amount = 2000e6;
        uint256 working = amount - _fee(amount);
        uint256 expectedWeth = working * 2;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        bytes memory swapParams = abi.encode(address(weth), uint24(3000), uint256(0));

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(adapter),
            params: swapParams,
            minOutput: 0,
            outputAsset: address(weth)
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
            sourceAmount: amount,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(weth.balanceOf(destination), expectedWeth, "destination WETH");
    }

    /// @dev Fuzz the full swap flow.
    function testFuzz_swapFullFlow(uint256 amount) public {
        vm.assume(amount > 100 && amount <= 50_000e6);
        uint256 working = amount - _fee(amount);
        uint256 expectedWeth = working * 2;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        bytes memory swapParams = abi.encode(address(weth), uint24(3000), uint256(0));

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](1);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.SWAP,
            protocol: address(adapter),
            params: swapParams,
            minOutput: 0,
            outputAsset: address(weth)
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

        usdc.mint(user, amount);

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        assertEq(weth.balanceOf(destination), expectedWeth, "destination WETH");
        assertEq(usdc.balanceOf(address(adapter)), 0, "no USDC dust");
        assertEq(weth.balanceOf(address(adapter)), 0, "no WETH dust");
    }
}

// ─── Mock SpokePool for AcrossBridgeAdapter ─────────────────────────────────

/// @dev Minimal mock of Across v3 SpokePool.depositV3 — just pulls tokens.
contract MockSpokePool {
    event DepositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId
    );

    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address, /* exclusiveRelayer */
        uint32,  /* quoteTimestamp */
        uint32,  /* fillDeadline */
        uint32,  /* exclusivityDeadline */
        bytes calldata /* message */
    ) external payable {
        IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount);
        emit DepositV3(depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, destinationChainId);
    }
}

// ─── AcrossBridgeAdapter unit tests ──────────────────────────────────────────

contract AcrossBridgeAdapterTest is Test {
    MockERC20 usdc;
    MockSpokePool spokePool;
    AcrossBridgeAdapter adapter;
    address router = address(0xA0A0);

    function setUp() public {
        usdc = new MockERC20();
        spokePool = new MockSpokePool();
        adapter = new AcrossBridgeAdapter(address(spokePool), router);
    }

    function test_constructor_revertsOnZeroSpokePool() public {
        vm.expectRevert(AcrossBridgeAdapter.ZeroAddress.selector);
        new AcrossBridgeAdapter(address(0), router);
    }

    function test_constructor_revertsOnZeroRouter() public {
        vm.expectRevert(AcrossBridgeAdapter.ZeroAddress.selector);
        new AcrossBridgeAdapter(address(spokePool), address(0));
    }

    function test_constructor_setsSpokePoolAndRouter() public view {
        assertEq(address(adapter.spokePool()), address(spokePool));
        assertEq(adapter.router(), router);
    }

    function test_execute_revertsIfNotRouter() public {
        bytes memory params = abi.encode(address(0xBEEF), address(usdc), uint256(84532), uint256(900e6), uint32(block.timestamp + 3600));
        vm.expectRevert(AcrossBridgeAdapter.NotRouter.selector);
        adapter.execute(address(usdc), 1000e6, params);
    }

    function test_execute_revertsOnShortParams() public {
        vm.prank(router);
        vm.expectRevert(AcrossBridgeAdapter.InvalidParams.selector);
        adapter.execute(address(usdc), 1000e6, hex"0011");
    }

    function test_execute_depositsIntoSpokePool() public {
        uint256 amount = 1000e6;
        address recipient = address(0xDE57);
        address outputToken = address(0x007);
        uint256 destChainId = 84532;
        uint256 outputAmount = 990e6;
        uint32 fillDeadline = uint32(block.timestamp + 3600);

        bytes memory params = abi.encode(recipient, outputToken, destChainId, outputAmount, fillDeadline);

        // Mint to router and approve adapter
        usdc.mint(router, amount);
        vm.prank(router);
        usdc.approve(address(adapter), amount);

        vm.prank(router);
        uint256 amountOut = adapter.execute(address(usdc), amount, params);

        // Returns 0 (tokens in transit)
        assertEq(amountOut, 0, "bridge returns 0");
        // SpokePool received the tokens
        assertEq(usdc.balanceOf(address(spokePool)), amount, "spokePool got tokens");
        // No dust in adapter
        assertEq(usdc.balanceOf(address(adapter)), 0, "no dust in adapter");
    }

    function testFuzz_execute_anyAmount(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 100_000_000e6);
        address recipient = address(0xDE57);
        uint32 fillDeadline = uint32(block.timestamp + 3600);
        bytes memory params = abi.encode(recipient, address(usdc), uint256(84532), amount, fillDeadline);

        usdc.mint(router, amount);
        vm.prank(router);
        usdc.approve(address(adapter), amount);

        vm.prank(router);
        uint256 out = adapter.execute(address(usdc), amount, params);

        assertEq(out, 0, "always returns 0");
        assertEq(usdc.balanceOf(address(spokePool)), amount, "spokePool balance");
        assertEq(usdc.balanceOf(address(adapter)), 0, "no dust");
    }
}

// ─── AcrossBridgeAdapter + Router integration ───────────────────────────────

contract AcrossBridgeRouterIntegrationTest is Test {
    MockERC20 usdc;
    MockSpokePool spokePool;
    MeridianRouter router;
    AcrossBridgeAdapter bridgeAdapter;

    uint256 constant USER_PK   = 0xA11CE;
    uint256 constant DEST_PK   = 0xDE57;
    address user;
    address destination;
    address relayer = address(0xEEEE);
    address treasury = address(0xFEE);

    function setUp() public {
        usdc = new MockERC20();
        spokePool = new MockSpokePool();
        router = new MeridianRouter(relayer, treasury);

        bridgeAdapter = new AcrossBridgeAdapter(address(spokePool), address(router));
        router.setProtocolApproved(address(bridgeAdapter), true);

        user = vm.addr(USER_PK);
        destination = vm.addr(DEST_PK);

        usdc.mint(user, 100_000e6);
    }

    function _signDestination(address dest, uint256 pk, address signingUser, uint256 deadline)
        internal view returns (bytes memory sig)
    {
        bytes32 message = keccak256(abi.encodePacked(
            "Meridian destination verification\n",
            "Chain: ", block.chainid,
            "\n", "I confirm this wallet is mine: ", dest,
            "\nUser: ", signingUser,
            "\nDeadline: ", deadline
        ));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        sig = abi.encodePacked(r, s, v);
    }

    function _fee(uint256 amount) internal pure returns (uint256) {
        return (amount * 8) / 10_000;
    }

    /// @dev BRIDGE step pauses the router — tokens go to SpokePool, strategy stays active.
    function test_bridgeStep_pausesAndDeposits() public {
        uint256 amount = 5000e6;
        uint256 working = amount - _fee(amount);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        bytes memory bridgeParams = abi.encode(
            address(0xDE570000), // recipient on destination chain
            address(usdc),          // outputToken on destination chain
            uint256(84532),         // destination chain ID
            uint256(working - 10e6),// outputAmount (after bridge fees)
            uint32(block.timestamp + 3600) // fillDeadline
        );

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(bridgeAdapter),
            params: bridgeParams,
            minOutput: 0,
            outputAsset: address(usdc)
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
            sourceAmount: amount,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        // Strategy should be paused (active, at step 1)
        (uint256 currentStep, bool isActive, bool isFailed) = router.strategyStatus(
            _computeStrategyId(user, strat)
        );
        assertEq(currentStep, 1, "paused after bridge");
        assertTrue(isActive, "still active");
        assertFalse(isFailed, "not failed");

        // SpokePool received the working amount
        assertEq(usdc.balanceOf(address(spokePool)), working, "spokePool got tokens");
        // Router holds 0 (tokens went to bridge)
        assertEq(usdc.balanceOf(address(router)), 0, "router empty");
    }

    /// @dev Full cross-chain flow: BRIDGE → continueStrategy → SETTLE
    function test_bridgeThenContinue_fullFlow() public {
        uint256 amount = 5000e6;
        uint256 working = amount - _fee(amount);
        uint256 bridgedAmount = working - 5e6; // simulated bridge fee
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signDestination(destination, DEST_PK, user, deadline);

        bytes memory bridgeParams = abi.encode(
            address(0xDE570000),
            address(usdc),
            uint256(84532),
            uint256(0),
            uint32(block.timestamp + 3600)
        );

        IMeridianRouter.Step[] memory steps = new IMeridianRouter.Step[](2);
        steps[0] = IMeridianRouter.Step({
            stepType: IMeridianRouter.StepType.BRIDGE,
            protocol: address(bridgeAdapter),
            params: bridgeParams,
            minOutput: 0,
            outputAsset: address(usdc)
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
            sourceAmount: amount,
            steps: steps,
            destinationWallet: destination,
            destinationSignature: sig,
            deadline: deadline,
            creator: address(0)
        });

        vm.startPrank(user);
        usdc.approve(address(router), amount);
        router.executeStrategy(strat);
        vm.stopPrank();

        bytes32 strategyId = _computeStrategyId(user, strat);

        // Simulate bridge fill: relayer mints bridgedAmount to router and calls continueStrategy
        usdc.mint(address(router), bridgedAmount);

        vm.prank(relayer);
        router.continueStrategy(strategyId, 1, steps, bridgedAmount);

        // Strategy completed — destination received bridgedAmount
        (,bool isActive, bool isFailed) = router.strategyStatus(strategyId);
        assertFalse(isActive, "completed");
        assertFalse(isFailed, "not failed");
        assertEq(usdc.balanceOf(destination), bridgedAmount, "destination received bridged amount");
    }

    function _computeStrategyId(address u, IMeridianRouter.Strategy memory strat)
        internal view returns (bytes32)
    {
        // Nonce was 0 before execution (first strategy for this user)
        return keccak256(abi.encode(
            u,
            strat.sourceAsset,
            strat.sourceAmount,
            strat.destinationWallet,
            strat.deadline,
            block.chainid,
            uint256(0)
        ));
    }
}
