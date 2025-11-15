const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LastWillRegistry", function () {
  let propertyNFT, lastWillRegistry;
  let owner, surveyor, notary, ivsl, propertyOwner, beneficiary, witness1, witness2, executor;

  beforeEach(async function () {
    [owner, surveyor, notary, ivsl, propertyOwner, beneficiary, witness1, witness2, executor] = await ethers.getSigners();

    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    propertyNFT = await PropertyNFT.deploy(owner.address);
    await propertyNFT.waitForDeployment();

    const SURVEYOR_ROLE = await propertyNFT.SURVEYOR_ROLE();
    const NOTARY_ROLE = await propertyNFT.NOTARY_ROLE();
    const IVSL_ROLE = await propertyNFT.IVSL_ROLE();

    await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
    await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
    await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);

    const LastWillRegistry = await ethers.getContractFactory("LastWillRegistry");
    lastWillRegistry = await LastWillRegistry.deploy(
      await propertyNFT.getAddress(),
      owner.address
    );
    await lastWillRegistry.waitForDeployment();

    await lastWillRegistry.setExecutorAuthorization(executor.address, true);

    await propertyNFT.mintProperty(propertyOwner.address, "ipfs://test", "db://test");
    await propertyNFT.connect(surveyor).signProperty(0);
    await propertyNFT.connect(notary).signProperty(0);
    await propertyNFT.connect(ivsl).signProperty(0);
  });

  describe("Deployment", function () {
    it("Should set the correct PropertyNFT address", async function () {
      expect(await lastWillRegistry.propertyNFT()).to.equal(await propertyNFT.getAddress());
    });

    it("Should authorize executor", async function () {
      expect(await lastWillRegistry.authorizedExecutors(executor.address)).to.be.true;
    });

    it("Should not deploy with zero address", async function () {
      const LastWillRegistry = await ethers.getContractFactory("LastWillRegistry");
      await expect(
        LastWillRegistry.deploy(ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("Invalid PropertyNFT address");
    });
  });

  describe("Create Will", function () {
    it("Should create a will", async function () {
      const tx = await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "WillCreated");
    });

    it("Should store will data correctly", async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );

      const will = await lastWillRegistry.getWill(0);
      expect(will.beneficiary).to.equal(beneficiary.address);
      expect(will.witness1).to.equal(witness1.address);
      expect(will.witness2).to.equal(witness2.address);
      expect(will.isActive).to.be.true;
      expect(will.isExecuted).to.be.false;
      expect(will.ipfsHash).to.equal("ipfs://will-doc");
    });

    it("Should not allow non-owner to create will", async function () {
      await expect(
        lastWillRegistry.connect(beneficiary).createWill(
          0,
          beneficiary.address,
          witness1.address,
          witness2.address,
          "ipfs://will-doc"
        )
      ).to.be.revertedWith("Not property owner");
    });

    it("Should not allow duplicate will", async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );

      await expect(
        lastWillRegistry.connect(propertyOwner).createWill(
          0,
          beneficiary.address,
          witness1.address,
          witness2.address,
          "ipfs://will-doc2"
        )
      ).to.be.revertedWith("Will already exists for this property");
    });

    it("Should not allow invalid beneficiary", async function () {
      await expect(
        lastWillRegistry.connect(propertyOwner).createWill(
          0,
          ethers.ZeroAddress,
          witness1.address,
          witness2.address,
          "ipfs://will-doc"
        )
      ).to.be.revertedWith("Invalid beneficiary");
    });

    it("Should not allow owner as beneficiary", async function () {
      await expect(
        lastWillRegistry.connect(propertyOwner).createWill(
          0,
          propertyOwner.address,
          witness1.address,
          witness2.address,
          "ipfs://will-doc"
        )
      ).to.be.revertedWith("Cannot be your own beneficiary");
    });

    it("Should not allow same witness twice", async function () {
      await expect(
        lastWillRegistry.connect(propertyOwner).createWill(
          0,
          beneficiary.address,
          witness1.address,
          witness1.address,
          "ipfs://will-doc"
        )
      ).to.be.revertedWith("Witnesses must be different");
    });

    it("Should require IPFS hash", async function () {
      await expect(
        lastWillRegistry.connect(propertyOwner).createWill(
          0,
          beneficiary.address,
          witness1.address,
          witness2.address,
          ""
        )
      ).to.be.revertedWith("IPFS hash required");
    });
  });

  describe("Witness Will", function () {
    beforeEach(async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );
    });

    it("Should allow witness1 to approve", async function () {
      const tx = await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "WillWitnessed").withArgs(0, witness1.address, true);

      const will = await lastWillRegistry.getWill(0);
      expect(will.witness1Status).to.equal(1);
    });

    it("Should allow witness2 to approve", async function () {
      const tx = await lastWillRegistry.connect(witness2).witnessWill(0, true);
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "WillWitnessed").withArgs(0, witness2.address, true);

      const will = await lastWillRegistry.getWill(0);
      expect(will.witness2Status).to.equal(1);
    });

    it("Should allow witness to reject", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, false);

      const will = await lastWillRegistry.getWill(0);
      expect(will.witness1Status).to.equal(2);
    });

    it("Should not allow non-witness to witness", async function () {
      await expect(
        lastWillRegistry.connect(beneficiary).witnessWill(0, true)
      ).to.be.revertedWith("Not a witness for this will");
    });

    it("Should not allow double witnessing", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await expect(
        lastWillRegistry.connect(witness1).witnessWill(0, true)
      ).to.be.revertedWith("Already witnessed");
    });
  });

  describe("Execute Will", function () {
    beforeEach(async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );
    });

    it("Should execute will with full witnessing", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await lastWillRegistry.connect(witness2).witnessWill(0, true);

      await propertyNFT.connect(propertyOwner).approve(await lastWillRegistry.getAddress(), 0);

      const tx = await lastWillRegistry.connect(executor).executeWill(0);
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "WillExecuted");

      expect(await propertyNFT.ownerOf(0)).to.equal(beneficiary.address);
    });

    it("Should mark will as executed", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await lastWillRegistry.connect(witness2).witnessWill(0, true);
      await propertyNFT.connect(propertyOwner).approve(await lastWillRegistry.getAddress(), 0);

      await lastWillRegistry.connect(executor).executeWill(0);

      const will = await lastWillRegistry.getWill(0);
      expect(will.isExecuted).to.be.true;
      expect(will.isActive).to.be.false;
    });

    it("Should not execute without full witnessing", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);

      await expect(
        lastWillRegistry.connect(executor).executeWill(0)
      ).to.be.revertedWith("Will not fully witnessed");
    });

    it("Should not execute with rejection", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await lastWillRegistry.connect(witness2).witnessWill(0, false);

      await expect(
        lastWillRegistry.connect(executor).executeWill(0)
      ).to.be.revertedWith("Will not fully witnessed");
    });

    it("Should not allow unauthorized executor", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await lastWillRegistry.connect(witness2).witnessWill(0, true);

      await expect(
        lastWillRegistry.connect(beneficiary).executeWill(0)
      ).to.be.revertedWith("Not authorized executor");
    });

    it("Should not execute twice", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await lastWillRegistry.connect(witness2).witnessWill(0, true);
      await propertyNFT.connect(propertyOwner).approve(await lastWillRegistry.getAddress(), 0);

      await lastWillRegistry.connect(executor).executeWill(0);

      await expect(
        lastWillRegistry.connect(executor).executeWill(0)
      ).to.be.revertedWith("No active will for this property");
    });
  });

  describe("Revoke Will", function () {
    beforeEach(async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );
    });

    it("Should revoke active will", async function () {
      const tx = await lastWillRegistry.connect(propertyOwner).revokeWill(0);
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "WillRevoked");

      const will = await lastWillRegistry.getWill(0);
      expect(will.isActive).to.be.false;
    });

    it("Should not allow non-owner to revoke", async function () {
      await expect(
        lastWillRegistry.connect(beneficiary).revokeWill(0)
      ).to.be.revertedWith("Not property owner");
    });

    it("Should not revoke executed will", async function () {
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      await lastWillRegistry.connect(witness2).witnessWill(0, true);
      await propertyNFT.connect(propertyOwner).approve(await lastWillRegistry.getAddress(), 0);
      await lastWillRegistry.connect(executor).executeWill(0);

      await expect(
        lastWillRegistry.connect(beneficiary).revokeWill(0)
      ).to.be.revertedWith("No active will for this property");
    });
  });

  describe("Update Beneficiary", function () {
    beforeEach(async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );
      await lastWillRegistry.connect(witness1).witnessWill(0, true);
    });

    it("Should update beneficiary", async function () {
      const tx = await lastWillRegistry.connect(propertyOwner).updateBeneficiary(0, witness2.address);
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "WillTransferred").withArgs(0, beneficiary.address, witness2.address);

      const will = await lastWillRegistry.getWill(0);
      expect(will.beneficiary).to.equal(witness2.address);
    });

    it("Should reset witness signatures on beneficiary update", async function () {
      await lastWillRegistry.connect(propertyOwner).updateBeneficiary(0, witness2.address);

      const will = await lastWillRegistry.getWill(0);
      expect(will.witness1Status).to.equal(0);
      expect(will.witness2Status).to.equal(0);
    });

    it("Should not allow non-owner to update beneficiary", async function () {
      await expect(
        lastWillRegistry.connect(beneficiary).updateBeneficiary(0, witness2.address)
      ).to.be.revertedWith("Not property owner");
    });

    it("Should not update to zero address", async function () {
      await expect(
        lastWillRegistry.connect(propertyOwner).updateBeneficiary(0, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid beneficiary");
    });

    it("Should not update to owner address", async function () {
      await expect(
        lastWillRegistry.connect(propertyOwner).updateBeneficiary(0, propertyOwner.address)
      ).to.be.revertedWith("Cannot be your own beneficiary");
    });
  });

  describe("Executor Authorization", function () {
    it("Should authorize executor", async function () {
      const tx = await lastWillRegistry.setExecutorAuthorization(witness1.address, true);
      await tx.wait();
      
      expect(tx).to.emit(lastWillRegistry, "ExecutorAuthorized").withArgs(witness1.address, true);

      expect(await lastWillRegistry.authorizedExecutors(witness1.address)).to.be.true;
    });

    it("Should revoke executor authorization", async function () {
      await lastWillRegistry.setExecutorAuthorization(executor.address, false);
      expect(await lastWillRegistry.authorizedExecutors(executor.address)).to.be.false;
    });

    it("Should not allow non-owner to authorize", async function () {
      await expect(
        lastWillRegistry.connect(beneficiary).setExecutorAuthorization(witness1.address, true)
      ).to.be.revertedWithCustomError(lastWillRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should not authorize zero address", async function () {
      await expect(
        lastWillRegistry.setExecutorAuthorization(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid executor address");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await lastWillRegistry.connect(propertyOwner).createWill(
        0,
        beneficiary.address,
        witness1.address,
        witness2.address,
        "ipfs://will-doc"
      );
    });

    it("Should check if will is ready for execution", async function () {
      expect(await lastWillRegistry.isWillReadyForExecution(0)).to.be.false;

      await lastWillRegistry.connect(witness1).witnessWill(0, true);
      expect(await lastWillRegistry.isWillReadyForExecution(0)).to.be.false;

      await lastWillRegistry.connect(witness2).witnessWill(0, true);
      expect(await lastWillRegistry.isWillReadyForExecution(0)).to.be.true;
    });

    it("Should check if property has active will", async function () {
      expect(await lastWillRegistry.hasActiveWill(0)).to.be.true;
      expect(await lastWillRegistry.hasActiveWill(1)).to.be.false;
    });

    it("Should return complete will information", async function () {
      const will = await lastWillRegistry.getWill(0);
      
      expect(will.beneficiary).to.equal(beneficiary.address);
      expect(will.witness1).to.equal(witness1.address);
      expect(will.witness2).to.equal(witness2.address);
      expect(will.isActive).to.be.true;
      expect(will.isExecuted).to.be.false;
      expect(will.ipfsHash).to.equal("ipfs://will-doc");
      expect(will.witness1Status).to.equal(0);
      expect(will.witness2Status).to.equal(0);
    });
  });
});