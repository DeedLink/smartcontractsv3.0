// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FractionalToken is ERC20 {
    uint256 public propertyId;

    constructor(string memory name, string memory symbol, uint256 supply, uint256 _propertyId, address ownerAddr)
        ERC20(name, symbol)
    {
        propertyId = _propertyId;
        _mint(ownerAddr, supply);
    }
}