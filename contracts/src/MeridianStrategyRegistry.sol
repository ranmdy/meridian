// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title MeridianStrategyRegistry
/// @notice On-chain registry for published DeFi strategies.
///         Stores strategy metadata and creator attribution.
///         Full strategy data lives off-chain (IPFS); only the hash is stored here.
contract MeridianStrategyRegistry is Ownable2Step {
    // ─── Structs ──────────────────────────────────────────────────────────────

    struct StrategyRecord {
        address creator;
        uint256 createdAt;
        uint256 version;
        string ipfsHash;       // IPFS CID of full strategy JSON
        bool deprecated;
        uint256 executionCount;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(bytes32 => StrategyRecord) private _strategies;

    /// @notice Authorized router contracts that can increment execution counts.
    mapping(address => bool) public authorizedRouters;

    // ─── Events ───────────────────────────────────────────────────────────────

    event StrategyRegistered(
        bytes32 indexed strategyId,
        address indexed creator,
        string ipfsHash,
        uint256 version
    );

    event StrategyDeprecated(bytes32 indexed strategyId, address indexed by);

    event StrategyExecutionRecorded(bytes32 indexed strategyId, uint256 newCount);

    event RouterAuthorized(address indexed router, bool authorized);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error StrategyAlreadyExists();
    error StrategyDoesNotExist();
    error NotStrategyCreator();
    error StrategyDeprecatedError();
    error NotAuthorizedRouter();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── External ─────────────────────────────────────────────────────────────

    /// @notice Publish a strategy to the registry.
    /// @param ipfsHash IPFS CID of the full strategy definition JSON.
    /// @return strategyId Unique deterministic ID for this strategy.
    function registerStrategy(string calldata ipfsHash)
        external
        returns (bytes32 strategyId)
    {
        strategyId = keccak256(
            abi.encodePacked(msg.sender, ipfsHash, block.timestamp)
        );

        if (_strategies[strategyId].creator != address(0)) {
            revert StrategyAlreadyExists();
        }

        _strategies[strategyId] = StrategyRecord({
            creator: msg.sender,
            createdAt: block.timestamp,
            version: 1,
            ipfsHash: ipfsHash,
            deprecated: false,
            executionCount: 0
        });

        emit StrategyRegistered(strategyId, msg.sender, ipfsHash, 1);
    }

    /// @notice Deprecate a strategy. Only the original creator can do this.
    function deprecateStrategy(bytes32 strategyId) external {
        StrategyRecord storage record = _strategies[strategyId];
        if (record.creator == address(0)) revert StrategyDoesNotExist();
        if (record.creator != msg.sender) revert NotStrategyCreator();

        record.deprecated = true;
        emit StrategyDeprecated(strategyId, msg.sender);
    }

    /// @notice Record an execution. Only authorized routers can call this.
    function recordExecution(bytes32 strategyId) external {
        if (!authorizedRouters[msg.sender]) revert NotAuthorizedRouter();
        StrategyRecord storage record = _strategies[strategyId];
        if (record.creator == address(0)) revert StrategyDoesNotExist();
        if (record.deprecated) revert StrategyDeprecatedError();

        record.executionCount++;
        emit StrategyExecutionRecorded(strategyId, record.executionCount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getStrategy(bytes32 strategyId)
        external
        view
        returns (StrategyRecord memory)
    {
        if (_strategies[strategyId].creator == address(0)) {
            revert StrategyDoesNotExist();
        }
        return _strategies[strategyId];
    }

    function isDeprecated(bytes32 strategyId) external view returns (bool) {
        return _strategies[strategyId].deprecated;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setRouterAuthorized(address router, bool authorized)
        external
        onlyOwner
    {
        authorizedRouters[router] = authorized;
        emit RouterAuthorized(router, authorized);
    }
}
