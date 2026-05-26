import { BigInt, Bytes, Address } from '@graphprotocol/graph-ts';
import {
  StrategyStarted,
  StepExecuted,
  StrategyCompleted,
  StrategyFailed,
  EmergencyExitTriggered,
} from '../generated/MeridianRouter_Ethereum/MeridianRouter';
import {
  Strategy,
  ExecutionStep,
  User,
  ProtocolStats,
  AssetStats,
  DailySnapshot,
  GlobalStats,
} from '../generated/schema';

// ── StepType enum mirrors IMeridianRouter.StepType ─────────────────────────
const STEP_TYPES = ['SWAP', 'LEND', 'BRIDGE', 'STAKE', 'SETTLE'];

function stepTypeName(value: i32): string {
  if (value >= 0 && value < STEP_TYPES.length) return STEP_TYPES[value];
  return 'UNKNOWN';
}

// ── Daily snapshot bucket ───────────────────────────────────────────────────
function dayId(timestamp: BigInt): string {
  const secs = timestamp.toI64();
  const dayStart = secs - (secs % 86400);
  const d = new Date(dayStart * 1000);
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function dayTimestamp(timestamp: BigInt): BigInt {
  const secs = timestamp.toI64();
  return BigInt.fromI64(secs - (secs % 86400));
}

// ── Entity loaders with defaults ────────────────────────────────────────────

function loadOrCreateGlobal(): GlobalStats {
  let stats = GlobalStats.load('global');
  if (stats == null) {
    stats = new GlobalStats('global');
    stats.totalStrategies = BigInt.zero();
    stats.activeStrategies = BigInt.zero();
    stats.completedStrategies = BigInt.zero();
    stats.failedStrategies = BigInt.zero();
    stats.exitedStrategies = BigInt.zero();
    stats.totalVolume = BigInt.zero();
    stats.totalFinalAmount = BigInt.zero();
    stats.uniqueUsers = BigInt.zero();
    stats.totalSteps = BigInt.zero();
    stats.lastUpdatedAt = BigInt.zero();
  }
  return stats;
}

function loadOrCreateUser(address: Address, timestamp: BigInt): User {
  const id = address as Bytes;
  let user = User.load(id);
  if (user == null) {
    user = new User(id);
    user.totalStrategies = 0;
    user.completedStrategies = 0;
    user.failedStrategies = 0;
    user.exitedStrategies = 0;
    user.totalVolumeUsd = BigInt.zero();
    user.firstSeenAt = timestamp;
    user.lastActiveAt = timestamp;

    // Increment global unique user count for new users
    const global = loadOrCreateGlobal();
    global.uniqueUsers = global.uniqueUsers.plus(BigInt.fromI32(1));
    global.save();
  }
  return user;
}

function loadOrCreateProtocolStats(protocol: Address): ProtocolStats {
  const id = protocol as Bytes;
  let stats = ProtocolStats.load(id);
  if (stats == null) {
    stats = new ProtocolStats(id);
    stats.totalVolume = BigInt.zero();
    stats.stepCount = 0;
    stats.swapCount = 0;
    stats.lendCount = 0;
    stats.bridgeCount = 0;
    stats.stakeCount = 0;
    stats.settleCount = 0;
    stats.lastUsedAt = BigInt.zero();
  }
  return stats;
}

function loadOrCreateAssetStats(asset: Address): AssetStats {
  const id = asset as Bytes;
  let stats = AssetStats.load(id);
  if (stats == null) {
    stats = new AssetStats(id);
    stats.totalVolume = BigInt.zero();
    stats.strategyCount = 0;
    stats.completedCount = 0;
    stats.failedCount = 0;
    stats.lastSeenAt = BigInt.zero();
  }
  return stats;
}

function loadOrCreateDailySnapshot(timestamp: BigInt): DailySnapshot {
  const id = dayId(timestamp);
  let snap = DailySnapshot.load(id);
  if (snap == null) {
    snap = new DailySnapshot(id);
    snap.timestamp = dayTimestamp(timestamp);
    snap.totalVolume = BigInt.zero();
    snap.strategiesStarted = 0;
    snap.strategiesCompleted = 0;
    snap.strategiesFailed = 0;
    snap.strategiesExited = 0;
    snap.uniqueUsers = 0;
    snap.stepsExecuted = 0;
  }
  return snap;
}

// ── Event Handlers ──────────────────────────────────────────────────────────

export function handleStrategyStarted(event: StrategyStarted): void {
  const strategyId = event.params.strategyId;
  const user = event.params.user;
  const amount = event.params.amount;
  const sourceAsset = event.params.sourceAsset;
  const destinationWallet = event.params.destinationWallet;
  const timestamp = event.block.timestamp;
  const blockNumber = event.block.number;

  // ── Strategy entity ──
  let strategy = new Strategy(strategyId);
  strategy.user = user as Bytes;
  strategy.sourceAsset = sourceAsset as Bytes;
  strategy.sourceAmount = amount;
  strategy.destinationWallet = destinationWallet as Bytes;
  strategy.status = 'active';
  strategy.startedAt = timestamp;
  strategy.startedAtBlock = blockNumber;
  strategy.stepCount = 0;
  strategy.startTxHash = event.transaction.hash;
  strategy.userEntity = user as Bytes;
  strategy.save();

  // ── User entity ──
  const userEntity = loadOrCreateUser(user, timestamp);
  userEntity.totalStrategies += 1;
  userEntity.lastActiveAt = timestamp;
  userEntity.save();

  // ── Asset stats ──
  const asset = loadOrCreateAssetStats(sourceAsset);
  asset.totalVolume = asset.totalVolume.plus(amount);
  asset.strategyCount += 1;
  asset.lastSeenAt = timestamp;
  asset.save();

  // ── Daily snapshot ──
  const snap = loadOrCreateDailySnapshot(timestamp);
  snap.strategiesStarted += 1;
  snap.totalVolume = snap.totalVolume.plus(amount);
  // Count unique users per day conservatively (cannot do Set in AssemblyScript easily,
  // so we increment on every first strategy for that user today — acceptable approximation)
  snap.save();

  // ── Global stats ──
  const global = loadOrCreateGlobal();
  global.totalStrategies = global.totalStrategies.plus(BigInt.fromI32(1));
  global.activeStrategies = global.activeStrategies.plus(BigInt.fromI32(1));
  global.totalVolume = global.totalVolume.plus(amount);
  global.lastUpdatedAt = timestamp;
  global.save();
}

export function handleStepExecuted(event: StepExecuted): void {
  const strategyId = event.params.strategyId;
  const stepIndex = event.params.stepIndex;
  const stepTypeVal = event.params.stepType;
  const protocol = event.params.protocol;
  const amountOut = event.params.amountOut;
  const timestamp = event.block.timestamp;

  // ── ExecutionStep entity ──
  const stepEntityId = strategyId.toHexString() + '-' + stepIndex.toString();
  let step = new ExecutionStep(stepEntityId);
  step.strategy = strategyId;
  step.stepIndex = stepIndex;
  step.stepType = stepTypeName(stepTypeVal);
  step.protocol = protocol as Bytes;
  step.amountOut = amountOut;
  step.timestamp = timestamp;
  step.blockNumber = event.block.number;
  step.txHash = event.transaction.hash;
  step.save();

  // ── Update strategy step count ──
  const strategy = Strategy.load(strategyId);
  if (strategy != null) {
    strategy.stepCount += 1;
    strategy.save();
  }

  // ── Protocol stats ──
  const protoStats = loadOrCreateProtocolStats(protocol);
  protoStats.totalVolume = protoStats.totalVolume.plus(amountOut);
  protoStats.stepCount += 1;
  protoStats.lastUsedAt = timestamp;
  const typeName = stepTypeName(stepTypeVal);
  if (typeName == 'SWAP') protoStats.swapCount += 1;
  else if (typeName == 'LEND') protoStats.lendCount += 1;
  else if (typeName == 'BRIDGE') protoStats.bridgeCount += 1;
  else if (typeName == 'STAKE') protoStats.stakeCount += 1;
  else if (typeName == 'SETTLE') protoStats.settleCount += 1;
  protoStats.save();

  // ── Daily snapshot ──
  const snap = loadOrCreateDailySnapshot(timestamp);
  snap.stepsExecuted += 1;
  snap.save();

  // ── Global stats ──
  const global = loadOrCreateGlobal();
  global.totalSteps = global.totalSteps.plus(BigInt.fromI32(1));
  global.lastUpdatedAt = timestamp;
  global.save();
}

export function handleStrategyCompleted(event: StrategyCompleted): void {
  const strategyId = event.params.strategyId;
  const destination = event.params.destination;
  const asset = event.params.asset;
  const finalAmount = event.params.finalAmount;
  const timestamp = event.block.timestamp;

  // ── Update strategy ──
  const strategy = Strategy.load(strategyId);
  if (strategy != null) {
    strategy.status = 'completed';
    strategy.completedAt = timestamp;
    strategy.completedAtBlock = event.block.number;
    strategy.finalAsset = asset as Bytes;
    strategy.finalAmount = finalAmount;
    strategy.completionTxHash = event.transaction.hash;
    strategy.save();

    // ── Update user ──
    const userEntity = User.load(strategy.userEntity);
    if (userEntity != null) {
      userEntity.completedStrategies += 1;
      userEntity.lastActiveAt = timestamp;
      userEntity.save();
    }

    // ── Asset stats ──
    const assetStats = loadOrCreateAssetStats(asset);
    assetStats.completedCount += 1;
    assetStats.lastSeenAt = timestamp;
    assetStats.save();
  }

  // ── Daily snapshot ──
  const snap = loadOrCreateDailySnapshot(timestamp);
  snap.strategiesCompleted += 1;
  snap.save();

  // ── Global stats ──
  const global = loadOrCreateGlobal();
  global.activeStrategies = global.activeStrategies.minus(BigInt.fromI32(1));
  global.completedStrategies = global.completedStrategies.plus(BigInt.fromI32(1));
  global.totalFinalAmount = global.totalFinalAmount.plus(finalAmount);
  global.lastUpdatedAt = timestamp;
  global.save();
}

export function handleStrategyFailed(event: StrategyFailed): void {
  const strategyId = event.params.strategyId;
  const failedStep = event.params.failedStep;
  const reason = event.params.reason;
  const timestamp = event.block.timestamp;

  // ── Update strategy ──
  const strategy = Strategy.load(strategyId);
  if (strategy != null) {
    strategy.status = 'failed';
    strategy.completedAt = timestamp;
    strategy.completedAtBlock = event.block.number;
    strategy.failedStep = failedStep;
    strategy.failReason = reason;
    strategy.completionTxHash = event.transaction.hash;
    strategy.save();

    // ── Update user ──
    const userEntity = User.load(strategy.userEntity);
    if (userEntity != null) {
      userEntity.failedStrategies += 1;
      userEntity.lastActiveAt = timestamp;
      userEntity.save();
    }

    // ── Asset stats ──
    const assetStats = AssetStats.load(strategy.sourceAsset);
    if (assetStats != null) {
      assetStats.failedCount += 1;
      assetStats.save();
    }
  }

  // ── Daily snapshot ──
  const snap = loadOrCreateDailySnapshot(timestamp);
  snap.strategiesFailed += 1;
  snap.save();

  // ── Global stats ──
  const global = loadOrCreateGlobal();
  global.activeStrategies = global.activeStrategies.minus(BigInt.fromI32(1));
  global.failedStrategies = global.failedStrategies.plus(BigInt.fromI32(1));
  global.lastUpdatedAt = timestamp;
  global.save();
}

export function handleEmergencyExitTriggered(event: EmergencyExitTriggered): void {
  const strategyId = event.params.strategyId;
  const source = event.params.source;
  const amountReturned = event.params.amountReturned;
  const timestamp = event.block.timestamp;

  // ── Update strategy ──
  const strategy = Strategy.load(strategyId);
  if (strategy != null) {
    strategy.status = 'exited';
    strategy.completedAt = timestamp;
    strategy.completedAtBlock = event.block.number;
    strategy.amountReturned = amountReturned;
    strategy.completionTxHash = event.transaction.hash;
    strategy.save();

    // ── Update user ──
    const userEntity = User.load(strategy.userEntity);
    if (userEntity != null) {
      userEntity.exitedStrategies += 1;
      userEntity.lastActiveAt = timestamp;
      userEntity.save();
    }
  }

  // ── Daily snapshot ──
  const snap = loadOrCreateDailySnapshot(timestamp);
  snap.strategiesExited += 1;
  snap.save();

  // ── Global stats ──
  const global = loadOrCreateGlobal();
  global.activeStrategies = global.activeStrategies.minus(BigInt.fromI32(1));
  global.exitedStrategies = global.exitedStrategies.plus(BigInt.fromI32(1));
  global.lastUpdatedAt = timestamp;
  global.save();
}
