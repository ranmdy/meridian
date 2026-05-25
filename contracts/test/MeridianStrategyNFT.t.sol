// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MeridianStrategyNFT} from "../src/MeridianStrategyNFT.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract MeridianStrategyNFTTest is Test {
    MeridianStrategyNFT internal nft;

    address internal owner   = makeAddr("owner");
    address internal minter  = makeAddr("minter");
    address internal creator = makeAddr("creator");
    address internal buyer   = makeAddr("buyer");

    bytes32 internal constant STRAT_A = keccak256("strategy_alpha");
    bytes32 internal constant STRAT_B = keccak256("strategy_beta");
    string  internal constant URI_A   = "ipfs://QmAlpha";
    string  internal constant URI_B   = "ipfs://QmBeta";

    function setUp() public {
        nft = new MeridianStrategyNFT(owner, minter);
    }

    // ─── Deployment ────────────────────────────────────────────────────────────

    function test_deploymentSetsOwnerAndMinter() public view {
        assertEq(nft.owner(), owner);
        assertEq(nft.minter(), minter);
    }

    function test_deploymentRevertsOnZeroMinter() public {
        vm.expectRevert(MeridianStrategyNFT.ZeroAddress.selector);
        new MeridianStrategyNFT(owner, address(0));
    }

    function test_tokenIdStartsAtOne() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);
        assertEq(id, 1);
    }

    // ─── Minting ───────────────────────────────────────────────────────────────

    function test_mintAssignsTokenToCreator() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);
        assertEq(nft.ownerOf(id), creator);
    }

    function test_mintSetsTokenURI() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);
        assertEq(nft.tokenURI(id), URI_A);
    }

    function test_mintRecordsStrategyMapping() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);
        assertEq(nft.strategyTokenId(STRAT_A), id);
        assertEq(nft.tokenStrategyId(id), STRAT_A);
    }

    function test_mintRevertsIfNotMinter() public {
        vm.expectRevert(MeridianStrategyNFT.NotMinter.selector);
        vm.prank(creator);
        nft.mint(STRAT_A, creator, URI_A);
    }

    function test_mintRevertsOnDuplicateStrategyId() public {
        vm.startPrank(minter);
        nft.mint(STRAT_A, creator, URI_A);
        vm.expectRevert(abi.encodeWithSelector(MeridianStrategyNFT.AlreadyMinted.selector, STRAT_A));
        nft.mint(STRAT_A, creator, URI_A);
        vm.stopPrank();
    }

    function test_mintRevertsOnZeroCreator() public {
        vm.expectRevert(MeridianStrategyNFT.ZeroAddress.selector);
        vm.prank(minter);
        nft.mint(STRAT_A, address(0), URI_A);
    }

    function test_multipleMintIncrementsTokenIds() public {
        vm.startPrank(minter);
        uint256 id1 = nft.mint(STRAT_A, creator, URI_A);
        uint256 id2 = nft.mint(STRAT_B, creator, URI_B);
        vm.stopPrank();
        assertEq(id2, id1 + 1);
    }

    // ─── ERC-2981 Royalties ────────────────────────────────────────────────────

    function test_royaltyInfoReturnsCreatorAtMint() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        uint256 salePrice = 1 ether;
        (address receiver, uint256 amount) = nft.royaltyInfo(id, salePrice);

        assertEq(receiver, creator);
        // 2 bps of 1 ether = 2e14
        assertEq(amount, (salePrice * 2) / 10_000);
    }

    function test_royaltyUpdatesToNewOwnerAfterTransfer() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        // Creator transfers to buyer
        vm.prank(creator);
        nft.transferFrom(creator, buyer, id);

        (address receiver, ) = nft.royaltyInfo(id, 1 ether);
        assertEq(receiver, buyer);
    }

    function test_supportsERC2981Interface() public view {
        assertTrue(nft.supportsInterface(type(IERC2981).interfaceId));
    }

    function test_supportsERC721Interface() public view {
        assertTrue(nft.supportsInterface(type(IERC721).interfaceId));
    }

    // ─── Soulbound ─────────────────────────────────────────────────────────────

    function test_setSoulboundByOwner() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        vm.prank(creator);
        nft.setSoulbound(id, true);
        assertTrue(nft.soulbound(id));
    }

    function test_setSoulboundByContractOwner() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        vm.prank(owner);
        nft.setSoulbound(id, true);
        assertTrue(nft.soulbound(id));
    }

    function test_soulboundTokenCannotBeTransferred() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        vm.prank(creator);
        nft.setSoulbound(id, true);

        vm.expectRevert(abi.encodeWithSelector(MeridianStrategyNFT.Soulbound.selector, id));
        vm.prank(creator);
        nft.transferFrom(creator, buyer, id);
    }

    function test_unlockedSoulboundCanBeTransferred() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        vm.prank(creator);
        nft.setSoulbound(id, true);

        vm.prank(creator);
        nft.setSoulbound(id, false);

        vm.prank(creator);
        nft.transferFrom(creator, buyer, id);
        assertEq(nft.ownerOf(id), buyer);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function test_setMinterByOwner() public {
        address newMinter = makeAddr("newMinter");
        vm.prank(owner);
        nft.setMinter(newMinter);
        assertEq(nft.minter(), newMinter);
    }

    function test_setMinterRevertsForNonOwner() public {
        address newMinter = makeAddr("newMinter");
        vm.expectRevert();
        vm.prank(minter);
        nft.setMinter(newMinter);
    }

    function test_setMinterRevertsOnZeroAddress() public {
        vm.expectRevert(MeridianStrategyNFT.ZeroAddress.selector);
        vm.prank(owner);
        nft.setMinter(address(0));
    }

    // ─── Events ────────────────────────────────────────────────────────────────

    function test_mintEmitsStrategyNFTMinted() public {
        vm.expectEmit(true, true, true, true);
        emit MeridianStrategyNFT.StrategyNFTMinted(1, STRAT_A, creator, URI_A);
        vm.prank(minter);
        nft.mint(STRAT_A, creator, URI_A);
    }

    function test_setSoulboundEmitsSoulboundSet() public {
        vm.prank(minter);
        uint256 id = nft.mint(STRAT_A, creator, URI_A);

        vm.expectEmit(true, false, false, true);
        emit MeridianStrategyNFT.SoulboundSet(id, true);
        vm.prank(creator);
        nft.setSoulbound(id, true);
    }
}
