const fs = require("fs");

// ======================================================
// Analyze Single File
// ======================================================
const analyzeFile = (file) => {
  const issues = [];

  try {
    const content = fs.readFileSync(file.path, "utf8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const currentLine = line.trim();

      // =====================================
      // Debug Code
      // =====================================
      if (currentLine.includes("console.log(")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Low",
          type: "Debug Code",
          message: "Remove console.log() before production.",
          suggestion: "Use Winston, Morgan or another logging library.",
          autoFix: "Remove console.log() statement."
        });
      }

      if (currentLine.includes("debugger")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "Debug",
          message: "Debugger statement detected.",
          suggestion: "Remove debugger before deployment.",
          autoFix: "Delete debugger statement."
        });
      }

      // =====================================
      // TODO / FIXME
      // =====================================
      if (currentLine.includes("TODO")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "TODO",
          message: "Pending TODO found.",
          suggestion: "Complete the implementation.",
          autoFix: "Not Available"
        });
      }

      if (currentLine.includes("FIXME")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "High",
          type: "FIXME",
          message: "Developer marked this code for fixing.",
          suggestion: "Resolve before deployment.",
          autoFix: "Not Available"
        });
      }

      // =====================================
      // eval()
      // =====================================
      if (currentLine.includes("eval(")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Critical",
          type: "Security",
          message: "Avoid eval().",
          suggestion: "Use JSON.parse() or safer alternatives.",
          autoFix: "Replace eval() with safe logic."
        });
      }

      // =====================================
      // Hardcoded Password
      // =====================================
      if (
        /password\s*=/.test(currentLine) &&
        /["'`]/.test(currentLine)
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Critical",
          type: "Security",
          message: "Hardcoded password detected.",
          suggestion: "Store password inside .env.",
          autoFix: "Move password to process.env."
        });
      }

      // =====================================
      // API Keys
      // =====================================
      if (
        currentLine.includes("API_KEY") ||
        currentLine.includes("SECRET") ||
        currentLine.includes("TOKEN") ||
        currentLine.includes("apikey")
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Critical",
          type: "Security",
          message: "Possible secret/API key detected.",
          suggestion: "Move secrets into .env.",
          autoFix: "Replace hardcoded value with process.env."
        });
      }

      // =====================================
      // Empty Catch
      // =====================================
      if (
        currentLine === "catch(error){}" ||
        currentLine === "catch (error) {}" ||
        currentLine === "catch(e){}" ||
        currentLine === "catch (e) {}"
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "Code Quality",
          message: "Empty catch block.",
          suggestion: "Log the error or handle it properly.",
          autoFix: `
catch(error){
   console.error(error);
}
`
        });
      }

      // =====================================
      // var keyword
      // =====================================
      if (/\bvar\b/.test(currentLine)) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Low",
          type: "Modern JavaScript",
          message: "var keyword detected.",
          suggestion: "Use let or const.",
          autoFix: "Replace var with let/const."
        });
      }

      // =====================================
      // document.write()
      // =====================================
      if (currentLine.includes("document.write(")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "DOM",
          message: "Avoid document.write().",
          suggestion: "Use DOM methods.",
          autoFix: "Replace with innerHTML or appendChild."
        });
      }

      // =====================================
      // Infinite Loop
      // =====================================
      if (
        currentLine.includes("while(true)") ||
        currentLine.includes("for(;;)")
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Critical",
          type: "Performance",
          message: "Possible infinite loop.",
          suggestion: "Add an exit condition.",
          autoFix: "Check loop termination."
        });
      }

      // =====================================
      // SQL Query
      // =====================================
      if (
        currentLine.toLowerCase().includes("select ") &&
        currentLine.toLowerCase().includes(" from ")
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "High",
          type: "Database",
          message: "Raw SQL query detected.",
          suggestion: "Use parameterized queries.",
          autoFix: "Use prepared statements."
        });
      }

      // =====================================
      // process.exit()
      // =====================================
      if (currentLine.includes("process.exit(")) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "Node.js",
          message: "Avoid abrupt process termination.",
          suggestion: "Handle graceful shutdown.",
          autoFix: "Remove process.exit()."
        });
      }

      // =====================================
      // Long Line
      // =====================================
      if (currentLine.length > 120) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Low",
          type: "Formatting",
          message: "Line exceeds 120 characters.",
          suggestion: "Split into multiple lines.",
          autoFix: "Reformat the line."
        });
      }

      // =====================================
      // Trailing Spaces
      // =====================================
      if (/\s+$/.test(line)) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Low",
          type: "Formatting",
          message: "Trailing whitespace found.",
          suggestion: "Remove unnecessary spaces.",
          autoFix: "Trim trailing spaces."
        });
      }

      // =====================================
      // == instead of ===
      // =====================================
      if (
        currentLine.includes("==") &&
        !currentLine.includes("===")
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "Best Practice",
          message: "Use strict equality.",
          suggestion: "Replace == with ===.",
          autoFix: "Replace == → ==="
        });
      }

      // =====================================
      // != instead of !==
      // =====================================
      if (
        currentLine.includes("!=") &&
        !currentLine.includes("!==")
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "Best Practice",
          message: "Use strict inequality.",
          suggestion: "Replace != with !==.",
          autoFix: "Replace != → !=="
        });
      }

      // =====================================
      // Empty if
      // =====================================
      if (
        currentLine.includes("if(") &&
        currentLine.endsWith("{}")
      ) {
        issues.push({
          file: file.name,
          line: lineNumber,
          severity: "Medium",
          type: "Logic",
          message: "Empty if block.",
          suggestion: "Remove or implement logic.",
          autoFix: "Add implementation."
        });
      }

      // =====================================
      // Large Function Warning
      // =====================================
      if (currentLine.includes("function")) {
        let brace = 0;
        let count = 0;

        for (let i = index; i < lines.length; i++) {
          if (lines[i].includes("{")) brace++;
          if (lines[i].includes("}")) brace--;
          count++;

          if (brace === 0 && count > 50) {
            issues.push({
              file: file.name,
              line: lineNumber,
              severity: "Medium",
              type: "Maintainability",
              message: "Large function detected.",
              suggestion: "Split into smaller functions.",
              autoFix: "Refactor into reusable methods."
            });
            break;
          }
        }
      }
    });

    return issues;

  } catch (error) {
    return [
      {
        file: file.name,
        line: 0,
        severity: "Error",
        type: "Read Error",
        message: error.message,
        suggestion: "Check file permissions or encoding.",
        autoFix: "Not Available"
      },
    ];
  }
};

// ======================================================
// Analyze Whole Project
// ======================================================
const analyzeProject = (files) => {
  let report = [];

  files.forEach((file) => {
    report = report.concat(analyzeFile(file));
  });

  return report;
};

module.exports = {
  analyzeProject,
};