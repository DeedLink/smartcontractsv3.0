# Real Estate NFT Smart Contract System

Complete blockchain-based real estate management system with NFT properties, fractional ownership, escrow, stamp fees, and last will functionality.

---

## Contract Addresses (Deploy First)

```
PropertyNFT: [DEPLOYED_ADDRESS]
FractionTokenFactory: [DEPLOYED_ADDRESS]
EscrowFactory: [DEPLOYED_ADDRESS]
StampFeeCollector: [DEPLOYED_ADDRESS]
LastWillRegistry: [DEPLOYED_ADDRESS]
```

---

## 1. PropertyNFT Contract

### Functions

#### `mintProperty(address to, string ipfsHash, string dbHash)`
- **Description**: Mint a new property NFT
- **Access**: Anyone
- **Call**:
```javascript
await propertyNFT.mintProperty(
  "0x...", // owner address
  "ipfs://QmXxx...", // IPFS hash
  "db://property123" // database hash
);
```
- **Returns**: Creates new tokenId (auto-incremented)
- **Event**: None directly, but triggers Transfer event

#### `signProperty(uint256 tokenId)`
- **Description**: Sign property as surveyor, notary, or IVSL
- **Access**: Only role holders
- **Call**:
```javascript
// As surveyor
await propertyNFT.connect(surveyor).signProperty(0);
// As notary
await propertyNFT.connect(notary).signProperty(0);
// As IVSL
await propertyNFT.connect(ivsl).signProperty(0);
```
- **Event**: `PropertySigned(tokenId, signer, role)`

#### `getSignatures(uint256 tokenId)`
- **Description**: Get all signers for a property
- **Access**: Anyone
- **Call**:
```javascript
const [surveyor, notary, ivsl] = await propertyNFT.getSignatures(0);
```
- **Returns**: `(address surveyor, address notary, address ivsl)`

#### `isFullySigned(uint256 tokenId)`
- **Description**: Check if property has all required signatures
- **Access**: Anyone
- **Call**:
```javascript
const isSigned = await propertyNFT.isFullySigned(0);
```
- **Returns**: `bool` - true if all three roles have signed

#### `getMetadata(uint256 tokenId)`
- **Description**: Get property metadata
- **Access**: Anyone
- **Call**:
```javascript
const [ipfsHash, dbHash] = await propertyNFT.getMetadata(0);
```
- **Returns**: `(string ipfsHash, string dbHash)`

#### `setPoA(uint256 tokenId, address agent, PoARights right, bool allowed, uint256 start, uint256 end)`
- **Description**: Grant Power of Attorney to an agent
- **Access**: Property owner only
- **Rights**: `0=SIGN, 1=TRANSFER, 2=FRACTIONALIZE, 3=PAY_RENT`
- **Call**:
```javascript
const nowTimestamp = Math.floor(Date.now() / 1000);
const oneYearLater = nowTimestamp + 365 * 24 * 60 * 60;
await propertyNFT.setPoA(
  0, // tokenId
  "0x...", // agent address
  3, // PAY_RENT right
  true, // allowed
  nowTimestamp,
  oneYearLater
);
```
- **Event**: `PoASet(tokenId, agent, right, allowed, start, end)`

#### `setRent(uint256 tokenId, uint256 amount, uint256 period, address receiver)`
- **Description**: Set rent parameters for property
- **Access**: Property owner only
- **Call**:
```javascript
await propertyNFT.setRent(
  0, // tokenId
  ethers.parseEther("1.5"), // 1.5 ETH per period
  30 * 24 * 60 * 60, // 30 days in seconds
  "0x..." // receiver address
);
```

#### `payRent(uint256 tokenId)`
- **Description**: Pay rent for property
- **Access**: Owner or authorized agent with PAY_RENT right
- **Call**:
```javascript
const rentAmount = await propertyNFT.rentInfo(0).amount;
await propertyNFT.payRent(0, { value: rentAmount });
```
- **Event**: `RentPaid(tokenId, payer, amount, timestamp)`

#### `isRentActive(uint256 tokenId)`
- **Description**: Check if rent is currently paid
- **Access**: Anyone
- **Call**:
```javascript
const isActive = await propertyNFT.isRentActive(0);
```
- **Returns**: `bool`

