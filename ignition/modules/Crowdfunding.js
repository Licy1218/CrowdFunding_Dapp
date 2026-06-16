// 这个配置使用 Hardhat Ignition 来管理智能合约的部署。
// 了解更多: https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("CrowdfundingModule", (m) => {
    const crowdfunding = m.contract("Crowdfunding");
    return { crowdfunding };
});