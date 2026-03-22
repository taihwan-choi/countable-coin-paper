// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ── Path D/E: Full CountableCoin (allowlist + EIP-712) ────────────────────────
contract CountableCoin is ERC20 {

    uint256 public constant RAW_CD_SIZE = 44;

    bytes32 public constant TRANSFER_CD_TYPEHASH = keccak256(
        "TransferWithCD(address from,address to,uint256 value,bytes rawCD,uint256 nonce,uint256 deadline)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    address public owner;
    mapping(address => uint256) public nonces;
    mapping(address => bool)    public allowlist;

    event TransferWithCD(
        address indexed from,
        address indexed to,
        uint256         value,
        bytes           rawCD
    );
    event AllowlistUpdated(address indexed account, bool allowed);

    error OnlyOwner();
    error NotAllowlisted(address sender);
    error BadRawCDSize(uint256 got, uint256 expected);
    error DeadlineExpired(uint256 deadline, uint256 now_);
    error InvalidSignature();

    constructor(uint256 initialSupply) ERC20("CountableCoin", "CNC") {
        owner = msg.sender;
        _mint(msg.sender, initialSupply * 10 ** decimals());

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
            ),
            keccak256(bytes(name())),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));

        allowlist[msg.sender] = true;
        emit AllowlistUpdated(msg.sender, true);
    }

    function setAllowlist(address account, bool allowed) external {
        if (msg.sender != owner) revert OnlyOwner();
        allowlist[account] = allowed;
        emit AllowlistUpdated(account, allowed);
    }

    function transferWithCD(
        address to,
        uint256 value,
        bytes calldata rawCD
    ) external returns (bool) {
        if (!allowlist[msg.sender])       revert NotAllowlisted(msg.sender);
        if (rawCD.length != RAW_CD_SIZE)  revert BadRawCDSize(rawCD.length, RAW_CD_SIZE);

        _transfer(msg.sender, to, value);
        emit TransferWithCD(msg.sender, to, value, rawCD);
        return true;
    }

    function transferWithCDSigned(
        address        from,
        address        to,
        uint256        value,
        bytes calldata rawCD,
        uint256        deadline,
        bytes calldata sig
    ) external returns (bool) {
        if (rawCD.length != RAW_CD_SIZE)          revert BadRawCDSize(rawCD.length, RAW_CD_SIZE);
        if (block.timestamp > deadline)            revert DeadlineExpired(deadline, block.timestamp);
        if (!allowlist[from])                      revert NotAllowlisted(from);

        uint256 nonce = nonces[from]++;

        bytes32 structHash = keccak256(abi.encode(
            TRANSFER_CD_TYPEHASH,
            from,
            to,
            value,
            keccak256(rawCD),
            nonce,
            deadline
        ));

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address signer = _recoverSigner(digest, sig);
        if (signer != from) revert InvalidSignature();

        _transfer(from, to, value);
        emit TransferWithCD(from, to, value, rawCD);
        return true;
    }

    function _recoverSigner(
        bytes32        digest,
        bytes calldata sig
    ) internal pure returns (address) {
        require(sig.length == 65, "CountableCoin: bad sig length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}

// ── Path B: Wrapper-only ──────────────────────────────────────────────────────
contract CountableCoinWrapper is ERC20 {
    constructor() ERC20("Countable USD Wrapper", "cUSDw") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function transferWithCD(
        address to,
        uint256 amount,
        bytes calldata
    ) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }
}

// ── Path C: Minimal Semantic ──────────────────────────────────────────────────
contract CountableCoinMinimal is ERC20 {
    uint256 private constant CD_BYTE_LENGTH = 44;

    event TransferWithCD(
        address indexed from, address indexed to,
        uint256 amount, uint32 accountCode,
        uint32 bookingDate, uint32 taxCode,
        bytes32 documentHash
    );
    error HardFail(string reason);

    constructor() ERC20("Countable USD Minimal", "cUSDm") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function transferWithCD(
        address to, uint256 amount, bytes calldata rawCD
    ) external returns (bool) {
        if (rawCD.length != CD_BYTE_LENGTH)
            revert HardFail("invalid payload length");
        uint32  accountCode  = uint32(bytes4(rawCD[ 0: 4]));
        uint32  bookingDate  = uint32(bytes4(rawCD[ 4: 8]));
        uint32  taxCode      = uint32(bytes4(rawCD[ 8:12]));
        bytes32 documentHash = bytes32(rawCD[12:44]);
        if (accountCode  == 0) revert HardFail("accountCode missing");
        if (bookingDate  == 0) revert HardFail("bookingDate missing");
        if (taxCode      == 0) revert HardFail("taxCode missing");
        if (documentHash == bytes32(0)) revert HardFail("documentHash missing");
        if (!_isValidDate(bookingDate)) revert HardFail("bookingDate invalid");
        _transfer(msg.sender, to, amount);
        emit TransferWithCD(msg.sender, to, amount,
            accountCode, bookingDate, taxCode, documentHash);
        return true;
    }

    function _isValidDate(uint32 date) internal pure returns (bool) {
        uint32 year  = date / 10000;
        uint32 month = (date / 100) % 100;
        uint32 day   = date % 100;
        if (year < 2000 || year > 2100) return false;
        if (month < 1   || month > 12)  return false;
        if (day < 1) return false;
        uint32 maxDay;
        if (month == 2) {
            bool isLeap = (year % 4 == 0) &&
                ((year % 100 != 0) || (year % 400 == 0));
            maxDay = isLeap ? 29 : 28;
        } else if (month==4||month==6||month==9||month==11) {
            maxDay = 30;
        } else { maxDay = 31; }
        return day <= maxDay;
    }
}
