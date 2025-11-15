// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IPropertyNFT.sol";

contract LastWillRegistry is Ownable, ReentrancyGuard {
    
    struct LastWill {
        address beneficiary;
        address witness1;
        address witness2;
        uint256 createdAt;
        uint256 executionDate;
        bool isActive;
        bool isExecuted;
        string ipfsHash;
        WitnessStatus witness1Status;
        WitnessStatus witness2Status;
    }

    enum WitnessStatus {
        PENDING,
        SIGNED,
        REJECTED
    }

    mapping(uint256 => LastWill) public wills;
    mapping(uint256 => address[]) public willWitnesses;
    mapping(address => bool) public authorizedExecutors;

    event WillCreated(
        uint256 indexed tokenId,
        address indexed owner,
        address indexed beneficiary,
        address witness1,
        address witness2,
        string ipfsHash
    );
    
    event WillWitnessed(
        uint256 indexed tokenId,
        address indexed witness,
        bool approved
    );
    
    event WillExecuted(
        uint256 indexed tokenId,
        address indexed beneficiary,
        address executor,
        uint256 timestamp
    );
    
    event WillRevoked(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 timestamp
    );

    event WillTransferred(
        uint256 indexed tokenId,
        address indexed oldBeneficiary,
        address indexed newBeneficiary
    );

    event ExecutorAuthorized(address indexed executor, bool status);

    IPropertyNFT public propertyNFT;

    constructor(address _propertyNFT, address initialOwner) Ownable(initialOwner) {
        require(_propertyNFT != address(0), "Invalid PropertyNFT address");
        propertyNFT = IPropertyNFT(_propertyNFT);
    }

    modifier onlyPropertyOwner(uint256 tokenId) {
        require(propertyNFT.ownerOf(tokenId) == msg.sender, "Not property owner");
        _;
    }

    modifier onlyAuthorizedExecutor() {
        require(authorizedExecutors[msg.sender] || msg.sender == owner(), "Not authorized executor");
        _;
    }

    function createWill(
        uint256 tokenId,
        address beneficiary,
        address witness1,
        address witness2,
        string memory ipfsHash
    ) external onlyPropertyOwner(tokenId) {
        require(!wills[tokenId].isActive, "Will already exists for this property");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(witness1 != address(0) && witness2 != address(0), "Invalid witnesses");
        require(witness1 != witness2, "Witnesses must be different");
        require(beneficiary != msg.sender, "Cannot be your own beneficiary");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        wills[tokenId] = LastWill({
            beneficiary: beneficiary,
            witness1: witness1,
            witness2: witness2,
            createdAt: block.timestamp,
            executionDate: 0,
            isActive: true,
            isExecuted: false,
            ipfsHash: ipfsHash,
            witness1Status: WitnessStatus.PENDING,
            witness2Status: WitnessStatus.PENDING
        });

        emit WillCreated(tokenId, msg.sender, beneficiary, witness1, witness2, ipfsHash);
    }

    function witnessWill(uint256 tokenId, bool approve) external {
        LastWill storage will = wills[tokenId];
        require(will.isActive, "No active will for this property");
        require(!will.isExecuted, "Will already executed");
        require(
            msg.sender == will.witness1 || msg.sender == will.witness2,
            "Not a witness for this will"
        );

        if (msg.sender == will.witness1) {
            require(will.witness1Status == WitnessStatus.PENDING, "Already witnessed");
            will.witness1Status = approve ? WitnessStatus.SIGNED : WitnessStatus.REJECTED;
        } else {
            require(will.witness2Status == WitnessStatus.PENDING, "Already witnessed");
            will.witness2Status = approve ? WitnessStatus.SIGNED : WitnessStatus.REJECTED;
        }

        emit WillWitnessed(tokenId, msg.sender, approve);
    }

    function executeWill(uint256 tokenId) external nonReentrant onlyAuthorizedExecutor {
        LastWill storage will = wills[tokenId];
        require(will.isActive, "No active will for this property");
        require(!will.isExecuted, "Will already executed");
        require(
            will.witness1Status == WitnessStatus.SIGNED && 
            will.witness2Status == WitnessStatus.SIGNED,
            "Will not fully witnessed"
        );

        address currentOwner = propertyNFT.ownerOf(tokenId);
        
        will.isExecuted = true;
        will.isActive = false;
        will.executionDate = block.timestamp;

        propertyNFT.transferFrom(currentOwner, will.beneficiary, tokenId);

        emit WillExecuted(tokenId, will.beneficiary, msg.sender, block.timestamp);
    }

    function revokeWill(uint256 tokenId) external onlyPropertyOwner(tokenId) {
        LastWill storage will = wills[tokenId];
        require(will.isActive, "No active will for this property");
        require(!will.isExecuted, "Cannot revoke executed will");

        will.isActive = false;

        emit WillRevoked(tokenId, msg.sender, block.timestamp);
    }

    function updateBeneficiary(
        uint256 tokenId,
        address newBeneficiary
    ) external onlyPropertyOwner(tokenId) {
        LastWill storage will = wills[tokenId];
        require(will.isActive, "No active will for this property");
        require(!will.isExecuted, "Cannot update executed will");
        require(newBeneficiary != address(0), "Invalid beneficiary");
        require(newBeneficiary != msg.sender, "Cannot be your own beneficiary");

        address oldBeneficiary = will.beneficiary;
        will.beneficiary = newBeneficiary;
        
        will.witness1Status = WitnessStatus.PENDING;
        will.witness2Status = WitnessStatus.PENDING;

        emit WillTransferred(tokenId, oldBeneficiary, newBeneficiary);
    }

    function setExecutorAuthorization(address executor, bool status) external onlyOwner {
        require(executor != address(0), "Invalid executor address");
        authorizedExecutors[executor] = status;
        emit ExecutorAuthorized(executor, status);
    }

    function getWill(uint256 tokenId) external view returns (
        address beneficiary,
        address witness1,
        address witness2,
        uint256 createdAt,
        uint256 executionDate,
        bool isActive,
        bool isExecuted,
        string memory ipfsHash,
        WitnessStatus witness1Status,
        WitnessStatus witness2Status
    ) {
        LastWill memory will = wills[tokenId];
        return (
            will.beneficiary,
            will.witness1,
            will.witness2,
            will.createdAt,
            will.executionDate,
            will.isActive,
            will.isExecuted,
            will.ipfsHash,
            will.witness1Status,
            will.witness2Status
        );
    }

    function isWillReadyForExecution(uint256 tokenId) external view returns (bool) {
        LastWill memory will = wills[tokenId];
        return will.isActive && 
               !will.isExecuted && 
               will.witness1Status == WitnessStatus.SIGNED && 
               will.witness2Status == WitnessStatus.SIGNED;
    }

    function hasActiveWill(uint256 tokenId) external view returns (bool) {
        return wills[tokenId].isActive && !wills[tokenId].isExecuted;
    }
}