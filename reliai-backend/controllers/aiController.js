const fs = require("fs");
const path = require("path");

const { extractZip } = require("../services/zipService");
const { scanProject } = require("../services/fileScanner");
const { analyzeProject } = require("../services/codeAnalyzer");
const { autoFixProject } = require("../services/autoFixService");
const { createFixedZip } = require("../services/zipDownloadService");
const { generatePDFReport } = require("../services/reportGenerator");
const { analyzeLogs } = require("../services/aiLogAnalyzer");

// ======================================================
// Upload & Analyze Project
// POST /api/ai/upload
// ======================================================
exports.uploadProject = async (req, res) => {
  try {
    // =====================================
    // Validate Upload
    // =====================================
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No project uploaded.",
      });
    }

    console.log("========================================");
    console.log("AI PROJECT ANALYSIS STARTED");
    console.log("Uploaded File :", req.file.originalname);
    console.log("========================================");

    const uploadedFile = req.file.path;
    let projectPath = uploadedFile;

    // =====================================
    // Extract ZIP
    // =====================================
    const extension = path
      .extname(req.file.originalname)
      .toLowerCase();

    if (extension === ".zip") {
      console.log("Extracting ZIP...");

      projectPath = await extractZip(uploadedFile);

      console.log("ZIP Extracted Successfully");
      console.log(projectPath);
    }

    // =====================================
    // Scan Project
    // =====================================
    let files = [];

    if (fs.existsSync(projectPath)) {
      const stats = fs.statSync(projectPath);

      if (stats.isDirectory()) {
        files = scanProject(projectPath);
      } else {
        files.push({
          name: req.file.originalname,
          path: uploadedFile,
          extension,
          size: req.file.size,
        });
      }
    }

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No supported source files found.",
      });
    }

    console.log(`Files Scanned : ${files.length}`);

    // =====================================
    // AI Analysis
    // =====================================
    const issues = analyzeProject(files);

    // =====================================
    // AI Auto Fix
    // =====================================
    const autoFixReport = autoFixProject(files);

    console.log("========================================");
    console.log("AUTO FIX COMPLETED");
    console.log(autoFixReport);
    console.log("========================================");

    // =====================================
    // Create Fixed ZIP
    // =====================================
    let downloadPath = null;

    if (
      fs.existsSync(projectPath) &&
      fs.statSync(projectPath).isDirectory()
    ) {
      const downloadsDir = path.join(
        __dirname,
        "..",
        "downloads"
      );

      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, {
          recursive: true,
        });
      }

      const zipName = `${Date.now()}-fixed-project.zip`;

      downloadPath = path.join(
        downloadsDir,
        zipName
      );

      await createFixedZip(
        projectPath,
        downloadPath
      );

      console.log("========================================");
      console.log("FIXED PROJECT ZIP CREATED");
      console.log(downloadPath);
      console.log("========================================");
    }

    // =====================================
    // Statistics
    // =====================================
    const statistics = {
      totalFiles: files.length,

      totalIssues: issues.length,

      totalFixes: autoFixReport.reduce(
        (total, file) =>
          total + (file.totalFixes || 0),
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
    // Generate PDF Automatically
    // =====================================
    let pdfReport = null;

    try {
      pdfReport = await generatePDFReport({
        projectName: req.file.originalname,
        generatedAt: new Date(),
        statistics,
        issues,
        autoFixReport,
      });

      console.log("========================================");
      console.log("PDF REPORT GENERATED");
      console.log(pdfReport.fileName);
      console.log("========================================");

    } catch (err) {
      console.error("PDF Generation Failed");
      console.error(err.message);
    }

    console.log("========================================");
    console.log("ANALYSIS COMPLETED SUCCESSFULLY");
    console.log(statistics);
    console.log("========================================");

    // =====================================
    // Response
    // =====================================
    return res.status(200).json({
      success: true,

      message:
        "Project analyzed, auto-fixed and report generated successfully.",

      uploadedFile: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        extension,
      },

      statistics,

      issues,

      autoFixReport,

      fixedProjectDownload: downloadPath
        ? `/downloads/${path.basename(downloadPath)}`
        : null,

      pdfReport: pdfReport
        ? {
            fileName: pdfReport.fileName,
            downloadUrl: pdfReport.downloadUrl,
          }
        : null,
    });

  } catch (error) {
    console.error("========================================");
    console.error("AI ANALYSIS ERROR");
    console.error(error);
    console.error("========================================");

    return res.status(500).json({
      success: false,
      message: "AI analysis failed.",
      error: error.message,
    });
  }
};
// ======================================================
// Analyze Build / Test Error
// POST /api/ai/analyze
// ======================================================
exports.analyzeError = async (req, res) => {
  try {
    const {
      error = "",
      logs = "",
      projectType = "Unknown",
      command = "",
    } = req.body;

    // =====================================
    // Validation
    // =====================================
    if (
      (!error || error.trim() === "") &&
      (!logs || logs.trim() === "")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Error or build/test logs are required.",
      });
    }

    console.log("========================================");
    console.log("AI LOG ANALYSIS STARTED");
    console.log("Project Type :", projectType);
    console.log("Command      :", command);
    console.log("========================================");

    // =====================================
    // Combine Error + Logs
    // =====================================
    const combinedLogs = `
${error}
${logs}
`.trim();

    // =====================================
    // Analyze Logs
    // =====================================
    const analysis = analyzeLogs(combinedLogs);

    console.log("========================================");
    console.log("AI LOG ANALYSIS COMPLETED");
    console.log(analysis);
    console.log("========================================");

    // =====================================
    // Response
    // =====================================
    return res.status(200).json({
      success: true,

      message:
        "Error analysis completed successfully.",

      projectType,

      command,

      analysis,

      input: {
        error,
        logs,
      },

      analyzedAt: new Date(),
    });

  } catch (error) {
    console.error("========================================");
    console.error("AI LOG ANALYSIS ERROR");
    console.error(error);
    console.error("========================================");

    return res.status(500).json({
      success: false,
      message: "Failed to analyze error.",
      error: error.message,
    });
  }
};// ======================================================
// Generate PDF Report
// POST /api/ai/report
// ======================================================
exports.generateReport = async (req, res) => {
  try {
    const {
      projectName,
      statistics = {},
      issues = [],
      autoFixReport = [],
    } = req.body;

    // =====================================
    // Validation
    // =====================================
    if (
      !projectName ||
      projectName.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Project name is required.",
      });
    }

    console.log("========================================");
    console.log("PDF REPORT GENERATION STARTED");
    console.log("Project :", projectName);
    console.log("========================================");

    // =====================================
    // Generate PDF
    // =====================================
    const report = await generatePDFReport({
      projectName,
      generatedAt: new Date(),
      statistics,
      issues,
      autoFixReport,
    });

    console.log("========================================");
    console.log("PDF REPORT GENERATED SUCCESSFULLY");
    console.log("File :", report.fileName);
    console.log("========================================");

    // =====================================
    // Response
    // =====================================
    return res.status(200).json({
      success: true,

      message:
        "PDF report generated successfully.",

      report: {
        fileName: report.fileName,
        downloadUrl: report.downloadUrl,
      },
    });

  } catch (error) {
    console.error("========================================");
    console.error("PDF REPORT ERROR");
    console.error(error);
    console.error("========================================");

    return res.status(500).json({
      success: false,
      message: "Failed to generate PDF report.",
      error: error.message,
    });
  }
};