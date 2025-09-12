// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PropertyEscrow is ReentrancyGuard {
    address public buyer;
    address public seller;
    IERC721 public propertyNFT;
    uint256 public tokenId;
    uint256 public price;
    bool public isBuyerDeposited;
    bool public isSellerDeposited;

    constructor(address _buyer, address _seller, address _nft, uint256 _tokenId, uint256 _price) {
        buyer = _buyer;
        seller = _seller;
        propertyNFT = IERC721(_nft);
        tokenId = _tokenId;
        price = _price;
    }

    // Buyer deposits ETH
    function depositPayment() external payable nonReentrant {
        require(msg.sender == buyer, "Only buyer");
        require(msg.value == price, "Incorrect payment");
        isBuyerDeposited = true;
    }

    // Seller deposits NFT
    function depositNFT() external nonReentrant {
        require(msg.sender == seller, "Only seller");
        propertyNFT.transferFrom(seller, address(this), tokenId);
        isSellerDeposited = true;
    }

    // Finalize transaction
    function finalize() external nonReentrant {
        require(isBuyerDeposited && isSellerDeposited, "Escrow not complete");

        // Send ETH to seller
        (bool sent, ) = seller.call{value: price}("");
        require(sent, "ETH transfer failed");

        // Send NFT to buyer
        propertyNFT.transferFrom(address(this), buyer, tokenId);
    }
}
