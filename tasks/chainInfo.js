// 添加自定义任务，用于显示当前链的账户状态以及最新区块的信息
task("chain-info", "show balance and lastest block").setAction(async (args, hre) => {
    // 获取账户信息
    const accounts = await hre.ethers.getSigners();
    console.log("Available Accounts:");
    for (let i = 0; i < accounts.length; i++) {
        const balance = await hre.ethers.provider.getBalance(accounts[i].address);
        const balanceEth = hre.ethers.formatEther(balance);
        console.log(`${i}: ${accounts[i].address}: ${balanceEth} ETH`);
    }

    // 获取当前区块高度
    const blockNumber = await hre.ethers.provider.getBlockNumber();
    console.log(`Current Block Number: ${blockNumber}`);

    // 获取最新区块信息
    const lastestBlock = await hre.ethers.provider.getBlock(blockNumber);
    console.log('Lastest Block:');
    console.log(lastestBlock);
});

// 导出
module.exports = {};