const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CountableCoin Contracts", function () {
  let deployer, alice, bob;
  let std, wrapper, minimal, cnc;
  const initialSupply = ethers.parseUnits("1000000", 18);
  const amount = ethers.parseUnits("100", 18);

  // Valid 44-byte CD payload
  const validCD = ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(1001), 4), // accountCode
    ethers.zeroPadValue(ethers.toBeHex(20250101), 4), // bookingDate
    ethers.zeroPadValue(ethers.toBeHex(10), 4), // taxCode
    ethers.keccak256(ethers.toUtf8Bytes("test")), // documentHash
  ]);

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();

    const StandardToken = await ethers.getContractFactory("StandardToken");
    std = await StandardToken.deploy(initialSupply);
    await std.waitForDeployment();

    const CountableCoinWrapper = await ethers.getContractFactory("CountableCoinWrapper");
    wrapper = await CountableCoinWrapper.deploy();
    await wrapper.waitForDeployment();

    const MinimalCountableCoin = await ethers.getContractFactory("MinimalCountableCoin");
    minimal = await MinimalCountableCoin.deploy();
    await minimal.waitForDeployment();

    const CountableCoin = await ethers.getContractFactory("CountableCoin");
    cnc = await CountableCoin.deploy(initialSupply);
    await cnc.waitForDeployment();

    // Fund alice
    await std.connect(deployer).transfer(alice.address, amount);
    await wrapper.connect(deployer).transfer(alice.address, amount);
    await minimal.connect(deployer).transfer(alice.address, amount);
    await cnc.connect(deployer).transfer(alice.address, amount);

    // Setup CNC controls
    await cnc.connect(deployer).setAllowlist(alice.address, true);
    await cnc.connect(deployer).setAllowedAccountCode(1001, true);
    await cnc.connect(deployer).setAllowedTaxCode(10, true);
    await cnc.connect(deployer).setAuthorizedSigner(alice.address, true);
  });

  describe("StandardToken", function () {
    it("should transfer normally", async function () {
      await expect(std.connect(alice).transfer(bob.address, amount)).to.changeTokenBalances(
        std, [alice, bob], [-amount, amount]
      );
    });
  });

  describe("CountableCoinWrapper", function () {
    it("should transfer with any CD", async function () {
      await expect(wrapper.connect(alice).transferWithCD(bob.address, amount, validCD)).to.changeTokenBalances(
        wrapper, [alice, bob], [-amount, amount]
      );
    });
  });

  describe("MinimalCountableCoin", function () {
    it("should succeed with valid 44-byte payload", async function () {
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, validCD)).to.changeTokenBalances(
        minimal, [alice, bob], [-amount, amount]
      );
    });

    it("should fail with invalid length", async function () {
      const invalidCD = ethers.randomBytes(32);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, invalidCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("invalid payload length");
    });

    it("should fail with missing accountCode", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("accountCode missing");
    });

    it("should fail with missing bookingDate", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("bookingDate missing");
    });

    it("should fail with missing taxCode", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("taxCode missing");
    });

    it("should fail with missing documentHash", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.zeroPadValue(ethers.toBeHex(0), 32),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("documentHash missing");
    });

    it("should fail with invalid date", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20251301), 4), // invalid month
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("bookingDate invalid");
    });
  });

  describe("CountableCoin", function () {
    it("should succeed with allowlisted sender and allowed codes", async function () {
      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, validCD)).to.changeTokenBalances(
        cnc, [alice, bob], [-amount, amount]
      );
    });

    it("should fail with disallowed sender", async function () {
      await expect(cnc.connect(bob).transferWithCD(alice.address, amount, validCD)).to.be.revertedWithCustomError(cnc, "NotAllowlisted").withArgs(bob.address);
    });

    it("should fail with disallowed accountCode", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(9999), 4), // disallowed
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(cnc, "AccountCodeNotAllowed");
    });

    it("should fail with disallowed taxCode", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(99), 4), // disallowed
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(cnc, "TaxCodeNotAllowed");
    });

    it("should succeed with valid signed transfer", async function () {
      const nonce = await cnc.nonces(alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: "CountableCoin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await cnc.getAddress(),
      };
      const types = {
        TransferWithCD: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "rawCD", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await alice.signTypedData(domain, types, {
        from: alice.address,
        to: bob.address,
        value: amount,
        rawCD: validCD,
        nonce,
        deadline,
      });
      await expect(cnc.connect(deployer).transferWithCDSigned(alice.address, bob.address, amount, validCD, deadline, sig)).to.changeTokenBalances(
        cnc, [alice, bob], [-amount, amount]
      );
    });

    it("should fail with unauthorized signer", async function () {
      const nonce = await cnc.nonces(alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: "CountableCoin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await cnc.getAddress(),
      };
      const types = {
        TransferWithCD: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "rawCD", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await bob.signTypedData(domain, types, { // bob is not authorized
        from: alice.address,
        to: bob.address,
        value: amount,
        rawCD: validCD,
        nonce,
        deadline,
      });
      await expect(cnc.connect(deployer).transferWithCDSigned(alice.address, bob.address, amount, validCD, deadline, sig)).to.be.revertedWithCustomError(cnc, "InvalidSignature");
    });

    it("should fail with expired deadline", async function () {
      const nonce = await cnc.nonces(alice.address);
      const deadline = Math.floor(Date.now() / 1000) - 1;
      const domain = {
        name: "CountableCoin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await cnc.getAddress(),
      };
      const types = {
        TransferWithCD: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "rawCD", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await alice.signTypedData(domain, types, {
        from: alice.address,
        to: bob.address,
        value: amount,
        rawCD: validCD,
        nonce,
        deadline,
      });
      await expect(cnc.connect(deployer).transferWithCDSigned(alice.address, bob.address, amount, validCD, deadline, sig)).to.be.revertedWithCustomError(cnc, "DeadlineExpired");
    });

    it("should reject payload with wrong length before any policy check (enterprise path enforces semantic validation)", async function () {
      const shortCD = ethers.randomBytes(32);
      await expect(
        cnc.connect(alice).transferWithCD(bob.address, amount, shortCD)
      ).to.be.revertedWithCustomError(cnc, "InvalidPayloadLength");
    });

    it("should reject zero accountCode via semantic validation, not policy check (enterprise path)", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(
        cnc.connect(alice).transferWithCD(bob.address, amount, badCD)
      ).to.be.revertedWithCustomError(cnc, "AccountCodeMissing");
    });

    it("should reject invalid booking date via semantic validation in enterprise path", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20251301), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(
        cnc.connect(alice).transferWithCD(bob.address, amount, badCD)
      ).to.be.revertedWithCustomError(cnc, "BookingDateInvalid");
    });

    it("should reject signed transfer carrying a semantically invalid payload", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20251301), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      const nonce = await cnc.nonces(alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: "CountableCoin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await cnc.getAddress(),
      };
      const types = {
        TransferWithCD: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "rawCD", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await alice.signTypedData(domain, types, {
        from: alice.address,
        to: bob.address,
        value: amount,
        rawCD: badCD,
        nonce,
        deadline,
      });
      await expect(
        cnc.connect(deployer).transferWithCDSigned(alice.address, bob.address, amount, badCD, deadline, sig)
      ).to.be.revertedWithCustomError(cnc, "BookingDateInvalid");
    });

    it("should fail with replayed nonce", async function () {
      const nonce = await cnc.nonces(alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: "CountableCoin",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await cnc.getAddress(),
      };
      const types = {
        TransferWithCD: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "rawCD", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const sig = await alice.signTypedData(domain, types, {
        from: alice.address,
        to: bob.address,
        value: amount,
        rawCD: validCD,
        nonce,
        deadline,
      });
      // First call succeeds
      await cnc.connect(deployer).transferWithCDSigned(alice.address, bob.address, amount, validCD, deadline, sig);
      // Second call fails
      await expect(cnc.connect(deployer).transferWithCDSigned(alice.address, bob.address, amount, validCD, deadline, sig)).to.be.revertedWithCustomError(cnc, "InvalidSignature");
    });
  });
});