// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract PropertyNFT is ERC721, Ownable, AccessControl {
    uint256 public nextTokenId;

    bytes32 public constant SURVEYOR_ROLE = keccak256("SURVEYOR_ROLE");
    bytes32 public constant NOTARY_ROLE = keccak256("NOTARY_ROLE");
    bytes32 public constant IVSL_ROLE = keccak256("IVSL_ROLE");

    struct Metadata {
        string ipfsHash;
        string dbHash;
    }

    struct Signatures {
        bool surveyorSigned;
        bool notarySigned;
        bool ivslSigned;
    }

    mapping(uint256 => Metadata) private _tokenMetadata;
    mapping(uint256 => Signatures) private _signatures;

    constructor(address initialOwner) ERC721("RealEstateNFT", "RE-NFT") Ownable(initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    function mintProperty(address to, string memory ipfsHash, string memory dbHash) external {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _tokenMetadata[tokenId] = Metadata(ipfsHash, dbHash);
    }

    function signProperty(uint256 tokenId) external {
        require(ownerOf(tokenId) != address(0), "Token does not exist");

        if (hasRole(SURVEYOR_ROLE, msg.sender)) {
            require(!_signatures[tokenId].surveyorSigned, "Already signed");
            _signatures[tokenId].surveyorSigned = true;
        } else if (hasRole(NOTARY_ROLE, msg.sender)) {
            require(!_signatures[tokenId].notarySigned, "Already signed");
            _signatures[tokenId].notarySigned = true;
        } else if (hasRole(IVSL_ROLE, msg.sender)) {
            require(!_signatures[tokenId].ivslSigned, "Already signed");
            _signatures[tokenId].ivslSigned = true;
        } else {
            revert("Not authorized to sign");
        }
    }

    function isSignedBySurveyor(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].surveyorSigned;
    }

    function isSignedByNotary(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].notarySigned;
    }

    function isSignedByIVSL(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].ivslSigned;
    }

    function isFullySigned(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].surveyorSigned &&
               _signatures[tokenId].notarySigned &&
               _signatures[tokenId].ivslSigned;
    }

    function getMetadata(uint256 tokenId) external view returns (string memory ipfsHash, string memory dbHash) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        Metadata memory metadata = _tokenMetadata[tokenId];
        return (metadata.ipfsHash, metadata.dbHash);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}