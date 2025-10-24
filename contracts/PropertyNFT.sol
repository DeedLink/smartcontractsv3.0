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
        address surveyor;
        address notary;
        address ivsl;
    }

    struct RentInfo {
        uint256 amount;
        uint256 period;
        uint256 lastPaid;
        address receiver;
    }

    mapping(uint256 => RentInfo) public rentInfo;
    event RentPaid(uint256 indexed tokenId, address indexed payer, uint256 amount, uint256 timestamp);

    enum PoARights { SIGN, TRANSFER, FRACTIONALIZE, PAY_RENT }
    struct PoAInfo {
        bool allowed;
        uint256 start;
        uint256 end;
    }
    mapping(uint256 => mapping(address => mapping(PoARights => PoAInfo))) public poa;
    event PoASet(uint256 indexed tokenId, address indexed agent, PoARights right, bool allowed, uint256 start, uint256 end);
 
    mapping(uint256 => Metadata) private _tokenMetadata;
    mapping(uint256 => Signatures) private _signatures;

    event PropertySigned(uint256 indexed tokenId, address indexed signer, string role);

    constructor(address initialOwner) ERC721("RealEstateNFT", "RE-NFT") Ownable(initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    modifier onlyOwnerOrActiveAgent(uint256 tokenId, PoARights right) {
        PoAInfo memory agent = poa[tokenId][msg.sender][right];
        require(
            msg.sender == ownerOf(tokenId) ||
            (agent.allowed && block.timestamp >= agent.start && block.timestamp <= agent.end),
            "Not authorized"
        );
        _;
    }

    function mintProperty(address to, string memory ipfsHash, string memory dbHash) external {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _tokenMetadata[tokenId] = Metadata(ipfsHash, dbHash);
    }

    function signProperty(uint256 tokenId) external {
        require(ownerOf(tokenId) != address(0), "Token does not exist");

        if (hasRole(SURVEYOR_ROLE, msg.sender)) {
            require(_signatures[tokenId].surveyor == address(0), "Already signed");
            _signatures[tokenId].surveyor = msg.sender;
            emit PropertySigned(tokenId, msg.sender, "SURVEYOR");
        } else if (hasRole(NOTARY_ROLE, msg.sender)) {
            require(_signatures[tokenId].notary == address(0), "Already signed");
            _signatures[tokenId].notary = msg.sender;
            emit PropertySigned(tokenId, msg.sender, "NOTARY");
        } else if (hasRole(IVSL_ROLE, msg.sender)) {
            require(_signatures[tokenId].ivsl == address(0), "Already signed");
            _signatures[tokenId].ivsl = msg.sender;
            emit PropertySigned(tokenId, msg.sender, "IVSL");
        } else {
            revert("Not authorized to sign");
        }
    }

    function getRolesOf(address account) external view returns (bool surveyor, bool notary, bool ivsl) {
        return (
            hasRole(SURVEYOR_ROLE, account),
            hasRole(NOTARY_ROLE, account),
            hasRole(IVSL_ROLE, account)
        );
    }

    function getSignatures(uint256 tokenId) external view returns (address surveyor, address notary, address ivsl) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        Signatures memory s = _signatures[tokenId];
        return (s.surveyor, s.notary, s.ivsl);
    }

    function isSignedBySurveyor(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].surveyor != address(0);
    }

    function isSignedByNotary(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].notary != address(0);
    }

    function isSignedByIVSL(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].ivsl != address(0);
    }

    function isFullySigned(uint256 tokenId) public view returns (bool) {
        require(ownerOf(tokenId) != address(0), "Token does not exist");
        return _signatures[tokenId].surveyor != address(0) &&
               _signatures[tokenId].notary != address(0) &&
               _signatures[tokenId].ivsl != address(0);
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

    function setPoA(
        uint256 tokenId,
        address agent,
        PoARights right,
        bool allowed,
        uint256 start,
        uint256 end
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Only owner can assign PoA");
        require(end > start, "Invalid period");
        poa[tokenId][agent][right] = PoAInfo(allowed, start, end);
        emit PoASet(tokenId, agent, right, allowed, start, end);
    }

    function setRent(uint256 tokenId, uint256 amount, uint256 period, address receiver) external {
        require(ownerOf(tokenId) == msg.sender, "Only owner can set rent");
        rentInfo[tokenId] = RentInfo(amount, period, block.timestamp, receiver);
    }

    function payRent(uint256 tokenId) external payable onlyOwnerOrActiveAgent(tokenId, PoARights.PAY_RENT) {
        RentInfo storage rent = rentInfo[tokenId];
        require(rent.amount > 0, "Rent not set");
        require(msg.value == rent.amount, "Incorrect amount");
        require(block.timestamp >= rent.lastPaid + rent.period, "Payment not due yet");

        rent.lastPaid = block.timestamp;
        payable(rent.receiver).transfer(msg.value);
        emit RentPaid(tokenId, msg.sender, msg.value, block.timestamp);
    }

    function getRentStatus(uint256 tokenId) external view returns (uint256 lastPaid, uint256 amount, uint256 period, address receiver) {
        RentInfo memory r = rentInfo[tokenId];
        return (r.lastPaid, r.amount, r.period, r.receiver);
    }
}