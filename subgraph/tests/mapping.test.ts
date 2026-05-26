import {
  assert,
  describe,
  test,
  beforeEach,
  clearStore,
} from 'matchstick-as/assembly/index';
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import {
  handleStrategyStarted,
  handleStepExecuted,
  handleStrategyCompleted,
  handleStrategyFailed,
  handleEmergencyExitTriggered,
} from '../src/mapping';
import {
  StrategyStarted,
  StepExecuted,
  StrategyCompleted,
  StrategyFailed,
  EmergencyExitTriggered,
} from '../generated/MeridianRouter_Ethereum/MeridianRouter';

// ── Helpers ─────────────────────────────────────────────────────────────────

const STRATEGY_ID = Bytes.fromHexString('0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899');
const USER = Address.fromString('0x1111111111111111111111111111111111111111');
const SOURCE_ASSET = Address.fromString('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'); // USDC
const DESTINATION = Address.fromString('0x2222222222222222222222222222222222222222');
const PROTOCOL = Address.fromString('0x3333333333333333333333333333333333333333');
const AMOUNT = BigInt.fromI64(1000000000); // 1000 USDC (6 decimals)
const TIMESTAMP = BigInt.fromI64(1700000000);
const BLOCK_NUM = BigInt.fromI64(18000000);

function mockBlock(): ethereum.Block {
  return new ethereum.Block(
    Bytes.fromHexString('0x' + '00'.repeat(32)),
    Bytes.fromHexString('0x' + '00'.repeat(32)),
    Bytes.fromHexString('0x' + '00'.repeat(32)),
    Address.zero(),
    Bytes.fromHexString('0x' + '00'.repeat(32)),
    Bytes.fromHexString('0x' + '00'.repeat(32)),
    Bytes.fromHexString('0x' + '00'.repeat(32)),
    BLOCK_NUM,
    BigInt.fromI32(30000000),
    BigInt.fromI32(10000000),
    TIMESTAMP,
    BigInt.fromI32(1),
    BigInt.fromI32(1),
    null,
    null,
  );
}

function mockTx(): ethereum.Transaction {
  return new ethereum.Transaction(
    Bytes.fromHexString('0x' + 'aa'.repeat(32)),
    BigInt.fromI32(0),
    Address.zero(),
    null,
    BigInt.zero(),
    BigInt.fromI32(21000),
    BigInt.fromI32(1000000000),
    Bytes.fromHexString('0x'),
    BigInt.zero(),
  );
}

function createStrategyStartedEvent(): StrategyStarted {
  const ev = changetype<StrategyStarted>(new ethereum.Event(
    Address.zero(),
    BigInt.zero(),
    BigInt.zero(),
    null,
    mockBlock(),
    mockTx(),
    [],
    null,
  ));
  ev.parameters = [];
  ev.parameters.push(new ethereum.EventParam('strategyId', ethereum.Value.fromBytes(STRATEGY_ID)));
  ev.parameters.push(new ethereum.EventParam('user', ethereum.Value.fromAddress(USER)));
  ev.parameters.push(new ethereum.EventParam('amount', ethereum.Value.fromUnsignedBigInt(AMOUNT)));
  ev.parameters.push(new ethereum.EventParam('sourceAsset', ethereum.Value.fromAddress(SOURCE_ASSET)));
  ev.parameters.push(new ethereum.EventParam('destinationWallet', ethereum.Value.fromAddress(DESTINATION)));
  return ev;
}

function createStepExecutedEvent(stepType: i32): StepExecuted {
  const ev = changetype<StepExecuted>(new ethereum.Event(
    Address.zero(),
    BigInt.zero(),
    BigInt.zero(),
    null,
    mockBlock(),
    mockTx(),
    [],
    null,
  ));
  ev.parameters = [];
  ev.parameters.push(new ethereum.EventParam('strategyId', ethereum.Value.fromBytes(STRATEGY_ID)));
  ev.parameters.push(new ethereum.EventParam('stepIndex', ethereum.Value.fromUnsignedBigInt(BigInt.zero())));
  ev.parameters.push(new ethereum.EventParam('stepType', ethereum.Value.fromI32(stepType)));
  ev.parameters.push(new ethereum.EventParam('protocol', ethereum.Value.fromAddress(PROTOCOL)));
  ev.parameters.push(new ethereum.EventParam('amountOut', ethereum.Value.fromUnsignedBigInt(AMOUNT)));
  return ev;
}

