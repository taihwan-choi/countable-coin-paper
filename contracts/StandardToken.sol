// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StandardToken
/// @notice Plain ERC-20 for gas-comparison baseline.
contract StandardToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("StandardToken", "STD") {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }
}
