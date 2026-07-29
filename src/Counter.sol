// SPDX-License-Identifier: UNLICENSED
//Akıllı sözleşmelerimizi (Solidity kodlarını) yazacağımız yer. (İçinde örnek olarak Counter.sol vardır).
pragma solidity ^0.8.13;

contract Counter {
    uint256 public number;

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }
}
