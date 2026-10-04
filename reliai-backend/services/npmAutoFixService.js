const { executeCommand } = require("./commandService");

// ======================================================
// NPM Dependency Auto Fix Service
// ======================================================

const fixNpmDependencies = async (projectPath, logs = "") => {
  try {
    // ==================================================
    // Validate Project Path
    // ==================================================
    if (!projectPath) {
      return {
        success: false,
        fixed: false,
        message: "Project path is required.",
        autoFixAvailable: false,
      };
    }

    // ==================================================
    // Validate Logs
    // ==================================================
    const logText = String(logs).toLowerCase();

    console.log("========================================");
    console.log("NPM AUTO-FIX STARTED");
    console.log("Project Path :", projectPath);
    console.log("========================================");

    // ==================================================
    // Step 1: Run npm install
    // ==================================================
    console.log("Running npm install...");

    const installResult = await executeCommand(
      "npm install",
      projectPath
    );

    // ==================================================
    // npm install SUCCESS
    // ==================================================
    if (installResult.success) {
      console.log("========================================");
      console.log("NPM AUTO-FIX SUCCESSFUL");
      console.log("========================================");

      return {
        success: true,
        fixed: true,

        type: "NPM_DEPENDENCY_FIX",

        command: "npm install",

        duration: installResult.duration,

        logs: installResult.logs,

        error: null,

        message:
          "Project dependencies were installed successfully.",

        autoFixAvailable: true,
      };
    }

    // ==================================================
    // Step 2: npm install failed
    // ==================================================
    console.log("========================================");
    console.log("NPM INSTALL FAILED");
    console.log("TRYING CLEAN INSTALL");
    console.log("========================================");

    // ==================================================
    // Windows / Cross Platform Cleanup
    // ==================================================
    let cleanupCommand;

    if (process.platform === "win32") {
      cleanupCommand =
        "if exist node_modules rmdir /s /q node_modules && if exist package-lock.json del /f /q package-lock.json";
    } else {
      cleanupCommand =
        "rm -rf node_modules package-lock.json";
    }

    // ==================================================
    // Clean node_modules
    // ==================================================
    const cleanupResult = await executeCommand(
      cleanupCommand,
      projectPath
    );

    if (!cleanupResult.success) {
      return {
        success: false,
        fixed: false,

        type: "NPM_DEPENDENCY_FIX",

        command: cleanupCommand,

        duration: cleanupResult.duration,

        logs: cleanupResult.logs,

        error: cleanupResult.error,

        message:
          "Failed to clean node_modules and package-lock.json.",

        autoFixAvailable: false,
      };
    }

    // ==================================================
    // Step 3: Run npm install again
    // ==================================================
    console.log("========================================");
    console.log("RUNNING CLEAN NPM INSTALL");
    console.log("========================================");

    const reinstallResult = await executeCommand(
      "npm install",
      projectPath
    );

    // ==================================================
    // Clean Install SUCCESS
    // ==================================================
    if (reinstallResult.success) {
      console.log("========================================");
      console.log("CLEAN NPM INSTALL SUCCESSFUL");
      console.log("========================================");

      return {
        success: true,
        fixed: true,

        type: "NPM_DEPENDENCY_FIX",

        command: "npm install",

        duration:
          installResult.duration +
          cleanupResult.duration +
          reinstallResult.duration,

        logs: `
INITIAL NPM INSTALL:
${installResult.logs || ""}

CLEANUP:
${cleanupResult.logs || ""}

CLEAN NPM INSTALL:
${reinstallResult.logs || ""}
`.trim(),

        error: null,

        message:
          "Dependencies were repaired using a clean npm installation.",

        autoFixAvailable: true,
      };
    }

    // ==================================================
    // Clean Install FAILED
    // ==================================================
    console.error("========================================");
    console.error("NPM AUTO-FIX FAILED");
    console.error("========================================");

    return {
      success: false,
      fixed: false,

      type: "NPM_DEPENDENCY_FIX",

      command: "npm install",

      duration:
        installResult.duration +
        cleanupResult.duration +
        reinstallResult.duration,

      logs: `
INITIAL NPM INSTALL:
${installResult.logs || ""}

CLEANUP:
${cleanupResult.logs || ""}

CLEAN NPM INSTALL:
${reinstallResult.logs || ""}
`.trim(),

      error: reinstallResult.error,

      message:
        "Unable to repair the npm dependencies automatically.",

      autoFixAvailable: false,
    };
  } catch (error) {
    // ==================================================
    // Service Error
    // ==================================================
    console.error("========================================");
    console.error("NPM AUTO-FIX SERVICE ERROR");
    console.error(error);
    console.error("========================================");

    return {
      success: false,
      fixed: false,

      type: "NPM_DEPENDENCY_FIX",

      message: "NPM auto-fix failed.",

      error: error.message,

      duration: 0,

      autoFixAvailable: false,
    };
  }
};

// ======================================================
// Export
// ======================================================

module.exports = {
  fixNpmDependencies,
};