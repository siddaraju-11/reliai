const { exec } = require("child_process");

// ======================================================
// Execute Command
// ======================================================
const executeCommand = (command, projectPath) => {
  return new Promise((resolve) => {
    const startTime = Date.now();

    console.log("========================================");
    console.log("COMMAND STARTED");
    console.log("Project Path :", projectPath);
    console.log("Command      :", command);
    console.log("========================================");

    exec(
      command,
      {
        cwd: projectPath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const duration = Date.now() - startTime;

        const logs = `${stdout || ""}\n${stderr || ""}`.trim();

        // ==========================================
        // Command Failed
        // ==========================================
        if (error) {
          console.error("========================================");
          console.error("COMMAND FAILED");
          console.error("Command  :", command);
          console.error("Duration :", duration, "ms");
          console.error("Error    :", error.message);
          console.error("========================================");

          return resolve({
            success: false,
            status: "FAILED",
            command,
            duration,
            logs,
            error: error.message,
          });
        }

        // ==========================================
        // Command Successful
        // ==========================================
        console.log("========================================");
        console.log("COMMAND COMPLETED");
        console.log("Command  :", command);
        console.log("Duration :", duration, "ms");
        console.log("========================================");

        return resolve({
          success: true,
          status: "SUCCESS",
          command,
          duration,
          logs,
          error: null,
        });
      }
    );
  });
};

// ======================================================
// Export
// ======================================================
module.exports = {
  executeCommand,
};