#### `getRolesOf(address account)`
- **Description**: Get all roles of an account
- **Access**: Anyone
- **Call**:
```javascript
const [isSurveyor, isNotary, isIVSL] = await propertyNFT.getRolesOf("0x...");
```
- **Returns**: `(bool, bool, bool)`

### Events

```solidity
event PropertySigned(uint256 indexed tokenId, address indexed signer, string role);
event PoASet(uint256 indexed tokenId, address indexed agent, PoARights right, bool allowed, uint256 start, uint256 end);
event RentPaid(uint256 indexed tokenId, address indexed payer, uint256 amount, uint256 timestamp);
```

### Listen to Events

```javascript
// Listen for property signings
propertyNFT.on("PropertySigned", (tokenId, signer, role) => {
  console.log(`Property ${tokenId} signed by ${role}: ${signer}`);
});

// Listen for rent payments
propertyNFT.on("RentPaid", (tokenId, payer, amount, timestamp) => {
  console.log(`Rent paid for property ${tokenId}: ${ethers.formatEther(amount)} ETH`);
});

// Get past events
const filter = propertyNFT.filters.PropertySigned(0); // tokenId 0
const events = await propertyNFT.queryFilter(filter);
```

---

## 2. FractionalToken Contract

### Functions

#### `burn(uint256 amount)`
- **Description**: Burn fractional tokens
- **Access**: Token holder
- **Call**:
```javascript
await fractionalToken.burn(ethers.parseUnits("100", 18));
```

#### Standard ERC20 Functions
- `balanceOf(address)` - Get token balance
- `transfer(address, uint256)` - Transfer tokens
- `approve(address, uint256)` - Approve spending
- `transferFrom(address, address, uint256)` - Transfer from approved

**Call Examples**:
```javascript
const balance = await fractionalToken.balanceOf("0x...");
await fractionalToken.transfer("0x...", ethers.parseUnits("50", 18));
await fractionalToken.approve("0x...", ethers.parseUnits("100", 18));
```

### Events
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```

---

## 3. FractionTokenFactory Contract

### Functions

#### `createFractionToken(uint256 propertyId, string name, string symbol, uint256 totalSupply, address propertyNFTAddr)`
- **Description**: Create fractional tokens for a property
- **Access**: Property owner only
- **Requirements**: Property must be fully signed
- **Call**:
```javascript
// First approve PropertyNFT transfer
await propertyNFT.approve(fractionFactoryAddress, 0);

