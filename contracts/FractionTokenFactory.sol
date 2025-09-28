// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./FractionalToken.sol";

interface IPropertyNFT {
    enum PropertyStatus { PENDING, APPROVED, MINTED }
    function getApplication(uint256 applicationId) external view returns (address, string memory, string memory, PropertyStatus, bool);
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract FractionTokenFactory {
    mapping(uint256 => address) public propertyToFractionToken;
    mapping(uint256 => address) public applicationToFractionToken;
    IPropertyNFT public propertyNFTContract;
    
    event FractionTokenCreated(uint256 propertyId, uint256 applicationId, address tokenAddress);

    constructor(address _propertyNFTContract) {
        propertyNFTContract = IPropertyNFT(_propertyNFTContract);
    }

    function createFractionTokenFromApplication(
        uint256 applicationId, string memory name, string memory symbol, uint256 totalSupply
    ) external returns (address) {
        (, , , IPropertyNFT.PropertyStatus status, bool allSigned) = propertyNFTContract.getApplication(applicationId);
        require(status == IPropertyNFT.PropertyStatus.APPROVED, "Application not approved");
        require(allSigned, "Not all signatures collected");
        require(applicationToFractionToken[applicationId] == address(0), "Token already exists");

        FractionalToken token = new FractionalToken(name, symbol, totalSupply, applicationId, applicationId, msg.sender);
        applicationToFractionToken[applicationId] = address(token);
        propertyToFractionToken[applicationId] = address(token);

        emit FractionTokenCreated(applicationId, applicationId, address(token));
        return address(token);
    }

    function createFractionToken(
        uint256 propertyId, string memory name, string memory symbol, uint256 totalSupply
    ) external returns (address) {
        require(propertyToFractionToken[propertyId] == address(0), "Token already exists");
        address propertyOwner = propertyNFTContract.ownerOf(propertyId);
        require(propertyOwner == msg.sender, "Only property owner");

        FractionalToken token = new FractionalToken(name, symbol, totalSupply, propertyId, 0, msg.sender);
        propertyToFractionToken[propertyId] = address(token);

        emit FractionTokenCreated(propertyId, 0, address(token));
        return address(token);
    }
}
