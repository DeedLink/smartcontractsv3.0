const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 6) {
    throw new Error(`Not enough signers: got ${signers.length}, need at least 6. Check your Hardhat config.`);
  }
  const [deployer, surveyor, notary, ivsl, buyer, seller] = signers;

  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  console.log("\n=== Deploying PropertyNFT ===");
  const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
  const propertyNFT = await PropertyNFT.deploy(deployer.address);
  await propertyNFT.waitForDeployment();
  const propertyNFTAddress = await propertyNFT.getAddress();
  console.log("PropertyNFT deployed to:", propertyNFTAddress);

  const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
  const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
  const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

  await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
  await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
  await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);
  console.log("Roles granted to surveyor, notary, and ivsl");

  const mintTx = await propertyNFT.mintProperty(seller.address, "ipfs://property1", "db://property1");
  await mintTx.wait();
  console.log("Property NFT minted to seller with tokenId 0");

  await (await propertyNFT.connect(surveyor).signProperty(0)).wait();
  await (await propertyNFT.connect(notary).signProperty(0)).wait();
  await (await propertyNFT.connect(ivsl).signProperty(0)).wait();
  console.log("Property NFT fully signed by all parties");

  console.log("\n=== Deploying FractionTokenFactory ===");
  const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
  const fractionFactory = await FractionTokenFactory.deploy();
  await fractionFactory.waitForDeployment();
  const factoryAddress = await fractionFactory.getAddress();
  console.log("FractionTokenFactory deployed to:", factoryAddress);

  const totalSupply = ethers.parseUnits("1000000", 18);
  
  await propertyNFT.connect(seller).approve(factoryAddress, 0);
  console.log("PropertyNFT approved for fractionalization");

  const fractionTx = await fractionFactory.connect(seller).createFractionToken(
    0,
    "Property Token",
    "PTKN",
    totalSupply,
    propertyNFTAddress
  );
  await fractionTx.wait();

  const fractionTokenAddress = await fractionFactory.propertyToFractionToken(0);
  console.log("Fractional token created at:", fractionTokenAddress);
  console.log("Seller owns", ethers.formatUnits(totalSupply, 18), "PTKN tokens");

  console.log("\n=== Deploying EscrowFactory ===");
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy();
  await escrowFactory.waitForDeployment();
  const escrowFactoryAddress = await escrowFactory.getAddress();
  console.log("EscrowFactory deployed to:", escrowFactoryAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("PropertyNFT:", propertyNFTAddress);
  console.log("FractionTokenFactory:", factoryAddress);
  console.log("Fractional Token:", fractionTokenAddress);
  console.log("EscrowFactory:", escrowFactoryAddress);
  console.log("Deployer:", deployer.address);
  console.log("Surveyor:", surveyor.address);
  console.log("Notary:", notary.address);
  console.log("IVSL:", ivsl.address);
  console.log("Buyer:", buyer.address);
  console.log("Seller:", seller.address);

  console.log("\n=== Saving deployment addresses ===");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network: network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PropertyNFT: propertyNFTAddress,
      FractionTokenFactory: factoryAddress,
      FractionalToken: fractionTokenAddress,
      EscrowFactory: escrowFactoryAddress
    },
    accounts: {
      deployer: deployer.address,
      surveyor: surveyor.address,
      notary: notary.address,
      ivsl: ivsl.address,
      buyer: buyer.address,
      seller: seller.address
    }
  };

  const filePath = path.join(deploymentsDir, `${network.name}-deployment.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to ./deployments/${network.name}-deployment.json`);

  console.log("\n=== Deployment Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });