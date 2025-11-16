// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FractionalToken is ERC20 {
    uint256 public propertyId;
    address public factory;

    constructor(string memory name, string memory symbol, uint256 supply, uint256 _propertyId, address ownerAddr)
        ERC20(name, symbol)
    {
        propertyId = _propertyId;
        factory = msg.sender;
        _mint(ownerAddr, supply);
    }

    function burn(uint256 amount) external {
        require(msg.sender == factory || msg.sender == _msgSender(), "Not authorized to burn");
        if (msg.sender == factory) {
            _burn(factory, amount);
        } else {
            _burn(msg.sender, amount);
        }
    }
}