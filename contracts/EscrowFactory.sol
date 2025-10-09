// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./HybridEscrow.sol";

contract EscrowFactory {
    address[] public allEscrows;
    mapping(address => address[]) public userEscrows;
    
    event EscrowCreated(
        address indexed escrow,
        address indexed buyer,
        address indexed seller,
        HybridEscrow.EscrowType escrowType
    );

    function createNFTEscrow(
        address buyer,
        address seller,
        uint256 price,
        address propertyNFT,
        uint256 tokenId
    ) external returns (address) {
        HybridEscrow escrow = new HybridEscrow(
            buyer,
            seller,
            price,
            HybridEscrow.EscrowType.NFT,
            propertyNFT,
            tokenId
        );
        
        address escrowAddr = address(escrow);
        allEscrows.push(escrowAddr);
        userEscrows[buyer].push(escrowAddr);
        userEscrows[seller].push(escrowAddr);
        
        emit EscrowCreated(escrowAddr, buyer, seller, HybridEscrow.EscrowType.NFT);
        
        return escrowAddr;
    }

    function createFractionalEscrow(
        address buyer,
        address seller,
        uint256 price,
        address propertyNFT,
        uint256 propertyId,
        address fractionToken,
        uint256 fractionAmount
    ) external returns (address) {
        HybridEscrow escrow = new HybridEscrow(
            buyer,
            seller,
            price,
            HybridEscrow.EscrowType.FRACTIONAL,
            propertyNFT,
            propertyId
        );
        
        escrow.initializeFractionalEscrow(fractionToken, fractionAmount);
        
        address escrowAddr = address(escrow);
        allEscrows.push(escrowAddr);
        userEscrows[buyer].push(escrowAddr);
        userEscrows[seller].push(escrowAddr);
        
        emit EscrowCreated(escrowAddr, buyer, seller, HybridEscrow.EscrowType.FRACTIONAL);
        
        return escrowAddr;
    }

    function getUserEscrows(address user) external view returns (address[] memory) {
        return userEscrows[user];
    }

    function getTotalEscrows() external view returns (uint256) {
        return allEscrows.length;
    }
}