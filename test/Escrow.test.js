const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Escrow System", function () {
  let propertyNFT, fractionFactory, escrowFactory;
  let owner, surveyor, notary, ivsl, buyer, seller;

  beforeEach(async function () {
    [owner, surveyor, notary, ivsl, buyer, seller] = await ethers.getSigners();

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

    const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
    escrowFactory = await EscrowFactory.deploy();
    await escrowFactory.waitForDeployment();

    await propertyNFT.mintProperty(seller.address, "ipfs://test", "db://test");
    await propertyNFT.connect(surveyor).signProperty(0);
    await propertyNFT.connect(notary).signProperty(0);
    await propertyNFT.connect(ivsl).signProperty(0);
  });

  describe("NFT Escrow", function () {
    let escrowAddress, escrow;
    const price = ethers.parseEther("10");

    beforeEach(async function () {
      const tx = await escrowFactory.createNFTEscrow(
        buyer.address,
        seller.address,
        price,
        await propertyNFT.getAddress(),
        0
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          return escrowFactory.interface.parseLog(log).name === "EscrowCreated";
        } catch {
          return false;
        }
      });
      
      escrowAddress = escrowFactory.interface.parseLog(event).args.escrow;
      escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);
    });

    it("Should create NFT escrow", async function () {
      expect(await escrow.buyer()).to.equal(buyer.address);
      expect(await escrow.seller()).to.equal(seller.address);
      expect(await escrow.price()).to.equal(price);
      expect(await escrow.escrowType()).to.equal(0);
    });

    it("Should allow buyer to deposit payment", async function () {
      const tx = await escrow.connect(buyer).depositPayment({ value: price });
      await tx.wait();
      
      expect(tx).to.emit(escrow, "PaymentDeposited").withArgs(buyer.address, price);

      const [isBuyerDeposited] = await escrow.getStatus();
      expect(isBuyerDeposited).to.be.true;
    });

    it("Should not allow incorrect payment amount", async function () {
      await expect(
        escrow.connect(buyer).depositPayment({ value: ethers.parseEther("5") })
      ).to.be.revertedWith("Incorrect payment");
    });

    it("Should not allow non-buyer to deposit payment", async function () {
      await expect(
        escrow.connect(seller).depositPayment({ value: price })
      ).to.be.revertedWith("Only buyer");
    });

    it("Should allow seller to deposit NFT", async function () {
      await propertyNFT.connect(seller).approve(escrowAddress, 0);
      
      const tx = await escrow.connect(seller).depositNFTAsset();
      await tx.wait();
      
      expect(tx).to.emit(escrow, "AssetDeposited").withArgs(seller.address, 0);

      const [, isSellerDeposited] = await escrow.getStatus();
      expect(isSellerDeposited).to.be.true;
      expect(await propertyNFT.ownerOf(0)).to.equal(escrowAddress);
    });

    it("Should finalize escrow", async function () {
      await escrow.connect(buyer).depositPayment({ value: price });
      await propertyNFT.connect(seller).approve(escrowAddress, 0);
      await escrow.connect(seller).depositNFTAsset();

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      await expect(
        escrow.connect(buyer).finalize()
      ).to.emit(escrow, "EscrowFinalized")
        .withArgs(buyer.address, seller.address);

      expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
      
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(price);
    });

    it("Should not finalize without buyer deposit", async function () {
      await propertyNFT.connect(seller).approve(escrowAddress, 0);
      await escrow.connect(seller).depositNFTAsset();

      await expect(
        escrow.connect(buyer).finalize()
      ).to.be.revertedWith("Escrow not complete");
    });

    it("Should not finalize without seller deposit", async function () {
      await escrow.connect(buyer).depositPayment({ value: price });

      await expect(
        escrow.connect(buyer).finalize()
      ).to.be.revertedWith("Escrow not complete");
    });

    it("Should cancel escrow and refund", async function () {
      await escrow.connect(buyer).depositPayment({ value: price });
      await propertyNFT.connect(seller).approve(escrowAddress, 0);
      await escrow.connect(seller).depositNFTAsset();

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      await expect(
        escrow.connect(buyer).cancel()
      ).to.emit(escrow, "EscrowCancelled");

      expect(await propertyNFT.ownerOf(0)).to.equal(seller.address);
    });

    it("Should cancel with only buyer deposit", async function () {
      await escrow.connect(buyer).depositPayment({ value: price });

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      await escrow.connect(buyer).cancel();
    });

    it("Should not allow non-party to cancel", async function () {
      await expect(
        escrow.connect(owner).cancel()
      ).to.be.revertedWith("Only parties can cancel");
    });
  });

  describe("Fractional Escrow", function () {
    let escrowAddress, escrow, fractionalToken;
    const price = ethers.parseEther("5");
    const totalSupply = ethers.parseUnits("1000000", 18);
    const fractionAmount = ethers.parseUnits("100000", 18);

    beforeEach(async function () {
      const factoryAddress = await fractionFactory.getAddress();
      await propertyNFT.connect(seller).approve(factoryAddress, 0);
      await fractionFactory.connect(seller).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      const tokenAddress = await fractionFactory.propertyToFractionToken(0);
      fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);

      const tx = await escrowFactory.createFractionalEscrow(
        buyer.address,
        seller.address,
        price,
        await propertyNFT.getAddress(),
        0,
        tokenAddress,
        fractionAmount
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          return escrowFactory.interface.parseLog(log).name === "EscrowCreated";
        } catch {
          return false;
        }
      });
      
      escrowAddress = escrowFactory.interface.parseLog(event).args.escrow;
      escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);
    });

    it("Should create fractional escrow", async function () {
      expect(await escrow.buyer()).to.equal(buyer.address);
      expect(await escrow.seller()).to.equal(seller.address);
      expect(await escrow.price()).to.equal(price);
      expect(await escrow.escrowType()).to.equal(1);
      expect(await escrow.fractionAmount()).to.equal(fractionAmount);
    });

    it("Should allow seller to deposit fractional tokens", async function () {
      await fractionalToken.connect(seller).approve(escrowAddress, fractionAmount);
      
      const tx = await escrow.connect(seller).depositFractionalAsset();
      await tx.wait();
      
      expect(tx).to.emit(escrow, "AssetDeposited").withArgs(seller.address, 1);

      const [, isSellerDeposited] = await escrow.getStatus();
      expect(isSellerDeposited).to.be.true;
    });

    it("Should finalize fractional escrow", async function () {
      await escrow.connect(buyer).depositPayment({ value: price });
      await fractionalToken.connect(seller).approve(escrowAddress, fractionAmount);
      await escrow.connect(seller).depositFractionalAsset();

      const tx = await escrow.connect(buyer).finalize();
      await tx.wait();
      
      expect(tx).to.emit(escrow, "EscrowFinalized");

      expect(await fractionalToken.balanceOf(buyer.address)).to.equal(fractionAmount);
    });

    it("Should cancel fractional escrow and return tokens", async function () {
      await escrow.connect(buyer).depositPayment({ value: price });
      await fractionalToken.connect(seller).approve(escrowAddress, fractionAmount);
      await escrow.connect(seller).depositFractionalAsset();

      const tx = await escrow.connect(seller).cancel();
      await tx.wait();
      
      expect(tx).to.emit(escrow, "EscrowCancelled");

      expect(await fractionalToken.balanceOf(seller.address)).to.equal(totalSupply);
    });
  });

  describe("EscrowFactory", function () {
    it("Should track user escrows", async function () {
      const price = ethers.parseEther("10");
      
      await escrowFactory.createNFTEscrow(
        buyer.address,
        seller.address,
        price,
        await propertyNFT.getAddress(),
        0
      );

      const buyerEscrows = await escrowFactory.getUserEscrows(buyer.address);
      const sellerEscrows = await escrowFactory.getUserEscrows(seller.address);

      expect(buyerEscrows.length).to.equal(1);
      expect(sellerEscrows.length).to.equal(1);
      expect(buyerEscrows[0]).to.equal(sellerEscrows[0]);
    });

    it("Should track total escrows", async function () {
      const price = ethers.parseEther("10");
      
      expect(await escrowFactory.getTotalEscrows()).to.equal(0);

      await escrowFactory.createNFTEscrow(
        buyer.address,
        seller.address,
        price,
        await propertyNFT.getAddress(),
        0
      );

      expect(await escrowFactory.getTotalEscrows()).to.equal(1);
    });

    it("Should emit EscrowCreated event", async function () {
      const price = ethers.parseEther("10");
      
      const tx = await escrowFactory.createNFTEscrow(
        buyer.address,
        seller.address,
        price,
        await propertyNFT.getAddress(),
        0
      );
      await tx.wait();
      
      expect(tx).to.emit(escrowFactory, "EscrowCreated");
    });
  });
});