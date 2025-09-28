// test/PropertyNFTSimple.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Property NFT System - Anvil Compatible", function () {
    let propertyNFT, fractionFactory;
    let owner, surveyor, notary, ivsl, user1, user2;

    before(async function () {
        [owner, surveyor, notary, ivsl, user1, user2] = await ethers.getSigners();
        console.log("Deploying contracts...");
        
        // Deploy PropertyNFT
        const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
        propertyNFT = await PropertyNFT.deploy(owner.address);
        await propertyNFT.waitForDeployment();
        console.log("PropertyNFT deployed to:", await propertyNFT.getAddress());

        // Deploy FractionTokenFactory
        const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
        fractionFactory = await FractionTokenFactory.deploy(await propertyNFT.getAddress());
        await fractionFactory.waitForDeployment();
        console.log("FractionTokenFactory deployed to:", await fractionFactory.getAddress());

        // Setup authorities
        await propertyNFT.connect(owner).addAuthorizedUser(surveyor.address, 0); // SURVEYOR
        await propertyNFT.connect(owner).addAuthorizedUser(notary.address, 1);   // NOTARY
        await propertyNFT.connect(owner).addAuthorizedUser(ivsl.address, 2);     // IVSL
        console.log("Authorities configured");
    });

    describe("Basic Functionality", function () {
        it("Should have correct initial state", async function () {
            expect(await propertyNFT.name()).to.equal("RealEstateNFT");
            expect(await propertyNFT.symbol()).to.equal("RE-NFT");
            expect(await propertyNFT.nextTokenId()).to.equal(0);
            expect(await propertyNFT.nextApplicationId()).to.equal(0);
        });

        it("Should create property application", async function () {
            const tx = await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            const receipt = await tx.wait();
            
            // Find the event in the receipt
            const event = receipt.logs.find(log => {
                try {
                    const parsed = propertyNFT.interface.parseLog(log);
                    return parsed.name === "PropertyApplicationCreated";
                } catch (e) {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;
            const parsedEvent = propertyNFT.interface.parseLog(event);
            expect(parsedEvent.args.applicationId).to.equal(0);
            expect(parsedEvent.args.applicant).to.equal(user1.address);
        });

        it("Should handle signatures", async function () {
            // Sign with surveyor
            await propertyNFT.connect(surveyor).signProperty(0);
            
            const signatures = await propertyNFT.getSignatureStatus(0);
            expect(signatures.surveyorSigned).to.equal(true);
            expect(signatures.surveyorSigner).to.equal(surveyor.address);
        });

        it("Should approve after all signatures", async function () {
            // Complete remaining signatures
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);

            const app = await propertyNFT.getApplication(0);
            expect(app.status).to.equal(1); // APPROVED
            expect(app.allSigned).to.equal(true);
        });

        it("Should mint NFT after approval", async function () {
            await propertyNFT.connect(user1).mintApprovedProperty(0, user1.address);
            
            expect(await propertyNFT.ownerOf(0)).to.equal(user1.address);
            expect(await propertyNFT.tokenURI(0)).to.equal("ipfs://test");
        });

        it("Should create fractional tokens", async function () {
            // Create new application for fractional tokens
            await propertyNFT.connect(user2).createPropertyApplication("ipfs://prop2", "db://prop2");
            
            // Sign all authorities
            await propertyNFT.connect(surveyor).signProperty(1);
            await propertyNFT.connect(notary).signProperty(1);
            await propertyNFT.connect(ivsl).signProperty(1);

            // Create fractional token
            const tx = await fractionFactory.connect(user2).createFractionTokenFromApplication(
                1, "Property Token", "PT", ethers.parseEther("1000")
            );
            await tx.wait();

            const tokenAddress = await fractionFactory.applicationToFractionToken(1);
            expect(tokenAddress).to.not.equal(ethers.ZeroAddress);

            // Check token details
            const FractionalToken = await ethers.getContractFactory("FractionalToken");
            const token = FractionalToken.attach(tokenAddress);
            
            expect(await token.name()).to.equal("Property Token");
            expect(await token.symbol()).to.equal("PT");
            expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("1000"));
        });

        it("Should handle escrow for NFT", async function () {
            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                user2.address,  // buyer
                user1.address,  // seller (owns NFT token 0)
                ethers.parseEther("1"), // price
                0, // NFT type
                await propertyNFT.getAddress(),
                0  // token ID
            );
            await escrow.waitForDeployment();

            // Seller approves and deposits NFT
            await propertyNFT.connect(user1).approve(await escrow.getAddress(), 0);
            await escrow.connect(user1).depositAsset();

            // Buyer deposits payment
            await escrow.connect(user2).depositPayment({ value: ethers.parseEther("1") });

            // Check deposits
            expect(await escrow.isBuyerDeposited()).to.equal(true);
            expect(await escrow.isSellerDeposited()).to.equal(true);

            // Finalize escrow
            await escrow.finalize();

            // Verify transfer
            expect(await propertyNFT.ownerOf(0)).to.equal(user2.address);
        });
    });

    describe("Error Cases", function () {
        it("Should reject unauthorized signers", async function () {
            // Create new application
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test3", "db://test3");
            
            await expect(
                propertyNFT.connect(user1).signProperty(2)
            ).to.be.revertedWith("Not authorized");
        });

        it("Should reject double signing", async function () {
            await propertyNFT.connect(surveyor).signProperty(2);
            
            await expect(
                propertyNFT.connect(surveyor).signProperty(2)
            ).to.be.revertedWith("Already signed");
        });

        it("Should reject minting unapproved property", async function () {
            await expect(
                propertyNFT.connect(user1).mintApprovedProperty(2, user1.address)
            ).to.be.revertedWith("Property not approved");
        });
    });
});