// Then create fractions
await fractionFactory.createFractionToken(
  0, // propertyId
  "Property Token",
  "PTKN",
  ethers.parseUnits("1000000", 18), // 1M tokens
  propertyNFTAddress
);
```
- **Event**: `FractionTokenCreated(propertyId, tokenAddress, totalSupply)`

#### `defractionalizeProperty(uint256 propertyId, address propertyNFTAddr)`
- **Description**: Convert 100% fractional ownership back to NFT
- **Access**: Must own 100% of fractions
- **Call**:
```javascript
await fractionFactory.defractionalizeProperty(0, propertyNFTAddress);
```
- **Event**: `PropertyDefractionalized(propertyId, owner)`

#### `transferFullOwnership(uint256 propertyId, address to, address propertyNFTAddr)`
- **Description**: Burn all fractions and transfer NFT to new owner
- **Access**: Must own 100% of fractions
- **Call**:
```javascript
await fractionFactory.transferFullOwnership(
  0, // propertyId
  "0x...", // new owner
  propertyNFTAddress
);
```
- **Event**: `FullOwnershipTransferred(propertyId, from, to)`

#### `getFractionToken(uint256 propertyId)`
- **Description**: Get fractional token address for property
- **Access**: Anyone
- **Call**:
```javascript
const tokenAddress = await fractionFactory.getFractionToken(0);
```
- **Returns**: `address`

#### `hasFullOwnership(uint256 propertyId, address owner)`
- **Description**: Check if address owns 100% of fractions
- **Access**: Anyone
- **Call**:
```javascript
const hasFullOwnership = await fractionFactory.hasFullOwnership(0, "0x...");
```
- **Returns**: `bool`

#### `getFractionBalance(uint256 propertyId, address owner)`
- **Description**: Get fraction balance for an address
- **Access**: Anyone
- **Call**:
```javascript
const balance = await fractionFactory.getFractionBalance(0, "0x...");
```
- **Returns**: `uint256`

### Events

```solidity
event FractionTokenCreated(uint256 propertyId, address tokenAddress, uint256 totalSupply);
event PropertyDefractionalized(uint256 propertyId, address indexed owner);
event FullOwnershipTransferred(uint256 propertyId, address indexed from, address indexed to);
```

### Listen to Events

```javascript
fractionFactory.on("FractionTokenCreated", (propertyId, tokenAddress, totalSupply) => {
  console.log(`Property ${propertyId} fractionalized at ${tokenAddress}`);
});
```

---

## 4. HybridEscrow Contract

### Functions

#### `depositPayment()`
- **Description**: Buyer deposits payment into escrow
- **Access**: Buyer only
- **Call**:
```javascript
const price = await escrow.price();
await escrow.connect(buyer).depositPayment({ value: price });
```
- **Event**: `PaymentDeposited(buyer, amount)`

#### `depositNFTAsset()`
- **Description**: Seller deposits NFT into escrow
- **Access**: Seller only
- **Type**: NFT escrow only
- **Call**:
```javascript
// First approve escrow
await propertyNFT.connect(seller).approve(escrowAddress, tokenId);
// Then deposit
await escrow.connect(seller).depositNFTAsset();
```
- **Event**: `AssetDeposited(seller, NFT)`

#### `depositFractionalAsset()`
- **Description**: Seller deposits fractional tokens into escrow
- **Access**: Seller only
- **Type**: Fractional escrow only
- **Call**:
```javascript
// First approve escrow
await fractionalToken.connect(seller).approve(escrowAddress, fractionAmount);
// Then deposit
await escrow.connect(seller).depositFractionalAsset();
```
- **Event**: `AssetDeposited(seller, FRACTIONAL)`

#### `finalize()`
- **Description**: Complete escrow - transfers asset to buyer, payment to seller
- **Access**: Buyer only
- **Requirements**: Both deposits must be completed
- **Call**:
```javascript
await escrow.connect(buyer).finalize();
```
- **Event**: `EscrowFinalized(buyer, seller)`

#### `cancel()`
- **Description**: Cancel escrow and refund both parties
- **Access**: Buyer or seller
- **Call**:
```javascript
await escrow.connect(buyer).cancel();
// or
await escrow.connect(seller).cancel();
```
- **Event**: `EscrowCancelled()`

#### `getStatus()`
- **Description**: Get current escrow status
- **Access**: Anyone
- **Call**:
```javascript
const [isBuyerDeposited, isSellerDeposited, isFinalized] = await escrow.getStatus();
```
- **Returns**: `(bool, bool, bool)`

### Events

```solidity
event PaymentDeposited(address indexed buyer, uint256 amount);
event AssetDeposited(address indexed seller, EscrowType escrowType);
event EscrowFinalized(address indexed buyer, address indexed seller);
event EscrowCancelled();
```

---

## 5. EscrowFactory Contract

### Functions

#### `createNFTEscrow(address buyer, address seller, uint256 price, address propertyNFT, uint256 tokenId)`
- **Description**: Create escrow for full NFT property
- **Access**: Anyone
- **Call**:
```javascript
const escrowAddress = await escrowFactory.createNFTEscrow(
  buyerAddress,
  sellerAddress,
  ethers.parseEther("10"), // 10 ETH
  propertyNFTAddress,
  0 // tokenId
);
```
- **Returns**: `address` - escrow contract address
- **Event**: `EscrowCreated(escrowAddress, buyer, seller, NFT)`

#### `createFractionalEscrow(address buyer, address seller, uint256 price, address propertyNFT, uint256 propertyId, address fractionToken, uint256 fractionAmount)`
- **Description**: Create escrow for fractional tokens
- **Access**: Anyone
- **Call**:
```javascript
const escrowAddress = await escrowFactory.createFractionalEscrow(
  buyerAddress,
  sellerAddress,
  ethers.parseEther("2.5"), // 2.5 ETH
  propertyNFTAddress,
  0, // propertyId
  fractionTokenAddress,
  ethers.parseUnits("50000", 18) // 50k tokens
);
```
- **Returns**: `address` - escrow contract address
- **Event**: `EscrowCreated(escrowAddress, buyer, seller, FRACTIONAL)`

#### `getUserEscrows(address user)`
- **Description**: Get all escrows for a user
- **Access**: Anyone
- **Call**:
```javascript
const userEscrows = await escrowFactory.getUserEscrows("0x...");
```
- **Returns**: `address[]`

#### `getTotalEscrows()`
- **Description**: Get total number of escrows created
- **Access**: Anyone
- **Call**:
```javascript
const total = await escrowFactory.getTotalEscrows();
```
- **Returns**: `uint256`

### Events

```solidity
event EscrowCreated(
    address indexed escrow,
    address indexed buyer,
    address indexed seller,
    HybridEscrow.EscrowType escrowType
);
```

### Listen to Events

```javascript
escrowFactory.on("EscrowCreated", (escrowAddr, buyer, seller, type) => {
  console.log(`New escrow created at ${escrowAddr} between ${buyer} and ${seller}`);
});
```

---

## 6. StampFeeCollector Contract

### Functions

#### `payStampFee(uint256 tokenId)`
- **Description**: Pay government stamp duty fee for property
- **Access**: Anyone
- **Call**:
```javascript
await stampFeeCollector.payStampFee(0, { 
  value: ethers.parseEther("0.5") // 0.5 ETH fee
});
```
- **Event**: `StampFeePaid(payer, tokenId, amount, timestamp)`

#### `updateAdmin(address newAdmin)`
- **Description**: Change admin address that receives fees
- **Access**: Current admin only
- **Call**:
```javascript
await stampFeeCollector.updateAdmin("0x...");
```

### Events

```solidity
event StampFeePaid(
    address indexed payer,
    uint256 indexed tokenId,
    uint256 amount,
    uint256 timestamp
);
```

### Listen to Events

```javascript
stampFeeCollector.on("StampFeePaid", (payer, tokenId, amount, timestamp) => {
  console.log(`Stamp fee paid: ${ethers.formatEther(amount)} ETH for property ${tokenId}`);
});
```

---

## 7. LastWillRegistry Contract

### Functions

#### `createWill(uint256 tokenId, address beneficiary, address witness1, address witness2, string ipfsHash)`
- **Description**: Create a last will for property
- **Access**: Property owner only
- **Call**:
```javascript
await lastWillRegistry.connect(owner).createWill(
  0, // tokenId
  "0x...", // beneficiary
  "0x...", // witness1
  "0x...", // witness2
  "ipfs://QmWillDocument..."
);
```
- **Event**: `WillCreated(tokenId, owner, beneficiary, witness1, witness2, ipfsHash)`

#### `witnessWill(uint256 tokenId, bool approve)`
- **Description**: Witness approves or rejects will
- **Access**: Designated witnesses only
- **Call**:
```javascript
// Approve
await lastWillRegistry.connect(witness1).witnessWill(0, true);
// Reject
await lastWillRegistry.connect(witness1).witnessWill(0, false);
```
- **Event**: `WillWitnessed(tokenId, witness, approved)`

#### `executeWill(uint256 tokenId)`
- **Description**: Execute will and transfer property to beneficiary
- **Access**: Authorized executors only
- **Requirements**: Both witnesses must have signed
- **Call**:
```javascript
await lastWillRegistry.connect(executor).executeWill(0);
```
- **Event**: `WillExecuted(tokenId, beneficiary, executor, timestamp)`

#### `revokeWill(uint256 tokenId)`
- **Description**: Cancel/revoke active will
- **Access**: Property owner only
- **Call**:
```javascript
await lastWillRegistry.connect(owner).revokeWill(0);
```
- **Event**: `WillRevoked(tokenId, owner, timestamp)`

#### `updateBeneficiary(uint256 tokenId, address newBeneficiary)`
- **Description**: Change will beneficiary (resets witness signatures)
- **Access**: Property owner only
- **Call**:
```javascript
await lastWillRegistry.connect(owner).updateBeneficiary(0, "0x...");
```
- **Event**: `WillTransferred(tokenId, oldBeneficiary, newBeneficiary)`

#### `setExecutorAuthorization(address executor, bool status)`
- **Description**: Authorize/revoke executor permissions
- **Access**: Contract owner only
- **Call**:
```javascript
await lastWillRegistry.setExecutorAuthorization("0x...", true);
```
- **Event**: `ExecutorAuthorized(executor, status)`

#### `getWill(uint256 tokenId)`
- **Description**: Get complete will information
- **Access**: Anyone
- **Call**:
```javascript
const [
  beneficiary,
  witness1,
  witness2,
  createdAt,
  executionDate,
  isActive,
  isExecuted,
  ipfsHash,
  witness1Status,
  witness2Status
] = await lastWillRegistry.getWill(0);
```
- **Returns**: All will details

#### `isWillReadyForExecution(uint256 tokenId)`
- **Description**: Check if will can be executed
- **Access**: Anyone
- **Call**:
```javascript
const isReady = await lastWillRegistry.isWillReadyForExecution(0);
```
- **Returns**: `bool` - true if active, not executed, and fully witnessed

#### `hasActiveWill(uint256 tokenId)`
- **Description**: Check if property has active will
- **Access**: Anyone
- **Call**:
```javascript
const hasWill = await lastWillRegistry.hasActiveWill(0);
```
- **Returns**: `bool`

### Events

```solidity
event WillCreated(uint256 indexed tokenId, address indexed owner, address indexed beneficiary, address witness1, address witness2, string ipfsHash);
event WillWitnessed(uint256 indexed tokenId, address indexed witness, bool approved);
event WillExecuted(uint256 indexed tokenId, address indexed beneficiary, address executor, uint256 timestamp);
event WillRevoked(uint256 indexed tokenId, address indexed owner, uint256 timestamp);
event WillTransferred(uint256 indexed tokenId, address indexed oldBeneficiary, address indexed newBeneficiary);
event ExecutorAuthorized(address indexed executor, bool status);
```

### Listen to Events

```javascript
// Listen for will creation
lastWillRegistry.on("WillCreated", (tokenId, owner, beneficiary, w1, w2, ipfs) => {
  console.log(`Will created for property ${tokenId}, beneficiary: ${beneficiary}`);
});

