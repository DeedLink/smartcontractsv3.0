const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FractionTokenFactory", function () {
  let propertyNFT, fractionFactory, fractionalToken;
  let owner, surveyor, notary, ivsl, user1, user2;

  beforeEach(async function () {
    [owner, surveyor, notary, ivsl, user1, user2] = await ethers.getSigners();

    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    propertyNFT = await PropertyNFT.deploy(owner.address);
    await propertyNFT.waitForDeployment();

    const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
    const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
    const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

    await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
    await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
    await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);

    const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
    fractionFactory = await FractionTokenFactory.deploy();
    await fractionFactory.waitForDeployment();

    await propertyNFT.mintProperty(user1.address, "ipfs://test", "db://test");
    await propertyNFT.connect(surveyor).signProperty(0);
    await propertyNFT.connect(notary).signProperty(0);
    await propertyNFT.connect(ivsl).signProperty(0);
  });

  describe("Token Creation", function () {
    it("Should create fraction token", async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      
      await expect(
        fractionFactory.connect(user1).createFractionToken(
          0,
          "Property Token",
          "PTKN",
          totalSupply,
          await propertyNFT.getAddress()
        )
      ).to.emit(fractionFactory, "FractionTokenCreated");

      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should transfer NFT to factory", async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      expect(await propertyNFT.ownerOf(0)).to.equal(factoryAddress);
    });

    it("Should mint tokens to creator", async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      const FractionalToken = await ethers.getContractFactory("FractionalToken");
      const token = FractionalToken.attach(tokenAddress);

      expect(await token.balanceOf(user1.address)).to.equal(totalSupply);
    });

    it("Should not create duplicate fraction token", async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      await expect(
        fractionFactory.connect(user1).createFractionToken(
          0,
          "Property Token 2",
          "PTKN2",
          totalSupply,
          await propertyNFT.getAddress()
        )
      ).to.be.revertedWith("Fraction token already exists");
    });

    it("Should not allow non-owner to fractionalize", async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      
      await expect(
        fractionFactory.connect(user2).createFractionToken(
          0,
          "Property Token",
          "PTKN",
          totalSupply,
          await propertyNFT.getAddress()
        )
      ).to.be.revertedWith("Only property owner can fractionalize");
    });

    it("Should not fractionalize unsigned property", async function () {
      await propertyNFT.mintProperty(user1.address, "ipfs://test2", "db://test2");
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 1);

      await expect(
        fractionFactory.connect(user1).createFractionToken(
          1,
          "Property Token",
          "PTKN",
          totalSupply,
          await propertyNFT.getAddress()
        )
      ).to.be.revertedWith("Property not fully signed");
    });
  });

  describe("Defractionalization", function () {
    beforeEach(async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );
    });

    it("Should defractionalize with 100% ownership", async function () {
      await expect(
        fractionFactory.connect(user1).defractionalizeProperty(
          0,
          await propertyNFT.getAddress()
        )
      ).to.emit(fractionFactory, "PropertyDefractionalized");

      expect(await propertyNFT.ownerOf(0)).to.equal(user1.address);
      expect(await fractionFactory.isPropertyFractionalized(0)).to.be.false;
    });

    it("Should not defractionalize without 100% ownership", async function () {
      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      const FractionalToken = await ethers.getContractFactory("FractionalToken");
      const token = FractionalToken.attach(tokenAddress);

      await token.connect(user1).transfer(user2.address, ethers.parseUnits("100", 18));

      await expect(
        fractionFactory.connect(user1).defractionalizeProperty(
          0,
          await propertyNFT.getAddress()
        )
      ).to.be.revertedWith("Must own 100% of fractions");
    });

    it("Should burn tokens on defractionalization", async function () {
      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      const FractionalToken = await ethers.getContractFactory("FractionalToken");
      const token = FractionalToken.attach(tokenAddress);

      const balanceBefore = await token.balanceOf(user1.address);
      
      await fractionFactory.connect(user1).defractionalizeProperty(
        0,
        await propertyNFT.getAddress()
      );

      const balanceAfter = await token.balanceOf(user1.address);
      expect(balanceAfter).to.equal(0);
    });
  });

  describe("Transfer Full Ownership", function () {
    beforeEach(async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );
    });

    it("Should transfer full ownership to another address", async function () {
      await expect(
        fractionFactory.connect(user1).transferFullOwnership(
          0,
          user2.address,
          await propertyNFT.getAddress()
        )
      ).to.emit(fractionFactory, "FullOwnershipTransferred")
        .withArgs(0, user1.address, user2.address);

      expect(await propertyNFT.ownerOf(0)).to.equal(user2.address);
    });

    it("Should not transfer without 100% ownership", async function () {
      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      const FractionalToken = await ethers.getContractFactory("FractionalToken");
      const token = FractionalToken.attach(tokenAddress);

      await token.connect(user1).transfer(user2.address, ethers.parseUnits("100", 18));

      await expect(
        fractionFactory.connect(user1).transferFullOwnership(
          0,
          user2.address,
          await propertyNFT.getAddress()
        )
      ).to.be.revertedWith("Must own 100% of fractions");
    });

    it("Should not transfer to zero address", async function () {
      await expect(
        fractionFactory.connect(user1).transferFullOwnership(
          0,
          ethers.ZeroAddress,
          await propertyNFT.getAddress()
        )
      ).to.be.revertedWith("Invalid recipient");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );
    });

    it("Should get fraction token address", async function () {
      const tokenAddress = await fractionFactory.getFractionToken(0);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should check full ownership", async function () {
      expect(await fractionFactory.hasFullOwnership(0, user1.address)).to.be.true;
      expect(await fractionFactory.hasFullOwnership(0, user2.address)).to.be.false;
    });

    it("Should get fraction balance", async function () {
      const balance = await fractionFactory.getFractionBalance(0, user1.address);
      expect(balance).to.equal(ethers.parseUnits("1000000", 18));
    });

    it("Should return zero for non-existent property", async function () {
      const balance = await fractionFactory.getFractionBalance(99, user1.address);
      expect(balance).to.equal(0);
    });
  });

  describe("FractionalToken Burn", function () {
    it("Should burn tokens correctly", async function () {
      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      
      await propertyNFT.connect(user1).approve(factoryAddress, 0);
      await fractionFactory.connect(user1).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      const FractionalToken = await ethers.getContractFactory("FractionalToken");
      const token = FractionalToken.attach(tokenAddress);

      const burnAmount = ethers.parseUnits("100", 18);
      await token.connect(user1).burn(burnAmount);

      const balance = await token.balanceOf(user1.address);
      expect(balance).to.equal(totalSupply - burnAmount);
    });
  });
});