// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PropertyNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    struct Metadata {
        string ipfsURI;
        string databaseURI;
    }
    mapping(uint256 => Metadata) private _tokenMetadata;

    constructor(address initialOwner) ERC721("RealEstateNFT", "RE-NFT") Ownable(initialOwner){}

    function mintProperty(address to, string memory ipfsURI, string memory databaseURI) external {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _tokenMetadata[tokenId] = Metadata(ipfsURI, databaseURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _tokenMetadata[tokenId].ipfsURI;
    }
    
    function dbURI(uint256 tokenId) public view returns (string memory) {
        return _tokenMetadata[tokenId].databaseURI;
    }

    function getProperty(uint256 tokenId) public view returns (
        address owner,
        string memory ipfsURI,
        string memory databaseURI
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        owner = ownerOf(tokenId);
        Metadata memory meta = _tokenMetadata[tokenId];
        return (owner, meta.ipfsURI, meta.databaseURI);
    }
}