// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./FractionalToken.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IPropertyNFT.sol";

contract FractionTokenFactory is ReentrancyGuard {
    mapping(uint256 => address) public propertyToFractionToken;
    mapping(uint256 => uint256) public propertyToTotalSupply;
    mapping(uint256 => bool) public isPropertyFractionalized;
    
    event FractionTokenCreated(uint256 propertyId, address tokenAddress, uint256 totalSupply);
    event PropertyDefractionalized(uint256 propertyId, address indexed owner);
    event FullOwnershipTransferred(uint256 propertyId, address indexed from, address indexed to);

    function createFractionToken(
        uint256 propertyId,
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address propertyNFTAddr
    ) external returns (address) {
        require(propertyToFractionToken[propertyId] == address(0), "Fraction token already exists");
        
        IPropertyNFT propertyNFT = IPropertyNFT(propertyNFTAddr);
        try propertyNFT.ownerOf(propertyId) returns (address owner) {
            require(msg.sender == owner, "Only property owner can fractionalize");
            require(propertyNFT.isFullySigned(propertyId), "Property not fully signed");
        } catch {
            revert("Property does not exist");
        }

        IERC721(propertyNFTAddr).transferFrom(msg.sender, address(this), propertyId);

        FractionalToken newToken = new FractionalToken(
            name,
            symbol,
            totalSupply,
            propertyId,
            msg.sender
        );

        propertyToFractionToken[propertyId] = address(newToken);
        propertyToTotalSupply[propertyId] = totalSupply;
        isPropertyFractionalized[propertyId] = true;
        
        emit FractionTokenCreated(propertyId, address(newToken), totalSupply);
        
        return address(newToken);
    }

    function transferFullOwnership(
        uint256 propertyId,
        address to,
        address propertyNFTAddr
    ) external nonReentrant {
        require(isPropertyFractionalized[propertyId], "Property not fractionalized");
        require(to != address(0), "Invalid recipient");
        
        address fractionTokenAddr = propertyToFractionToken[propertyId];
        require(fractionTokenAddr != address(0), "Fraction token not found");
        
        IERC20 fractionToken = IERC20(fractionTokenAddr);
        uint256 totalSupply = propertyToTotalSupply[propertyId];
        uint256 senderBalance = fractionToken.balanceOf(msg.sender);
        
        require(senderBalance == totalSupply, "Must own 100% of fractions");
        
        require(
            fractionToken.transferFrom(msg.sender, address(0xdead), totalSupply),
            "Failed to burn tokens"
        );
        
        IERC721(propertyNFTAddr).transferFrom(address(this), to, propertyId);
        
        isPropertyFractionalized[propertyId] = false;
        
        emit FullOwnershipTransferred(propertyId, msg.sender, to);
    }

    function defractionalizeProperty(
        uint256 propertyId,
        address propertyNFTAddr
    ) external nonReentrant {
        require(isPropertyFractionalized[propertyId], "Property not fractionalized");
        
        address fractionTokenAddr = propertyToFractionToken[propertyId];
        require(fractionTokenAddr != address(0), "Fraction token not found");
        
        IERC20 fractionToken = IERC20(fractionTokenAddr);
        uint256 totalSupply = propertyToTotalSupply[propertyId];
        uint256 senderBalance = fractionToken.balanceOf(msg.sender);
        
        require(senderBalance == totalSupply, "Must own 100% of fractions");
        
        require(
            fractionToken.transferFrom(msg.sender, address(0xdead), totalSupply),
            "Failed to burn tokens"
        );
        
        IERC721(propertyNFTAddr).transferFrom(address(this), msg.sender, propertyId);
        
        isPropertyFractionalized[propertyId] = false;
        
        emit PropertyDefractionalized(propertyId, msg.sender);
    }

    function getFractionToken(uint256 propertyId) external view returns (address) {
        return propertyToFractionToken[propertyId];
    }

    function hasFullOwnership(uint256 propertyId, address owner) external view returns (bool) {
        if (!isPropertyFractionalized[propertyId]) return false;
        
        address fractionTokenAddr = propertyToFractionToken[propertyId];
        if (fractionTokenAddr == address(0)) return false;
        
        IERC20 fractionToken = IERC20(fractionTokenAddr);
        uint256 totalSupply = propertyToTotalSupply[propertyId];
        uint256 ownerBalance = fractionToken.balanceOf(owner);
        
        return ownerBalance == totalSupply;
    }

    function getFractionBalance(uint256 propertyId, address owner) external view returns (uint256) {
        address fractionTokenAddr = propertyToFractionToken[propertyId];
        if (fractionTokenAddr == address(0)) return 0;
        
        IERC20 fractionToken = IERC20(fractionTokenAddr);
        return fractionToken.balanceOf(owner);
    }
}