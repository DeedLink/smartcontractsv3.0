const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Smart Contract Integration Tests", function () {
    let deployer, surveyor, notary, ivsl, buyer, seller;
    let propertyNFT, fractionFactory, escrow, fractionTokenAddress;
    let propertyNFTAddress, fractionFactoryAddress, escrowAddress;
    let SURVEYOR_ROLE, NOTARY_ROLE, IVSL_ROLE;

    beforeEach(async function () {
        [deployer, surveyor, notary, ivsl, buyer, seller] = await ethers.getSigners();

        // Deploy PropertyNFT
        const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
        propertyNFT = await PropertyNFT.deploy(deployer.address);
        propertyNFTAddress = await propertyNFT.getAddress();

        // Get role hashes
        SURVEYOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SURVEYOR_ROLE"));
        NOTARY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("NOTARY_ROLE"));
        IVSL_ROLE = ethers.keccak256(ethers.toUtf8Bytes("IVSL_ROLE"));

        // Grant roles
        await propertyNFT.grantRole(SURVEYOR_ROLE, surveyor.address);
        await propertyNFT.grantRole(NOTARY_ROLE, notary.address);
        await propertyNFT.grantRole(IVSL_ROLE, ivsl.address);

        // Mint property NFT
        await propertyNFT.mintProperty(seller.address, "ipfs://property1", "db://property1");

        // Deploy FractionTokenFactory
        const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
        fractionFactory = await FractionTokenFactory.deploy();
        fractionFactoryAddress = await fractionFactory.getAddress();

        // Deploy HybridEscrow
        const HybridEscrow = await ethers.getContractFactory("HybridEscrow");
        escrow = await HybridEscrow.deploy(
            buyer.address,
            seller.address,
            ethers.parseEther("1"),
            0,
            propertyNFTAddress,
            0
        );
        escrowAddress = await escrow.getAddress();
    });

    describe("PropertyNFT", function () {
        describe("Role Management", function () {
            it("should have correct role assignments", async function () {
                expect(await propertyNFT.hasRole(SURVEYOR_ROLE, surveyor.address)).to.be.true;
                expect(await propertyNFT.hasRole(NOTARY_ROLE, notary.address)).to.be.true;
                expect(await propertyNFT.hasRole(IVSL_ROLE, ivsl.address)).to.be.true;
            });

            it("should prevent unauthorized role assignments", async function () {
                await expect(
                    propertyNFT.connect(seller).grantRole(SURVEYOR_ROLE, buyer.address)
                ).to.be.reverted;
            });
        });

        describe("Property Management", function () {
            it("should mint with correct metadata", async function () {
                const [ipfsHash, dbHash] = await propertyNFT.getMetadata(0);
                expect(ipfsHash).to.equal("ipfs://property1");
                expect(dbHash).to.equal("db://property1");
            });

            it("should track token IDs correctly", async function () {
                const nextId = await propertyNFT.nextTokenId();
                expect(nextId).to.equal(1);
            });

            it("should assign correct ownership", async function () {
                expect(await propertyNFT.ownerOf(0)).to.equal(seller.address);
            });
        });

        describe("Property Signing", function () {
            it("should track individual signatures", async function () {
                await propertyNFT.connect(surveyor).signProperty(0);
                expect(await propertyNFT.isSignedBySurveyor(0)).to.be.true;
                expect(await propertyNFT.isSignedByNotary(0)).to.be.false;
                expect(await propertyNFT.isSignedByIVSL(0)).to.be.false;
            });

            it("should prevent double signing", async function () {
                await propertyNFT.connect(surveyor).signProperty(0);
                await expect(
                    propertyNFT.connect(surveyor).signProperty(0)
                ).to.be.revertedWith("Already signed");
            });

            it("should update fully signed status correctly", async function () {
                await propertyNFT.connect(surveyor).signProperty(0);
                await propertyNFT.connect(notary).signProperty(0);
                await propertyNFT.connect(ivsl).signProperty(0);
                expect(await propertyNFT.isFullySigned(0)).to.be.true;
            });

            it("should prevent unauthorized signing", async function () {
                await expect(
                    propertyNFT.connect(buyer).signProperty(0)
                ).to.be.revertedWith("Not authorized to sign");
            });
        });
    });

    describe("FractionTokenFactory", function () {
        beforeEach(async function () {
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);
        });

        it("should create fraction token with correct parameters", async function () {
            const tx = await fractionFactory.createFractionToken(
                0,
                "PropertyToken",
                "PTKN",
                ethers.parseUnits("1000", 18),
                propertyNFTAddress
            );
            await tx.wait();

            fractionTokenAddress = await fractionFactory.propertyToFractionToken(0);
            const FractionalToken = await ethers.getContractFactory("FractionalToken");
            const fractionToken = FractionalToken.attach(fractionTokenAddress);

            expect(await fractionToken.name()).to.equal("PropertyToken");
            expect(await fractionToken.symbol()).to.equal("PTKN");
            expect(await fractionToken.propertyId()).to.equal(0);
        });

        it("should prevent creating tokens for non-existent NFTs", async function () {
            await expect(
                fractionFactory.createFractionToken(
                    999,
                    "Invalid",
                    "INV",
                    ethers.parseUnits("1000", 18),
                    propertyNFTAddress
                )
            ).to.be.revertedWith("Property does not exist");
        });

        it("should prevent duplicate token creation", async function () {
            await fractionFactory.createFractionToken(
                0,
                "PropertyToken",
                "PTKN",
                ethers.parseUnits("1000", 18),
                propertyNFTAddress
            );

            await expect(
                fractionFactory.createFractionToken(
                    0,
                    "PropertyToken2",
                    "PTKN2",
                    ethers.parseUnits("1000", 18),
                    propertyNFTAddress
                )
            ).to.be.revertedWith("Fraction token already exists");
        });
    });

    describe("HybridEscrow", function () {
        beforeEach(async function () {
            await propertyNFT.connect(surveyor).signProperty(0);
            await propertyNFT.connect(notary).signProperty(0);
            await propertyNFT.connect(ivsl).signProperty(0);
        });

        describe("Deposits", function () {
            it("should handle ETH deposits correctly", async function () {
                await escrow.connect(buyer).depositPayment({ value: ethers.parseEther("1") });
                expect(await ethers.provider.getBalance(escrowAddress)).to.equal(ethers.parseEther("1"));
            });

            it("should handle NFT deposits correctly", async function () {
                await propertyNFT.connect(seller).approve(escrowAddress, 0);
                await escrow.connect(seller).depositAsset();
                expect(await propertyNFT.ownerOf(0)).to.equal(escrowAddress);
            });

            it("should prevent incorrect payment amounts", async function () {
                await expect(
                    escrow.connect(buyer).depositPayment({ value: ethers.parseEther("0.5") })
                ).to.be.revertedWith("Incorrect payment");
            });

            it("should prevent unauthorized deposits", async function () {
                await expect(
                    escrow.connect(seller).depositPayment({ value: ethers.parseEther("1") })
                ).to.be.revertedWith("Only buyer");
            });
        });

        describe("Escrow Flow", function () {
            it("should complete full escrow cycle", async function () {
                const initialSellerBalance = await ethers.provider.getBalance(seller.address);

                await propertyNFT.connect(seller).approve(escrowAddress, 0);
                await escrow.connect(buyer).depositPayment({ value: ethers.parseEther("1") });
                await escrow.connect(seller).depositAsset();
                await escrow.connect(buyer).finalize();

                expect(await propertyNFT.ownerOf(0)).to.equal(buyer.address);
                const finalSellerBalance = await ethers.provider.getBalance(seller.address);
                
                // Check that seller received payment (allowing for small gas costs)
                const balanceDiff = finalSellerBalance - initialSellerBalance;
                expect(balanceDiff).to.be.closeTo(
                    ethers.parseEther("1"),
                    ethers.parseEther("0.01") // Allow for gas costs
                );
            });

            it("should prevent premature finalization", async function () {
                await expect(
                    escrow.connect(buyer).finalize()
                ).to.be.revertedWith("Escrow not complete");
            });
            
            it("should prevent unauthorized finalization", async function () {
                await escrow.connect(buyer).depositPayment({ value: ethers.parseEther("1") });
                await expect(
                    escrow.connect(seller).finalize()
                ).to.be.revertedWith("Only buyer can finalize");
            });
        });
    });
});