// Listen for will execution
lastWillRegistry.on("WillExecuted", (tokenId, beneficiary, executor, timestamp) => {
  console.log(`Will executed for property ${tokenId}, transferred to ${beneficiary}`);
});

// Get past will events
const filter = lastWillRegistry.filters.WillCreated(null, null, beneficiaryAddress);
const events = await lastWillRegistry.queryFilter(filter);
```

---

## Complete Workflow Examples

### Example 1: Mint, Sign, and Fractionalize Property

```javascript
// 1. Mint property
await propertyNFT.mintProperty(owner, "ipfs://...", "db://...");
const tokenId = 0;

// 2. Get signatures
await propertyNFT.connect(surveyor).signProperty(tokenId);
await propertyNFT.connect(notary).signProperty(tokenId);
await propertyNFT.connect(ivsl).signProperty(tokenId);

// 3. Approve and fractionalize
await propertyNFT.connect(owner).approve(fractionFactoryAddress, tokenId);
await fractionFactory.connect(owner).createFractionToken(
  tokenId,
  "My Property",
  "MPROP",
  ethers.parseUnits("1000000", 18),
  propertyNFTAddress
);

// 4. Get token address
const tokenAddr = await fractionFactory.getFractionToken(tokenId);
```

### Example 2: Create and Complete NFT Escrow

```javascript
// 1. Create escrow
const tx = await escrowFactory.createNFTEscrow(
  buyer,
  seller,
  ethers.parseEther("10"),
  propertyNFTAddress,
  tokenId
);
const receipt = await tx.wait();
const escrowAddress = receipt.events[0].args.escrow;
const escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);

