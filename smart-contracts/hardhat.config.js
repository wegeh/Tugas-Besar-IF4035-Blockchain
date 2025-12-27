require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",

  networks: {
    // Local Hardhat node (buat compile/deploy + FE dev)
    localhost: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      chainId: Number(process.env.CHAIN_ID || "1515"),
      accounts: "remote", // Use unlocked node accounts
    },

    // Private PoA network (isi nanti kalau RPC sudah ada)
    // poa: {
    //   url: process.env.POA_RPC_URL,
    //   accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    //   chainId: Number(process.env.POA_CHAIN_ID || "0"),
    // },
  },
};
