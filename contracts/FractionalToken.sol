// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FractionalToken is ERC20 {
    uint256 public propertyId;
    uint256 public applicationId;

    constructor(
        string memory name, string memory symbol, uint256 supply, 
        uint256 _propertyId, uint256 _applicationId, address ownerAddr
    ) ERC20(name, symbol) {
        propertyId = _propertyId;
        applicationId = _applicationId;
        _mint(ownerAddr, supply);
    }
}