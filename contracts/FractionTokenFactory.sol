// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./FractionalToken.sol";

interface IPropertyNFT {
    function isFullySigned(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract FractionTokenFactory {
    mapping(uint256 => address) public propertyToFractionToken;
    event FractionTokenCreated(uint256 propertyId, address tokenAddress);

    function createFractionToken(
        uint256 propertyId,
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address propertyNFTAddr
    ) external returns (address) {
        require(propertyToFractionToken[propertyId] == address(0), "Fraction token already exists");
        
        IPropertyNFT propertyNFT = IPropertyNFT(propertyNFTAddr);
        require(propertyNFT.ownerOf(propertyId) != address(0), "Property does not exist");
        require(propertyNFT.isFullySigned(propertyId), "Property not fully signed");

        FractionalToken newToken = new FractionalToken(
            name,
            symbol,
            totalSupply,
            propertyId,
            propertyNFT.ownerOf(propertyId)
        );

        propertyToFractionToken[propertyId] = address(newToken);
        emit FractionTokenCreated(propertyId, address(newToken));
        
        return address(newToken);
    }
}