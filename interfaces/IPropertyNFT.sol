// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IPropertyNFT {
    function isFullySigned(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
}