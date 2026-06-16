# CrowdFunding DApp

一个基于 Hardhat、Solidity 和 Ethers.js 的区块链众筹系统。本次项目从经典 pet-shop DApp 示例改造而来，重点展示智能合约中的众筹项目创建、捐赠、到期结算、失败退款、里程碑释放和前端链上交互。

## 一、项目亮点

- 链上创建众筹项目，保存项目名称、描述、分类、目标金额和截止日期。
- 用户可以向进行中的项目捐赠 ETH，合约记录每个捐赠者地址和捐赠金额。
- 截止日期到达后，任何人都可以调用合约结束项目。
- 达到目标金额的项目由发起人提款；未达目标的项目允许捐赠者全额退款。
- 支持早鸟勋章机制，项目前 10 位不同捐赠者获得链上声誉积分。
- 支持里程碑释放，项目达标后发起人可提前释放部分资金，成功结束后再提取剩余资金。
- 支持项目分类筛选、项目公告、我的参与记录和更细的项目进度状态。

## 二、技术栈

- Solidity `0.8.28`
- Hardhat
- Hardhat Ignition
- Ethers.js
- Lite Server
- Bootstrap

## 三、目录结构

```text
contracts/                 Solidity 智能合约
  Crowdfunding.sol             众筹系统主合约
ignition/modules/          Hardhat Ignition 部署模块
  Crowdfunding.js
src/                       前端页面和脚本
  index.html
  js/dapp.js
test/                      合约测试
  Crowdfunding.js
tasks/                     Hardhat 自定义任务
```

## 四、核心功能

### （一）基础功能及众筹流程

1. 发起人创建项目。
2. 捐赠者选择项目并捐赠 ETH。
3. 合约记录项目已筹金额、捐赠者列表和每个地址的捐赠金额。
4. 项目到期后，任何人都可以结束项目。
5. 如果已筹金额达到目标，发起人可以提取资金。
6. 如果未达到目标，捐赠者可以取回自己的捐赠金额。

### （二）早鸟勋章

每个项目前 10 位不同捐赠者会获得链上声誉积分：

- 第 1 至第 3 位：100 分
- 第 4 至第 10 位：50 分

早鸟积分并不会参与资金计算，仅作为用户声誉标签展示。在用户之后发起项目时，页面会展示该发起人的累计勋章，有助于其他用户判断其活跃度和可信度。

### （三）里程碑资金释放

本项目采用不破坏退款逻辑的里程碑规则：

- 项目未达到目标金额前，不能释放资金。
- 项目达到或超过目标金额后，发起人可提前释放 50% 目标金额。
- 项目成功结束后，发起人提取剩余资金。
- 项目失败时不会发生提前释放，因此捐赠者仍可全额退款。

### （四）项目管理体验

- 项目分类：公益、校园、医疗、创意、其他。
- 项目公告：项目发起人可以发布链上项目进展公告。
- 我的参与记录：展示当前钱包发起、参与和可退款的项目数量；点击统计块可筛选项目列表。
- 项目进度状态：未达标进行中、已达标可释放、已释放里程碑、待结束、成功待提款、成功已提款、失败可退款。

## 五、本地运行

安装依赖：

```shell
npm install
```

运行测试：

```shell
npm test
```

启动本地 Hardhat 节点：

```shell
npm run node
```

该命令会把 Hardhat RPC 监听在 `0.0.0.0:8545`。如果是在服务器或虚拟机上运行项目，再从另一台电脑浏览器访问前端，需要确保服务器防火墙放行 `8545` 端口。

另开一个终端，部署合约：

```shell
npm run deploy:local
```

启动前端：

```shell
npm run dev
```

前端默认运行在：

```text
http://localhost:3000
```

如果使用 lite-server 输出的 External 地址访问，例如 `http://58.198.177.109:3000`，MetaMask 的 RPC URL 也要使用同一个主机地址。

## 六、MetaMask 配置

请在 MetaMask 中添加本地 Hardhat 网络：

```text
Network name: Hardhat Local
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency symbol: ETH
```

如果浏览器和 Hardhat 节点不在同一台机器上，请不要使用 `127.0.0.1`，改成服务器或虚拟机 IP：

```text
Network name: Hardhat Local
RPC URL: http://58.198.177.109:8545
Chain ID: 31337
Currency symbol: ETH
```

Hardhat 节点启动后会输出一组本地测试账户和私钥。可以把这些账户导入 MetaMask，用不同账号模拟发起人、捐赠者和退款用户。

## 七、演示建议

### （一）成功众筹

1. 使用 Account 1 创建目标为 `1 ETH` 的项目。
2. 切换 Account 2 捐赠 `0.4 ETH`。
3. 切换 Account 3 捐赠 `0.6 ETH`。
4. 项目达标后，切回 Account 1 释放里程碑资金。
5. 截止时间到达后，任意账号结束项目。
6. Account 1 提取剩余资金。

### (二）失败退款

1. 创建目标较高的项目，例如 `10 ETH`。
2. 使用捐赠者账号捐赠少量资金。
3. 截止时间到达后结束项目。
4. 捐赠者账号点击申请退款。

### （三）查询本地账户余额

确保 Hardhat 节点正在运行，然后执行：

```shell
node -e "const { ethers } = require('ethers'); const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545'); (async () => { const accounts = await provider.send('eth_accounts', []); for (const [i, account] of accounts.entries()) { const balance = await provider.getBalance(account); console.log(`Account #${i}: ${account}  ${ethers.formatEther(balance)} ETH`); } })();"
```

## 八、注意事项

- 本项目仅用于本地开发和课程实验演示，不建议直接部署到主网。
- Hardhat 本地链重启后链上数据会清空，需要重新部署合约并重新创建项目。
- `npm run deploy:local` 使用 `--reset`，会重置 Hardhat Ignition 本地部署记录。
- `.gitignore` 已排除 `node_modules/`、`artifacts/`、`cache/`、`ignition/deployments/` 和 `backups/` 等本地文件。
