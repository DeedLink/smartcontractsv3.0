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
        string ipfsURI;
        string databaseURI;
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

    function mintProperty(address to, string memory ipfsURI, string memory databaseURI) external onlyOwner {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _tokenMetadata[tokenId] = Metadata(ipfsURI, databaseURI);
    }

    function signProperty(uint256 tokenId) external {
        require(ownerOf(tokenId) != address(0), "Token does not exist");

        if (hasRole(SURVEYOR_ROLE, msg.sender)) {
            _signatures[tokenId].surveyorSigned = true;
        } else if (hasRole(NOTARY_ROLE, msg.sender)) {
            _signatures[tokenId].notarySigned = true;
        } else if (hasRole(IVSL_ROLE, msg.sender)) {
            _signatures[tokenId].ivslSigned = true;
        } else {
            revert("Not authorized to sign");
        }
    }

    function isFullySigned(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        Signatures memory sig = _signatures[tokenId];
        return sig.surveyorSigned && sig.notarySigned && sig.ivslSigned;
    }

    function getSignatureStatus(uint256 tokenId) external view returns (bool, bool, bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        Signatures memory sig = _signatures[tokenId];
        return (sig.surveyorSigned, sig.notarySigned, sig.ivslSigned);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _tokenMetadata[tokenId].ipfsURI;
    }

    function dbURI(uint256 tokenId) public view returns (string memory) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _tokenMetadata[tokenId].databaseURI;
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
