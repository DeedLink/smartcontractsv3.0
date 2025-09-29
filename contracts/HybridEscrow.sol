// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPropertyNFT {
    function isFullySigned(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract HybridEscrow is ReentrancyGuard {
    enum EscrowType { NFT, FRACTIONAL }

    address public buyer;
    address public seller;
    uint256 public price;
    bool public isBuyerDeposited;
    bool public isSellerDeposited;

    EscrowType public escrowType;
    uint256 public tokenId;
    IERC721 public propertyNFT;

    constructor(
        address _buyer,
        address _seller,
        uint256 _price,
        EscrowType _type,
        address _propertyNFT,
        uint256 _tokenId
    ) {
        buyer = _buyer;
        seller = _seller;
        price = _price;
        escrowType = _type;
        propertyNFT = IERC721(_propertyNFT);
        tokenId = _tokenId;
    }

    function depositPayment() external payable {
        require(msg.sender == buyer, "Only buyer");
        require(msg.value == price, "Incorrect payment");
        require(!isBuyerDeposited, "Already deposited");
        isBuyerDeposited = true;
    }

    function depositAsset() external {
        require(msg.sender == seller, "Only seller");
        require(!isSellerDeposited, "Already deposited");
        propertyNFT.transferFrom(seller, address(this), tokenId);
        isSellerDeposited = true;
    }

    function finalize() external nonReentrant {
        require(msg.sender == buyer, "Only buyer can finalize");
        require(isBuyerDeposited && isSellerDeposited, "Escrow not complete");
        
        propertyNFT.transferFrom(address(this), buyer, tokenId);
        (bool sent, ) = seller.call{value: price}("");
        require(sent, "Failed to send ETH");
    }
}