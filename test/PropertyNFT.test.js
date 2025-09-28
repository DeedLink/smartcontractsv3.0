const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Property NFT Multi-Signature System", function () {
    let propertyNFT, fractionalToken, fractionFactory, hybridEscrow;
    let owner, surveyor, notary, ivsl, user1, user2, buyer, seller;

    beforeEach(async function () {
        [owner, surveyor, notary, ivsl, user1, user2, buyer, seller] = await ethers.getSigners();

        const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
        propertyNFT = await PropertyNFT.deploy(owner.address);

        const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
        fractionFactory = await FractionTokenFactory.deploy(propertyNFT.address);

        await propertyNFT.addAuthorizedUser(surveyor.address, 0); // SURVEYOR
        await propertyNFT.addAuthorizedUser(notary.address, 1);   // NOTARY
        await propertyNFT.addAuthorizedUser(ivsl.address, 2);     // IVSL
    });

    describe("PropertyNFT", function () {
        it("Should create property application", async function () {
            const tx = await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            const receipt = await tx.wait();
            
            expect(receipt.events[0].event).to.equal("PropertyApplicationCreated");
            expect(receipt.events[0].args.applicationId).to.equal(0);
            expect(receipt.events[0].args.applicant).to.equal(user1.address);

            const app = await propertyNFT.getApplication(0);
            expect(app.applicant).to.equal(user1.address);
            expect(app.ipfsURI).to.equal("ipfs://test");
            expect(app.status).to.equal(0); // PENDING
            expect(app.allSigned).to.equal(false);
        });

        it("Should handle multiple applications from different users", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://user1", "db://user1");
            await propertyNFT.connect(user2).createPropertyApplication("ipfs://user2", "db://user2");

            const app1 = await propertyNFT.getApplication(0);
            const app2 = await propertyNFT.getApplication(1);

            expect(app1.applicant).to.equal(user1.address);
            expect(app2.applicant).to.equal(user2.address);
            expect(app1.ipfsURI).to.equal("ipfs://user1");
            expect(app2.ipfsURI).to.equal("ipfs://user2");
        });

        it("Should allow authorized users to sign", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");

            await propertyNFT.connect(surveyor).signProperty(0);
            
            const signatures = await propertyNFT.getSignatureStatus(0);
            expect(signatures.surveyorSigned).to.equal(true);
            expect(signatures.surveyorSigner).to.equal(surveyor.address);
            expect(signatures.notarySigned).to.equal(false);
        });

        it("Should reject unauthorized signers", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");

            await expect(
                propertyNFT.connect(user2).signProperty(0)
            ).to.be.revertedWith("Not authorized");
        });

        it("Should prevent double signing by same authority type", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            await propertyNFT.connect(surveyor).signProperty(0);

            await expect(
                propertyNFT.connect(surveyor).signProperty(0)
            ).to.be.revertedWith("Already signed");
        });

        it("Should approve application after all signatures", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");

            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            
            let app = await propertyNFT.getApplication(0);
            expect(app.status).to.equal(0); // Still PENDING

            const tx = await propertyNFT.connect(ivsl).signProperty(0);
            const receipt = await tx.wait();
            
            expect(receipt.events[1].event).to.equal("PropertyApproved");
            
            app = await propertyNFT.getApplication(0);
            expect(app.status).to.equal(1); // APPROVED
            expect(app.allSigned).to.equal(true);
        });

        it("Should mint NFT after approval", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);

            const tx = await propertyNFT.connect(user1).mintApprovedProperty(0, user1.address);
            const receipt = await tx.wait();

            expect(receipt.events[1].event).to.equal("PropertyMinted");
            expect(await propertyNFT.ownerOf(0)).to.equal(user1.address);
            expect(await propertyNFT.tokenURI(0)).to.equal("ipfs://test");

            const app = await propertyNFT.getApplication(0);
            expect(app.status).to.equal(2); // MINTED
        });

        it("Should reject minting unapproved properties", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");

            await expect(
                propertyNFT.connect(user1).mintApprovedProperty(0, user1.address)
            ).to.be.revertedWith("Property not approved");
        });

        it("Should only allow applicant or owner to mint", async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);

            await expect(
                propertyNFT.connect(user2).mintApprovedProperty(0, user2.address)
            ).to.be.revertedWith("Only applicant or owner");
        });
    });

    describe("FractionTokenFactory", function () {
        beforeEach(async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);
        });

        it("Should create fractional token from approved application", async function () {
            const tx = await fractionFactory.connect(user1).createFractionTokenFromApplication(
                0, "Property Token", "PT", ethers.utils.parseEther("1000")
            );
            const receipt = await tx.wait();

            expect(receipt.events[0].event).to.equal("FractionTokenCreated");
            
            const tokenAddress = await fractionFactory.applicationToFractionToken(0);
            expect(tokenAddress).to.not.equal(ethers.constants.AddressZero);

            const FractionalToken = await ethers.getContractFactory("FractionalToken");
            const token = FractionalToken.attach(tokenAddress);
            
            expect(await token.name()).to.equal("Property Token");
            expect(await token.symbol()).to.equal("PT");
            expect(await token.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("1000"));
            expect(await token.applicationId()).to.equal(0);
        });

        it("Should reject creating token for unapproved application", async function () {
            await propertyNFT.connect(user2).createPropertyApplication("ipfs://test2", "db://test2");

            await expect(
                fractionFactory.connect(user2).createFractionTokenFromApplication(
                    1, "Property Token", "PT", ethers.utils.parseEther("1000")
                )
            ).to.be.revertedWith("Application not approved");
        });

        it("Should prevent duplicate tokens for same application", async function () {
            await fractionFactory.connect(user1).createFractionTokenFromApplication(
                0, "Property Token", "PT", ethers.utils.parseEther("1000")
            );

            await expect(
                fractionFactory.connect(user1).createFractionTokenFromApplication(
                    0, "Property Token 2", "PT2", ethers.utils.parseEther("500")
                )
            ).to.be.revertedWith("Token already exists");
        });

        it("Should create fractional token for minted NFT", async function () {
            await propertyNFT.connect(user1).mintApprovedProperty(0, user1.address);

            const tx = await fractionFactory.connect(user1).createFractionToken(
                0, "Minted Property Token", "MPT", ethers.utils.parseEther("2000")
            );

            const tokenAddress = await fractionFactory.propertyToFractionToken(0);
            expect(tokenAddress).to.not.equal(ethers.constants.AddressZero);
        });

        it("Should only allow property owner to create token for minted NFT", async function () {
            await propertyNFT.connect(user1).mintApprovedProperty(0, user1.address);

            await expect(
                fractionFactory.connect(user2).createFractionToken(
                    0, "Unauthorized Token", "UT", ethers.utils.parseEther("1000")
                )
            ).to.be.revertedWith("Only property owner");
        });
    });

    describe("HybridEscrow", function () {
        let tokenAddress, fractionalToken;

        beforeEach(async function () {
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://test", "db://test");
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);
            await propertyNFT.connect(user1).mintApprovedProperty(0, seller.address);

            await fractionFactory.connect(user1).createFractionTokenFromApplication(
                0, "Property Token", "PT", ethers.utils.parseEther("1000")
            );
            tokenAddress = await fractionFactory.applicationToFractionToken(0);
            
            const FractionalToken = await ethers.getContractFactory("FractionalToken");
            fractionalToken = FractionalToken.attach(tokenAddress);
            
            await fractionalToken.connect(user1).transfer(seller.address, ethers.utils.parseEther("100"));
        });

        it("Should handle NFT escrow", async function () {
            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                buyer.address, seller.address, ethers.utils.parseEther("1"),
                0, propertyNFT.address, 0
            );

            await propertyNFT.connect(seller).approve(escrow.address, 0);
            await escrow.connect(seller).depositAsset();
            await escrow.connect(buyer).depositPayment({ value: ethers.utils.parseEther("1") });

            expect(await escrow.isBuyerDeposited()).to.equal(true);
            expect(await escrow.isSellerDeposited()).to.equal(true);

            await escrow.finalize();

            expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
        });

        it("Should handle fractional token escrow", async function () {
            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                buyer.address, seller.address, ethers.utils.parseEther("0.1"),
                1, tokenAddress, ethers.utils.parseEther("50")
            );

            await fractionalToken.connect(seller).approve(escrow.address, ethers.utils.parseEther("50"));
            await escrow.connect(seller).depositAsset();
            await escrow.connect(buyer).depositPayment({ value: ethers.utils.parseEther("0.1") });

            await escrow.finalize();

            expect(await fractionalToken.balanceOf(buyer.address)).to.equal(ethers.utils.parseEther("50"));
        });

        it("Should reject incorrect payment amount", async function () {
            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                buyer.address, seller.address, ethers.utils.parseEther("1"),
                0, propertyNFT.address, 0
            );

            await expect(
                escrow.connect(buyer).depositPayment({ value: ethers.utils.parseEther("0.5") })
            ).to.be.revertedWith("Incorrect payment");
        });

        it("Should only allow designated parties to deposit", async function () {
            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                buyer.address, seller.address, ethers.utils.parseEther("1"),
                0, propertyNFT.address, 0
            );

            await expect(
                escrow.connect(user1).depositPayment({ value: ethers.utils.parseEther("1") })
            ).to.be.revertedWith("Only buyer");

            await expect(
                escrow.connect(user1).depositAsset()
            ).to.be.revertedWith("Only seller");
        });

        it("Should require both deposits before finalization", async function () {
            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                buyer.address, seller.address, ethers.utils.parseEther("1"),
                0, propertyNFT.address, 0
            );

            await escrow.connect(buyer).depositPayment({ value: ethers.utils.parseEther("1") });

            await expect(escrow.finalize()).to.be.revertedWith("Escrow not complete");
        });
    });

    describe("Integration Tests", function () {
        it("Should complete full workflow: Application -> Approval -> Mint -> Fractionalize -> Trade", async function () {
            // Step 1: Create application
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://property", "db://property");

            // Step 2: Get all signatures
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);

            // Step 3: Mint NFT
            await propertyNFT.connect(user1).mintApprovedProperty(0, user1.address);
            expect(await propertyNFT.ownerOf(0)).to.equal(user1.address);

            // Step 4: Create fractional tokens
            await fractionFactory.connect(user1).createFractionTokenFromApplication(
                0, "Property Shares", "PS", ethers.utils.parseEther("1000")
            );

            const tokenAddress = await fractionFactory.applicationToFractionToken(0);
            const FractionalToken = await ethers.getContractFactory("FractionalToken");
            const fractionalToken = FractionalToken.attach(tokenAddress);

            expect(await fractionalToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("1000"));

            // Step 5: Trade fractional tokens via escrow
            await fractionalToken.connect(user1).transfer(seller.address, ethers.utils.parseEther("100"));

            const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
            const escrow = await HybridEscrow.deploy(
                buyer.address, seller.address, ethers.utils.parseEther("0.1"),
                1, tokenAddress, ethers.utils.parseEther("50")
            );

            await fractionalToken.connect(seller).approve(escrow.address, ethers.utils.parseEther("50"));
            await escrow.connect(seller).depositAsset();
            await escrow.connect(buyer).depositPayment({ value: ethers.utils.parseEther("0.1") });
            await escrow.finalize();

            expect(await fractionalToken.balanceOf(buyer.address)).to.equal(ethers.utils.parseEther("50"));
        });

        it("Should handle multiple properties simultaneously", async function () {
            // Create multiple applications
            await propertyNFT.connect(user1).createPropertyApplication("ipfs://prop1", "db://prop1");
            await propertyNFT.connect(user2).createPropertyApplication("ipfs://prop2", "db://prop2");

            // Sign property 1
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);

            // Sign property 2 partially
            await propertyNFT.connect(surveyor).signProperty(1);

            // Check statuses
            const app1 = await propertyNFT.getApplication(0);
            const app2 = await propertyNFT.getApplication(1);

            expect(app1.status).to.equal(1); // APPROVED
            expect(app2.status).to.equal(0); // PENDING

            // Mint only approved property
            await propertyNFT.connect(user1).mintApprovedProperty(0, user1.address);
            expect(await propertyNFT.ownerOf(0)).to.equal(user1.address);

            // Cannot mint unapproved property
            await expect(
                propertyNFT.connect(user2).mintApprovedProperty(1, user2.address)
            ).to.be.revertedWith("Property not approved");
        });
    });
});