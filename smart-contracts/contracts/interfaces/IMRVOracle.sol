// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMRVOracle {
    function getVerifiedEmission(uint32 period, address user) external view returns (uint256);
}
