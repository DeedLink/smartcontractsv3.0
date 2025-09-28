const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 6) {
    throw new Error(`Not enough signers: got ${signers.length}, need at least 6. Check your Anvil config.`);
  }
  const [deployer, surveyor, notary, ivsl, buyer, seller] = signers;

  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // ---------------- PropertyNFT ----------------
  console.log("\nDeploying PropertyNFT...");
  const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
  const propertyNFT = await PropertyNFT.deploy(deployer.address);
  await propertyNFT.waitForDeployment();
  const propertyNFTAddress = await propertyNFT.getAddress();
  console.log("PropertyNFT deployed to:", propertyNFTAddress);

  // Grant roles
  const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
  const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
  const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

  await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
  await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
  await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);
  console.log("Roles granted");

  // Mint property NFT
  const mintTx = await propertyNFT.mintProperty(seller.address, "ipfs://property1", "db://property1");
  await mintTx.wait();
  console.log("Property NFT minted to seller with tokenId 0");

  // Sign NFT
  await (await propertyNFT.connect(surveyor).signProperty(0)).wait();
  await (await propertyNFT.connect(notary).signProperty(0)).wait();
  await (await propertyNFT.connect(ivsl).signProperty(0)).wait();
  console.log("Property NFT fully signed");

  // ---------------- FractionTokenFactory ----------------
  console.log("\nDeploying FractionTokenFactory...");
  const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
  const fractionFactory = await FractionTokenFactory.deploy();
  await fractionFactory.waitForDeployment();
  const factoryAddress = await fractionFactory.getAddress();
  console.log("FractionTokenFactory deployed to:", factoryAddress);

  // Create fractional token (use 5 arguments as required by contract)
  const totalSupply = ethers.parseUnits("1000", 18); // 1000 tokens with 18 decimals
  const fractionTx = await fractionFactory.createFractionToken(
    0, // propertyId
    "PropertyToken", // name
    "PTKN", // symbol
    totalSupply, // totalSupply
    propertyNFTAddress // propertyNFTAddr
  );
  await fractionTx.wait();

  const fractionTokenAddress = await fractionFactory.propertyToFractionToken(0);
  console.log("Fractional token created at:", fractionTokenAddress);

  // ---------------- HybridEscrow ----------------
  console.log("\nDeploying HybridEscrow...");
  const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
  const escrow = await HybridEscrow.deploy(
    buyer.address,
    seller.address,
    ethers.parseEther("1"),
    0, // NFT
    propertyNFTAddress,
    0 // tokenId
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("HybridEscrow deployed to:", escrowAddress);

  console.log("\n--- Deployment Summary ---");
  console.log("PropertyNFT:", propertyNFTAddress);
  console.log("FractionTokenFactory:", factoryAddress);
  console.log("Fractional Token:", fractionTokenAddress);
  console.log("HybridEscrow:", escrowAddress);
  console.log("Deployer:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });