const fs = require("fs");
const crypto = require("crypto");
const { ethers } = require("hardhat");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error("❌ ENCRYPTION_KEY missing");
  process.exit(1);
}

async function main() {
  const deployedContracts = {};

  // Deploy EscrowFactory
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy();
  await escrowFactory.deployed();
  deployedContracts["EscrowFactory"] = escrowFactory.address;

  // Deploy FractionalToken
  const FractionalToken = await ethers.getContractFactory("FractionalToken");
  const fractionalToken = await FractionalToken.deploy();
  await fractionalToken.deployed();
  deployedContracts["FractionalToken"] = fractionalToken.address;

  // Deploy FractionTokenFactory
  const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
  const fractionTokenFactory = await FractionTokenFactory.deploy();
  await fractionTokenFactory.deployed();
  deployedContracts["FractionTokenFactory"] = fractionTokenFactory.address;

  // Deploy HybridEscrow
  const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
  const hybridEscrow = await HybridEscrow.deploy();
  await hybridEscrow.deployed();
  deployedContracts["HybridEscrow"] = hybridEscrow.address;

  // Deploy PropertyNFT
  const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
  const propertyNFT = await PropertyNFT.deploy();
  await propertyNFT.deployed();
  deployedContracts["PropertyNFT"] = propertyNFT.address;

  // Ensure runtime directory exists
  const dir = "./runtime";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const filePath = `${dir}/dev.json`;

  // Encrypt contract addresses
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );

  let encrypted = cipher.update(JSON.stringify(deployedContracts), "utf8", "hex");
  encrypted += cipher.final("hex");

  const encryptedData = {
    iv: iv.toString("hex"),
    data: encrypted,
  };

  fs.writeFileSync(filePath, JSON.stringify(encryptedData, null, 2));

  console.log("Contracts deployed and encrypted at runtime/dev.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
