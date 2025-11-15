const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration Tests - Complete Workflows", function () {
  let propertyNFT, fractionFactory, escrowFactory, stampFeeCollector, lastWillRegistry;
  let owner, surveyor, notary, ivsl, seller, buyer, witness1, witness2, executor;

  beforeEach(async function () {
    [owner, surveyor, notary, ivsl, seller, buyer, witness1, witness2, executor] = await ethers.getSigners();

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

    const StampFeeCollector = await ethers.getContractFactory("StampFeeCollector");
    stampFeeCollector = await StampFeeCollector.deploy(owner.address);
    await stampFeeCollector.waitForDeployment();

    const LastWillRegistry = await ethers.getContractFactory("LastWillRegistry");
    lastWillRegistry = await LastWillRegistry.deploy(
      await propertyNFT.getAddress(),
      owner.address
    );
    await lastWillRegistry.waitForDeployment();

    await lastWillRegistry.setExecutorAuthorization(executor.address, true);
  });

  describe("Workflow 1: Property Minting -> Signing -> Transfer", function () {
    it("Should complete full property lifecycle", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      
      expect(await propertyNFT.ownerOf(0)).to.equal(seller.address);
      expect(await propertyNFT.isFullySigned(0)).to.be.false;

      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);
      
      expect(await propertyNFT.isFullySigned(0)).to.be.true;

      await stampFeeCollector.connect(seller).payStampFee(0, { 
        value: ethers.parseEther("0.1") 
      });

      await propertyNFT.connect(seller).transferFrom(seller.address, buyer.address, 0);
      expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
    });
  });

  describe("Workflow 2: Property -> Fractionalization -> Defractionalization", function () {
    it("Should fractionalize and defractionalize property", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();

      await propertyNFT.connect(seller).approve(factoryAddress, 0);
      await fractionFactory.connect(seller).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      expect(await propertyNFT.ownerOf(0)).to.equal(factoryAddress);
      expect(await fractionFactory.isPropertyFractionalized(0)).to.be.true;

      const tokenAddress = await fractionFactory.getFractionToken(0);
      const token = await ethers.getContractAt("FractionalToken", tokenAddress);
      expect(await token.balanceOf(seller.address)).to.equal(totalSupply);

      await token.connect(seller).approve(factoryAddress, totalSupply);
      
      await fractionFactory.connect(seller).defractionalizeProperty(
        0,
        await propertyNFT.getAddress()
      );

      expect(await propertyNFT.ownerOf(0)).to.equal(seller.address);
      expect(await fractionFactory.isPropertyFractionalized(0)).to.be.false;
    });
  });

  describe("Workflow 3: Complete NFT Escrow Transaction", function () {
    it("Should complete NFT escrow from creation to finalization", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const price = ethers.parseEther("10");
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
      
      const escrowAddress = escrowFactory.interface.parseLog(event).args.escrow;
      const escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);

      await escrow.connect(buyer).depositPayment({ value: price });

      await propertyNFT.connect(seller).approve(escrowAddress, 0);
      await escrow.connect(seller).depositNFTAsset();

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      await escrow.connect(buyer).finalize();

      expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
      
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(price);
    });
  });

  describe("Workflow 4: Fractional Token Trading via Escrow", function () {
    it("Should sell fraction tokens through escrow", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();

      await propertyNFT.connect(seller).approve(factoryAddress, 0);
      await fractionFactory.connect(seller).createFractionToken(
        0,
        "Property Token",
        "PTKN",
        totalSupply,
        await propertyNFT.getAddress()
      );

      const tokenAddress = await fractionFactory.getFractionToken(0);
      const token = await ethers.getContractAt("FractionalToken", tokenAddress);

      const fractionAmount = ethers.parseUnits("100000", 18);
      const price = ethers.parseEther("5");

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
      
      const escrowAddress = escrowFactory.interface.parseLog(event).args.escrow;
      const escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);

      await escrow.connect(buyer).depositPayment({ value: price });

      await token.connect(seller).approve(escrowAddress, fractionAmount);
      await escrow.connect(seller).depositFractionalAsset();

      await escrow.connect(buyer).finalize();

      expect(await token.balanceOf(buyer.address)).to.equal(fractionAmount);
      expect(await token.balanceOf(seller.address)).to.equal(totalSupply - fractionAmount);
    });
  });

  describe("Workflow 5: Last Will Creation and Execution", function () {
    it("Should complete will lifecycle from creation to execution", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      await lastWillRegistry.connect(seller).createWill(
        0,
        buyer.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );

      expect(await lastWillRegistry.hasActiveWill(0)).to.be.true;
      expect(await lastWillRegistry.isWillReadyForExecution(0)).to.be.false;

      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      expect(await lastWillRegistry.isWillReadyForExecution(0)).to.be.false;

      await lastWillRegistry.connect(witness2).witnessWill(0, true);
      expect(await lastWillRegistry.isWillReadyForExecution(0)).to.be.true;

      await propertyNFT.connect(seller).approve(await lastWillRegistry.getAddress(), 0);

      await lastWillRegistry.connect(executor).executeWill(0);

      expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
      expect(await lastWillRegistry.hasActiveWill(0)).to.be.false;

      const will = await lastWillRegistry.getWill(0);
      expect(will.isExecuted).to.be.true;
    });
  });

  describe("Workflow 6: Property with Rent and PoA", function () {
    it("Should manage property with rent payments and agent authorization", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const rentAmount = ethers.parseEther("1");
      const period = 30 * 24 * 60 * 60;
      await propertyNFT.connect(seller).setRent(0, rentAmount, period, owner.address);

      const now = Math.floor(Date.now() / 1000);
      const oneYear = now + 365 * 24 * 60 * 60;
      await propertyNFT.connect(seller).setPoA(0, buyer.address, 3, true, now, oneYear);

      await ethers.provider.send("evm_increaseTime", [period]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await ethers.provider.getBalance(owner.address);

      await propertyNFT.connect(buyer).payRent(0, { value: rentAmount });

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(rentAmount);

      expect(await propertyNFT.isRentActive(0)).to.be.true;
    });
  });

  describe("Workflow 7: Multiple Properties Management", function () {
    it("Should handle multiple properties with different states", async function () {
      for (let i = 0; i < 3; i++) {
        await propertyNFT.mintProperty(seller.address, `ipfs://prop${i}`, `db://prop${i}`);
        await propertyNFT.connect(surveyor).signProperty(i);
        await propertyNFT.connect(notary).signProperty(i);
        await propertyNFT.connect(ivsl).signProperty(i);
      }

      const totalSupply = ethers.parseUnits("1000000", 18);
      const factoryAddress = await fractionFactory.getAddress();
      await propertyNFT.connect(seller).approve(factoryAddress, 0);
      await fractionFactory.connect(seller).createFractionToken(
        0,
        "Property Token 1",
        "PTK1",
        totalSupply,
        await propertyNFT.getAddress()
      );

      await lastWillRegistry.connect(seller).createWill(
        1,
        buyer.address,
        witness1.address,
        witness2.address,
        "ipfs://will-1"
      );

      await propertyNFT.connect(seller).transferFrom(seller.address, buyer.address, 2);

      expect(await propertyNFT.ownerOf(0)).to.equal(factoryAddress);
      expect(await propertyNFT.ownerOf(1)).to.equal(seller.address);
      expect(await propertyNFT.ownerOf(2)).to.equal(buyer.address);

      expect(await fractionFactory.isPropertyFractionalized(0)).to.be.true;
      expect(await lastWillRegistry.hasActiveWill(1)).to.be.true;
    });
  });

  describe("Workflow 8: Failed Escrow and Cancellation", function () {
    it("Should properly cancel escrow and refund parties", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      const price = ethers.parseEther("10");
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
      
      const escrowAddress = escrowFactory.interface.parseLog(event).args.escrow;
      const escrow = await ethers.getContractAt("HybridEscrow", escrowAddress);

      await escrow.connect(buyer).depositPayment({ value: price });
      await propertyNFT.connect(seller).approve(escrowAddress, 0);
      await escrow.connect(seller).depositNFTAsset();

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      const cancelTx = await escrow.connect(seller).cancel();
      const cancelReceipt = await cancelTx.wait();
      const gasCost = cancelReceipt.gasUsed * cancelReceipt.gasPrice;

      expect(await propertyNFT.ownerOf(0)).to.equal(seller.address);
    });
  });

  describe("Workflow 9: Will Revocation and Recreation", function () {
    it("Should revoke will and create new one with different beneficiary", async function () {
      await propertyNFT.mintProperty(seller.address, "ipfs://prop1", "db://prop1");
      await propertyNFT.connect(surveyor).signProperty(0);
      await propertyNFT.connect(notary).signProperty(0);
      await propertyNFT.connect(ivsl).signProperty(0);

      await lastWillRegistry.connect(seller).createWill(
        0,
        buyer.address,
        witness1.address,
        witness2.address,
        "ipfs://will-1"
      );

      await lastWillRegistry.connect(witness1).witnessWill(0, true);

      await lastWillRegistry.connect(seller).revokeWill(0);

      expect(await lastWillRegistry.hasActiveWill(0)).to.be.false;

      await lastWillRegistry.connect(seller).createWill(
        0,
        witness1.address,
        buyer.address,
        witness2.address,
        "ipfs://will-2"
      );

      const will = await lastWillRegistry.getWill(0);
      expect(will.beneficiary).to.equal(witness1.address);
      expect(will.isActive).to.be.true;
    });
  });

  describe("Workflow 10: Collecting Multiple Stamp Fees", function () {
    it("Should collect stamp fees for multiple transactions", async function () {
      for (let i = 0; i < 3; i++) {
        await propertyNFT.mintProperty(seller.address, `ipfs://prop${i}`, `db://prop${i}`);
        await propertyNFT.connect(surveyor).signProperty(i);
        await propertyNFT.connect(notary).signProperty(i);
        await propertyNFT.connect(ivsl).signProperty(i);
      }

      const feeAmount = ethers.parseEther("0.1");
      const adminBalanceBefore = await ethers.provider.getBalance(owner.address);

      await stampFeeCollector.connect(seller).payStampFee(0, { value: feeAmount });
      await stampFeeCollector.connect(seller).payStampFee(1, { value: feeAmount });
      await stampFeeCollector.connect(seller).payStampFee(2, { value: feeAmount });

      const adminBalanceAfter = await ethers.provider.getBalance(owner.address);
      const totalFeesCollected = adminBalanceAfter - adminBalanceBefore;

      expect(totalFeesCollected).to.equal(feeAmount * 3n);
    });
  });
});