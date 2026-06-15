// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Adoption {
    uint256 private constant EARLY_DONOR_LIMIT = 10;
    uint256 private constant TOP_DONOR_POINTS = 100;
    uint256 private constant EARLY_DONOR_POINTS = 50;
    uint256 private constant MILESTONE_RELEASE_PERCENT = 50;

    struct Project {
        uint256 id;
        string name;
        string description;
        string category;
        uint256 goalAmount;
        uint256 deadline;
        uint256 pledgedAmount;
        uint256 releasedAmount;
        address payable creator;
        bool ended;
        bool successful;
        bool fundsClaimed;
        bool milestoneReleased;
    }

    struct ProjectUpdate {
        address author;
        string content;
        uint256 timestamp;
    }

    uint256 public projectCount;

    mapping(uint256 => Project) private projects;
    mapping(uint256 => ProjectUpdate[]) private projectUpdates;
    mapping(uint256 => address[]) private projectDonors;
    mapping(uint256 => mapping(address => uint256)) public donations;
    mapping(uint256 => mapping(address => uint256)) public earlyDonorRanks;
    mapping(uint256 => mapping(address => uint256)) public earlyDonorPoints;
    mapping(address => uint256) public supporterBadgePoints;
    mapping(uint256 => mapping(address => bool)) private hasDonated;

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed creator,
        string name,
        string category,
        uint256 goalAmount,
        uint256 deadline
    );
    event ProjectUpdated(uint256 indexed projectId, address indexed author, string content);
    event DonationReceived(uint256 indexed projectId, address indexed donor, uint256 amount);
    event EarlyDonorRewarded(uint256 indexed projectId, address indexed donor, uint256 rank, uint256 points);
    event MilestoneFundsReleased(uint256 indexed projectId, address indexed creator, uint256 amount);
    event ProjectEnded(uint256 indexed projectId, bool successful, uint256 pledgedAmount);
    event FundsWithdrawn(uint256 indexed projectId, address indexed creator, uint256 amount);
    event RefundClaimed(uint256 indexed projectId, address indexed donor, uint256 amount);

    function createProject(
        string calldata name,
        string calldata description,
        string calldata category,
        uint256 goalAmount,
        uint256 deadline
    ) external returns (uint256) {
        require(bytes(name).length > 0, "Project name required");
        require(bytes(category).length > 0, "Project category required");
        require(goalAmount > 0, "Goal must be greater than zero");
        require(deadline > block.timestamp, "Deadline must be in the future");

        uint256 projectId = projectCount;
        projects[projectId] = Project({
            id: projectId,
            name: name,
            description: description,
            category: category,
            goalAmount: goalAmount,
            deadline: deadline,
            pledgedAmount: 0,
            releasedAmount: 0,
            creator: payable(msg.sender),
            ended: false,
            successful: false,
            fundsClaimed: false,
            milestoneReleased: false
        });
        projectCount++;

        emit ProjectCreated(projectId, msg.sender, name, category, goalAmount, deadline);
        return projectId;
    }

    function donate(uint256 projectId) external payable {
        Project storage project = projects[projectId];

        require(projectId < projectCount, "Project does not exist");
        require(!project.ended, "Project already ended");
        require(block.timestamp < project.deadline, "Project deadline reached");
        require(msg.value > 0, "Donation must be greater than zero");

        if (!hasDonated[projectId][msg.sender]) {
            hasDonated[projectId][msg.sender] = true;
            projectDonors[projectId].push(msg.sender);
            _awardEarlyDonorBadge(projectId, msg.sender, projectDonors[projectId].length);
        }

        donations[projectId][msg.sender] += msg.value;
        project.pledgedAmount += msg.value;

        emit DonationReceived(projectId, msg.sender, msg.value);
    }

    function releaseMilestoneFunds(uint256 projectId) external {
        Project storage project = projects[projectId];

        require(projectId < projectCount, "Project does not exist");
        require(!project.ended, "Project already ended");
        require(msg.sender == project.creator, "Only creator can release");
        require(project.pledgedAmount >= project.goalAmount, "Goal not reached");
        require(!project.milestoneReleased, "Milestone already released");

        uint256 amount = (project.goalAmount * MILESTONE_RELEASE_PERCENT) / 100;
        project.releasedAmount = amount;
        project.milestoneReleased = true;

        (bool sent, ) = project.creator.call{value: amount}("");
        require(sent, "Milestone transfer failed");

        emit MilestoneFundsReleased(projectId, msg.sender, amount);
    }

    function updateProject(uint256 projectId, string calldata content) external {
        Project storage project = projects[projectId];

        require(projectId < projectCount, "Project does not exist");
        require(msg.sender == project.creator, "Only creator can post");
        require(bytes(content).length > 0, "Update content required");

        projectUpdates[projectId].push(ProjectUpdate({
            author: msg.sender,
            content: content,
            timestamp: block.timestamp
        }));

        emit ProjectUpdated(projectId, msg.sender, content);
    }

    function endProject(uint256 projectId) external {
        Project storage project = projects[projectId];

        require(projectId < projectCount, "Project does not exist");
        require(!project.ended, "Project already ended");
        require(block.timestamp >= project.deadline, "Project deadline not reached");

        project.ended = true;
        project.successful = project.pledgedAmount >= project.goalAmount;

        emit ProjectEnded(projectId, project.successful, project.pledgedAmount);
    }

    function withdrawFunds(uint256 projectId) external {
        Project storage project = projects[projectId];

        require(projectId < projectCount, "Project does not exist");
        require(project.ended, "Project not ended");
        require(project.successful, "Project did not reach goal");
        require(msg.sender == project.creator, "Only creator can withdraw");
        require(!project.fundsClaimed, "Funds already withdrawn");

        uint256 amount = project.pledgedAmount - project.releasedAmount;
        project.fundsClaimed = true;

        (bool sent, ) = project.creator.call{value: amount}("");
        require(sent, "Funds transfer failed");

        emit FundsWithdrawn(projectId, msg.sender, amount);
    }

    function claimRefund(uint256 projectId) external {
        Project storage project = projects[projectId];

        require(projectId < projectCount, "Project does not exist");
        require(project.ended, "Project not ended");
        require(!project.successful, "Project reached goal");

        uint256 amount = donations[projectId][msg.sender];
        require(amount > 0, "No donation to refund");

        donations[projectId][msg.sender] = 0;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Refund transfer failed");

        emit RefundClaimed(projectId, msg.sender, amount);
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        require(projectId < projectCount, "Project does not exist");
        return projects[projectId];
    }

    function getProjects() external view returns (Project[] memory) {
        Project[] memory allProjects = new Project[](projectCount);

        for (uint256 i = 0; i < projectCount; i++) {
            allProjects[i] = projects[i];
        }

        return allProjects;
    }

    function getDonors(uint256 projectId) external view returns (address[] memory) {
        require(projectId < projectCount, "Project does not exist");
        return projectDonors[projectId];
    }

    function getProjectUpdates(uint256 projectId) external view returns (ProjectUpdate[] memory) {
        require(projectId < projectCount, "Project does not exist");
        return projectUpdates[projectId];
    }

    function getDonorReward(uint256 projectId, address donor) external view returns (uint256 rank, uint256 points) {
        require(projectId < projectCount, "Project does not exist");
        return (earlyDonorRanks[projectId][donor], earlyDonorPoints[projectId][donor]);
    }

    function _awardEarlyDonorBadge(uint256 projectId, address donor, uint256 rank) private {
        if (rank > EARLY_DONOR_LIMIT) {
            return;
        }

        uint256 points = rank <= 3 ? TOP_DONOR_POINTS : EARLY_DONOR_POINTS;
        earlyDonorRanks[projectId][donor] = rank;
        earlyDonorPoints[projectId][donor] = points;
        supporterBadgePoints[donor] += points;

        emit EarlyDonorRewarded(projectId, donor, rank, points);
    }
}
