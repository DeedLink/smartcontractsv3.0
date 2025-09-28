// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PropertyNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    uint256 public nextApplicationId;
    
    enum UserType { SURVEYOR, NOTARY, IVSL }
    enum PropertyStatus { PENDING, APPROVED, MINTED }
    
    struct Metadata {
        string ipfsURI;
        string databaseURI;
    }
    
    struct PropertyApplication {
        address applicant;
        string ipfsURI;
        string databaseURI;
        PropertyStatus status;
        mapping(UserType => bool) signatures;
        mapping(UserType => address) signers;
    }
    
    mapping(uint256 => Metadata) private _tokenMetadata;
    mapping(uint256 => PropertyApplication) public propertyApplications;
    mapping(address => UserType) public authorizedUsers;
    mapping(UserType => mapping(address => bool)) public typeAuthorizations;
    
    event PropertyApplicationCreated(uint256 applicationId, address applicant);
    event PropertySigned(uint256 applicationId, UserType userType, address signer);
    event PropertyApproved(uint256 applicationId);
    event PropertyMinted(uint256 applicationId, uint256 tokenId, address to);

    constructor(address initialOwner) ERC721("RealEstateNFT", "RE-NFT") Ownable(initialOwner) {}

    function addAuthorizedUser(address user, UserType userType) external onlyOwner {
        authorizedUsers[user] = userType;
        typeAuthorizations[userType][user] = true;
    }

    function removeAuthorizedUser(address user) external onlyOwner {
        UserType userType = authorizedUsers[user];
        delete authorizedUsers[user];
        typeAuthorizations[userType][user] = false;
    }

    function createPropertyApplication(string memory ipfsURI, string memory databaseURI) external returns (uint256) {
        uint256 applicationId = nextApplicationId++;
        PropertyApplication storage app = propertyApplications[applicationId];
        app.applicant = msg.sender;
        app.ipfsURI = ipfsURI;
        app.databaseURI = databaseURI;
        app.status = PropertyStatus.PENDING;
        emit PropertyApplicationCreated(applicationId, msg.sender);
        return applicationId;
    }

    function signProperty(uint256 applicationId) external {
        require(typeAuthorizations[authorizedUsers[msg.sender]][msg.sender], "Not authorized");
        PropertyApplication storage app = propertyApplications[applicationId];
        require(app.status == PropertyStatus.PENDING, "Application not pending");
        
        UserType signerType = authorizedUsers[msg.sender];
        require(!app.signatures[signerType], "Already signed");
        
        app.signatures[signerType] = true;
        app.signers[signerType] = msg.sender;
        emit PropertySigned(applicationId, signerType, msg.sender);
        
        if (app.signatures[UserType.SURVEYOR] && app.signatures[UserType.NOTARY] && app.signatures[UserType.IVSL]) {
            app.status = PropertyStatus.APPROVED;
            emit PropertyApproved(applicationId);
        }
    }

    function mintApprovedProperty(uint256 applicationId, address to) external {
        PropertyApplication storage app = propertyApplications[applicationId];
        require(app.status == PropertyStatus.APPROVED, "Property not approved");
        require(msg.sender == app.applicant || msg.sender == owner(), "Only applicant or owner");
        
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _tokenMetadata[tokenId] = Metadata(app.ipfsURI, app.databaseURI);
        app.status = PropertyStatus.MINTED;
        emit PropertyMinted(applicationId, tokenId, to);
    }

    function getApplication(uint256 applicationId) external view returns (
        address applicant, string memory ipfsURI, string memory databaseURI, PropertyStatus status, bool allSigned
    ) {
        PropertyApplication storage app = propertyApplications[applicationId];
        bool isAllSigned = app.signatures[UserType.SURVEYOR] && app.signatures[UserType.NOTARY] && app.signatures[UserType.IVSL];
        return (app.applicant, app.ipfsURI, app.databaseURI, app.status, isAllSigned);
    }

    function getSignatureStatus(uint256 applicationId) external view returns (
        bool surveyorSigned, bool notarySigned, bool ivslSigned,
        address surveyorSigner, address notarySigner, address ivslSigner
    ) {
        PropertyApplication storage app = propertyApplications[applicationId];
        return (
            app.signatures[UserType.SURVEYOR], app.signatures[UserType.NOTARY], app.signatures[UserType.IVSL],
            app.signers[UserType.SURVEYOR], app.signers[UserType.NOTARY], app.signers[UserType.IVSL]
        );
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _tokenMetadata[tokenId].ipfsURI;
    }
    
    function dbURI(uint256 tokenId) public view returns (string memory) {
        return _tokenMetadata[tokenId].databaseURI;
    }

    function getProperty(uint256 tokenId) public view returns (address owner, string memory ipfsURI, string memory databaseURI) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        owner = ownerOf(tokenId);
        Metadata memory meta = _tokenMetadata[tokenId];
        return (owner, meta.ipfsURI, meta.databaseURI);
    }
}
