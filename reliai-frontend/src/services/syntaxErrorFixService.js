const fs = require("fs");
const path = require("path");

// ======================================================
// Detect JavaScript Syntax Error
// ======================================================
const detectSyntaxError = (logs = "") => {
  try {
    if (!logs || typeof logs !== "string") {
      return {
        detected: false,
        message: "No logs provided.",
      };
    }

    // --------------------------------------------------
    // Common Node.js syntax error
    // Example:
    // SyntaxError: Unexpected token '}'
    // --------------------------------------------------
    const syntaxMatch = logs.match(
      /SyntaxError:\s*(.+)/i
    );

    // --------------------------------------------------
    // Extract file path
    // Example:
    // C:\project\app.js:10
    // --------------------------------------------------
    const fileMatch = logs.match(
      /(?:^|\n)([A-Za-z]:\\[^:\n]+\.js):(\d+)/i
    );

    if (!syntaxMatch) {
      return {
        detected: false,
        message: "No JavaScript syntax error detected.",
      };
    }

    const errorMessage = syntaxMatch[1].trim();

    let filePath = null;
    let lineNumber = null;

    if (fileMatch) {
      filePath = fileMatch[1];
      lineNumber = Number(fileMatch[2]);
    }

    return {
      detected: true,
      type: "Syntax Error",
      message: errorMessage,
      filePath,
      lineNumber,
    };
  } catch (error) {
    return {
      detected: false,
      message: "Failed to detect syntax error.",
      error: error.message,
    };
  }
};

// ======================================================
// Read File Around Error Line
// ======================================================
const getErrorContext = (
  filePath,
  lineNumber,
  range = 3
) => {
  try {
    if (!filePath || !lineNumber) {
      return {
        success: false,
        message: "File path and line number are required.",
      };
    }

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: "Error file does not exist.",
      };
    }

    const code = fs.readFileSync(
      filePath,
      "utf8"
    );

    const lines = code.split(/\r?\n/);

    const start = Math.max(
      0,
      lineNumber - range - 1
    );

    const end = Math.min(
      lines.length,
      lineNumber + range
    );

    const context = [];

    for (let i = start; i < end; i++) {
      context.push({
        lineNumber: i + 1,
        code: lines[i],
        isErrorLine:
          i + 1 === lineNumber,
      });
    }

    return {
      success: true,
      filePath,
      lineNumber,
      context,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to read error context.",
      error: error.message,
    };
  }
};

// ======================================================
// Backup File Before Modification
// ======================================================
const backupFile = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        success: false,
        message: "File does not exist.",
      };
    }

    const backupPath =
      `${filePath}.reliai-backup`;

    fs.copyFileSync(
      filePath,
      backupPath
    );

    return {
      success: true,
      backupPath,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to create backup.",
      error: error.message,
    };
  }
};

// ======================================================
// Export
// ======================================================
module.exports = {
  detectSyntaxError,
  getErrorContext,
  backupFile,
};