// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract TRWToken is ERC20, ERC20Detailed{

    constructor() ERC20Detailed("TrendWager","TRW",18) public{
        _mint(msg.sender,10000000);
    }
}