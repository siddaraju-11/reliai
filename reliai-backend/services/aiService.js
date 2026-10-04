// ======================================================
// AI Log Analysis Service
// ======================================================

const analyzeLogs = (logs = "") => {
  const logText = logs.toLowerCase();

  // Default Response
  let result = {
    detectedIssue: "Unknown Error",
    suggestedFix:
      "Review the complete build logs and verify your project configuration.",
    confidence: 50,
    autoFixAvailable: false,
  };

  // ==========================================
  // Node Modules Missing
  // ==========================================
  if (
    logText.includes("module not found") ||
    logText.includes("cannot find module")
  ) {
    result = {
      detectedIssue: "Missing Node Module",
      suggestedFix:
        "Run 'npm install' or install the missing package using 'npm install <package-name>'.",
      confidence: 99,
      autoFixAvailable: true,
    };
  }

  // ==========================================
  // npm install failed
  // ==========================================
  else if (
    logText.includes("npm err") ||
    logText.includes("npm error")
  ) {
    result = {
      detectedIssue: "NPM Installation Failed",
      suggestedFix:
        "Delete node_modules and package-lock.json, then run 'npm install' again.",
      confidence: 97,
      autoFixAvailable: true,
    };
  }

  // ==========================================
  // MongoDB Connection
  // ==========================================
  else if (
    logText.includes("mongodb") &&
    logText.includes("failed")
  ) {
    result = {
      detectedIssue: "MongoDB Connection Failed",
      suggestedFix:
        "Check MongoDB URI, database status, network access, and credentials.",
      confidence: 98,
      autoFixAvailable: false,
    };
  }

  // ==========================================
  // Port Already Used
  // ==========================================
  else if (
    logText.includes("eaddrinuse") ||
    logText.includes("address already in use")
  ) {
    result = {
      detectedIssue: "Port Already in Use",
      suggestedFix:
        "Stop the process using the port or change the application's port number.",
      confidence: 98,
      autoFixAvailable: true,
    };
  }

  // ==========================================
  // Permission
  // ==========================================
  else if (
    logText.includes("permission denied") ||
    logText.includes("eacces")
  ) {
    result = {
      detectedIssue: "Permission Denied",
      suggestedFix:
        "Check file permissions and run the application with appropriate access rights.",
      confidence: 96,
      autoFixAvailable: false,
    };
  }

  // ==========================================
  // Syntax Error
  // ==========================================
  else if (logText.includes("syntaxerror")) {
    result = {
      detectedIssue: "Syntax Error",
      suggestedFix:
        "Review the reported file and line number, then fix the syntax mistake.",
      confidence: 99,
      autoFixAvailable: false,
    };
  }

  // ==========================================
  // Git Clone Failed
  // ==========================================
  else if (
    logText.includes("git") &&
    logText.includes("clone") &&
    logText.includes("failed")
  ) {
    result = {
      detectedIssue: "Repository Clone Failed",
      suggestedFix:
        "Verify the repository URL, authentication token, and repository permissions.",
      confidence: 97,
      autoFixAvailable: false,
    };
  }

  // ==========================================
  // Docker
  // ==========================================
  else if (
    logText.includes("docker") &&
    logText.includes("not found")
  ) {
    result = {
      detectedIssue: "Docker Not Installed",
      suggestedFix:
        "Install Docker or ensure the Docker daemon is running.",
      confidence: 98,
      autoFixAvailable: false,
    };
  }

  // ==========================================
  // React Build
  // ==========================================
  else if (
    logText.includes("react-scripts") &&
    logText.includes("failed")
  ) {
    result = {
      detectedIssue: "React Build Failed",
      suggestedFix:
        "Verify package versions and reinstall project dependencies.",
      confidence: 96,
      autoFixAvailable: true,
    };
  }

  // ==========================================
  // Java
  // ==========================================
  else if (
    logText.includes("javac") ||
    logText.includes("compilation failed")
  ) {
    result = {
      detectedIssue: "Java Compilation Error",
      suggestedFix:
        "Resolve compilation errors shown in the logs and rebuild the project.",
      confidence: 97,
      autoFixAvailable: false,
    };
  }

  // ==========================================
  // Python
  // ==========================================
  else if (
    logText.includes("importerror") ||
    logText.includes("modulenotfounderror")
  ) {
    result = {
      detectedIssue: "Python Module Missing",
      suggestedFix:
        "Install the missing Python package using 'pip install <package-name>'.",
      confidence: 99,
      autoFixAvailable: true,
    };
  }

  return result;
};

module.exports = {
  analyzeLogs,
};