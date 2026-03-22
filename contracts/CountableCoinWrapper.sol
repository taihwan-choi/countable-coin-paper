// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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
