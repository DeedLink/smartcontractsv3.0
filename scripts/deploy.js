const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  console.log("\n=== Deploying PropertyNFT ===");
  const PropertyNFT = await hre.ethers.getContractFactory("PropertyNFT");
  const propertyNFT = await PropertyNFT.deploy(deployer.address);
  await propertyNFT.waitForDeployment();
  const propertyNFTAddress = await propertyNFT.getAddress();
  console.log("PropertyNFT deployed to:", propertyNFTAddress);

  console.log("\n=== Deploying FractionTokenFactory ===");
  const FractionTokenFactory = await hre.ethers.getContractFactory("FractionTokenFactory");
  const fractionFactory = await FractionTokenFactory.deploy();
  await fractionFactory.waitForDeployment();
  const fractionFactoryAddress = await fractionFactory.getAddress();
  console.log("FractionTokenFactory deployed to:", fractionFactoryAddress);

  console.log("\n=== Deploying EscrowFactory ===");
  const EscrowFactory = await hre.ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy();
  await escrowFactory.waitForDeployment();
  const escrowFactoryAddress = await escrowFactory.getAddress();
  console.log("EscrowFactory deployed to:", escrowFactoryAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("PropertyNFT:", propertyNFTAddress);
  console.log("FractionTokenFactory:", fractionFactoryAddress);
  console.log("EscrowFactory:", escrowFactoryAddress);

  console.log("\n=== Saving deployment addresses ===");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PropertyNFT: propertyNFTAddress,
      FractionTokenFactory: fractionFactoryAddress,
      EscrowFactory: escrowFactoryAddress
    }
  };

  const filePath = path.join(deploymentsDir, `${hre.network.name}-deployment.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to ./deployments/${hre.network.name}-deployment.json`);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n=== Waiting for block confirmations ===");
    await propertyNFT.deploymentTransaction().wait(6);
    await fractionFactory.deploymentTransaction().wait(6);
    await escrowFactory.deploymentTransaction().wait(6);

    console.log("\n=== Verifying contracts on Etherscan ===");
    
    try {
      await hre.run("verify:verify", {
        address: propertyNFTAddress,
        constructorArguments: [deployer.address],
      });
      console.log("PropertyNFT verified");
    } catch (error) {
      console.log("PropertyNFT verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: fractionFactoryAddress,
        constructorArguments: [],
      });
      console.log("FractionTokenFactory verified");
    } catch (error) {
      console.log("FractionTokenFactory verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: escrowFactoryAddress,
        constructorArguments: [],
      });
      console.log("EscrowFactory verified");
    } catch (error) {
      console.log("EscrowFactory verification failed:", error.message);
    }
  }

  console.log("\n=== Deployment Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });