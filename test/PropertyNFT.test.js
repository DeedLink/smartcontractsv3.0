const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PropertyNFT + Fractional + Escrow Flow", function () {
  let deployer, surveyor, notary, ivsl, buyer, seller;
  let propertyNFT, fractionFactory, escrow;

  beforeEach(async function () {
    [deployer, surveyor, notary, ivsl, buyer, seller] = await ethers.getSigners();

    // Deploy PropertyNFT
    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    propertyNFT = await PropertyNFT.deploy(deployer.address);
    await propertyNFT.deployed();

    // Grant roles
    await propertyNFT.grantRole(await propertyNFT.SURVEYOR_ROLE(), surveyor.address);
    await propertyNFT.grantRole(await propertyNFT.NOTARY_ROLE(), notary.address);
    await propertyNFT.grantRole(await propertyNFT.IVSL_ROLE(), ivsl.address);

    // Mint property NFT
    await propertyNFT.mintProperty(seller.address, "ipfs://property1", "db://property1");

    // Deploy FractionTokenFactory
    const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
    fractionFactory = await FractionTokenFactory.deploy();
    await fractionFactory.deployed();

    // Deploy HybridEscrow
    const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
    escrow = await HybridEscrow.deploy(
      buyer.address,
      seller.address,
      ethers.utils.parseEther("1"),
      0, // NFT
      propertyNFT.address,
      0
    );
    await escrow.deployed();
  });

  it("should allow surveyor, notary, ivsl to sign", async function () {
    await propertyNFT.connect(surveyor).signProperty(0);
    await propertyNFT.connect(notary).signProperty(0);
    await propertyNFT.connect(ivsl).signProperty(0);

    const fullySigned = await propertyNFT.isFullySigned(0);
    expect(fullySigned).to.equal(true);
  });

  it("should deploy fractional token only after fully signed", async function () {
    // Sign first
    await propertyNFT.connect(surveyor).signProperty(0);
    await propertyNFT.connect(notary).signProperty(0);
    await propertyNFT.connect(ivsl).signProperty(0);

    const tx = await fractionFactory.createFractionToken(
      0,
      "PropertyToken",
      "PTKN",
      ethers.utils.parseUnits("1000", 18),
      propertyNFT.address
    );

    expect(tx).to.be.ok;
  });

  it("should handle escrow flow", async function () {
    // Seller approves escrow
    await propertyNFT.connect(seller).approve(escrow.address, 0);

    // Buyer deposits ETH
    await escrow.connect(buyer).depositPayment({ value: ethers.utils.parseEther("1") });

    // Seller deposits NFT
    await escrow.connect(seller).depositAsset();

    // Finalize escrow
    await escrow.connect(buyer).finalize();

    expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
  });
});
