require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",

  networks: {
    // Local Hardhat node (buat compile/deploy + FE dev)
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Private PoA network (isi nanti kalau RPC sudah ada)
    // poa: {
    //   url: process.env.POA_RPC_URL,
    //   accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    //   chainId: Number(process.env.POA_CHAIN_ID || "0"),
    // },
  },
};