// 2. Buyer deposits payment
await escrow.connect(buyer).depositPayment({ value: ethers.parseEther("10") });

// 3. Seller approves and deposits NFT
await propertyNFT.connect(seller).approve(escrowAddress, tokenId);
await escrow.connect(seller).depositNFTAsset();

// 4. Buyer finalizes
await escrow.connect(buyer).finalize();
```

### Example 3: Create Will and Execute

```javascript
// 1. Create will
await lastWillRegistry.connect(owner).createWill(
  tokenId,
  beneficiary,
  witness1,
  witness2,
  "ipfs://will-doc"
);

// 2. Witnesses sign
await lastWillRegistry.connect(witness1).witnessWill(tokenId, true);
await lastWillRegistry.connect(witness2).witnessWill(tokenId, true);

// 3. Check if ready
const isReady = await lastWillRegistry.isWillReadyForExecution(tokenId);

// 4. Execute (by authorized executor)
if (isReady) {
  await lastWillRegistry.connect(executor).executeWill(tokenId);
}
```

### Example 4: Sell Fractional Tokens via Escrow

```javascript
// 1. Get fraction token
const tokenAddr = await fractionFactory.getFractionToken(propertyId);
const fractionToken = await ethers.getContractAt("FractionalToken", tokenAddr);

