const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PropertyNFT", function () {
  let propertyNFT;
  let owner, surveyor, notary, ivsl, user1, user2, agent;

  beforeEach(async function () {
    [owner, surveyor, notary, ivsl, user1, user2, agent] = await ethers.getSigners();

    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    propertyNFT = await PropertyNFT.deploy(owner.address);
    await propertyNFT.waitForDeployment();

    const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
    const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
    const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

    await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
    await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
    await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);
  });

  describe("Minting", function () {
    it("Should mint a new property", async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
      expect(await propertyNFT.ownerOf(0)).to.equal(user1.address);
    });

    it("Should increment tokenId", async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test1", "db://test1");
      await propertyNFT.mintProperty(user2.address, "ipfs://test2", "db://test2");
      expect(await propertyNFT.nextTokenId()).to.equal(2);
    });

    it("Should store metadata correctly", async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
      const [ipfsHash, dbHash] = await propertyNFT.getMetadata(0);
      expect(ipfsHash).to.equal("ipfs://test");
      expect(dbHash).to.equal("db://test");
    });
  });

  describe("Signing", function () {
    beforeEach(async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
    });

    it("Should allow surveyor to sign", async function () {
      await expect(propertyNFT.connect(surveyor).signProperty(0))
        .to.emit(propertyNFT, "PropertySigned")
        .withArgs(0, surveyor.address, "SURVEYOR");
      
      expect(await propertyNFT.isSignedBySurveyor(0)).to.be.true;
    });

    it("Should allow notary to sign", async function () {
      await expect(propertyNFT.connect(notary).signProperty(0))
        .to.emit(propertyNFT, "PropertySigned")
        .withArgs(0, notary.address, "NOTARY");
      
      expect(await propertyNFT.isSignedByNotary(0)).to.be.true;
    });

    it("Should allow IVSL to sign", async function () {
      await expect(propertyNFT.connect(ivsl).signProperty(0))
        .to.emit(propertyNFT, "PropertySigned")
        .withArgs(0, ivsl.address, "IVSL");
      
      expect(await propertyNFT.isSignedByIVSL(0)).to.be.true;
    });

    it("Should not allow double signing by same role", async function () {
      await propertyNFT.connect(surveyor).signProperty(0);
      await expect(
        propertyNFT.connect(surveyor).signProperty(0)
      ).to.be.revertedWith("Already signed");
    });

    it("Should not allow unauthorized users to sign", async function () {
      await expect(
        propertyNFT.connect(user1).signProperty(0)
      ).to.be.revertedWith("Not authorized to sign");
    });

    it("Should check if fully signed", async function () {
      expect(await propertyNFT.isFullySigned(0)).to.be.false;
      
      await propertyNFT.connect(surveyor).signProperty(0);
      expect(await propertyNFT.isFullySigned(0)).to.be.false;
      
      await propertyNFT.connect(notary).signProperty(0);
      expect(await propertyNFT.isFullySigned(0)).to.be.false;
      
      await propertyNFT.connect(ivsl).signProperty(0);
      expect(await propertyNFT.isFullySigned(0)).to.be.true;
    });

    it("Should get all signatures", async function () {
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const [surveyorAddr, notaryAddr, ivslAddr] = await propertyNFT.getSignatures(0);
      expect(surveyorAddr).to.equal(surveyor.address);
      expect(notaryAddr).to.equal(notary.address);
      expect(ivslAddr).to.equal(ivsl.address);
    });
  });

  describe("Transfer Restrictions", function () {
    beforeEach(async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
    });

    it("Should not allow transfer without full signatures", async function () {
      await expect(
        propertyNFT.connect(user1).transferFrom(user1.address, user2.address, 0)
      ).to.be.revertedWith("Property must be fully signed before transfer");
    });

    it("Should allow transfer with full signatures", async function () {
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      await propertyNFT.connect(user1).transferFrom(user1.address, user2.address, 0);
      expect(await propertyNFT.ownerOf(0)).to.equal(user2.address);
    });
  });

  describe("Power of Attorney (PoA)", function () {
    beforeEach(async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
    });

    it("Should set PoA for agent", async function () {
      const now = Math.floor(Date.now() / 1000);
      const oneYear = now + 365 * 24 * 60 * 60;

      await expect(
        propertyNFT.connect(user1).setPoA(0, agent.address, 3, true, now, oneYear)
      ).to.emit(propertyNFT, "PoASet")
        .withArgs(0, agent.address, 3, true, now, oneYear);
    });

    it("Should not allow non-owner to set PoA", async function () {
      const now = Math.floor(Date.now() / 1000);
      const oneYear = now + 365 * 24 * 60 * 60;

      await expect(
        propertyNFT.connect(user2).setPoA(0, agent.address, 3, true, now, oneYear)
      ).to.be.revertedWith("Only owner can assign PoA");
    });

    it("Should reject invalid PoA period", async function () {
      const now = Math.floor(Date.now() / 1000);

      await expect(
        propertyNFT.connect(user1).setPoA(0, agent.address, 3, true, now, now - 1)
      ).to.be.revertedWith("Invalid period");
    });
  });

  describe("Rent Management", function () {
    beforeEach(async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
    });

    it("Should set rent parameters", async function () {
      const rentAmount = ethers.parseEther("1");
      const period = 30 * 24 * 60 * 60;

      await propertyNFT.connect(user1).setRent(0, rentAmount, period, user2.address);
      
      const rentInfo = await propertyNFT.rentInfo(0);
      expect(rentInfo.amount).to.equal(rentAmount);
      expect(rentInfo.period).to.equal(period);
      expect(rentInfo.receiver).to.equal(user2.address);
    });

    it("Should not allow non-owner to set rent", async function () {
      const rentAmount = ethers.parseEther("1");
      const period = 30 * 24 * 60 * 60;

      await expect(
        propertyNFT.connect(user2).setRent(0, rentAmount, period, user2.address)
      ).to.be.revertedWith("Only owner can set rent");
    });

    it("Should allow owner to pay rent", async function () {
      const rentAmount = ethers.parseEther("1");
      const period = 30 * 24 * 60 * 60;

      await propertyNFT.connect(user1).setRent(0, rentAmount, period, user2.address);

      const balanceBefore = await ethers.provider.getBalance(user2.address);
      
      await expect(
        propertyNFT.connect(user1).payRent(0, { value: rentAmount })
      ).to.emit(propertyNFT, "RentPaid");

      const balanceAfter = await ethers.provider.getBalance(user2.address);
      expect(balanceAfter - balanceBefore).to.equal(rentAmount);
    });

    it("Should not allow rent payment with incorrect amount", async function () {
      const rentAmount = ethers.parseEther("1");
      const period = 30 * 24 * 60 * 60;

      await propertyNFT.connect(user1).setRent(0, rentAmount, period, user2.address);

      await expect(
        propertyNFT.connect(user1).payRent(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect amount");
    });

    it("Should check rent active status", async function () {
      const rentAmount = ethers.parseEther("1");
      const period = 30 * 24 * 60 * 60;

      await propertyNFT.connect(user1).setRent(0, rentAmount, period, user2.address);
      await propertyNFT.connect(user1).payRent(0, { value: rentAmount });

      expect(await propertyNFT.isRentActive(0)).to.be.true;
    });
  });

  describe("Role Management", function () {
    it("Should get roles correctly", async function () {
      const [isSurveyor, isNotary, isIVSL] = await propertyNFT.getRolesOf(surveyor.address);
      expect(isSurveyor).to.be.true;
      expect(isNotary).to.be.false;
      expect(isIVSL).to.be.false;
    });

    it("Should return false for address with no roles", async function () {
      const [isSurveyor, isNotary, isIVSL] = await propertyNFT.getRolesOf(user1.address);
      expect(isSurveyor).to.be.false;
      expect(isNotary).to.be.false;
      expect(isIVSL).to.be.false;
    });
  });
});