function createStrategyCompletedEvent(): StrategyCompleted {
  const ev = changetype<StrategyCompleted>(new ethereum.Event(
    Address.zero(),
    BigInt.zero(),
    BigInt.zero(),
    null,
    mockBlock(),
    mockTx(),
    [],
    null,
  ));
  ev.parameters = [];
  ev.parameters.push(new ethereum.EventParam('strategyId', ethereum.Value.fromBytes(STRATEGY_ID)));
  ev.parameters.push(new ethereum.EventParam('destination', ethereum.Value.fromAddress(DESTINATION)));
  ev.parameters.push(new ethereum.EventParam('asset', ethereum.Value.fromAddress(SOURCE_ASSET)));
  ev.parameters.push(new ethereum.EventParam('finalAmount', ethereum.Value.fromUnsignedBigInt(AMOUNT)));
  return ev;
}

function createStrategyFailedEvent(): StrategyFailed {
  const ev = changetype<StrategyFailed>(new ethereum.Event(
    Address.zero(),
    BigInt.zero(),
    BigInt.zero(),
    null,
    mockBlock(),
    mockTx(),
    [],
    null,
  ));
  ev.parameters = [];
  ev.parameters.push(new ethereum.EventParam('strategyId', ethereum.Value.fromBytes(STRATEGY_ID)));
  ev.parameters.push(new ethereum.EventParam('failedStep', ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(2))));
  ev.parameters.push(new ethereum.EventParam('reason', ethereum.Value.fromString('Slippage exceeded')));
  return ev;
}

function createEmergencyExitEvent(): EmergencyExitTriggered {
  const ev = changetype<EmergencyExitTriggered>(new ethereum.Event(
    Address.zero(),
    BigInt.zero(),
    BigInt.zero(),
    null,
    mockBlock(),
    mockTx(),
    [],
    null,
  ));
  ev.parameters = [];
  ev.parameters.push(new ethereum.EventParam('strategyId', ethereum.Value.fromBytes(STRATEGY_ID)));
  ev.parameters.push(new ethereum.EventParam('source', ethereum.Value.fromAddress(USER)));
  ev.parameters.push(new ethereum.EventParam('amountReturned', ethereum.Value.fromUnsignedBigInt(AMOUNT)));
  return ev;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleStrategyStarted', () => {
  beforeEach(() => { clearStore(); });

  test('creates Strategy entity with active status', () => {
    handleStrategyStarted(createStrategyStartedEvent());
    assert.entityCount('Strategy', 1);
    const id = STRATEGY_ID.toHexString();
    assert.fieldEquals('Strategy', id, 'status', 'active');
    assert.fieldEquals('Strategy', id, 'sourceAmount', AMOUNT.toString());
    assert.fieldEquals('Strategy', id, 'stepCount', '0');
  });

  test('creates User entity', () => {
    handleStrategyStarted(createStrategyStartedEvent());
    assert.entityCount('User', 1);
    const userId = USER.toHexString().toLowerCase();
    assert.fieldEquals('User', userId, 'totalStrategies', '1');
    assert.fieldEquals('User', userId, 'completedStrategies', '0');
  });

  test('creates GlobalStats with totalStrategies = 1', () => {
    handleStrategyStarted(createStrategyStartedEvent());
    assert.entityCount('GlobalStats', 1);
    assert.fieldEquals('GlobalStats', 'global', 'totalStrategies', '1');
    assert.fieldEquals('GlobalStats', 'global', 'activeStrategies', '1');
    assert.fieldEquals('GlobalStats', 'global', 'uniqueUsers', '1');
  });

  test('creates AssetStats', () => {
    handleStrategyStarted(createStrategyStartedEvent());
    assert.entityCount('AssetStats', 1);
  });

  test('creates DailySnapshot', () => {
    handleStrategyStarted(createStrategyStartedEvent());
    assert.entityCount('DailySnapshot', 1);
  });

  test('increments unique users only once for same address', () => {
    handleStrategyStarted(createStrategyStartedEvent());
    handleStrategyStarted(createStrategyStartedEvent());
    // User entity exists — uniqueUsers in global incremented once
    assert.fieldEquals('GlobalStats', 'global', 'uniqueUsers', '1');
    assert.fieldEquals('User', USER.toHexString().toLowerCase(), 'totalStrategies', '2');
  });
});

