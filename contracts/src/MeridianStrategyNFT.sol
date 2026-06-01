// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title MeridianStrategyNFT
/// @notice ERC-721 + ERC-2981 NFT minted when a strategy is published to the Meridian Marketplace.
///
/// Key design decisions:
///   - One NFT per strategy ID (bytes32). Minting twice for the same strategy reverts.
///   - Royalty is 2 bps (0.02%) following ERC-2981.
///   - When the NFT is transferred (sold), the royalty recipient updates to the NEW owner.
///     This is an intentional design choice: the royalty follows the NFT, not the original
///     creator. The current holder — who manages and markets the strategy — earns secondary
///     sale fees. If you want royalties to stay with the original creator forever, do NOT
///     transfer the NFT and keep it as the creator's proof-of-authorship.
///   - Metadata URI points to an IPFS JSON with strategy stats (APY, risk score, hop count).
///   - Only the authorised minter (Meridian backend relayer or registry contract) can mint.
///   - Soulbound toggle: owner can make a token non-transferable (opt-in per strategy).
contract MeridianStrategyNFT is ERC721, ERC721URIStorage, ERC721Royalty, Ownable2Step {
    // ─── Constants ────────────────────────────────────────────────────────────

    /// @dev Royalty in basis points (denominator 10_000). 2 bps = 0.02%.
    uint96 public constant ROYALTY_BPS = 2;

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    /// @notice Maps strategy ID → token ID (0 = not minted).
    mapping(bytes32 => uint256) public strategyTokenId;

    /// @notice Maps token ID → strategy ID.
    mapping(uint256 => bytes32) public tokenStrategyId;

    /// @notice The Meridian backend address authorised to call mint().
    address public minter;

    /// @notice Tokens marked soulbound cannot be transferred (except burn).
    mapping(uint256 => bool) public soulbound;

    // ─── Events ───────────────────────────────────────────────────────────────

    event StrategyNFTMinted(
        uint256 indexed tokenId,
        bytes32 indexed strategyId,
        address indexed creator,
        string tokenURI
    );

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    event SoulboundSet(uint256 indexed tokenId, bool locked);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotMinter();
    error NotAuthorized();
    error AlreadyMinted(bytes32 strategyId);
    error Soulbound(uint256 tokenId);
    error ZeroAddress();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address initialOwner, address initialMinter)
        ERC721("Meridian Strategy", "MSTR")
        Ownable(initialOwner)
    {
        if (initialMinter == address(0)) revert ZeroAddress();
        minter = initialMinter;
        _nextTokenId = 1; // start at 1 — 0 is the sentinel "not minted"
    }

    // ─── Minting ──────────────────────────────────────────────────────────────

    /// @notice Mint an NFT for a published strategy.
    /// @param strategyId  keccak256 of the strategy's canonical ID string.
    /// @param creator     The wallet address of the strategy creator.
    /// @param uri         IPFS URI for the token metadata (stats, APY, name, etc.).
    /// @return tokenId    The minted token ID.
    function mint(bytes32 strategyId, address creator, string calldata uri)
        external
        returns (uint256 tokenId)
    {
        if (msg.sender != minter) revert NotMinter();
        if (strategyTokenId[strategyId] != 0) revert AlreadyMinted(strategyId);
        if (creator == address(0)) revert ZeroAddress();

        tokenId = _nextTokenId++;
        _safeMint(creator, tokenId);
        _setTokenURI(tokenId, uri);

        // Set per-token royalty: creator receives 0.02% on secondary sales.
        // Note: this royalty recipient updates on each transfer — see _update().
        _setTokenRoyalty(tokenId, creator, ROYALTY_BPS);

        strategyTokenId[strategyId] = tokenId;
        tokenStrategyId[tokenId] = strategyId;

        emit StrategyNFTMinted(tokenId, strategyId, creator, uri);
    }

    // ─── Soulbound ────────────────────────────────────────────────────────────

    /// @notice Lock or unlock a token as soulbound (non-transferable).
    ///         Only the current token owner or contract owner can call this.
    function setSoulbound(uint256 tokenId, bool locked) external {
        address tokenOwner = ownerOf(tokenId);
        // owner() is the Ownable contract owner (internal call, not external).
        if (msg.sender != tokenOwner && msg.sender != owner()) revert NotAuthorized();
        soulbound[tokenId] = locked;
        emit SoulboundSet(tokenId, locked);
    }

    // ─── Royalty on transfer ──────────────────────────────────────────────────

    /// @notice When an NFT is transferred (sold), update the royalty recipient to the new owner.
    ///         This ensures the fee follows the NFT, not the original creator.
    ///         See contract-level documentation for the rationale behind this design.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address from)
    {
        from = super._update(to, tokenId, auth);

        // Soulbound check: revert if token is locked and this is a real transfer
        if (soulbound[tokenId] && from != address(0) && to != address(0)) {
            revert Soulbound(tokenId);
        }

        // Update royalty recipient to new owner on transfer (not mint/burn)
        if (from != address(0) && to != address(0)) {
            _setTokenRoyalty(tokenId, to, ROYALTY_BPS);
        }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update the authorised minter address.
    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterUpdated(minter, newMinter);
        minter = newMinter;
    }

    // ─── ERC-165 overrides ────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ─── ERC-721 overrides ────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
