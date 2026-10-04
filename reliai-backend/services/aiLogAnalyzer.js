// ======================================================
// ReliAI - AI Log Analysis Service
// ======================================================

const analyzeLogs = (logs = "") => {
  try {
    const originalLogs = String(logs || "");
    const logText = originalLogs.toLowerCase();

    // ==================================================
    // Helper: Extract Node Module
    // ==================================================
    const extractNodeModule = () => {
      const match = originalLogs.match(
        /Cannot find module ['"]([^'"]+)['"]/i
      );

      return match ? match[1] : null;
    };

    // ==================================================
    // Helper: Extract Python Module
    // ==================================================
    const extractPythonModule = () => {
      const match = originalLogs.match(
        /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i
      );

      return match ? match[1] : null;
    };

    // ==================================================
    // Helper: Extract File + Line + Column
    // ==================================================
    const extractLocation = () => {
      const patterns = [
        /at .*?\(?([A-Za-z]:\\[^:\n]+):(\d+):(\d+)\)?/i,
        /\(?([A-Za-z]:\\[^:\n]+):(\d+):(\d+)\)?/i,
        /at .*?\(?([/\\][^:\n]+):(\d+):(\d+)\)?/i,
      ];

      for (const pattern of patterns) {
        const match = originalLogs.match(pattern);

        if (match) {
          return {
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
          };
        }
      }

      return null;
    };

    // ==================================================
    // Helper: Extract Reference Variable
    // ==================================================
    const extractReferenceVariable = () => {
      const match = originalLogs.match(
        /ReferenceError:\s*(.*?)\s+is not defined/i
      );

      return match ? match[1].trim() : null;
    };

    // ==================================================
    // Helper: Extract TypeError
    // ==================================================
    const extractTypeError = () => {
      const match = originalLogs.match(
        /TypeError:\s*(.+)/i
      );

      return match ? match[1].trim() : null;
    };

    // ==================================================
    // Helper: Extract SyntaxError
    // ==================================================
    const extractSyntaxError = () => {
      const match = originalLogs.match(
        /SyntaxError:\s*(.+)/i
      );

      return match ? match[1].trim() : null;
    };

    // ==================================================
    // Helper: Extract Error Message
    // ==================================================
    const extractErrorMessage = () => {
      const patterns = [
        /Error:\s*(.+)/i,
        /fatal:\s*(.+)/i,
        /npm ERR![^\n]*\n?([\s\S]{0,300})/i,
      ];

      for (const pattern of patterns) {
        const match = originalLogs.match(pattern);

        if (match && match[1]) {
          return match[1].trim().substring(0, 500);
        }
      }

      return null;
    };

    // ==================================================
    // Empty Logs
    // ==================================================
    if (!originalLogs.trim()) {
      return {
        detectedIssue: "No Log Information",
        suggestedFix: "No logs were provided for analysis.",
        confidence: 100,
        autoFixAvailable: false,
        category: "UNKNOWN",
        severity: "LOW",
        details: {
          message: "No logs were provided.",
          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // Common Information
    // ==================================================
    const location = extractLocation();

    // ==================================================
    // Default Result
    // ==================================================
    let result = {
      detectedIssue: "Unknown Error",

      suggestedFix:
        "Review the complete build logs and fix the first reported error.",

      confidence: 50,

      autoFixAvailable: false,

      category: "UNKNOWN",

      severity: "MEDIUM",

      details: {
        message: extractErrorMessage(),
        file: location ? location.file : null,
        line: location ? location.line : null,
        column: location ? location.column : null,
      },
    };

    // ==================================================
    // 1. Node.js Missing Module
    // ==================================================
    if (
      logText.includes("cannot find module") ||
      logText.includes("module not found")
    ) {
      const packageName = extractNodeModule();

      result = {
        detectedIssue: "Missing Node Module",

        suggestedFix: packageName
          ? `Run 'npm install ${packageName}' to install the missing module.`
          : "Run 'npm install' or install the missing package using 'npm install <package-name>'.",

        confidence: 99,

        autoFixAvailable: true,

        category: "DEPENDENCY",

        severity: "HIGH",

        details: {
          message: packageName
            ? `Node.js could not find module '${packageName}'.`
            : "Node.js could not find a required module.",

          module: packageName,

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 2. package.json Missing
    // ==================================================
    else if (
      logText.includes("enoent") &&
      logText.includes("package.json")
    ) {
      result = {
        detectedIssue: "package.json Missing",

        suggestedFix:
          "Make sure the project contains a valid package.json file and run the build from the correct project directory.",

        confidence: 99,

        autoFixAvailable: false,

        category: "PROJECT_CONFIGURATION",

        severity: "HIGH",

        details: {
          message:
            "The project package.json file could not be found.",
          file: "package.json",
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 3. Python Missing Module
    // ==================================================
    else if (
      logText.includes("modulenotfounderror") ||
      logText.includes("no module named") ||
      logText.includes("importerror")
    ) {
      const pythonModule = extractPythonModule();

      result = {
        detectedIssue: "Python Module Missing",

        suggestedFix: pythonModule
          ? `Install the missing Python package using 'pip install ${pythonModule}'.`
          : "Install the missing Python dependency using pip or install dependencies from requirements.txt.",

        confidence: 99,

        autoFixAvailable: true,

        category: "PYTHON",

        severity: "HIGH",

        details: {
          message: pythonModule
            ? `Python could not find module '${pythonModule}'.`
            : "Python could not find a required module.",

          module: pythonModule,

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 4. Reference Error
    // ==================================================
    else if (
      logText.includes("referenceerror") ||
      logText.includes("is not defined")
    ) {
      const variable = extractReferenceVariable();

      result = {
        detectedIssue: "Reference Error",

        suggestedFix: variable
          ? `Variable or function '${variable}' is not defined. Declare it, import it, or correct its name.`
          : "Check the variable or function referenced in the error and make sure it is declared or imported.",

        confidence: 98,

        autoFixAvailable: false,

        category: "CODE",

        severity: "HIGH",

        details: {
          message: variable
            ? `'${variable}' is not defined.`
            : "A variable or function is not defined.",

          variable,

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 5. Type Error
    // ==================================================
    else if (logText.includes("typeerror")) {
      const typeError = extractTypeError();

      result = {
        detectedIssue: "Type Error",

        suggestedFix:
          "Check the value type and verify that the method, property, or operation is being used with the correct data type.",

        confidence: 98,

        autoFixAvailable: false,

        category: "CODE",

        severity: "HIGH",

        details: {
          message:
            typeError || "A JavaScript type error occurred.",

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 6. Syntax Error
    // ==================================================
    else if (
      logText.includes("syntaxerror") ||
      logText.includes("syntax error")
    ) {
      const syntaxError = extractSyntaxError();

      result = {
        detectedIssue: "Syntax Error",

        suggestedFix:
          "Review the reported file and line number. Check brackets, parentheses, quotes, commas, operators, and syntax.",

        confidence: 99,

        autoFixAvailable: false,

        category: "CODE",

        severity: "HIGH",

        details: {
          message:
            syntaxError || "A syntax error occurred.",

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 7. NPM Error
    // ==================================================
    else if (
      logText.includes("npm err") ||
      logText.includes("npm error")
    ) {
      result = {
        detectedIssue: "NPM Installation Failed",

        suggestedFix:
          "Check package.json, package versions, npm configuration, and network connectivity. Run 'npm install' again if required.",

        confidence: 97,

        autoFixAvailable: true,

        category: "DEPENDENCY",

        severity: "HIGH",

        details: {
          message: extractErrorMessage(),
          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 8. Dependency Conflict
    // ==================================================
    else if (
      logText.includes("eresolve") ||
      logText.includes("unable to resolve dependency tree") ||
      logText.includes("peer dependency")
    ) {
      result = {
        detectedIssue: "Dependency Conflict",

        suggestedFix:
          "Check package versions and resolve conflicting dependencies. Update or downgrade the conflicting package if necessary.",

        confidence: 98,

        autoFixAvailable: false,

        category: "DEPENDENCY",

        severity: "HIGH",

        details: {
          message: extractErrorMessage(),
          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 9. MongoDB Error
    // ==================================================
    else if (
      logText.includes("mongodb") &&
      (
        logText.includes("failed") ||
        logText.includes("error") ||
        logText.includes("refused") ||
        logText.includes("server selection") ||
        logText.includes("timed out")
      )
    ) {
      result = {
        detectedIssue: "MongoDB Connection Failed",

        suggestedFix:
          "Check the MongoDB URI, credentials, MongoDB Atlas IP access list, network connection, firewall, and cluster status.",

        confidence: 98,

        autoFixAvailable: false,

        category: "DATABASE",

        severity: "HIGH",

        details: {
          message:
            "The application could not establish a MongoDB connection.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 10. Database Authentication
    // ==================================================
    else if (
      (
        logText.includes("authentication failed") ||
        logText.includes("auth failed")
      ) &&
      (
        logText.includes("mongodb") ||
        logText.includes("database")
      )
    ) {
      result = {
        detectedIssue: "Database Authentication Failed",

        suggestedFix:
          "Verify the database username, password, authentication database, and connection URI.",

        confidence: 99,

        autoFixAvailable: false,

        category: "DATABASE",

        severity: "HIGH",

        details: {
          message:
            "Database authentication failed.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 11. Port Already Used
    // ==================================================
    else if (
      logText.includes("eaddrinuse") ||
      logText.includes("address already in use") ||
      logText.includes("port is already in use")
    ) {
      result = {
        detectedIssue: "Port Already in Use",

        suggestedFix:
          "Stop the process currently using the port or configure the application to use another port.",

        confidence: 99,

        autoFixAvailable: true,

        category: "NETWORK",

        severity: "MEDIUM",

        details: {
          message:
            "Another process is already using the requested port.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 12. Permission Error
    // ==================================================
    else if (
      logText.includes("permission denied") ||
      logText.includes("eacces") ||
      logText.includes("eperm") ||
      logText.includes("access denied")
    ) {
      result = {
        detectedIssue: "Permission Denied",

        suggestedFix:
          "Check file and directory permissions and make sure the current user has sufficient access.",

        confidence: 97,

        autoFixAvailable: false,

        category: "SYSTEM",

        severity: "HIGH",

        details: {
          message:
            "The operating system denied access to a required resource.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 13. Git Clone Error
    // ==================================================
    else if (
      logText.includes("git") &&
      logText.includes("clone") &&
      (
        logText.includes("fatal") ||
        logText.includes("failed") ||
        logText.includes("repository not found")
      )
    ) {
      result = {
        detectedIssue: "Repository Clone Failed",

        suggestedFix:
          "Verify the repository URL, branch, Git credentials, access token, and repository permissions.",

        confidence: 98,

        autoFixAvailable: false,

        category: "GIT",

        severity: "HIGH",

        details: {
          message: extractErrorMessage(),
          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 14. Git Authentication
    // ==================================================
    else if (
      logText.includes("git") &&
      (
        logText.includes("authentication failed") ||
        logText.includes("permission to") ||
        logText.includes("access denied")
      )
    ) {
      result = {
        detectedIssue: "Git Authentication Failed",

        suggestedFix:
          "Verify Git credentials, personal access token, SSH key, and repository permissions.",

        confidence: 98,

        autoFixAvailable: false,

        category: "GIT",

        severity: "HIGH",

        details: {
          message: extractErrorMessage(),
          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 15. Docker Error
    // ==================================================
    else if (
      logText.includes("docker") &&
      (
        logText.includes("not found") ||
        logText.includes("cannot connect") ||
        logText.includes("daemon")
      )
    ) {
      result = {
        detectedIssue: "Docker Not Available",

        suggestedFix:
          "Make sure Docker is installed and the Docker daemon is running.",

        confidence: 98,

        autoFixAvailable: false,

        category: "DOCKER",

        severity: "HIGH",

        details: {
          message:
            "Docker could not be accessed.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 16. React Build
    // ==================================================
    else if (
      logText.includes("react-scripts") &&
      (
        logText.includes("failed") ||
        logText.includes("error")
      )
    ) {
      result = {
        detectedIssue: "React Build Failed",

        suggestedFix:
          "Check React dependencies, package versions, source-code errors, and build configuration.",

        confidence: 97,

        autoFixAvailable: true,

        category: "FRONTEND",

        severity: "HIGH",

        details: {
          message:
            "The React project build failed.",

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 17. Vite Build
    // ==================================================
    else if (
      logText.includes("vite") &&
      (
        logText.includes("failed") ||
        logText.includes("error")
      )
    ) {
      result = {
        detectedIssue: "Vite Build Failed",

        suggestedFix:
          "Check Vite configuration, dependencies, source code, and the reported file and line number.",

        confidence: 96,

        autoFixAvailable: false,

        category: "FRONTEND",

        severity: "HIGH",

        details: {
          message:
            "The Vite project build failed.",

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 18. TypeScript
    // ==================================================
    else if (
      logText.includes("typescript") ||
      logText.includes("tsc") ||
      logText.includes("ts(")
    ) {
      result = {
        detectedIssue: "TypeScript Compilation Error",

        suggestedFix:
          "Check the TypeScript error, file path, line number, type definitions, and compiler configuration.",

        confidence: 97,

        autoFixAvailable: false,

        category: "TYPESCRIPT",

        severity: "HIGH",

        details: {
          message: extractErrorMessage(),
          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 19. Java Compilation
    // ==================================================
    else if (
      logText.includes("javac") ||
      logText.includes("compilation failed") ||
      logText.includes("cannot find symbol")
    ) {
      result = {
        detectedIssue: "Java Compilation Error",

        suggestedFix:
          "Review the Java compiler error, reported class, method, variable, and line number, then rebuild the project.",

        confidence: 98,

        autoFixAvailable: false,

        category: "JAVA",

        severity: "HIGH",

        details: {
          message: extractErrorMessage(),
          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 20. Test Failure
    // ==================================================
    else if (
      logText.includes("test failed") ||
      logText.includes("tests failed") ||
      logText.includes("failing tests") ||
      logText.includes("assertionerror")
    ) {
      result = {
        detectedIssue: "Test Failure",

        suggestedFix:
          "Review the failed test cases and assertions, fix the underlying code, and run the tests again.",

        confidence: 97,

        autoFixAvailable: false,

        category: "TEST",

        severity: "HIGH",

        details: {
          message:
            "One or more tests failed.",

          file: location ? location.file : null,
          line: location ? location.line : null,
          column: location ? location.column : null,
        },
      };
    }

    // ==================================================
    // 21. Out Of Memory
    // ==================================================
    else if (
      logText.includes("out of memory") ||
      logText.includes("heap out of memory") ||
      logText.includes("javascript heap")
    ) {
      result = {
        detectedIssue: "Memory Limit Exceeded",

        suggestedFix:
          "Reduce memory usage or increase Node.js heap size using '--max-old-space-size'.",

        confidence: 99,

        autoFixAvailable: false,

        category: "PERFORMANCE",

        severity: "HIGH",

        details: {
          message:
            "The process exceeded its available memory.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 22. Network Error
    // ==================================================
    else if (
      logText.includes("enotfound") ||
      logText.includes("etimedout") ||
      logText.includes("network error") ||
      logText.includes("connection timed out")
    ) {
      result = {
        detectedIssue: "Network Connection Error",

        suggestedFix:
          "Check internet connectivity, DNS, firewall, proxy configuration, and remote service availability.",

        confidence: 97,

        autoFixAvailable: false,

        category: "NETWORK",

        severity: "MEDIUM",

        details: {
          message:
            "A network connection failed.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 23. Environment Variable
    // ==================================================
    else if (
      logText.includes("undefined") &&
      (
        logText.includes("process.env") ||
        logText.includes("environment variable")
      )
    ) {
      result = {
        detectedIssue: "Environment Variable Missing",

        suggestedFix:
          "Check the project's .env file and verify that all required environment variables are configured.",

        confidence: 95,

        autoFixAvailable: false,

        category: "CONFIGURATION",

        severity: "HIGH",

        details: {
          message:
            "A required environment variable appears to be undefined.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 24. Command Not Found
    // ==================================================
    else if (
      logText.includes("command not found") ||
      logText.includes("is not recognized as an internal") ||
      logText.includes("not recognized as the name of a cmdlet")
    ) {
      result = {
        detectedIssue: "Command Not Found",

        suggestedFix:
          "Install the required command-line tool and make sure it is available in the system PATH.",

        confidence: 99,

        autoFixAvailable: false,

        category: "SYSTEM",

        severity: "HIGH",

        details: {
          message:
            "The requested command could not be found.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // 25. File Not Found
    // ==================================================
    else if (
      logText.includes("file not found") ||
      logText.includes("no such file or directory")
    ) {
      result = {
        detectedIssue: "File or Directory Not Found",

        suggestedFix:
          "Verify that the required file or directory exists and that the configured path is correct.",

        confidence: 98,

        autoFixAvailable: false,

        category: "FILESYSTEM",

        severity: "HIGH",

        details: {
          message:
            "A required file or directory could not be found.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    // ==================================================
    // Success
    // ==================================================
    else if (
      logText.includes("build completed successfully") ||
      logText.includes("tests completed successfully") ||
      logText.includes("completed successfully") ||
      logText.includes("build successful")
    ) {
      result = {
        detectedIssue: "No Critical Error Detected",

        suggestedFix: "No fix is required.",

        confidence: 95,

        autoFixAvailable: false,

        category: "SUCCESS",

        severity: "LOW",

        details: {
          message:
            "The command completed successfully.",

          file: null,
          line: null,
          column: null,
        },
      };
    }

    return result;
  } catch (error) {
    console.error("========================================");
    console.error("AI LOG ANALYZER ERROR");
    console.error(error);
    console.error("========================================");

    return {
      detectedIssue: "Log Analysis Failed",

      suggestedFix:
        "Unable to analyze the provided logs. Review the logs manually.",

      confidence: 0,

      autoFixAvailable: false,

      category: "ANALYZER",

      severity: "UNKNOWN",

      details: {
        message: error.message,
        file: null,
        line: null,
        column: null,
      },

      error: error.message,
    };
  }
};

// ======================================================
// Export
// ======================================================

module.exports = {
  analyzeLogs,
};