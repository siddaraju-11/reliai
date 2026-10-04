const fs = require("fs");
const path = require("path");

// =====================================
// Supported Source Code Extensions
// =====================================
const supportedExtensions = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".java",
  ".py",
  ".cpp",
  ".c",
  ".cs",
  ".php",
  ".go",
  ".rb",
  ".swift",
  ".kt",
  ".html",
  ".css",
  ".scss",
  ".json",
  ".xml",
  ".yml",
  ".yaml",
  ".sql",
  ".md",
  ".txt",
];

// =====================================
// Ignore These Folders
// =====================================
const ignoredFolders = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".idea",
  ".vscode",
  "coverage",
  "uploads",
  "extracted",
];

// =====================================
// Scan Project Recursively
// =====================================
const scanProject = (folderPath) => {
  let files = [];

  const items = fs.readdirSync(folderPath);

  for (const item of items) {
    const fullPath = path.join(folderPath, item);

    const stats = fs.statSync(fullPath);

    // Ignore folders
    if (stats.isDirectory()) {
      if (ignoredFolders.includes(item)) {
        continue;
      }

      files = files.concat(scanProject(fullPath));
    }

    // Read files
    else {
      const extension = path.extname(item).toLowerCase();

      if (supportedExtensions.includes(extension)) {
        files.push({
          name: item,
          path: fullPath,
          extension,
          size: stats.size,
        });
      }
    }
  }

  return files;
};

module.exports = {
  scanProject,
};