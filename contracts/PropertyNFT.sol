// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PropertyNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    mapping(uint256 => string) public tokenURIMap;

    constructor(address initialOwner) ERC721("RealEstateNFT", "RE-NFT") Ownable(initialOwner){}

    function mintProperty(address to, string memory uri) external onlyOwner {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        tokenURIMap[tokenId] = uri;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return tokenURIMap[tokenId];
    }
}