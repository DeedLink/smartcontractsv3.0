// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HybridEscrow is ReentrancyGuard {
    enum EscrowType { NFT, FRACTIONAL }

    address public buyer;
    address public seller;
    uint256 public price;
    bool public isBuyerDeposited;
    bool public isSellerDeposited;
    EscrowType public escrowType;

    IERC721 public propertyNFT;
    uint256 public tokenId;
    IERC20 public fractionalToken;
    uint256 public tokenAmount;

    constructor(
        address _buyer, address _seller, uint256 _price, EscrowType _escrowType,
        address assetAddress, uint256 assetAmountOrId
    ) {
        buyer = _buyer;
        seller = _seller;
        price = _price;
        escrowType = _escrowType;

        if (_escrowType == EscrowType.NFT) {
            propertyNFT = IERC721(assetAddress);
            tokenId = assetAmountOrId;
        } else {
            fractionalToken = IERC20(assetAddress);
            tokenAmount = assetAmountOrId;
        }
    }

    function depositPayment() external payable nonReentrant {
        require(msg.sender == buyer, "Only buyer");
        require(msg.value == price, "Incorrect payment");
        isBuyerDeposited = true;
    }

    function depositAsset() external nonReentrant {
        require(msg.sender == seller, "Only seller");
        
        if (escrowType == EscrowType.NFT) {
            propertyNFT.transferFrom(seller, address(this), tokenId);
        } else {
            fractionalToken.transferFrom(seller, address(this), tokenAmount);
        }
        isSellerDeposited = true;
    }

    function finalize() external nonReentrant {
        require(isBuyerDeposited && isSellerDeposited, "Escrow not complete");

        (bool sent, ) = seller.call{value: price}("");
        require(sent, "ETH transfer failed");

        if (escrowType == EscrowType.NFT) {
            propertyNFT.transferFrom(address(this), buyer, tokenId);
        } else {
            fractionalToken.transfer(buyer, tokenAmount);
        }
    }
}