const axios = require("axios");
const fs = require("fs");
const path = require("path");

const { cloneRepository } = require("../services/githubCloneService");
const { scanProject } = require("../services/fileScanner");
const { analyzeProject } = require("../services/codeAnalyzer");
const { autoFixProject } = require("../services/autoFixService");
const { createFixedZip } = require("../services/zipDownloadService");
const { generatePDFReport } = require("../services/reportGenerator");

// ======================================================
// Analyze GitHub Repository
// POST /api/github/analyze
// ======================================================
exports.analyzeGithubRepository = async (req, res) => {
  try {
    const { repositoryUrl } = req.body;

    if (!repositoryUrl) {
      return res.status(400).json({
        success: false,
        message: "Repository URL is required.",
      });
    }

    if (!repositoryUrl.includes("github.com")) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid GitHub repository URL.",
      });
    }

    const parts = repositoryUrl.replace(/\/$/, "").split("/");

    const owner = parts[parts.length - 2];
    const repo = parts[parts.length - 1];

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`
    );

    const repository = response.data;

    return res.status(200).json({
      success: true,
      message: "Repository fetched successfully.",

      repository: {
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        language: repository.language,
        visibility: repository.private ? "Private" : "Public",
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        watchers: repository.watchers_count,
        openIssues: repository.open_issues_count,
        defaultBranch: repository.default_branch,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        cloneUrl: repository.clone_url,
        htmlUrl: repository.html_url,
      },
    });
  } catch (error) {
    console.error("====================================");
    console.error("GITHUB ANALYZER ERROR");
    console.error(error.message);
    console.error("====================================");

    return res.status(500).json({
      success: false,
      message: "Failed to analyze GitHub repository.",
      error: error.message,
    });
  }
};

// ======================================================
// Full GitHub Repository Analysis
// POST /api/github/full-analysis
// ======================================================
exports.fullGithubAnalysis = async (req, res) => {
  try {
    const { repositoryUrl } = req.body;

    // =====================================
    // Validation
    // =====================================
    if (!repositoryUrl) {
      return res.status(400).json({
        success: false,
        message: "Repository URL is required.",
      });
    }

    if (!repositoryUrl.includes("github.com")) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid GitHub repository URL.",
      });
    }

    // =====================================
    // Extract Owner & Repository
    // =====================================
    const parts = repositoryUrl.replace(/\/$/, "").split("/");

    const owner = parts[parts.length - 2];
    const repo = parts[parts.length - 1];

    console.log("====================================");
    console.log("GITHUB FULL ANALYSIS STARTED");
    console.log(`Repository : ${owner}/${repo}`);
    console.log("====================================");

    // =====================================
    // Fetch Repository Information
    // =====================================
    const repoResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`
    );

    const repository = repoResponse.data;

    // =====================================
    // Clone Repository
    // =====================================
    console.log("Cloning Repository...");

    const projectPath = await cloneRepository(repository.clone_url);

    console.log("Repository Cloned Successfully");
    console.log(projectPath);

    // =====================================
    // Scan Project
    // =====================================
    const files = scanProject(projectPath);

    console.log(`Files Scanned : ${files.length}`);

    // =====================================
    // AI Analysis
    // =====================================
    const issues = analyzeProject(files);

    console.log(`Issues Found : ${issues.length}`);

    // =====================================
    // AI Auto Fix
    // =====================================
    const autoFixReport = autoFixProject(files);

    console.log("Auto Fix Completed");
        // =====================================
    // Create Fixed ZIP
    // =====================================
    let fixedProjectDownload = null;

    const downloadsDir = path.join(__dirname, "..", "downloads");

    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, {
        recursive: true,
      });
    }

    const zipName = `${Date.now()}-github-fixed-project.zip`;

    const zipPath = path.join(downloadsDir, zipName);

    await createFixedZip(projectPath, zipPath);

    fixedProjectDownload = `/downloads/${zipName}`;

    console.log("Fixed Project ZIP Created");

    // =====================================
    // Fetch Languages
    // =====================================
    const languageResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/languages`
    );

    // =====================================
    // Fetch Contributors
    // =====================================
    const contributorResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=10`
    );

    // =====================================
    // Fetch Branches
    // =====================================
    const branchResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/branches`
    );

    // =====================================
    // Statistics
    // =====================================
    const statistics = {
      totalFiles: files.length,

      totalIssues: issues.length,

      totalFixes: autoFixReport.reduce(
        (total, file) => total + (file.totalFixes || 0),
        0
      ),

      criticalIssues: issues.filter(
        (i) => i.severity === "Critical"
      ).length,

      highIssues: issues.filter(
        (i) => i.severity === "High"
      ).length,

      mediumIssues: issues.filter(
        (i) => i.severity === "Medium"
      ).length,

      lowIssues: issues.filter(
        (i) => i.severity === "Low"
      ).length,
    };

    // =====================================
    // AI Scores
    // =====================================
    let healthScore = 100;

    if (statistics.criticalIssues > 0)
      healthScore -= statistics.criticalIssues * 20;

    if (statistics.highIssues > 0)
      healthScore -= statistics.highIssues * 10;

    if (statistics.mediumIssues > 0)
      healthScore -= statistics.mediumIssues * 5;

    if (healthScore < 0) healthScore = 0;

    // =====================================
    // Generate PDF Report
    // =====================================
    const pdfReport = await generatePDFReport({
      projectName: repository.full_name,
      generatedAt: new Date(),
      statistics,
      issues,
      autoFixReport,
    });

    console.log("PDF Report Generated");

    // =====================================
    // Cleanup Temporary Repository
    // =====================================
    try {
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });

      console.log("Temporary Repository Deleted");
    } catch (cleanupError) {
      console.log("Cleanup Skipped");
    }

    console.log("====================================");
    console.log("FULL GITHUB ANALYSIS COMPLETED");
    console.log("====================================");

    // =====================================
    // Response
    // =====================================
    return res.status(200).json({
      success: true,
      message: "Full repository analysis completed.",

      repository: {
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        language: repository.language,
        visibility: repository.private ? "Private" : "Public",
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        watchers: repository.watchers_count,
        openIssues: repository.open_issues_count,
        defaultBranch: repository.default_branch,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
      },

      statistics,

      issues,

      autoFixReport,

      languages: languageResponse.data,

      contributors: contributorResponse.data.map((user) => ({
        login: user.login,
        contributions: user.contributions,
        avatar: user.avatar_url,
      })),

      branches: branchResponse.data.map(
        (branch) => branch.name
      ),

      scores: {
        repositoryHealth: healthScore,
        popularity:
          repository.stargazers_count > 1000
            ? "Excellent"
            : "Good",

        maintenance:
          repository.open_issues_count < 50
            ? "Good"
            : "Needs Attention",
      },

      downloads: {
        pdfReport: pdfReport.downloadUrl,
        fixedProject: fixedProjectDownload,
      },
    });
  } catch (error) {
    console.error("====================================");
    console.error("FULL GITHUB ANALYSIS ERROR");
    console.error(error);
    console.error("====================================");

    return res.status(500).json({
      success: false,
      message: "Failed to perform full GitHub analysis.",
      error: error.message,
    });
  }
};