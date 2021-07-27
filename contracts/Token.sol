// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20{

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function loadMore() public{
        _mint(msg.sender,1000e18);
    }

    function burn(address owner) public{
        _burn(owner,balanceOf(owner));
    }
}