describe('handleStepExecuted', () => {
  beforeEach(() => {
    clearStore();
    handleStrategyStarted(createStrategyStartedEvent());
  });

  test('creates ExecutionStep entity', () => {
    handleStepExecuted(createStepExecutedEvent(0)); // SWAP
    assert.entityCount('ExecutionStep', 1);
    const id = STRATEGY_ID.toHexString() + '-0';
    assert.fieldEquals('ExecutionStep', id, 'stepType', 'SWAP');
    assert.fieldEquals('ExecutionStep', id, 'amountOut', AMOUNT.toString());
  });

  test('increments Strategy stepCount', () => {
    handleStepExecuted(createStepExecutedEvent(0));
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'stepCount', '1');
  });

  test('creates ProtocolStats', () => {
    handleStepExecuted(createStepExecutedEvent(0));
    assert.entityCount('ProtocolStats', 1);
    const protoId = PROTOCOL.toHexString().toLowerCase();
    assert.fieldEquals('ProtocolStats', protoId, 'swapCount', '1');
    assert.fieldEquals('ProtocolStats', protoId, 'stepCount', '1');
  });

  test('LEND step increments lendCount on ProtocolStats', () => {
    handleStepExecuted(createStepExecutedEvent(1)); // LEND
    const protoId = PROTOCOL.toHexString().toLowerCase();
    assert.fieldEquals('ProtocolStats', protoId, 'lendCount', '1');
    assert.fieldEquals('ProtocolStats', protoId, 'swapCount', '0');
  });

  test('BRIDGE step increments bridgeCount', () => {
    handleStepExecuted(createStepExecutedEvent(2)); // BRIDGE
    const protoId = PROTOCOL.toHexString().toLowerCase();
    assert.fieldEquals('ProtocolStats', protoId, 'bridgeCount', '1');
  });

  test('increments global totalSteps', () => {
    handleStepExecuted(createStepExecutedEvent(0));
    assert.fieldEquals('GlobalStats', 'global', 'totalSteps', '1');
  });
});

describe('handleStrategyCompleted', () => {
  beforeEach(() => {
    clearStore();
    handleStrategyStarted(createStrategyStartedEvent());
  });

  test('updates Strategy status to completed', () => {
    handleStrategyCompleted(createStrategyCompletedEvent());
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'status', 'completed');
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'finalAmount', AMOUNT.toString());
  });

  test('decrements activeStrategies and increments completedStrategies', () => {
    handleStrategyCompleted(createStrategyCompletedEvent());
    assert.fieldEquals('GlobalStats', 'global', 'activeStrategies', '0');
    assert.fieldEquals('GlobalStats', 'global', 'completedStrategies', '1');
  });

  test('increments user completedStrategies', () => {
    handleStrategyCompleted(createStrategyCompletedEvent());
    assert.fieldEquals('User', USER.toHexString().toLowerCase(), 'completedStrategies', '1');
  });

  test('updates DailySnapshot strategiesCompleted', () => {
    handleStrategyCompleted(createStrategyCompletedEvent());
    assert.fieldEquals('DailySnapshot', '2023-11-14', 'strategiesCompleted', '1');
  });
});

describe('handleStrategyFailed', () => {
  beforeEach(() => {
    clearStore();
    handleStrategyStarted(createStrategyStartedEvent());
  });

  test('updates Strategy status to failed with reason', () => {
    handleStrategyFailed(createStrategyFailedEvent());
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'status', 'failed');
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'failReason', 'Slippage exceeded');
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'failedStep', '2');
  });

  test('decrements activeStrategies', () => {
    handleStrategyFailed(createStrategyFailedEvent());
    assert.fieldEquals('GlobalStats', 'global', 'activeStrategies', '0');
    assert.fieldEquals('GlobalStats', 'global', 'failedStrategies', '1');
  });

  test('increments user failedStrategies', () => {
    handleStrategyFailed(createStrategyFailedEvent());
    assert.fieldEquals('User', USER.toHexString().toLowerCase(), 'failedStrategies', '1');
  });
});

describe('handleEmergencyExitTriggered', () => {
  beforeEach(() => {
    clearStore();
    handleStrategyStarted(createStrategyStartedEvent());
  });

  test('updates Strategy status to exited', () => {
    handleEmergencyExitTriggered(createEmergencyExitEvent());
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'status', 'exited');
    assert.fieldEquals('Strategy', STRATEGY_ID.toHexString(), 'amountReturned', AMOUNT.toString());
  });

  test('decrements activeStrategies and increments exitedStrategies', () => {
    handleEmergencyExitTriggered(createEmergencyExitEvent());
    assert.fieldEquals('GlobalStats', 'global', 'activeStrategies', '0');
    assert.fieldEquals('GlobalStats', 'global', 'exitedStrategies', '1');
  });

  test('increments user exitedStrategies', () => {
    handleEmergencyExitTriggered(createEmergencyExitEvent());
    assert.fieldEquals('User', USER.toHexString().toLowerCase(), 'exitedStrategies', '1');
  });
});
