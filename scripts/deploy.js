const { ethers } = require("hardhat");

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get account balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy PropertyNFT
  console.log("\nDeploying PropertyNFT...");
  const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
  const propertyNFT = await PropertyNFT.deploy(deployer.address);
  await propertyNFT.waitForDeployment();
  
  const propertyNFTAddress = await propertyNFT.getAddress();
  console.log("PropertyNFT deployed to:", propertyNFTAddress);

  // Deploy FractionTokenFactory
  console.log("\nDeploying FractionTokenFactory...");
  const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
  const fractionTokenFactory = await FractionTokenFactory.deploy();
  await fractionTokenFactory.waitForDeployment();
  
  const factoryAddress = await fractionTokenFactory.getAddress();
  console.log("FractionTokenFactory deployed to:", factoryAddress);

  // Verify deployment by checking contract properties
  console.log("\n--- Verification ---");
  console.log("PropertyNFT name:", await propertyNFT.name());
  console.log("PropertyNFT symbol:", await propertyNFT.symbol());
  console.log("PropertyNFT owner:", await propertyNFT.owner());

  console.log("\n--- Deployment Summary ---");
  console.log("PropertyNFT:", propertyNFTAddress);
  console.log("FractionTokenFactory:", factoryAddress);
  console.log("Deployer:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });