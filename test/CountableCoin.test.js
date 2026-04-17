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

  async function signTransferWithCD(from, to, value, rawCD, nonce, deadline) {
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
    return from.signTypedData(domain, types, {
      from: from.address,
      to,
      value,
      rawCD,
      nonce,
      deadline,
    });
  }

  describe("StandardToken", function () {
    it("Path A transfers normally through StandardToken", async function () {
      await expect(std.connect(alice).transfer(bob.address, amount)).to.changeTokenBalances(
        std, [alice, bob], [-amount, amount]
      );
    });
  });

  describe("CountableCoinWrapper", function () {
    it("Path B carries arbitrary CD without semantic validation", async function () {
      await expect(wrapper.connect(alice).transferWithCD(bob.address, amount, validCD)).to.changeTokenBalances(
        wrapper, [alice, bob], [-amount, amount]
      );
    });
  });

  describe("MinimalCountableCoin", function () {
    it("Path C accepts valid 44-byte semantic payload", async function () {
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, validCD)).to.changeTokenBalances(
        minimal, [alice, bob], [-amount, amount]
      );
    });

    it("Path C emits structured TransferWithCD event", async function () {
      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, validCD))
        .to.emit(minimal, "TransferWithCD")
        .withArgs(
          alice.address,
          bob.address,
          amount,
          1001,
          20250101,
          10,
          expectedHash
        );
    });

    it("Path C rejects invalid payload length", async function () {
      const invalidCD = ethers.randomBytes(32);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, invalidCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("invalid payload length");
    });

    it("Path C rejects missing accountCode", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("accountCode missing");
    });

    it("Path C rejects missing bookingDate", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("bookingDate missing");
    });

    it("Path C rejects missing taxCode", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(0), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("taxCode missing");
    });

    it("Path C rejects missing documentHash", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.zeroPadValue(ethers.toBeHex(0), 32),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("documentHash missing");
    });

    it("Path C rejects invalid booking date", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20251301), 4), // invalid month
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(minimal, "HardFail").withArgs("bookingDate invalid");
    });

    it("Path C accepts leap day for leap year", async function () {
      const leapCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20240229), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("leap")),
      ]);

      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, leapCD))
        .to.changeTokenBalances(minimal, [alice, bob], [-amount, amount]);
    });

    it("Path C rejects Feb 29 on non-leap year", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20230229), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("bad")),
      ]);

      await expect(minimal.connect(alice).transferWithCD(bob.address, amount, badCD))
        .to.be.revertedWithCustomError(minimal, "HardFail")
        .withArgs("bookingDate invalid");
    });
  });

  describe("CountableCoin", function () {
    it("Path D accepts allowlisted sender and allowed codes", async function () {
      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, validCD)).to.changeTokenBalances(
        cnc, [alice, bob], [-amount, amount]
      );
    });

    it("Path D emits structured TransferWithCD event", async function () {
      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, validCD))
        .to.emit(cnc, "TransferWithCD")
        .withArgs(
          alice.address,
          bob.address,
          amount,
          1001,
          20250101,
          10,
          expectedHash
        );
    });

    it("Path D rejects disallowed sender", async function () {
      await expect(cnc.connect(bob).transferWithCD(alice.address, amount, validCD)).to.be.revertedWithCustomError(cnc, "NotAllowlisted").withArgs(bob.address);
    });

    it("Path D rejects disallowed account code", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(9999), 4), // disallowed
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(10), 4),
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(cnc, "AccountCodeNotAllowed");
    });

    it("Path D rejects disallowed tax code", async function () {
      const badCD = ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(1001), 4),
        ethers.zeroPadValue(ethers.toBeHex(20250101), 4),
        ethers.zeroPadValue(ethers.toBeHex(99), 4), // disallowed
        ethers.keccak256(ethers.toUtf8Bytes("test")),
      ]);
      await expect(cnc.connect(alice).transferWithCD(bob.address, amount, badCD)).to.be.revertedWithCustomError(cnc, "TaxCodeNotAllowed");
    });

    it("Path E accepts valid signed execution", async function () {
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

    it("Path E increments nonce after signed execution", async function () {
      const nonceBefore = await cnc.nonces(alice.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await signTransferWithCD(
        alice,
        bob.address,
        amount,
        validCD,
        nonceBefore,
        deadline
      );

      await cnc.connect(deployer).transferWithCDSigned(
        alice.address,
        bob.address,
        amount,
        validCD,
        deadline,
        sig
      );

      expect(await cnc.nonces(alice.address)).to.equal(nonceBefore + 1n);
    });

    it("Path E rejects unauthorized signer", async function () {
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

    it("Path E rejects expired signed execution", async function () {
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

    it("Path D rejects wrong payload length before policy checks", async function () {
      const shortCD = ethers.randomBytes(32);
      await expect(
        cnc.connect(alice).transferWithCD(bob.address, amount, shortCD)
      ).to.be.revertedWithCustomError(cnc, "InvalidPayloadLength");
    });

    it("Path D rejects zero accountCode via semantic validation", async function () {
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

    it("Path D rejects invalid booking date via semantic validation", async function () {
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

    it("Path E rejects semantically invalid signed payload", async function () {
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

    it("Path E rejects replayed nonce", async function () {
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
