const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// =====================================================
// Generate PDF Report
// =====================================================
const generatePDFReport = async (data) => {
  return new Promise((resolve, reject) => {
    try {
      // =====================================
      // Create downloads folder
      // =====================================
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

      // =====================================
      // File Name
      // =====================================
      const fileName = `ReliAI-Report-${Date.now()}.pdf`;

      const filePath = path.join(
        downloadsDir,
        fileName
      );

      // =====================================
      // Create PDF
      // =====================================
      const doc = new PDFDocument({
        size: "A4",
        margin: 45,
      });

      const stream =
        fs.createWriteStream(filePath);

      doc.pipe(stream);

      // =====================================
      // Helper
      // =====================================
      const checkPage = () => {
        if (doc.y > 730) {
          doc.addPage();
        }
      };

      // =====================================
      // Header
      // =====================================
      doc
        .fontSize(26)
        .fillColor("#2563eb")
        .text(
          "ReliAI Analysis Report",
          {
            align: "center",
          }
        );

      doc.moveDown(0.3);

      doc
        .fontSize(13)
        .fillColor("#444")
        .text(
          "AI Powered CI/CD Monitoring System",
          {
            align: "center",
          }
        );

      doc.moveDown();

      doc
        .moveTo(45, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      doc.moveDown();

      // =====================================
      // Project Information
      // =====================================
      doc
        .fontSize(18)
        .fillColor("#111827")
        .text("Project Information");

      doc.moveDown(0.5);

      doc.fontSize(12);

      doc.text(
        `Project Name : ${
          data.projectName ||
          "Unknown Project"
        }`
      );

      doc.text(
        `Generated On : ${(
          data.generatedAt ||
          new Date()
        ).toLocaleString()}`
      );

      doc.moveDown();

      // =====================================
      // Statistics
      // =====================================
      const stats =
        data.statistics || {};

      doc
        .fontSize(18)
        .fillColor("#111827")
        .text("Project Statistics");

      doc.moveDown(0.5);

      doc.fontSize(12);

      doc.text(
        `Files Scanned : ${
          stats.totalFiles || 0
        }`
      );

      doc.text(
        `Issues Found : ${
          stats.totalIssues || 0
        }`
      );

      doc.text(
        `Auto Fixes : ${
          stats.totalFixes || 0
        }`
      );

      doc.text(
        `Critical Issues : ${
          stats.criticalIssues || 0
        }`
      );

      doc.text(
        `High Issues : ${
          stats.highIssues || 0
        }`
      );

      doc.text(
        `Medium Issues : ${
          stats.mediumIssues || 0
        }`
      );

      doc.text(
        `Low Issues : ${
          stats.lowIssues || 0
        }`
      );

      doc.moveDown();

      doc
        .moveTo(45, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      doc.moveDown();

      // =====================================
      // Calculate Scores
      // =====================================
      const totalIssues =
        stats.totalIssues || 0;

      const critical =
        stats.criticalIssues || 0;

      const high =
        stats.highIssues || 0;

      const medium =
        stats.mediumIssues || 0;

      const aiScore = Math.round(
        Math.max(
          0,
          100 -
            (
              critical * 20 +
              high * 10 +
              medium * 5 +
              totalIssues
            )
        )
      );

      const securityScore =
        Math.round(
          Math.max(
            0,
            100 -
              (
                critical * 25 +
                high * 10
              )
          )
        );

      const performanceScore =
        Math.round(
          Math.max(
            0,
            100 -
              (
                high * 3 +
                medium * 5
              )
          )
        );

      const qualityScore =
        Math.round(
          Math.max(
            0,
            100 - totalIssues
          )
        );

      // =====================================
      // Scores
      // =====================================
      doc
        .fontSize(18)
        .fillColor("#111827")
        .text("AI Project Scores");

      doc.moveDown(0.5);

      doc.fontSize(12);

      doc.text(
        `Overall AI Score : ${aiScore}/100`
      );

      doc.text(
        `Security Score : ${securityScore}/100`
      );

      doc.text(
        `Performance Score : ${performanceScore}/100`
      );

      doc.text(
        `Code Quality Score : ${qualityScore}/100`
      );

      doc.moveDown();

      doc
        .moveTo(45, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      doc.moveDown();

      // =====================================
      // Detected Issues
      // =====================================
      doc
        .fontSize(18)
        .fillColor("#dc2626")
        .text("Detected Issues");

      doc.moveDown();

      if (
        !data.issues ||
        data.issues.length === 0
      ) {
        doc
          .fillColor("black")
          .fontSize(12)
          .text("No issues detected.");
      } else {
        data.issues.forEach(
          (issue, index) => {
            checkPage();

            doc
              .fontSize(13)
              .fillColor("#dc2626")
              .text(
                `${index + 1}. ${
                  issue.type
                }`
              );

            doc
              .fillColor("black")
              .fontSize(11);

            doc.text(
              `File : ${
                issue.file || "-"
              }`
            );

            doc.text(
              `Line : ${
                issue.line || "-"
              }`
            );

            doc.text(
              `Severity : ${
                issue.severity || "-"
              }`
            );

            doc.text(
              `Message : ${
                issue.message || "-"
              }`
            );

            doc.text(
              `Suggestion : ${
                issue.suggestion ||
                "No suggestion"
              }`
            );

            doc.moveDown(0.5);

            doc
              .moveTo(45, doc.y)
              .lineTo(550, doc.y)
              .stroke();

            doc.moveDown();
          }
        );
      }
            // =====================================
      // Auto Fix Summary
      // =====================================
      checkPage();

      doc
        .fontSize(18)
        .fillColor("#16a34a")
        .text("Auto Fix Summary");

      doc.moveDown();

      if (
        !data.autoFixReport ||
        data.autoFixReport.length === 0
      ) {
        doc
          .fillColor("black")
          .fontSize(12)
          .text("No automatic fixes were applied.");
      } else {
        data.autoFixReport.forEach((file, index) => {
          checkPage();

          doc
            .fontSize(13)
            .fillColor("#16a34a")
            .text(`${index + 1}. ${file.file}`);

          doc
            .fillColor("black")
            .fontSize(11);

          doc.text(
            `Total Fixes : ${file.totalFixes || 0}`
          );

          if (
            file.fixes &&
            Array.isArray(file.fixes) &&
            file.fixes.length > 0
          ) {
            file.fixes.forEach((fix) => {
              checkPage();
              doc.text(`✔ ${fix}`);
            });
          } else {
            doc.text("No fix details available.");
          }

          doc.moveDown(0.5);

          doc
            .moveTo(45, doc.y)
            .lineTo(550, doc.y)
            .stroke();

          doc.moveDown();
        });
      }

      // =====================================
      // Overall Summary
      // =====================================
      checkPage();

      doc
        .fontSize(18)
        .fillColor("#2563eb")
        .text("Overall Summary");

      doc.moveDown();

      doc
        .fillColor("black")
        .fontSize(12);

      doc.text(
        `Project Name : ${
          data.projectName || "Unknown"
        }`
      );

      doc.text(
        `Files Scanned : ${
          stats.totalFiles || 0
        }`
      );

      doc.text(
        `Issues Detected : ${
          stats.totalIssues || 0
        }`
      );

      doc.text(
        `Auto Fixes Applied : ${
          stats.totalFixes || 0
        }`
      );

      doc.text(`Overall AI Score : ${aiScore}/100`);

      doc.text(
        `Security Score : ${securityScore}/100`
      );

      doc.text(
        `Performance Score : ${performanceScore}/100`
      );

      doc.text(
        `Code Quality Score : ${qualityScore}/100`
      );

      doc.moveDown();

      doc
        .moveTo(45, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      doc.moveDown(2);

      // =====================================
      // Footer
      // =====================================
      doc
        .fontSize(16)
        .fillColor("#2563eb")
        .text("Generated by ReliAI", {
          align: "center",
        });

      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .fillColor("#6b7280")
        .text(
          "AI Powered CI/CD Monitoring System",
          {
            align: "center",
          }
        );

      doc.moveDown(0.5);

      doc.text(
        `Generated On : ${(
          data.generatedAt ||
          new Date()
        ).toLocaleString()}`,
        {
          align: "center",
        }
      );

      // =====================================
      // Finish PDF
      // =====================================
      doc.end();

      stream.on("finish", () => {
        resolve({
          fileName,
          filePath,
          downloadUrl: `/downloads/${fileName}`,
        });
      });

      stream.on("error", (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
};

// =====================================
// Export
// =====================================
module.exports = {
  generatePDFReport,
};