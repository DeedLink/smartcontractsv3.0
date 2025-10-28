// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract StampFeeCollector {
    address public admin;

    event StampFeePaid(
        address indexed payer,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 timestamp
    );

    constructor(address _admin) {
        require(_admin != address(0), "Admin cannot be zero address");
        admin = _admin;
    }

    function payStampFee(uint256 tokenId) external payable {
        require(msg.value > 0, "Fee required");

        (bool sent, ) = admin.call{value: msg.value}("");
        require(sent, "Failed to send fee");

        emit StampFeePaid(msg.sender, tokenId, msg.value, block.timestamp);
    }

    function updateAdmin(address newAdmin) external {
        require(msg.sender == admin, "Only admin");
        require(newAdmin != address(0), "Admin cannot be zero");
        admin = newAdmin;
    }
}
