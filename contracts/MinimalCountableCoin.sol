// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MinimalCountableCoin
/// @notice Path C — Semantic-only CountableCoin.
///         Validates the 44-byte countable-data payload and emits an event.
///         No allowlist, no nonce, no EIP-712.
///
/// Payload layout (44 bytes):
///   [0: 4]  accountCode  – uint32, MUST be non-zero
///   [4: 8]  bookingDate  – uint32, YYYYMMDD, MUST be a valid calendar date
///   [8:12]  taxCode      – uint32, MUST be non-zero
///  [12:44]  documentHash – bytes32, MUST be non-zero
contract MinimalCountableCoin is ERC20 {
    uint256 private constant CD_BYTE_LENGTH = 44;

    event TransferWithCD(
        address indexed from,
        address indexed to,
        uint256         amount,
        uint32          accountCode,
        uint32          bookingDate,
        uint32          taxCode,
        bytes32         documentHash
    );

    error HardFail(string reason);

    constructor() ERC20("Minimal CountableCoin", "mCNC") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Transfer tokens and validate a 44-byte countable-data payload.
    function transferWithCD(
        address        to,
        uint256        amount,
        bytes calldata rawCD
    ) external returns (bool) {
        if (rawCD.length != CD_BYTE_LENGTH)
            revert HardFail("invalid payload length");

        uint32  accountCode  = uint32(bytes4(rawCD[ 0: 4]));
        uint32  bookingDate  = uint32(bytes4(rawCD[ 4: 8]));
        uint32  taxCode      = uint32(bytes4(rawCD[ 8:12]));
        bytes32 documentHash = bytes32(rawCD[12:44]);

        if (accountCode  == 0)          revert HardFail("accountCode missing");
        if (bookingDate  == 0)          revert HardFail("bookingDate missing");
        if (taxCode      == 0)          revert HardFail("taxCode missing");
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
        if (day < 1)                    return false;
        uint32 maxDay;
        if (month == 2) {
            bool isLeap = (year % 4 == 0) &&
                          ((year % 100 != 0) || (year % 400 == 0));
            maxDay = isLeap ? 29 : 28;
        } else if (month == 4 || month == 6 || month == 9 || month == 11) {
            maxDay = 30;
        } else {
            maxDay = 31;
        }
        return day <= maxDay;
    }
}
