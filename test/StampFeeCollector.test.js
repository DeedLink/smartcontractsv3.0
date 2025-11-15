const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StampFeeCollector", function () {
  let stampFeeCollector;
  let admin, user1, user2;

  beforeEach(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    const StampFeeCollector = await ethers.getContractFactory("StampFeeCollector");
    stampFeeCollector = await StampFeeCollector.deploy(admin.address);
    await stampFeeCollector.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct admin", async function () {
      expect(await stampFeeCollector.admin()).to.equal(admin.address);
    });

    it("Should not allow zero address as admin", async function () {
      const StampFeeCollector = await ethers.getContractFactory("StampFeeCollector");
      await expect(
        StampFeeCollector.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Admin cannot be zero address");
    });
  });

  describe("Pay Stamp Fee", function () {
    it("Should accept stamp fee payment", async function () {
      const feeAmount = ethers.parseEther("0.5");
      const tokenId = 0;

      await expect(
        stampFeeCollector.connect(user1).payStampFee(tokenId, { value: feeAmount })
      ).to.emit(stampFeeCollector, "StampFeePaid")
        .withArgs(user1.address, tokenId, feeAmount, await ethers.provider.getBlockNumber() + 1);
    });

    it("Should transfer fee to admin", async function () {
      const feeAmount = ethers.parseEther("0.5");
      const tokenId = 0;

      const adminBalanceBefore = await ethers.provider.getBalance(admin.address);

      await stampFeeCollector.connect(user1).payStampFee(tokenId, { value: feeAmount });

      const adminBalanceAfter = await ethers.provider.getBalance(admin.address);
      expect(adminBalanceAfter - adminBalanceBefore).to.equal(feeAmount);
    });

    it("Should not accept zero fee", async function () {
      await expect(
        stampFeeCollector.connect(user1).payStampFee(0, { value: 0 })
      ).to.be.revertedWith("Fee required");
    });

    it("Should allow multiple fee payments", async function () {
      const feeAmount = ethers.parseEther("0.5");

      await stampFeeCollector.connect(user1).payStampFee(0, { value: feeAmount });
      await stampFeeCollector.connect(user1).payStampFee(1, { value: feeAmount });
      await stampFeeCollector.connect(user2).payStampFee(2, { value: feeAmount });

      const adminBalance = await ethers.provider.getBalance(admin.address);
      expect(adminBalance).to.be.gt(ethers.parseEther("10000"));
    });
  });

  describe("Admin Management", function () {
    it("Should allow admin to update admin address", async function () {
      await stampFeeCollector.connect(admin).updateAdmin(user1.address);
      expect(await stampFeeCollector.admin()).to.equal(user1.address);
    });

    it("Should not allow non-admin to update admin", async function () {
      await expect(
        stampFeeCollector.connect(user1).updateAdmin(user2.address)
      ).to.be.revertedWith("Only admin");
    });

    it("Should not allow zero address as new admin", async function () {
      await expect(
        stampFeeCollector.connect(admin).updateAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("Admin cannot be zero");
    });

    it("Should transfer fees to new admin after update", async function () {
      await stampFeeCollector.connect(admin).updateAdmin(user1.address);

      const feeAmount = ethers.parseEther("0.5");
      const user1BalanceBefore = await ethers.provider.getBalance(user1.address);

      await stampFeeCollector.connect(user2).payStampFee(0, { value: feeAmount });

      const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
      expect(user1BalanceAfter - user1BalanceBefore).to.equal(feeAmount);
    });
  });

  describe("Events", function () {
    it("Should emit StampFeePaid with correct parameters", async function () {
      const feeAmount = ethers.parseEther("1");
      const tokenId = 5;

      const tx = await stampFeeCollector.connect(user1).payStampFee(tokenId, { value: feeAmount });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(stampFeeCollector, "StampFeePaid")
        .withArgs(user1.address, tokenId, feeAmount, block.timestamp);
    });
  });
});