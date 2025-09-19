// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract PropertyNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    mapping(uint256 => string) public tokenURIMap;
    bytes32 public merkleRoot;

    constructor(address initialOwner) ERC721("RealEstateNFT", "RE-NFT") Ownable(initialOwner){}

    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
    }

    function mintProperty(string memory uri, bytes32[] calldata proof) external {
        require(
            MerkleProof.verify(proof, merkleRoot, keccak256(abi.encodePacked(msg.sender))),
            "Not whitelisted"
        );
        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        tokenURIMap[tokenId] = uri;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return tokenURIMap[tokenId];
    }
}