// 2. Create fractional escrow
const escrowAddress = await escrowFactory.createFractionalEscrow(
  buyer,
  seller,
  ethers.parseEther("5"),
  propertyNFTAddress,
  propertyId,
  tokenAddr,
  ethers.parseUnits("100000", 18) // 100k tokens
);
const escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);

// 3. Buyer deposits payment
await escrow.connect(buyer).depositPayment({ value: ethers.parseEther("5") });

// 4. Seller approves and deposits tokens
await fractionToken.connect(seller).approve(escrowAddress, ethers.parseUnits("100000", 18));
await escrow.connect(seller).depositFractionalAsset();

// 5. Finalize
await escrow.connect(buyer).finalize();
```

---

## Event Filtering and Querying

### Filter by Specific Parameters

```javascript
// Get all properties signed by specific notary
const filter = propertyNFT.filters.PropertySigned(null, notaryAddress, null);
const events = await propertyNFT.queryFilter(filter);

// Get all escrows for specific buyer
const escrowFilter = escrowFactory.filters.EscrowCreated(null, buyerAddress, null, null);
const escrows = await escrowFactory.queryFilter(escrowFilter);

// Get all wills for specific beneficiary
const willFilter = lastWillRegistry.filters.WillCreated(null, null, beneficiaryAddress);
const wills = await lastWillRegistry.queryFilter(willFilter);
```

### Listen to Multiple Events

```javascript
// Listen to all property-related events
propertyNFT.on("PropertySigned", (tokenId, signer, role) => {
  console.log(`Signed: ${tokenId} by ${role}`);
});

propertyNFT.on("Transfer", (from, to, tokenId) => {
  console.log(`Transfer: ${tokenId} from ${from} to ${to}`);
});

propertyNFT.on("RentPaid", (tokenId, payer, amount, timestamp) => {
  console.log(`Rent: ${ethers.formatEther(amount)} ETH for ${tokenId}`);
});
```

### Get Event History with Block Range

```javascript
const currentBlock = await ethers.provider.getBlockNumber();
const fromBlock = currentBlock - 10000; // Last ~10k blocks

const events = await propertyNFT.queryFilter(
  propertyNFT.filters.PropertySigned(),
  fromBlock,
  currentBlock
);

events.forEach(event => {
  console.log(`TokenId: ${event.args.tokenId}, Signer: ${event.args.signer}`);
});
```

---

## Deployment

```bash
npx hardhat run scripts/deploy.js --network localhost
# or
npx hardhat run scripts/deploy.js --network sepolia
```

---

## File Structure

```
contracts/
├── PropertyNFT.sol
├── FractionalToken.sol
├── FractionTokenFactory.sol
├── HybridEscrow.sol
├── EscrowFactory.sol
├── StampFeeCollector.sol
├── LastWillRegistry.sol
└── interfaces/
    └── IPropertyNFT.sol

scripts/
└── deploy.js

deployments/
└── [network]-deployment.json
```

---

## Security Notes

1. **Reentrancy Protection**: All critical functions use `nonReentrant` modifier
2. **Access Control**: Role-based permissions for sensitive operations
3. **Signature Requirements**: Properties must be fully signed before transfer
4. **Escrow Safety**: Funds locked until both parties fulfill obligations
5. **Will Security**: Requires two witnesses and authorized executor
6. **Fraction Burns**: Proper ERC20 burn mechanism implemented

---

## Gas Optimization Tips

1. Batch operations when possible (e.g., multiple signatures in one transaction)
2. Use events for off-chain data storage
3. Query view functions - they're free!
4. Consider using multicall for reading multiple values

---

## Support

For issues or questions:
- Check event logs first
- Verify all prerequisites are met
- Ensure proper role assignments
- Confirm sufficient gas and ETH balance
