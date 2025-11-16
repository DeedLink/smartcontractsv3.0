const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Marketplace", function () {
  let marketplace, propertyNFT, fractionFactory, fractionalToken;
  let owner, seller, buyer, surveyor, notary, ivsl;

  beforeEach(async function () {
    [owner, seller, buyer, surveyor, notary, ivsl] = await ethers.getSigners();

    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    propertyNFT = await PropertyNFT.deploy(owner.address);
    await propertyNFT.waitForDeployment();

    const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
    const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
    const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

    await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
    await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
    await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();

    const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
    fractionFactory = await FractionTokenFactory.deploy();
    await fractionFactory.waitForDeployment();
  });

  describe("NFT Listings", function () {
    beforeEach(async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://test", "db://test");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);
    });

    it("Should list NFT", async function () {
      const price = ethers.parseEther("10");
      await propertyNFT.connect(seller).approve(await marketplace.getAddress(), 0);

      const tx = await marketplace.connect(seller).listNFT(
        await propertyNFT.getAddress(),
        0,
        price
      );
      await tx.wait();

      expect(tx).to.emit(marketplace, "Listed");

      const listing = await marketplace.getListing(0);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(price);
      expect(listing.listingType).to.equal(0);
      expect(listing.isActive).to.be.true;
    });

    it("Should buy NFT", async function () {
      const price = ethers.parseEther("10");
      await propertyNFT.connect(seller).approve(await marketplace.getAddress(), 0);
      await marketplace.connect(seller).listNFT(
        await propertyNFT.getAddress(),
        0,
        price
      );

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      const tx = await marketplace.connect(buyer).buyNFT(0, { value: price });
      await tx.wait();

      expect(tx).to.emit(marketplace, "Sold");
      expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);

      const listing = await marketplace.getListing(0);
      expect(listing.isActive).to.be.false;

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(price);
    });

    it("Should cancel listing", async function () {
      const price = ethers.parseEther("10");
      await propertyNFT.connect(seller).approve(await marketplace.getAddress(), 0);
      await marketplace.connect(seller).listNFT(
        await propertyNFT.getAddress(),
        0,
        price
      );

      const tx = await marketplace.connect(seller).cancelListing(0);
      await tx.wait();

      expect(tx).to.emit(marketplace, "Cancelled");

      const listing = await marketplace.getListing(0);
      expect(listing.isActive).to.be.false;
    });
  });

  describe("Fractional Token Listings", function () {
    let tokenAddress;
    const totalSupply = ethers.parseUnits("1000000", 18);

    beforeEach(async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://test", "db://test");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const factoryAddress = await fractionFactory.getAddress();
      await propertyNFT.connect(seller).approve(factoryAddress, 0);
      await fractionFactory.connect(seller).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      tokenAddress = await fractionFactory.propertyToFractionToken(0);
      fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);
    });

    it("Should list fractional tokens", async function () {
      const amount = ethers.parseUnits("100000", 18);
      const pricePerToken = ethers.parseEther("0.01");

      await fractionalToken.connect(seller).approve(await marketplace.getAddress(), amount);

      const tx = await marketplace.connect(seller).listFractionalTokens(
        await propertyNFT.getAddress(),
        0,
        tokenAddress,
        amount,
        pricePerToken
      );
      await tx.wait();

      expect(tx).to.emit(marketplace, "Listed");

      const listing = await marketplace.getListing(0);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.amount).to.equal(amount);
      expect(listing.listingType).to.equal(1);
      expect(listing.isActive).to.be.true;
    });

    it("Should buy fractional tokens", async function () {
      const amount = ethers.parseUnits("100000", 18);
      const buyAmount = ethers.parseUnits("50000", 18);
      const pricePerToken = ethers.parseEther("0.01");
      const totalPrice = (pricePerToken * buyAmount) / ethers.parseUnits("1", 18);

      await fractionalToken.connect(seller).approve(await marketplace.getAddress(), amount);
      await marketplace.connect(seller).listFractionalTokens(
        await propertyNFT.getAddress(),
        0,
        tokenAddress,
        amount,
        pricePerToken
      );

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      await marketplace.connect(buyer).buyFractionalTokens(0, buyAmount, { value: totalPrice });

      expect(await fractionalToken.balanceOf(buyer.address)).to.equal(buyAmount);

      const listing = await marketplace.getListing(0);
      expect(listing.amount).to.equal(amount - buyAmount);
      expect(listing.isActive).to.be.true;

      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(totalPrice);
    });

    it("Should mark listing inactive when all tokens sold", async function () {
      const amount = ethers.parseUnits("100000", 18);
      const pricePerToken = ethers.parseEther("0.01");
      const totalPrice = (pricePerToken * amount) / ethers.parseUnits("1", 18);

      await fractionalToken.connect(seller).approve(await marketplace.getAddress(), amount);
      await marketplace.connect(seller).listFractionalTokens(
        await propertyNFT.getAddress(),
        0,
        tokenAddress,
        amount,
        pricePerToken
      );

      await marketplace.connect(buyer).buyFractionalTokens(0, amount, { value: totalPrice });

      const listing = await marketplace.getListing(0);
      expect(listing.amount).to.equal(0);
      expect(listing.isActive).to.be.false;
    });

    it("Should not buy with wrong price", async function () {
      const amount = ethers.parseUnits("100000", 18);
      const buyAmount = ethers.parseUnits("50000", 18);
      const pricePerToken = ethers.parseEther("0.01");

      await fractionalToken.connect(seller).approve(await marketplace.getAddress(), amount);
      await marketplace.connect(seller).listFractionalTokens(
        await propertyNFT.getAddress(),
        0,
        tokenAddress,
        amount,
        pricePerToken
      );

      await expect(
        marketplace.connect(buyer).buyFractionalTokens(0, buyAmount, { value: ethers.parseEther("100") })
      ).to.be.revertedWith("Wrong price");
    });
  });
});