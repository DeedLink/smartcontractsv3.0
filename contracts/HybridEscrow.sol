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
    bool public isFinalized;

    EscrowType public escrowType;
    uint256 public tokenId;
    IERC721 public propertyNFT;
    
    IERC20 public fractionToken;
    uint256 public fractionAmount;

    event PaymentDeposited(address indexed buyer, uint256 amount);
    event AssetDeposited(address indexed seller, EscrowType escrowType);
    event EscrowFinalized(address indexed buyer, address indexed seller);
    event EscrowCancelled();

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

    function initializeFractionalEscrow(
        address _fractionToken,
        uint256 _fractionAmount
    ) external {
        require(msg.sender == seller, "Only seller can initialize");
        require(escrowType == EscrowType.FRACTIONAL, "Wrong escrow type");
        require(address(fractionToken) == address(0), "Already initialized");
        
        fractionToken = IERC20(_fractionToken);
        fractionAmount = _fractionAmount;
    }

    function depositPayment() external payable {
        require(msg.sender == buyer, "Only buyer");
        require(msg.value == price, "Incorrect payment");
        require(!isBuyerDeposited, "Already deposited");
        require(!isFinalized, "Already finalized");
        
        isBuyerDeposited = true;
        emit PaymentDeposited(buyer, msg.value);
    }

    function depositNFTAsset() external {
        require(msg.sender == seller, "Only seller");
        require(!isSellerDeposited, "Already deposited");
        require(escrowType == EscrowType.NFT, "Wrong escrow type");
        require(!isFinalized, "Already finalized");
        
        propertyNFT.transferFrom(seller, address(this), tokenId);
        isSellerDeposited = true;
        emit AssetDeposited(seller, EscrowType.NFT);
    }

    function depositFractionalAsset() external {
        require(msg.sender == seller, "Only seller");
        require(!isSellerDeposited, "Already deposited");
        require(escrowType == EscrowType.FRACTIONAL, "Wrong escrow type");
        require(address(fractionToken) != address(0), "Fractional escrow not initialized");
        require(!isFinalized, "Already finalized");
        
        require(
            fractionToken.transferFrom(seller, address(this), fractionAmount),
            "Fraction token transfer failed"
        );
        
        isSellerDeposited = true;
        emit AssetDeposited(seller, EscrowType.FRACTIONAL);
    }

    function finalize() external nonReentrant {
        require(msg.sender == buyer, "Only buyer can finalize");
        require(isBuyerDeposited && isSellerDeposited, "Escrow not complete");
        require(!isFinalized, "Already finalized");
        
        isFinalized = true;
        
        if (escrowType == EscrowType.NFT) {
            propertyNFT.transferFrom(address(this), buyer, tokenId);
        } else {
            require(
                fractionToken.transfer(buyer, fractionAmount),
                "Fraction token transfer failed"
            );
        }
        
        (bool sent, ) = seller.call{value: price}("");
        require(sent, "Failed to send ETH");
        
        emit EscrowFinalized(buyer, seller);
    }

    function cancel() external nonReentrant {
        require(!isFinalized, "Already finalized");
        require(msg.sender == buyer || msg.sender == seller, "Only parties can cancel");
        
        if (isBuyerDeposited) {
            (bool sent, ) = buyer.call{value: price}("");
            require(sent, "Failed to refund buyer");
        }
        
        if (isSellerDeposited) {
            if (escrowType == EscrowType.NFT) {
                propertyNFT.transferFrom(address(this), seller, tokenId);
            } else {
                require(
                    fractionToken.transfer(seller, fractionAmount),
                    "Failed to return fractions"
                );
            }
        }
        
        isFinalized = true;
        emit EscrowCancelled();
    }

    function getStatus() external view returns (
        bool _isBuyerDeposited,
        bool _isSellerDeposited,
        bool _isFinalized
    ) {
        return (isBuyerDeposited, isSellerDeposited, isFinalized);
    }
}