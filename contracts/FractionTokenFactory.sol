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
        require(propertyToFractionToken[propertyId] == address(0), "Token already exists for property");
        require(IPropertyNFT(propertyNFTAddr).ownerOf(propertyId) != address(0), "Property does not exist");
        require(IPropertyNFT(propertyNFTAddr).isFullySigned(propertyId), "Property not fully signed");

        FractionalToken token = new FractionalToken(name, symbol, totalSupply, propertyId, msg.sender);
        propertyToFractionToken[propertyId] = address(token);

        emit FractionTokenCreated(propertyId, address(token));
        return address(token);
    }
}
