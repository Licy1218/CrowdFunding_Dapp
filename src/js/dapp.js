import { ethers } from "./ethers.min.js";

const DApp = {
    web3Provider: null,
    readProvider: null,
    contract: null,
    readContract: null,
    account: null,
    projectsCache: [],
    participationFilter: "all",
    selectedProjectId: null,

    init: async function () {
        DApp.setDefaultDeadline();
        await DApp.initWeb3();
        DApp.bindEvents();
        await DApp.refreshProjects();
    },

    initWeb3: async function () {
        DApp.readProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

        if (window.ethereum) {
            DApp.web3Provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            DApp.account = accounts[0];

            window.ethereum.on("accountsChanged", async accounts => {
                DApp.account = accounts[0] || null;
                DApp.updateAccountBadge();
                await DApp.refreshProjects();
            });
        } else {
            DApp.web3Provider = new ethers.JsonRpcProvider("http://localhost:8545");
            const signer = await DApp.web3Provider.getSigner();
            DApp.account = await signer.getAddress();
        }

        await DApp.initContract();
        DApp.updateAccountBadge();
    },

    initContract: async function () {
        const chainId = await DApp.readProvider.getNetwork().then(network => network.chainId);
        const artifactResponse = await fetch("../artifacts/contracts/Adoption.sol/Adoption.json");
        const addressResponse = await fetch(`../ignition/deployments/chain-${chainId}/deployed_addresses.json`);
        const artifact = await artifactResponse.json();
        const addresses = await addressResponse.json();
        const address = addresses["AdoptionModule#Adoption"];
        const signer = await DApp.web3Provider.getSigner();

        DApp.contract = new ethers.Contract(address, artifact.abi, signer);
        DApp.readContract = new ethers.Contract(address, artifact.abi, DApp.readProvider);
    },

    bindEvents: function () {
        document.getElementById("projectForm").addEventListener("submit", DApp.handleCreateProject);
        document.getElementById("projectsList").addEventListener("submit", DApp.handleProjectSubmit);
        document.getElementById("projectsList").addEventListener("click", DApp.handleProjectAction);
        document.getElementById("myParticipation").addEventListener("click", DApp.handleParticipationClick);
        document.getElementById("refreshProjects").addEventListener("click", DApp.refreshProjects);
        document.getElementById("categoryFilter").addEventListener("change", DApp.renderCachedProjects);
        document.getElementById("statusFilter").addEventListener("change", DApp.renderCachedProjects);
        document.getElementById("clearParticipationFilter").addEventListener("click", DApp.clearParticipationFilter);
    },

    setDefaultDeadline: function () {
        const deadlineInput = document.getElementById("projectDeadline");
        const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());
        deadlineInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        deadlineInput.value = defaultDate.toISOString().slice(0, 16);
    },

    updateAccountBadge: function () {
        const accountBadge = document.getElementById("accountBadge");
        accountBadge.textContent = DApp.account
            ? `${DApp.account.slice(0, 6)}...${DApp.account.slice(-4)}`
            : "未连接钱包";
    },

    handleCreateProject: async function (event) {
        event.preventDefault();
        DApp.setStatus("正在创建项目...");

        const name = document.getElementById("projectName").value.trim();
        const description = document.getElementById("projectDescription").value.trim();
        const category = document.getElementById("projectCategory").value;
        const goal = document.getElementById("projectGoal").value;
        const deadlineValue = document.getElementById("projectDeadline").value;
        const deadline = Math.floor(new Date(deadlineValue).getTime() / 1000);

        try {
            await DApp.prepareWalletTransaction();
            const tx = await DApp.withTimeout(
                DApp.contract.createProject(
                    name,
                    description,
                    category,
                    ethers.parseEther(goal),
                    deadline
                ),
                "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
            );
            await tx.wait();

            event.target.reset();
            DApp.setDefaultDeadline();
            await DApp.refreshProjects();
            DApp.setStatus("项目创建成功。", "success");
        } catch (err) {
            DApp.setStatus(DApp.getErrorMessage(err), "danger");
        }
    },

    handleProjectSubmit: async function (event) {
        if (!event.target.classList.contains("donation-form") && !event.target.classList.contains("update-form")) {
            return;
        }

        event.preventDefault();
        const projectId = event.target.dataset.projectId;

        if (event.target.classList.contains("donation-form")) {
            await DApp.submitDonation(event.target, projectId);
        } else {
            await DApp.submitProjectUpdate(event.target, projectId);
        }
    },

    submitDonation: async function (form, projectId) {
        const amountInput = form.querySelector(".donation-amount");

        try {
            DApp.setStatus("正在提交捐赠...");
            await DApp.prepareWalletTransaction();
            const tx = await DApp.withTimeout(
                DApp.contract.donate(projectId, {
                    value: ethers.parseEther(amountInput.value)
                }),
                "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
            );
            await tx.wait();

            amountInput.value = "";
            await DApp.refreshProjects();
            DApp.setStatus("捐赠成功，感谢支持。", "success");
        } catch (err) {
            DApp.setStatus(DApp.getErrorMessage(err), "danger");
        }
    },

    submitProjectUpdate: async function (form, projectId) {
        const contentInput = form.querySelector(".update-content");

        try {
            DApp.setStatus("正在发布项目公告...");
            await DApp.prepareWalletTransaction();
            const tx = await DApp.withTimeout(
                DApp.contract.updateProject(projectId, contentInput.value.trim()),
                "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
            );
            await tx.wait();

            contentInput.value = "";
            await DApp.refreshProjects();
            DApp.setStatus("项目公告已发布。", "success");
        } catch (err) {
            DApp.setStatus(DApp.getErrorMessage(err), "danger");
        }
    },

    handleParticipationClick: async function (event) {
        const filterTarget = event.target.closest("[data-participation-filter]");
        if (filterTarget) {
            DApp.participationFilter = filterTarget.dataset.participationFilter;
            DApp.selectedProjectId = null;
            await DApp.renderCachedProjects();
            DApp.scrollToProjects();
            return;
        }

        const target = event.target.closest("[data-jump-project]");
        if (!target) {
            return;
        }

        DApp.participationFilter = "single";
        DApp.selectedProjectId = Number(target.dataset.jumpProject);
        document.getElementById("categoryFilter").value = "all";
        document.getElementById("statusFilter").value = "all";
        await DApp.renderCachedProjects();

        const card = document.getElementById(`project-${target.dataset.jumpProject}`);
        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "start" });
            card.classList.add("project-card--focus");
            setTimeout(() => card.classList.remove("project-card--focus"), 1400);
        }
    },

    clearParticipationFilter: async function () {
        DApp.participationFilter = "all";
        DApp.selectedProjectId = null;
        await DApp.renderCachedProjects();
    },

    handleProjectAction: async function (event) {
        const button = event.target.closest("[data-action]");
        if (!button) {
            return;
        }

        const projectId = button.dataset.projectId;
        const action = button.dataset.action;
        const labels = {
            end: "正在结束项目...",
            milestone: "正在释放里程碑资金...",
            withdraw: "正在提取资金...",
            refund: "正在申请退款..."
        };

        try {
            DApp.setStatus(labels[action]);
            await DApp.prepareWalletTransaction();
            let tx;

            if (action === "end") {
                tx = await DApp.withTimeout(
                    DApp.contract.endProject(projectId),
                    "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
                );
            } else if (action === "milestone") {
                tx = await DApp.withTimeout(
                    DApp.contract.releaseMilestoneFunds(projectId),
                    "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
                );
            } else if (action === "withdraw") {
                tx = await DApp.withTimeout(
                    DApp.contract.withdrawFunds(projectId),
                    "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
                );
            } else if (action === "refund") {
                tx = await DApp.withTimeout(
                    DApp.contract.claimRefund(projectId),
                    "MetaMask 未响应，请点击浏览器扩展图标查看是否有待确认交易。"
                );
            }

            await tx.wait();
            await DApp.refreshProjects();
            DApp.setStatus("链上操作已完成。", "success");
        } catch (err) {
            DApp.setStatus(DApp.getErrorMessage(err), "danger");
        }
    },

    refreshProjects: async function () {
        const list = document.getElementById("projectsList");
        list.innerHTML = '<div class="empty-state">正在读取链上项目...</div>';

        try {
            const count = Number(await DApp.withTimeout(
                DApp.readContract.projectCount(),
                "读取超时，请确认本地 Hardhat 节点仍在运行。"
            ));
            const projects = await Promise.all(
                Array.from({ length: count }, (_, i) => DApp.readContract.getProject(i))
            );
            DApp.projectsCache = projects;
            document.getElementById("projectCount").textContent = count;
            await DApp.renderMyParticipation(projects);

            if (count === 0) {
                DApp.updateProjectViewLabel(0);
                list.innerHTML = '<div class="empty-state">暂无项目，先创建一个众筹项目。</div>';
                return;
            }

            await DApp.renderCachedProjects();
        } catch (err) {
            list.innerHTML = '<div class="empty-state text-danger">读取项目失败，请确认合约已部署。</div>';
            DApp.setStatus(DApp.getErrorMessage(err), "danger");
        }
    },

    renderCachedProjects: async function () {
        const list = document.getElementById("projectsList");
        const category = document.getElementById("categoryFilter").value;
        const status = document.getElementById("statusFilter").value;
        const now = Math.floor(Date.now() / 1000);

        const filtered = [];
        for (const project of DApp.projectsCache) {
            const donation = DApp.account
                ? await DApp.readContract.donations(project.id, DApp.account)
                : 0n;
            const matchesCategory = category === "all" || project.category === category;
            const matchesStatus = status === "all" || DApp.getStatusKey(project, Number(project.deadline), now) === status;
            const matchesParticipation = DApp.matchesParticipationFilter(project, donation);
            if (matchesCategory && matchesStatus && matchesParticipation) {
                filtered.push(project);
            }
        }

        DApp.updateProjectViewLabel(filtered.length);

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state">没有符合筛选条件的项目。</div>';
            return;
        }

        const cards = await Promise.all(filtered.map(project => DApp.renderProject(project)));
        list.innerHTML = cards.join("");
    },

    matchesParticipationFilter: function (project, donation) {
        if (DApp.participationFilter === "all") {
            return true;
        }

        if (DApp.participationFilter === "single") {
            return Number(project.id) === DApp.selectedProjectId;
        }

        if (!DApp.account) {
            return false;
        }

        const isCreator = project.creator.toLowerCase() === DApp.account.toLowerCase();
        if (DApp.participationFilter === "created") {
            return isCreator;
        }

        if (DApp.participationFilter === "donated") {
            return donation > 0n;
        }

        if (DApp.participationFilter === "refundable") {
            return donation > 0n && project.ended && !project.successful;
        }

        return true;
    },

    updateProjectViewLabel: function (count) {
        const label = document.getElementById("projectViewLabel");
        const clearButton = document.getElementById("clearParticipationFilter");
        const labels = {
            all: "全部项目",
            created: "我发起的项目",
            donated: "我参与的项目",
            refundable: "可退款项目",
            single: "选中的项目"
        };

        label.textContent = `${labels[DApp.participationFilter] || "全部项目"} · ${count} 个`;
        clearButton.hidden = DApp.participationFilter === "all";
    },

    scrollToProjects: function () {
        document.getElementById("projectsList").scrollIntoView({ behavior: "smooth", block: "start" });
    },

    renderMyParticipation: async function (projects) {
        const panel = document.getElementById("myParticipation");
        if (!DApp.account) {
            panel.innerHTML = '<div class="empty-state compact">连接钱包后查看你的参与记录。</div>';
            return;
        }

        const records = await Promise.all(projects.map(async project => {
            const donation = await DApp.readContract.donations(project.id, DApp.account);
            return { project, donation };
        }));
        const created = records.filter(record => record.project.creator.toLowerCase() === DApp.account.toLowerCase());
        const donated = records.filter(record => record.donation > 0n);
        const refundable = donated.filter(record => record.project.ended && !record.project.successful);
        const history = [
            ...created.map(record => ({ ...record, label: "发起", value: DApp.escapeHtml(record.project.category) })),
            ...donated.map(record => ({ ...record, label: "捐赠", value: `${DApp.formatEth(record.donation)} ETH` })),
            ...refundable.map(record => ({ ...record, label: "可退款", value: `${DApp.formatEth(record.donation)} ETH` }))
        ]
            .sort((a, b) => Number(b.project.id) - Number(a.project.id))
            .slice(0, 3);

        panel.innerHTML = `
            <div class="participation-grid">
                <button type="button" ${created.length === 0 ? "disabled" : 'data-participation-filter="created"'}><strong>${created.length}</strong><span>我发起的项目</span></button>
                <button type="button" ${donated.length === 0 ? "disabled" : 'data-participation-filter="donated"'}><strong>${donated.length}</strong><span>我参与的项目</span></button>
                <button type="button" ${refundable.length === 0 ? "disabled" : 'data-participation-filter="refundable"'}><strong>${refundable.length}</strong><span>可退款项目</span></button>
            </div>
            <ul class="participation-list">
                ${history.length ? DApp.renderParticipationItems(history) : "<li><span>暂无参与记录</span></li>"}
            </ul>
        `;
    },

    renderParticipationItems: function (records) {
        return records.map(record => `
            <li>
                <button type="button" data-jump-project="${record.project.id}">
                    <span>${record.label} · #${record.project.id} ${DApp.escapeHtml(record.project.name)}</span>
                    <span>${record.value}</span>
                </button>
            </li>
        `).join("");
    },

    renderProject: async function (project) {
        const id = Number(project.id);
        const deadline = Number(project.deadline);
        const now = Math.floor(Date.now() / 1000);
        const goal = project.goalAmount;
        const pledged = project.pledgedAmount;
        const progress = goal === 0n ? 0 : Number((pledged * 100n) / goal);
        const cappedProgress = Math.min(progress, 100);
        const donors = await DApp.readContract.getDonors(id);
        const updates = await DApp.readContract.getProjectUpdates(id);
        const donorRows = await Promise.all(donors.map(async donor => {
            const [amount, reward] = await Promise.all([
                DApp.readContract.donations(id, donor),
                DApp.readContract.getDonorReward(id, donor)
            ]);
            const badge = Number(reward.points) > 0
                ? `<em>早鸟 #${reward.rank} · 勋章 ${reward.points}</em>`
                : "";
            return `<li><span>${DApp.shortAddress(donor)} ${badge}</span><span>${DApp.formatEth(amount)} ETH</span></li>`;
        }));
        const userDonation = DApp.account ? await DApp.readContract.donations(id, DApp.account) : 0n;
        const creatorBadgePoints = await DApp.readContract.supporterBadgePoints(project.creator);
        const canEnd = !project.ended && now >= deadline;
        const canDonate = !project.ended && now < deadline;
        const isCreator = DApp.account && project.creator.toLowerCase() === DApp.account.toLowerCase();
        const canReleaseMilestone = !project.ended && project.pledgedAmount >= project.goalAmount && !project.milestoneReleased && isCreator;
        const canWithdraw = project.ended && project.successful && !project.fundsClaimed && isCreator;
        const canRefund = project.ended && !project.successful && userDonation > 0n;
        const status = DApp.getProjectStatus(project, deadline, now, isCreator, userDonation);
        const updateRows = updates.map(update => `
            <li>
                <span>${DApp.escapeHtml(update.content)}</span>
                <time>${DApp.formatDate(Number(update.timestamp))}</time>
            </li>
        `);

        return `
            <article id="project-${id}" class="project-card">
                <div class="project-card__header">
                    <div>
                        <span class="project-id">#${id} · ${DApp.escapeHtml(project.category)}</span>
                        <h3>${DApp.escapeHtml(project.name)}</h3>
                        <p>${DApp.escapeHtml(project.description || "暂无描述")}</p>
                    </div>
                    <span class="status-pill ${status.className}">${status.text}</span>
                </div>

                <div class="metric-grid">
                    <div><strong>${DApp.formatEth(project.goalAmount)}</strong><span>目标 ETH</span></div>
                    <div><strong>${DApp.formatEth(project.pledgedAmount)}</strong><span>已筹 ETH</span></div>
                    <div><strong>${DApp.formatEth(project.releasedAmount)}</strong><span>已释放 ETH</span></div>
                    <div><strong>${DApp.getRemainingTime(deadline, now)}</strong><span>剩余时间</span></div>
                    <div><strong>${donors.length}</strong><span>捐赠者</span></div>
                </div>

                <div class="progress">
                    <div class="progress-bar" style="width: ${cappedProgress}%">${cappedProgress}%</div>
                </div>

                <dl class="project-meta">
                    <div><dt>发起人</dt><dd>${DApp.shortAddress(project.creator)}</dd></div>
                    <div><dt>发起人勋章</dt><dd>${DApp.getBadgeLabel(creatorBadgePoints)}</dd></div>
                    <div><dt>截止日期</dt><dd>${DApp.formatDate(deadline)}</dd></div>
                    <div><dt>你的捐赠</dt><dd>${DApp.formatEth(userDonation)} ETH</dd></div>
                </dl>

                <div class="project-actions">
                    ${canDonate ? `
                        <form class="donation-form" data-project-id="${id}">
                            <input class="form-control donation-amount" type="number" step="0.001" min="0.001" placeholder="捐赠 ETH" required>
                            <button class="btn btn-primary" type="submit">捐赠</button>
                        </form>
                    ` : ""}
                    ${canEnd ? `<button class="btn btn-warning" type="button" data-action="end" data-project-id="${id}">结束项目</button>` : ""}
                    ${canReleaseMilestone ? `<button class="btn btn-info" type="button" data-action="milestone" data-project-id="${id}">释放里程碑资金</button>` : ""}
                    ${canWithdraw ? `<button class="btn btn-success" type="button" data-action="withdraw" data-project-id="${id}">提取资金</button>` : ""}
                    ${canRefund ? `<button class="btn btn-outline-danger" type="button" data-action="refund" data-project-id="${id}">申请退款</button>` : ""}
                </div>

                <div class="project-updates">
                    <h4>项目公告</h4>
                    <ul>${updateRows.length ? updateRows.join("") : "<li><span>暂无公告</span></li>"}</ul>
                    ${isCreator ? `
                        <form class="update-form" data-project-id="${id}">
                            <label class="form-label" for="update-${id}">发布项目进展</label>
                            <div class="update-control">
                                <input id="update-${id}" class="form-control update-content" type="text" maxlength="120" placeholder="例如：第一批物资已采购" required>
                                <button class="btn btn-primary" type="submit">发布公告</button>
                            </div>
                        </form>
                    ` : ""}
                </div>

                <div class="donor-list">
                    <h4>捐赠者列表</h4>
                    <ul>${donorRows.length ? donorRows.join("") : "<li>暂无捐赠者</li>"}</ul>
                </div>
            </article>
        `;
    },

    getProjectStatus: function (project, deadline, now, isCreator = false, userDonation = 0n) {
        if (!project.ended && now < deadline) {
            if (project.pledgedAmount < project.goalAmount) {
                return { text: "未达标进行中", className: "status-active", key: "active" };
            }

            if (!project.milestoneReleased) {
                return { text: isCreator ? "已达标可释放" : "已达标进行中", className: "status-ready", key: "ready" };
            }

            return { text: "已释放里程碑", className: "status-released", key: "released" };
        }

        if (!project.ended) {
            return { text: "待结束", className: "status-pending", key: "pending" };
        }

        if (project.successful) {
            if (project.fundsClaimed) {
                return { text: "成功已提款", className: "status-success", key: "claimed" };
            }

            return { text: isCreator ? "成功待提款" : "成功待结算", className: "status-success", key: "success" };
        }

        return {
            text: userDonation > 0n ? "失败可退款" : "失败已结束",
            className: "status-failed",
            key: "failed"
        };
    },

    getStatusKey: function (project, deadline, now) {
        return DApp.getProjectStatus(project, deadline, now).key;
    },

    getRemainingTime: function (deadline, now) {
        const seconds = deadline - now;
        if (seconds <= 0) {
            return "已到期";
        }

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) {
            return `${days}天${hours}小时`;
        }

        if (hours > 0) {
            return `${hours}小时${minutes}分`;
        }

        return `${minutes}分钟`;
    },

    formatEth: function (value) {
        return Number(ethers.formatEther(value)).toFixed(4).replace(/\.?0+$/, "");
    },

    formatDate: function (timestamp) {
        return new Date(timestamp * 1000).toLocaleString();
    },

    getBadgeLabel: function (points) {
        const value = Number(points);
        if (value >= 300) {
            return `<span class="badge-label badge-gold">金牌早鸟 ${value}</span>`;
        }

        if (value >= 100) {
            return `<span class="badge-label badge-silver">早鸟支持者 ${value}</span>`;
        }

        if (value > 0) {
            return `<span class="badge-label badge-bronze">支持者 ${value}</span>`;
        }

        return '<span class="text-muted">暂无勋章</span>';
    },

    prepareWalletTransaction: async function () {
        if (!window.ethereum) {
            throw new Error("请先安装或启用 MetaMask。");
        }

        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== "0x7a69") {
            throw new Error("请在 MetaMask 中切换到 Hardhat Local 网络，Chain ID 应为 31337。");
        }

        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        DApp.account = accounts[0];
        DApp.updateAccountBadge();

        const signer = await DApp.web3Provider.getSigner();
        DApp.contract = DApp.contract.connect(signer);
    },

    shortAddress: function (address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    },

    setStatus: function (message, type = "info") {
        const status = document.getElementById("statusMessage");
        status.className = `alert alert-${type}`;
        status.textContent = message;
        status.hidden = false;
    },

    getErrorMessage: function (err) {
        return err?.reason || err?.shortMessage || err?.message || "操作失败";
    },

    withTimeout: function (promise, message, timeout = 10000) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(message)), timeout);
            })
        ]);
    },

    escapeHtml: function (value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

export { DApp };
