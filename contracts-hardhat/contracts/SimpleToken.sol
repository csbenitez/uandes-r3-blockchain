// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Token ERC-20 de práctica: agrégalo a Metamask con su dirección para verlo.
contract SimpleToken is ERC20 {
    constructor(address holder) ERC20("Taller Token", "TLR") {
        _mint(holder, 1_000_000 ether);
    }
}
