const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Real Estate Tokenization System", function () {
  let propertyNFT;
  let fractionTokenFactory;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy PropertyNFT
    const PropertyNFT = await ethers.getContractFactory("PropertyNFT");
    propertyNFT = await PropertyNFT.deploy(owner.address);
    await propertyNFT.waitForDeployment();

    // Deploy FractionTokenFactory
    const FractionTokenFactory = await ethers.getContractFactory("FractionTokenFactory");
    fractionTokenFactory = await FractionTokenFactory.deploy();
    await fractionTokenFactory.waitForDeployment();
  });

  describe("PropertyNFT", function () {
    describe("Deployment", function () {
      it("Should set the right owner", async function () {
        expect(await propertyNFT.owner()).to.equal(owner.address);
      });

      it("Should have correct name and symbol", async function () {
        expect(await propertyNFT.name()).to.equal("RealEstateNFT");
        expect(await propertyNFT.symbol()).to.equal("RE-NFT");
      });

      it("Should start with nextTokenId as 0", async function () {
        expect(await propertyNFT.nextTokenId()).to.equal(0);
      });
    });

    describe("Minting", function () {
      it("Should mint a property NFT to the specified address", async function () {
        const tokenURI = "https://example.com/property/1";
        
        await propertyNFT.mintProperty(addr1.address, tokenURI);
        
        expect(await propertyNFT.ownerOf(0)).to.equal(addr1.address);
        expect(await propertyNFT.tokenURI(0)).to.equal(tokenURI);
        expect(await propertyNFT.nextTokenId()).to.equal(1);
      });

      it("Should increment token ID for each mint", async function () {
        await propertyNFT.mintProperty(addr1.address, "uri1");
        await propertyNFT.mintProperty(addr2.address, "uri2");
        
        expect(await propertyNFT.ownerOf(0)).to.equal(addr1.address);
        expect(await propertyNFT.ownerOf(1)).to.equal(addr2.address);
        expect(await propertyNFT.nextTokenId()).to.equal(2);
      });

      it("Should only allow owner to mint", async function () {
        await expect(
          propertyNFT.connect(addr1).mintProperty(addr2.address, "uri")
        ).to.be.revertedWithCustomError(propertyNFT, "OwnableUnauthorizedAccount");
      });

      it("Should emit Transfer event on mint", async function () {
        await expect(propertyNFT.mintProperty(addr1.address, "uri"))
          .to.emit(propertyNFT, "Transfer")
          .withArgs(ethers.ZeroAddress, addr1.address, 0);
      });
    });

    describe("Token URI", function () {
      it("Should return correct token URI", async function () {
        const tokenURI = "https://example.com/property/1";
        await propertyNFT.mintProperty(addr1.address, tokenURI);
        
        expect(await propertyNFT.tokenURI(0)).to.equal(tokenURI);
      });

      it("Should allow different URIs for different tokens", async function () {
        const uri1 = "https://example.com/property/1";
        const uri2 = "https://example.com/property/2";
        
        await propertyNFT.mintProperty(addr1.address, uri1);
        await propertyNFT.mintProperty(addr2.address, uri2);
        
        expect(await propertyNFT.tokenURI(0)).to.equal(uri1);
        expect(await propertyNFT.tokenURI(1)).to.equal(uri2);
      });
    });
  });

  describe("FractionTokenFactory", function () {
    describe("Token Creation", function () {
      it("Should create a fractional token for a property", async function () {
        const propertyId = 1;
        const name = "Property Token";
        const symbol = "PROP";
        const totalSupply = ethers.parseEther("1000");

        const tx = await fractionTokenFactory.createFractionToken(
          propertyId,
          name,
          symbol,
          totalSupply
        );

        // Check if token address is stored
        const tokenAddress = await fractionTokenFactory.propertyToFractionToken(propertyId);
        expect(tokenAddress).to.not.equal(ethers.ZeroAddress);

        // Check event emission
        await expect(tx)
          .to.emit(fractionTokenFactory, "FractionTokenCreated")
          .withArgs(propertyId, tokenAddress);
      });

      it("Should not allow duplicate tokens for the same property", async function () {
        const propertyId = 1;
        const name = "Property Token";
        const symbol = "PROP";
        const totalSupply = ethers.parseEther("1000");

        // Create first token
        await fractionTokenFactory.createFractionToken(
          propertyId,
          name,
          symbol,
          totalSupply
        );

        // Try to create duplicate
        await expect(
          fractionTokenFactory.createFractionToken(
            propertyId,
            name,
            symbol,
            totalSupply
          )
        ).to.be.revertedWith("Token already exists for property");
      });

      it("Should allow different properties to have tokens", async function () {
        const totalSupply = ethers.parseEther("1000");

        await fractionTokenFactory.createFractionToken(1, "Token1", "TK1", totalSupply);
        await fractionTokenFactory.createFractionToken(2, "Token2", "TK2", totalSupply);

        const token1Address = await fractionTokenFactory.propertyToFractionToken(1);
        const token2Address = await fractionTokenFactory.propertyToFractionToken(2);

        expect(token1Address).to.not.equal(ethers.ZeroAddress);
        expect(token2Address).to.not.equal(ethers.ZeroAddress);
        expect(token1Address).to.not.equal(token2Address);
      });
    });

    describe("Token Properties", function () {
      let tokenAddress;
      let fractionalToken;

      beforeEach(async function () {
        const propertyId = 1;
        const name = "Property Token";
        const symbol = "PROP";
        const totalSupply = ethers.parseEther("1000");

        await fractionTokenFactory.createFractionToken(
          propertyId,
          name,
          symbol,
          totalSupply
        );

        tokenAddress = await fractionTokenFactory.propertyToFractionToken(propertyId);
        fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);
      });

      it("Should create token with correct properties", async function () {
        expect(await fractionalToken.name()).to.equal("Property Token");
        expect(await fractionalToken.symbol()).to.equal("PROP");
        expect(await fractionalToken.propertyId()).to.equal(1);
      });

      it("Should mint total supply to creator", async function () {
        const totalSupply = ethers.parseEther("1000");
        expect(await fractionalToken.balanceOf(owner.address)).to.equal(totalSupply);
        expect(await fractionalToken.totalSupply()).to.equal(totalSupply);
      });

      it("Should allow token transfers", async function () {
        const transferAmount = ethers.parseEther("100");
        
        await fractionalToken.transfer(addr1.address, transferAmount);
        
        expect(await fractionalToken.balanceOf(addr1.address)).to.equal(transferAmount);
        expect(await fractionalToken.balanceOf(owner.address)).to.equal(
          ethers.parseEther("900")
        );
      });

      it("Should allow approved transfers", async function () {
        const transferAmount = ethers.parseEther("100");
        
        await fractionalToken.approve(addr1.address, transferAmount);
        await fractionalToken.connect(addr1).transferFrom(
          owner.address,
          addr2.address,
          transferAmount
        );
        
        expect(await fractionalToken.balanceOf(addr2.address)).to.equal(transferAmount);
        expect(await fractionalToken.allowance(owner.address, addr1.address)).to.equal(0);
      });
    });
  });

  describe("Integration Tests", function () {
    it("Should create property NFT and corresponding fractional tokens", async function () {
      // Mint property NFT
      const tokenURI = "https://example.com/property/1";
      await propertyNFT.mintProperty(addr1.address, tokenURI);
      
      // Create fractional tokens for the property
      const propertyId = 0; // First minted NFT
      const totalSupply = ethers.parseEther("1000");
      
      await fractionTokenFactory.createFractionToken(
        propertyId,
        "Property Shares",
        "PSHARE",
        totalSupply
      );

      // Verify NFT ownership
      expect(await propertyNFT.ownerOf(propertyId)).to.equal(addr1.address);
      
      // Verify fractional token creation
      const tokenAddress = await fractionTokenFactory.propertyToFractionToken(propertyId);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
      
      // Verify fractional token properties
      const fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);
      expect(await fractionalToken.propertyId()).to.equal(propertyId);
      expect(await fractionalToken.balanceOf(owner.address)).to.equal(totalSupply);
    });

    it("Should handle multiple properties with their fractional tokens", async function () {
      // Mint multiple property NFTs
      await propertyNFT.mintProperty(addr1.address, "uri1");
      await propertyNFT.mintProperty(addr2.address, "uri2");
      
      const totalSupply = ethers.parseEther("1000");
      
      // Create fractional tokens for each property
      await fractionTokenFactory.createFractionToken(0, "Property1", "PROP1", totalSupply);
      await fractionTokenFactory.createFractionToken(1, "Property2", "PROP2", totalSupply);
      
      // Verify both tokens exist and are different
      const token1Address = await fractionTokenFactory.propertyToFractionToken(0);
      const token2Address = await fractionTokenFactory.propertyToFractionToken(1);
      
      expect(token1Address).to.not.equal(ethers.ZeroAddress);
      expect(token2Address).to.not.equal(ethers.ZeroAddress);
      expect(token1Address).to.not.equal(token2Address);
      
      // Verify token properties
      const token1 = await ethers.getContractAt("FractionalToken", token1Address);
      const token2 = await ethers.getContractAt("FractionalToken", token2Address);
      
      expect(await token1.propertyId()).to.equal(0);
      expect(await token2.propertyId()).to.equal(1);
      expect(await token1.symbol()).to.equal("PROP1");
      expect(await token2.symbol()).to.equal("PROP2");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero supply tokens", async function () {
      await fractionTokenFactory.createFractionToken(1, "ZeroToken", "ZERO", 0);
      
      const tokenAddress = await fractionTokenFactory.propertyToFractionToken(1);
      const fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);
      
      expect(await fractionalToken.totalSupply()).to.equal(0);
      expect(await fractionalToken.balanceOf(owner.address)).to.equal(0);
    });

    it("Should handle very large supply tokens", async function () {
      const largeSupply = ethers.parseEther("1000000000"); // 1 billion tokens
      
      await fractionTokenFactory.createFractionToken(1, "LargeToken", "LARGE", largeSupply);
      
      const tokenAddress = await fractionTokenFactory.propertyToFractionToken(1);
      const fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);
      
      expect(await fractionalToken.totalSupply()).to.equal(largeSupply);
      expect(await fractionalToken.balanceOf(owner.address)).to.equal(largeSupply);
    });

    it("Should handle empty strings for token name and symbol", async function () {
      await fractionTokenFactory.createFractionToken(1, "", "", ethers.parseEther("100"));
      
      const tokenAddress = await fractionTokenFactory.propertyToFractionToken(1);
      const fractionalToken = await ethers.getContractAt("FractionalToken", tokenAddress);
      
      expect(await fractionalToken.name()).to.equal("");
      expect(await fractionalToken.symbol()).to.equal("");
    });
  });
});