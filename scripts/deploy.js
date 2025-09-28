const hre = require("hardhat");

async function main() {
  const [deployer, surveyor, notary, ivsl, buyer, seller] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // Deploy PropertyNFT
  const PropertyNFT = await hre.ethers.getContractFactory("PropertyNFT");
  const propertyNFT = await PropertyNFT.deploy(deployer.address);
  await propertyNFT.deployed();
  console.log("PropertyNFT deployed at:", propertyNFT.address);

  // Grant roles to surveyor, notary, ivsl
  const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
  const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
  const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

  await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
  await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
  await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);
  console.log("Roles granted");

  // Mint a property NFT to seller
  await propertyNFT.mintProperty(seller.address, "ipfs://property1", "db://property1");
  console.log("Property NFT minted to seller");

  // Deploy FractionTokenFactory
  const FractionTokenFactory = await hre.ethers.getContractFactory("FractionTokenFactory");
  const fractionFactory = await FractionTokenFactory.deploy();
  await fractionFactory.deployed();
  console.log("FractionTokenFactory deployed at:", fractionFactory.address);

  // Deploy HybridEscrow (example for NFT)
  const HybridEscrow = await hre.ethers.getContractFactory("HybridEscrow");
  const escrow = await HybridEscrow.deploy(
    buyer.address,
    seller.address,
    hre.ethers.utils.parseEther("1"), // 1 ETH price
    0, // EscrowType.NFT
    propertyNFT.address,
    0 // tokenId
  );
  await escrow.deployed();
  console.log("HybridEscrow deployed at:", escrow.address);

  console.log("Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
