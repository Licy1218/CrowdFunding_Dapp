const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Crowdfunding Contract", function () {
    async function deploymentFixture() {
        const [creator, donor1, donor2, other, ...extraDonors] = await ethers.getSigners();
        const Adoption = await ethers.getContractFactory("Adoption");
        const adoption = await Adoption.deploy();

        return { adoption, creator, donor1, donor2, other, extraDonors };
    }

    async function createProject(adoption, creator, goal = ethers.parseEther("1")) {
        const deadline = (await time.latest()) + 7 * 24 * 60 * 60;
        await adoption.connect(creator).createProject(
            "Campus Library",
            "Raise funds for new books",
            "校园",
            goal,
            deadline
        );

        return { projectId: 0, deadline };
    }

    describe("Project Creation", function () {
        it("stores project details and assigns a unique id", async function () {
            const { adoption, creator } = await loadFixture(deploymentFixture);
            const { deadline } = await createProject(adoption, creator);

            const project = await adoption.getProject(0);

            expect(project.id).to.equal(0);
            expect(project.name).to.equal("Campus Library");
            expect(project.description).to.equal("Raise funds for new books");
            expect(project.category).to.equal("校园");
            expect(project.goalAmount).to.equal(ethers.parseEther("1"));
            expect(project.deadline).to.equal(deadline);
            expect(project.creator).to.equal(creator.address);
            expect(await adoption.projectCount()).to.equal(1);
        });

        it("rejects invalid project settings", async function () {
            const { adoption } = await loadFixture(deploymentFixture);
            const deadline = (await time.latest()) + 3600;

            await expect(adoption.createProject("", "Description", "公益", 1, deadline))
                .to.be.revertedWith("Project name required");
            await expect(adoption.createProject("Name", "Description", "", 1, deadline))
                .to.be.revertedWith("Project category required");
            await expect(adoption.createProject("Name", "Description", "公益", 0, deadline))
                .to.be.revertedWith("Goal must be greater than zero");
            await expect(adoption.createProject("Name", "Description", "公益", 1, await time.latest()))
                .to.be.revertedWith("Deadline must be in the future");
        });

        it("lets the creator post project updates", async function () {
            const { adoption, creator, donor1 } = await loadFixture(deploymentFixture);
            await createProject(adoption, creator);

            await adoption.connect(creator).updateProject(0, "First batch of books purchased");
            const updates = await adoption.getProjectUpdates(0);

            expect(updates).to.have.lengthOf(1);
            expect(updates[0].author).to.equal(creator.address);
            expect(updates[0].content).to.equal("First batch of books purchased");

            await expect(adoption.connect(donor1).updateProject(0, "Fake update"))
                .to.be.revertedWith("Only creator can post");
        });
    });

    describe("Donations", function () {
        it("accepts donations and records donor addresses and amounts", async function () {
            const { adoption, creator, donor1, donor2 } = await loadFixture(deploymentFixture);
            await createProject(adoption, creator);

            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("0.4") });
            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("0.1") });
            await adoption.connect(donor2).donate(0, { value: ethers.parseEther("0.2") });

            const project = await adoption.getProject(0);
            const donors = await adoption.getDonors(0);

            expect(project.pledgedAmount).to.equal(ethers.parseEther("0.7"));
            expect(await adoption.donations(0, donor1.address)).to.equal(ethers.parseEther("0.5"));
            expect(await adoption.donations(0, donor2.address)).to.equal(ethers.parseEther("0.2"));
            expect(donors).to.deep.equal([donor1.address, donor2.address]);
        });

        it("awards badge points to the first ten unique donors", async function () {
            const { adoption, creator, donor1, donor2, extraDonors } = await loadFixture(deploymentFixture);
            await createProject(adoption, creator, ethers.parseEther("20"));

            const donors = [donor1, donor2, ...extraDonors.slice(0, 9)];
            for (const donor of donors) {
                await adoption.connect(donor).donate(0, { value: ethers.parseEther("0.1") });
            }

            expect(await adoption.earlyDonorRanks(0, donor1.address)).to.equal(1);
            expect(await adoption.earlyDonorPoints(0, donor1.address)).to.equal(100);
            expect(await adoption.supporterBadgePoints(donor1.address)).to.equal(100);
            expect(await adoption.earlyDonorRanks(0, extraDonors[0].address)).to.equal(3);
            expect(await adoption.earlyDonorPoints(0, extraDonors[0].address)).to.equal(100);
            expect(await adoption.earlyDonorRanks(0, extraDonors[7].address)).to.equal(10);
            expect(await adoption.earlyDonorPoints(0, extraDonors[7].address)).to.equal(50);
            expect(await adoption.earlyDonorRanks(0, extraDonors[8].address)).to.equal(0);
            expect(await adoption.supporterBadgePoints(extraDonors[8].address)).to.equal(0);
        });

        it("rejects donations after the deadline", async function () {
            const { adoption, creator, donor1 } = await loadFixture(deploymentFixture);
            const { deadline } = await createProject(adoption, creator);

            await time.increaseTo(deadline);

            await expect(adoption.connect(donor1).donate(0, { value: 1 }))
                .to.be.revertedWith("Project deadline reached");
        });
    });

    describe("Ending and Settlement", function () {
        it("allows anyone to end a project after the deadline", async function () {
            const { adoption, creator, donor1, other } = await loadFixture(deploymentFixture);
            const { deadline } = await createProject(adoption, creator);

            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("1") });
            await time.increaseTo(deadline);
            await adoption.connect(other).endProject(0);

            const project = await adoption.getProject(0);
            expect(project.ended).to.equal(true);
            expect(project.successful).to.equal(true);
        });

        it("lets the creator withdraw funds after a successful project", async function () {
            const { adoption, creator, donor1 } = await loadFixture(deploymentFixture);
            const { deadline } = await createProject(adoption, creator);

            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("1.2") });
            await time.increaseTo(deadline);
            await adoption.endProject(0);

            await expect(() => adoption.connect(creator).withdrawFunds(0))
                .to.changeEtherBalance(creator, ethers.parseEther("1.2"));

            const project = await adoption.getProject(0);
            expect(project.fundsClaimed).to.equal(true);
        });

        it("allows a creator to release milestone funds after reaching the goal", async function () {
            const { adoption, creator, donor1, donor2 } = await loadFixture(deploymentFixture);
            const { deadline } = await createProject(adoption, creator, ethers.parseEther("1"));

            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("1") });

            await expect(() => adoption.connect(creator).releaseMilestoneFunds(0))
                .to.changeEtherBalance(creator, ethers.parseEther("0.5"));

            let project = await adoption.getProject(0);
            expect(project.releasedAmount).to.equal(ethers.parseEther("0.5"));
            expect(project.milestoneReleased).to.equal(true);

            await adoption.connect(donor2).donate(0, { value: ethers.parseEther("0.3") });
            await time.increaseTo(deadline);
            await adoption.endProject(0);

            await expect(() => adoption.connect(creator).withdrawFunds(0))
                .to.changeEtherBalance(creator, ethers.parseEther("0.8"));

            project = await adoption.getProject(0);
            expect(project.fundsClaimed).to.equal(true);
        });

        it("does not release milestone funds before the goal is reached", async function () {
            const { adoption, creator, donor1 } = await loadFixture(deploymentFixture);
            await createProject(adoption, creator, ethers.parseEther("1"));

            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("0.4") });

            await expect(adoption.connect(creator).releaseMilestoneFunds(0))
                .to.be.revertedWith("Goal not reached");
        });

        it("lets donors claim refunds after a failed project", async function () {
            const { adoption, creator, donor1, donor2 } = await loadFixture(deploymentFixture);
            const { deadline } = await createProject(adoption, creator, ethers.parseEther("2"));

            await adoption.connect(donor1).donate(0, { value: ethers.parseEther("0.4") });
            await adoption.connect(donor2).donate(0, { value: ethers.parseEther("0.6") });
            await time.increaseTo(deadline);
            await adoption.endProject(0);

            await expect(() => adoption.connect(donor1).claimRefund(0))
                .to.changeEtherBalance(donor1, ethers.parseEther("0.4"));
            expect(await adoption.donations(0, donor1.address)).to.equal(0);
            expect(await adoption.donations(0, donor2.address)).to.equal(ethers.parseEther("0.6"));
        });
    });
});
