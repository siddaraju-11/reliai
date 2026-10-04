const fs = require("fs");
const path = require("path");

const {
  spawn,
  spawnSync,
} = require("child_process");

const {
  validateProjectPath,
  validateCommand,
  validateExecutionRequest,
} = require("./executionSecurity");

// ======================================================
// PROJECT TYPES
// ======================================================

const PROJECT_TYPES = {
  NODE: "NODE",
  PYTHON: "PYTHON",
  JAVA_MAVEN: "JAVA_MAVEN",
  JAVA_GRADLE: "JAVA_GRADLE",
  UNKNOWN: "UNKNOWN",
};

// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_TIMEOUT =
  5 * 60 * 1000;

// After timeout/cancellation we normally expect the
// child process to emit "close".
//
// On Windows this does not always happen reliably,
// especially when shell:true creates descendant
// processes.
//
// Therefore we wait only this long before manually
// resolving the command.
const FORCE_FINISH_DELAY =
  5 * 1000;

// ======================================================
// ACTIVE PROCESS REGISTRY
// ======================================================
//
// buildId -> {
//   child,
//   pid,
//   command,
//   cwd,
//   startedAt,
//   cancelled
// }
//
// This registry allows pipelineExecutionService to
// cancel a running command.
//
// ======================================================

const activeProcesses =
  new Map();

// ======================================================
// EXISTS
// ======================================================

function exists(targetPath) {
  try {
    return fs.existsSync(
      targetPath
    );
  } catch (error) {
    return false;
  }
}

// ======================================================
// NORMALIZE PROJECT PATH
// ======================================================

function normalizeProjectPath(
  projectInput
) {
  let projectPath =
    projectInput;

  // ----------------------------------------------------
  // Support object input
  // ----------------------------------------------------

  if (
    projectInput &&
    typeof projectInput ===
      "object" &&
    !Array.isArray(
      projectInput
    )
  ) {
    projectPath =
      projectInput.projectPath ||
      projectInput.path ||
      projectInput.value ||
      projectInput.project_path ||
      "";
  }

  // ----------------------------------------------------
  // Validate
  // ----------------------------------------------------

  if (
    typeof projectPath !==
    "string"
  ) {
    throw new Error(
      "Project path must be a string."
    );
  }

  projectPath =
    projectPath.trim();

  if (!projectPath) {
    throw new Error(
      "Project path is required."
    );
  }

  // ----------------------------------------------------
  // Remove wrapping quotes
  // ----------------------------------------------------

  if (
    (
      projectPath.startsWith(
        '"'
      ) &&
      projectPath.endsWith(
        '"'
      )
    ) ||
    (
      projectPath.startsWith(
        "'"
      ) &&
      projectPath.endsWith(
        "'"
      )
    )
  ) {
    projectPath =
      projectPath.slice(
        1,
        -1
      );
  }

  // ----------------------------------------------------
  // Resolve absolute path
  // ----------------------------------------------------

  return path.resolve(
    projectPath
  );
}

// ======================================================
// NORMALIZE LOG CHUNK
// ======================================================

function normalizeLogChunk(
  chunk
) {
  if (
    chunk === null ||
    chunk === undefined
  ) {
    return "";
  }

  if (
    Buffer.isBuffer(chunk)
  ) {
    return chunk.toString(
      "utf8"
    );
  }

  return String(chunk);
}

// ======================================================
// SAFE LOG CALLBACK
// ======================================================

function emitLog(
  onLog,
  chunk
) {
  if (
    typeof onLog !==
    "function"
  ) {
    return;
  }

  const text =
    normalizeLogChunk(
      chunk
    );

  if (!text) {
    return;
  }

  try {
    const callbackResult =
      onLog(text);

    // Do not await logging.
    //
    // Build execution must never freeze because a
    // database/log callback is slow.
    if (
      callbackResult &&
      typeof callbackResult.catch ===
        "function"
    ) {
      callbackResult.catch(
        (error) => {
          console.error(
            "[BUILD SERVICE] onLog callback error:",
            error.message
          );
        }
      );
    }
  } catch (error) {
    console.error(
      "[BUILD SERVICE] onLog callback error:",
      error.message
    );
  }
}

// ======================================================
// ACTIVE PROCESS HELPERS
// ======================================================

function registerBuildProcess(
  buildId,
  child,
  metadata = {}
) {
  if (
    !buildId ||
    !child
  ) {
    return;
  }

  const key =
    String(buildId);

  activeProcesses.set(
    key,
    {
      child,

      pid:
        child.pid ||
        null,

      command:
        metadata.command ||
        "",

      cwd:
        metadata.cwd ||
        "",

      startedAt:
        new Date(),

      cancelled:
        false,
    }
  );

  console.log(
    "[BUILD SERVICE] Process registered:",
    key
  );

  console.log(
    "[BUILD SERVICE] PID:",
    child.pid ||
      "unknown"
  );
}

// ======================================================
// UNREGISTER PROCESS
// ======================================================

function unregisterBuildProcess(
  buildId,
  child = null
) {
  if (!buildId) {
    return;
  }

  const key =
    String(buildId);

  const current =
    activeProcesses.get(
      key
    );

  if (!current) {
    return;
  }

  // Protect against an old process removing a newer
  // process registered under the same build ID.
  if (
    child &&
    current.child &&
    current.child !== child
  ) {
    return;
  }

  activeProcesses.delete(
    key
  );

  console.log(
    "[BUILD SERVICE] Process unregistered:",
    key
  );
}

// ======================================================
// GET ACTIVE PROCESS
// ======================================================

function getBuildProcess(
  buildId
) {
  if (!buildId) {
    return null;
  }

  return (
    activeProcesses.get(
      String(buildId)
    ) ||
    null
  );
}

// ======================================================
// CHECK ACTIVE PROCESS
// ======================================================

function hasActiveBuildProcess(
  buildId
) {
  return Boolean(
    getBuildProcess(
      buildId
    )
  );
}

// ======================================================
// GET ACTIVE PROCESS IDS
// ======================================================

function getActiveBuildIds() {
  return Array.from(
    activeProcesses.keys()
  );
}

// ======================================================
// KILL PROCESS TREE
// ======================================================

function killProcessTree(
  pid
) {
  if (!pid) {
    return false;
  }

  console.log(
    "[BUILD SERVICE] Killing process tree:",
    pid
  );

  // ====================================================
  // WINDOWS
  // ====================================================

  if (
    process.platform ===
    "win32"
  ) {
    try {
      const result =
        spawnSync(
          "taskkill",
          [
            "/PID",
            String(pid),
            "/T",
            "/F",
          ],
          {
            windowsHide: true,
            encoding: "utf8",
            timeout: 10000,
          }
        );

      if (
        result.error
      ) {
        console.error(
          "[BUILD SERVICE] taskkill error:",
          result.error.message
        );

        return false;
      }

      // taskkill can return non-zero when the process
      // already exited. That is not necessarily fatal.
      if (
        result.status !== 0
      ) {
        const message =
          (
            result.stderr ||
            result.stdout ||
            ""
          ).trim();

        console.warn(
          "[BUILD SERVICE] taskkill returned status",
          result.status,
          message
        );
      } else {
        console.log(
          "[BUILD SERVICE] Windows process tree terminated."
        );
      }

      return true;
    } catch (error) {
      console.error(
        "[BUILD SERVICE] Unable to terminate Windows process tree:",
        error.message
      );

      return false;
    }
  }

  // ====================================================
  // UNIX / LINUX / MAC
  // ====================================================

  try {
    // Because detached:true is used on Unix,
    // -pid targets the entire process group.
    process.kill(
      -pid,
      "SIGTERM"
    );

    setTimeout(
      () => {
        try {
          process.kill(
            -pid,
            "SIGKILL"
          );
        } catch (error) {
          // Process probably already exited.
        }
      },
      2000
    );

    return true;
  } catch (error) {
    try {
      process.kill(
        pid,
        "SIGTERM"
      );

      return true;
    } catch (
      fallbackError
    ) {
      console.error(
        "[BUILD SERVICE] Unable to terminate process:",
        fallbackError.message
      );

      return false;
    }
  }
}

// ======================================================
// CANCEL BUILD PROCESS
// ======================================================

function cancelBuildProcess(
  buildId
) {
  if (!buildId) {
    return {
      success: false,
      cancelled: false,
      message:
        "Build ID is required.",
    };
  }

  const key =
    String(buildId);

  const processInfo =
    activeProcesses.get(
      key
    );

  if (!processInfo) {
    return {
      success: false,
      cancelled: false,
      message:
        "No active process was found for this build.",
    };
  }

  processInfo.cancelled =
    true;

  activeProcesses.set(
    key,
    processInfo
  );

  const pid =
    processInfo.pid ||
    processInfo.child?.pid;

  console.log(
    "[BUILD SERVICE] Cancellation requested for build:",
    key
  );

  console.log(
    "[BUILD SERVICE] PID:",
    pid ||
      "unknown"
  );

  if (pid) {
    killProcessTree(
      pid
    );
  }

  return {
    success: true,
    cancelled: true,
    buildId: key,
    pid:
      pid || null,
    message:
      "Build cancellation requested.",
  };
}

// ======================================================
// CANCEL COMMAND ALIAS
// ======================================================

function cancelCommand(
  buildId
) {
  return cancelBuildProcess(
    buildId
  );
}

// ======================================================
// EXECUTE COMMAND
// ======================================================
//
// Executes a shell command inside the supplied directory.
//
// Handles:
//
// SUCCESS
// FAILED
// CANCELLED
// TIMEOUT
// SPAWN ERROR
//
// IMPORTANT:
// This function guarantees that the returned Promise
// eventually resolves even when Windows fails to emit
// the child-process "close" event after taskkill.
//
// ======================================================

async function executeCommand(
  command,
  options = {}
) {
  // ====================================================
  // OPTIONS
  // ====================================================

  const {
    cwd,
    timeout =
      DEFAULT_TIMEOUT,

    buildId =
      null,

    onLog =
      null,

    env =
      {},

    shell =
      true,
  } = options;

  // ====================================================
  // SECURITY VALIDATION
  // ====================================================

  const requestedWorkingDirectory =
    cwd || process.cwd();

  let normalizedWorkingDirectory;

  try {
    normalizedWorkingDirectory =
      normalizeProjectPath(
        requestedWorkingDirectory
      );
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      command:
        typeof command === "string"
          ? command.trim()
          : "",
      duration: 0,
      logs:
        `[SECURITY] ${error.message}`,
      error: error.message,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      securityBlocked: true,
    };
  }

  const securityCheck =
    validateExecutionRequest({
      command,
      projectPath:
        normalizedWorkingDirectory,
    });

  if (!securityCheck.valid) {
    console.error(
      "[BUILD SERVICE] SECURITY BLOCK:",
      securityCheck.error
    );

    return {
      success: false,
      status: "FAILED",
      command:
        typeof command === "string"
          ? command.trim()
          : "",
      duration: 0,
      logs:
        `[SECURITY] ${securityCheck.error}`,
      error:
        securityCheck.error,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      securityBlocked: true,
    };
  }

  const normalizedCommand =
    securityCheck.command;

  const workingDirectory =
    securityCheck.projectPath;

  // ====================================================
  // NORMALIZE TIMEOUT
  // ====================================================

  const commandTimeout =
    Number.isFinite(
      Number(timeout)
    ) &&
    Number(timeout) > 0
      ? Number(timeout)
      : DEFAULT_TIMEOUT;

  // ====================================================
  // START COMMAND
  // ====================================================

  return new Promise(
    (resolve) => {
      const startTime =
        Date.now();

      let child =
        null;

      let stdout =
        "";

      let stderr =
        "";

      let finished =
        false;

      let timedOut =
        false;

      let spawnError =
        null;

      let timeoutTimer =
        null;

      let forceFinishTimer =
        null;

      // =================================================
      // RESULT FINALIZER
      // =================================================
            //
      // Every completion path must go through finish().
      //
      // This prevents:
      //
      // - duplicate resolve()
      // - duplicate process cleanup
      // - timeout + close race
      // - cancellation + close race
      // - error + close race
      //
      // =================================================

      const finish = (
        result = {}
      ) => {
        if (finished) {
          return;
        }

        finished =
          true;

        // -----------------------------------------------
        // Clear timers
        // -----------------------------------------------

        if (
          timeoutTimer
        ) {
          clearTimeout(
            timeoutTimer
          );

          timeoutTimer =
            null;
        }

        if (
          forceFinishTimer
        ) {
          clearTimeout(
            forceFinishTimer
          );

          forceFinishTimer =
            null;
        }

        // -----------------------------------------------
        // Remove process registry entry
        // -----------------------------------------------

        if (buildId) {
          unregisterBuildProcess(
            buildId,
            child
          );
        }

        const duration =
          Date.now() -
          startTime;

        const combinedLogs =
          [
            stdout,
            stderr,
          ]
            .filter(
              Boolean
            )
            .join(
              stdout &&
              stderr
                ? "\n"
                : ""
            );

        const finalResult = {
          success:
            Boolean(
              result.success
            ),

          status:
            result.status ||
            (
              result.success
                ? "SUCCESS"
                : "FAILED"
            ),

          command:
            normalizedCommand,

          duration:
            result.duration ??
            duration,

          logs:
            result.logs ??
            combinedLogs,

          error:
            result.error ??
            null,

          cancelled:
            Boolean(
              result.cancelled
            ),

          timedOut:
            Boolean(
              result.timedOut
            ),

          exitCode:
            result.exitCode ??
            null,

          signal:
            result.signal ??
            null,

          securityBlocked:
            Boolean(
              result.securityBlocked
            ),
        };

        console.log(
          "========================================"
        );

        console.log(
          "[BUILD SERVICE] COMMAND FINISHED"
        );

        console.log(
          "Command:",
          normalizedCommand
        );

        console.log(
          "Status:",
          finalResult.status
        );

        console.log(
          "Success:",
          finalResult.success
        );

        console.log(
          "Cancelled:",
          finalResult.cancelled
        );

        console.log(
          "Timed Out:",
          finalResult.timedOut
        );

        console.log(
          "Exit Code:",
          finalResult.exitCode
        );

        console.log(
          "Signal:",
          finalResult.signal
        );

        console.log(
          "Duration:",
          `${finalResult.duration}ms`
        );

        console.log(
          "========================================"
        );

        resolve(
          finalResult
        );
      };

      // =================================================
      // LOG COMMAND INFORMATION
      // =================================================

      console.log("");

      console.log(
        "========================================"
      );

      console.log(
        "[BUILD SERVICE] EXECUTING COMMAND"
      );

      console.log(
        "Command:",
        normalizedCommand
      );

      console.log(
        "Directory:",
        workingDirectory
      );

      console.log(
        "Build ID:",
        buildId ||
        "none"
      );

      console.log(
        "Timeout:",
        `${commandTimeout}ms`
      );

      console.log(
        "Platform:",
        process.platform
      );

      console.log(
        "========================================"
      );

      // =================================================
      // SPAWN PROCESS
      // =================================================

      try {
        child =
          spawn(
            normalizedCommand,
            [],
            {
              cwd:
                workingDirectory,

              shell,

              windowsHide:
                true,

              detached:
                process.platform !==
                "win32",

              env: {
                ...process.env,
                ...env,
              },
            }
          );
      } catch (error) {
        spawnError =
          error;

        finish({
          success: false,

          status:
            "FAILED",

          error:
            `Unable to start command: ${error.message}`,

          cancelled:
            false,

          timedOut:
            false,

          exitCode:
            null,

          signal:
            null,
        });

        return;
      }

      // =================================================
      // REGISTER PROCESS
      // =================================================

      if (buildId) {
        registerBuildProcess(
          buildId,
          child,
          {
            command:
              normalizedCommand,

            cwd:
              workingDirectory,
          }
        );
      }

      console.log(
        "[BUILD SERVICE] Process started."
      );

      console.log(
        "[BUILD SERVICE] PID:",
        child.pid ||
        "unknown"
      );

      // =================================================
      // STDOUT
      // =================================================

      if (
        child.stdout
      ) {
        child.stdout.on(
          "data",
          (chunk) => {
            const text =
              normalizeLogChunk(
                chunk
              );

            stdout +=
              text;

            process.stdout.write(
              text
            );

            emitLog(
              onLog,
              text
            );
          }
        );
      }

      // =================================================
      // STDERR
      // =================================================

      if (
        child.stderr
      ) {
        child.stderr.on(
          "data",
          (chunk) => {
            const text =
              normalizeLogChunk(
                chunk
              );

            stderr +=
              text;

            process.stderr.write(
              text
            );

            emitLog(
              onLog,
              text
            );
          }
        );
      }

      // =================================================
      // PROCESS ERROR
      // =================================================

      child.on(
        "error",
        (error) => {
          if (finished) {
            return;
          }

          spawnError =
            error;

          console.error(
            "[BUILD SERVICE] PROCESS ERROR:",
            error.message
          );

          // Some spawn errors may still be followed by
          // close. finish() prevents duplicate resolution.

          finish({
            success: false,

            status:
              "FAILED",

            error:
              `Command execution error: ${error.message}`,

            cancelled:
              false,

            timedOut:
              false,

            exitCode:
              child?.exitCode ??
              null,

            signal:
              child?.signalCode ??
              null,
          });
        }
      );

      // =================================================
      // PROCESS CLOSE
      // =================================================

      child.on(
        "close",
        (
          code,
          signal
        ) => {
          if (finished) {
            return;
          }

          console.log(
            "[BUILD SERVICE] Process close event."
          );

          console.log(
            "[BUILD SERVICE] Close code:",
            code
          );

          console.log(
            "[BUILD SERVICE] Close signal:",
            signal
          );

          // ---------------------------------------------
          // Was build cancelled?
          // ---------------------------------------------

          const processInfo =
            buildId
              ? getBuildProcess(
                  buildId
                )
              : null;

          const cancelled =
            Boolean(
              processInfo?.cancelled
            );

          if (cancelled) {
            finish({
              success: false,

              status:
                "CANCELLED",

              error:
                "Build was cancelled.",

              cancelled:
                true,

              timedOut:
                false,

              exitCode:
                code,

              signal:
                signal,
            });

            return;
          }

          // ---------------------------------------------
          // Was command timed out?
          // ---------------------------------------------

          if (timedOut) {
            finish({
              success: false,

              status:
                "TIMEOUT",

              error:
                `Command timed out after ${commandTimeout}ms.`,

              cancelled:
                false,

              timedOut:
                true,

              exitCode:
                code,

              signal:
                signal,
            });

            return;
          }

          // ---------------------------------------------
          // Spawn error
          // ---------------------------------------------

          if (spawnError) {
            finish({
              success: false,

              status:
                "FAILED",

              error:
                spawnError.message,

              cancelled:
                false,

              timedOut:
                false,

              exitCode:
                code,

              signal:
                signal,
            });

            return;
          }

          // ---------------------------------------------
          // Success
          // ---------------------------------------------

          if (code === 0) {
            finish({
              success: true,

              status:
                "SUCCESS",

              error:
                null,

              cancelled:
                false,

              timedOut:
                false,

              exitCode:
                code,

              signal:
                signal,
            });

            return;
          }

          // ---------------------------------------------
          // Failure
          // ---------------------------------------------

          const errorMessage =
            stderr.trim() ||
            stdout.trim() ||
            `Command exited with code ${code}.`;

          finish({
            success: false,

            status:
              "FAILED",

            error:
              errorMessage,

            cancelled:
              false,

            timedOut:
              false,

            exitCode:
              code,

            signal:
              signal,
          });
        }
      );

      // =================================================
      // TIMEOUT
      // =================================================

      timeoutTimer =
        setTimeout(
          () => {
            if (finished) {
              return;
            }

            timedOut =
              true;

            console.error("");

            console.error(
              "========================================"
            );

            console.error(
              "[BUILD SERVICE] COMMAND TIMEOUT"
            );

            console.error(
              "Command:",
              normalizedCommand
            );

            console.error(
              "Build ID:",
              buildId ||
              "none"
            );

            console.error(
              "PID:",
              child?.pid ||
              "unknown"
            );

            console.error(
              "Timeout:",
              `${commandTimeout}ms`
            );

            console.error(
              "========================================"
            );

            // -------------------------------------------
            // Attempt process termination
            // -------------------------------------------

            if (
              child &&
              child.pid
            ) {
              try {
                killProcessTree(
                  child.pid
                );
              } catch (error) {
                console.error(
                  "[BUILD SERVICE] Timeout kill error:",
                  error.message
                );
              }
            }

            // -------------------------------------------
            // GUARANTEED RESOLUTION
            // -------------------------------------------
            //
            // Usually taskkill causes "close" to fire.
            //
            // If it doesn't, resolve the command anyway
            // after FORCE_FINISH_DELAY.
            //
            // -------------------------------------------

            forceFinishTimer =
              setTimeout(
                () => {
                  if (
                    finished
                  ) {
                    return;
                  }

                  console.error(
                    "[BUILD SERVICE] Process did not emit close after timeout."
                  );

                  console.error(
                    "[BUILD SERVICE] Forcing command completion."
                  );

                  finish({
                    success:
                      false,

                    status:
                      "TIMEOUT",

                    error:
                      `Command timed out after ${commandTimeout}ms and did not terminate cleanly.`,

                    cancelled:
                      false,

                    timedOut:
                      true,

                    exitCode:
                      child?.exitCode ??
                      null,

                    signal:
                      child?.signalCode ??
                      null,
                  });
                },
                FORCE_FINISH_DELAY
              );
          },
          commandTimeout
        );

      // =================================================
      // CANCELLATION WATCHDOG
      // =================================================
      //
      // cancelBuildProcess() kills the process tree.
      //
      // Normally "close" then fires and handles the
      // cancellation above.
      //
      // This watchdog also prevents an indefinitely
      // unresolved Promise if Windows never emits close.
      //
      // =================================================

      if (buildId) {
        const cancellationWatcher =
          setInterval(
            () => {
              if (finished) {
                clearInterval(
                  cancellationWatcher
                );

                return;
              }

              const processInfo =
                getBuildProcess(
                  buildId
                );

              if (
                !processInfo ||
                !processInfo.cancelled
              ) {
                return;
              }

              clearInterval(
                cancellationWatcher
              );

              console.log(
                "[BUILD SERVICE] Cancellation detected for:",
                String(
                  buildId
                )
              );

              // Give the process a few seconds to emit
              // close after taskkill.

              setTimeout(
                () => {
                  if (
                    finished
                  ) {
                    return;
                  }

                  console.warn(
                    "[BUILD SERVICE] Cancelled process did not emit close. Forcing completion."
                  );

                  finish({
                    success:
                      false,

                    status:
                      "CANCELLED",

                    error:
                      "Build was cancelled.",

                    cancelled:
                      true,

                    timedOut:
                      false,

                    exitCode:
                      child?.exitCode ??
                      null,

                    signal:
                      child?.signalCode ??
                      null,
                  });
                },
                FORCE_FINISH_DELAY
              );
            },
            250
          );
      }
    }
  );
}

// ======================================================
// DETECT PROJECT TYPE
// ======================================================

function detectProjectType(
  projectInput
) {
  let projectRoot;

  try {
    projectRoot =
      normalizeProjectPath(
        projectInput
      );
  } catch (error) {
    return PROJECT_TYPES.UNKNOWN;
  }

  if (!exists(projectRoot)) {
    return PROJECT_TYPES.UNKNOWN;
  }

  // ====================================================
  // NODE.JS
  // ====================================================

  if (
    exists(
      path.join(
        projectRoot,
        "package.json"
      )
    )
  ) {
    return PROJECT_TYPES.NODE;
  }

  // ====================================================
  // MAVEN
  // ====================================================

  if (
    exists(
      path.join(
        projectRoot,
        "pom.xml"
      )
    )
  ) {
    return PROJECT_TYPES.JAVA_MAVEN;
  }

  // ====================================================
  // GRADLE
  // ====================================================

  if (
    exists(
      path.join(
        projectRoot,
        "build.gradle"
      )
    ) ||
    exists(
      path.join(
        projectRoot,
        "build.gradle.kts"
      )
    ) ||
    exists(
      path.join(
        projectRoot,
        "gradlew"
      )
    ) ||
    exists(
      path.join(
        projectRoot,
        "gradlew.bat"
      )
    )
  ) {
    return PROJECT_TYPES.JAVA_GRADLE;
  }

  // ====================================================
  // PYTHON
  // ====================================================

  const pythonMarkers = [
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "Pipfile",
    "manage.py",
  ];

  const pythonProject =
    pythonMarkers.some(
      (file) =>
        exists(
          path.join(
            projectRoot,
            file
          )
        )
    );

  if (pythonProject) {
    return PROJECT_TYPES.PYTHON;
  }

  // ----------------------------------------------------
  // Fallback: check root for .py files
  // ----------------------------------------------------

  try {
    const files =
      fs.readdirSync(
        projectRoot
      );

    if (
      files.some(
        (file) =>
          file
            .toLowerCase()
            .endsWith(".py")
      )
    ) {
      return PROJECT_TYPES.PYTHON;
    }
  } catch (error) {
    // Ignore directory read failure.
  }

  return PROJECT_TYPES.UNKNOWN;
}

// ======================================================
// READ PACKAGE.JSON
// ======================================================

function readPackageJson(
  projectRoot
) {
  const packageJsonPath =
    path.join(
      projectRoot,
      "package.json"
    );

  if (
    !exists(
      packageJsonPath
    )
  ) {
    throw new Error(
      "package.json was not found."
    );
  }

  try {
    const raw =
      fs.readFileSync(
        packageJsonPath,
        "utf8"
      );

    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Unable to read package.json: ${error.message}`
    );
  }
}

// ======================================================
// NODE PACKAGE MANAGER
// ======================================================

function detectNodePackageManager(
  projectRoot
) {
  if (
    exists(
      path.join(
        projectRoot,
        "pnpm-lock.yaml"
      )
    )
  ) {
    return "pnpm";
  }

  if (
    exists(
      path.join(
        projectRoot,
        "yarn.lock"
      )
    )
  ) {
    return "yarn";
  }

  return "npm";
}

// ======================================================
// NODE INSTALL COMMAND
// ======================================================

function getNodeInstallCommand(
  projectRoot,
  packageManager
) {
  if (
    packageManager ===
    "pnpm"
  ) {
    return "pnpm install";
  }

  if (
    packageManager ===
    "yarn"
  ) {
    return "yarn install";
  }

  // npm ci is preferable when a lockfile exists.
  if (
    exists(
      path.join(
        projectRoot,
        "package-lock.json"
      )
    )
  ) {
    return "npm ci";
  }

  return "npm install";
}

// ======================================================
// NODE BUILD COMMAND
// ======================================================

function getNodeBuildCommand(
  packageJson,
  packageManager
) {
  const scripts =
    packageJson?.scripts ||
    {};

  // ----------------------------------------------------
  // Prefer an explicit build script
  // ----------------------------------------------------

  if (scripts.build) {
    if (
      packageManager ===
      "yarn"
    ) {
      return "yarn build";
    }

    if (
      packageManager ===
      "pnpm"
    ) {
      return "pnpm run build";
    }

    return "npm run build";
  }

  // ----------------------------------------------------
  // No build script
  // ----------------------------------------------------
  //
  // Many Node/Express backends don't require compilation.
  //
  // In that case installation itself is sufficient and
  // we return no build command.
  // ----------------------------------------------------

  return "";
}

// ======================================================
// SKIPPED BUILD RESULT
// ======================================================

function skippedBuildResult(
  command,
  message,
  extra = {}
) {
  return {
    success: true,
    status: "SKIPPED",
    command:
      command || "",
    duration: 0,
    logs:
      `${message}\n`,
    error: null,
    cancelled: false,
    timedOut: false,
    exitCode: 0,
    signal: null,
    skipped: true,
    ...extra,
  };
}
// ======================================================
// RUN NODE BUILD
// ======================================================

async function runNodeBuild(
  projectInput,
  options = {}
) {
  let projectRoot;

  try {
    projectRoot =
      normalizeProjectPath(
        projectInput
      );
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        error.message,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      projectType:
        PROJECT_TYPES.NODE,
    };
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "[BUILD SERVICE] NODE BUILD STARTED"
  );

  console.log(
    "Project:",
    projectRoot
  );

  console.log(
    "Build ID:",
    options.buildId ||
      "none"
  );

  console.log(
    "========================================"
  );

  // ====================================================
  // PACKAGE.JSON
  // ====================================================

  let packageJson;

  try {
    packageJson =
      readPackageJson(
        projectRoot
      );
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        error.message,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      projectType:
        PROJECT_TYPES.NODE,
    };
  }

  // ====================================================
  // PACKAGE MANAGER
  // ====================================================

  const packageManager =
    detectNodePackageManager(
      projectRoot
    );

  console.log(
    "[BUILD SERVICE] Package manager:",
    packageManager
  );

  // ====================================================
  // DEPENDENCY INSTALLATION
  // ====================================================

  const nodeModulesPath =
    path.join(
      projectRoot,
      "node_modules"
    );

  if (
    !exists(
      nodeModulesPath
    )
  ) {
    const installCommand =
      getNodeInstallCommand(
        projectRoot,
        packageManager
      );

    console.log(
      "[BUILD SERVICE] node_modules not found."
    );

    console.log(
      "[BUILD SERVICE] Installing dependencies:"
    );

    console.log(
      installCommand
    );

    const installResult =
      await executeCommand(
        installCommand,
        {
          cwd:
            projectRoot,

          timeout:
            options.installTimeout ||
            options.timeout ||
            DEFAULT_TIMEOUT,

          buildId:
            options.buildId,

          onLog:
            options.onLog,
        }
      );

    if (
      !installResult.success
    ) {
      return {
        ...installResult,

        projectType:
          PROJECT_TYPES.NODE,

        phase:
          "INSTALL",
      };
    }

    if (
      installResult.cancelled ||
      installResult.timedOut
    ) {
      return {
        ...installResult,

        projectType:
          PROJECT_TYPES.NODE,

        phase:
          "INSTALL",
      };
    }
  } else {
    console.log(
      "[BUILD SERVICE] node_modules exists. Dependency installation skipped."
    );
  }

  // ====================================================
  // BUILD COMMAND
  // ====================================================

  const customBuildCommand =
    typeof options.buildCommand ===
      "string"
      ? options.buildCommand.trim()
      : "";

  const buildCommand =
    customBuildCommand ||
    getNodeBuildCommand(
      packageJson,
      packageManager
    );

  // ====================================================
  // NO BUILD SCRIPT
  // ====================================================

  if (!buildCommand) {
    console.log(
      "[BUILD SERVICE] No Node build script found."
    );

    console.log(
      "[BUILD SERVICE] Build stage will be skipped."
    );

    return skippedBuildResult(
      "",
      "No Node.js build script was found. Build stage skipped.",
      {
        projectType:
          PROJECT_TYPES.NODE,

        phase:
          "BUILD",
      }
    );
  }

  console.log(
    "[BUILD SERVICE] Build command:",
    buildCommand
  );

  // ====================================================
  // EXECUTE BUILD
  // ====================================================

  const result =
    await executeCommand(
      buildCommand,
      {
        cwd:
          projectRoot,

        timeout:
          options.timeout ||
          DEFAULT_TIMEOUT,

        buildId:
          options.buildId,

        onLog:
          options.onLog,
      }
    );

  return {
    ...result,

    projectType:
      PROJECT_TYPES.NODE,

    phase:
      "BUILD",
  };
}

// ======================================================
// PYTHON BUILD COMMAND
// ======================================================

function getPythonBuildCommand(
  projectRoot
) {
  // ----------------------------------------------------
  // pyproject.toml
  // ----------------------------------------------------

  if (
    exists(
      path.join(
        projectRoot,
        "pyproject.toml"
      )
    )
  ) {
    return (
      process.platform ===
        "win32"
        ? "python -m build"
        : "python3 -m build"
    );
  }

  // ----------------------------------------------------
  // setup.py
  // ----------------------------------------------------

  if (
    exists(
      path.join(
        projectRoot,
        "setup.py"
      )
    )
  ) {
    return (
      process.platform ===
        "win32"
        ? "python setup.py build"
        : "python3 setup.py build"
    );
  }

  return "";
}

// ======================================================
// RUN PYTHON BUILD
// ======================================================

async function runPythonBuild(
  projectInput,
  options = {}
) {
  let projectRoot;

  try {
    projectRoot =
      normalizeProjectPath(
        projectInput
      );
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        error.message,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      projectType:
        PROJECT_TYPES.PYTHON,
    };
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "[BUILD SERVICE] PYTHON BUILD STARTED"
  );

  console.log(
    "Project:",
    projectRoot
  );

  console.log(
    "========================================"
  );

  const customBuildCommand =
    typeof options.buildCommand ===
      "string"
      ? options.buildCommand.trim()
      : "";

  const buildCommand =
    customBuildCommand ||
    getPythonBuildCommand(
      projectRoot
    );

  // ====================================================
  // NO PYTHON BUILD STEP
  // ====================================================

  if (!buildCommand) {
    return skippedBuildResult(
      "",
      "No Python build configuration was found. Build stage skipped.",
      {
        projectType:
          PROJECT_TYPES.PYTHON,

        phase:
          "BUILD",
      }
    );
  }

  console.log(
    "[BUILD SERVICE] Build command:",
    buildCommand
  );

  const result =
    await executeCommand(
      buildCommand,
      {
        cwd:
          projectRoot,

        timeout:
          options.timeout ||
          DEFAULT_TIMEOUT,

        buildId:
          options.buildId,

        onLog:
          options.onLog,
      }
    );

  return {
    ...result,

    projectType:
      PROJECT_TYPES.PYTHON,

    phase:
      "BUILD",
  };
}

// ======================================================
// MAVEN COMMAND
// ======================================================

function getMavenCommand(
  projectRoot
) {
  // Prefer Maven wrapper when available.

  if (
    process.platform ===
      "win32" &&
    exists(
      path.join(
        projectRoot,
        "mvnw.cmd"
      )
    )
  ) {
    return "mvnw.cmd clean package -DskipTests";
  }

  if (
    process.platform !==
      "win32" &&
    exists(
      path.join(
        projectRoot,
        "mvnw"
      )
    )
  ) {
    return "./mvnw clean package -DskipTests";
  }

  return "mvn clean package -DskipTests";
}

// ======================================================
// RUN MAVEN BUILD
// ======================================================

async function runMavenBuild(
  projectInput,
  options = {}
) {
  let projectRoot;

  try {
    projectRoot =
      normalizeProjectPath(
        projectInput
      );
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        error.message,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      projectType:
        PROJECT_TYPES.JAVA_MAVEN,
    };
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "[BUILD SERVICE] MAVEN BUILD STARTED"
  );

  console.log(
    "Project:",
    projectRoot
  );

  console.log(
    "========================================"
  );

  const customBuildCommand =
    typeof options.buildCommand ===
      "string"
      ? options.buildCommand.trim()
      : "";

  const buildCommand =
    customBuildCommand ||
    getMavenCommand(
      projectRoot
    );

  console.log(
    "[BUILD SERVICE] Build command:",
    buildCommand
  );

  const result =
    await executeCommand(
      buildCommand,
      {
        cwd:
          projectRoot,

        timeout:
          options.timeout ||
          DEFAULT_TIMEOUT,

        buildId:
          options.buildId,

        onLog:
          options.onLog,
      }
    );

  return {
    ...result,

    projectType:
      PROJECT_TYPES.JAVA_MAVEN,

    phase:
      "BUILD",
  };
}

// ======================================================
// GRADLE COMMAND
// ======================================================

function getGradleCommand(
  projectRoot
) {
  // ----------------------------------------------------
  // Windows wrapper
  // ----------------------------------------------------

  if (
    process.platform ===
      "win32" &&
    exists(
      path.join(
        projectRoot,
        "gradlew.bat"
      )
    )
  ) {
    return "gradlew.bat build -x test";
  }

  // ----------------------------------------------------
  // Unix wrapper
  // ----------------------------------------------------

  if (
    process.platform !==
      "win32" &&
    exists(
      path.join(
        projectRoot,
        "gradlew"
      )
    )
  ) {
    return "./gradlew build -x test";
  }

  // ----------------------------------------------------
  // System Gradle
  // ----------------------------------------------------

  return "gradle build -x test";
}

// ======================================================
// RUN GRADLE BUILD
// ======================================================

async function runGradleBuild(
  projectInput,
  options = {}
) {
  let projectRoot;

  try {
    projectRoot =
      normalizeProjectPath(
        projectInput
      );
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        error.message,
      cancelled: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      projectType:
        PROJECT_TYPES.JAVA_GRADLE,
    };
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "[BUILD SERVICE] GRADLE BUILD STARTED"
  );

  console.log(
    "Project:",
    projectRoot
  );

  console.log(
    "========================================"
  );

  const customBuildCommand =
    typeof options.buildCommand ===
      "string"
      ? options.buildCommand.trim()
      : "";

  const buildCommand =
    customBuildCommand ||
    getGradleCommand(
      projectRoot
    );

  console.log(
    "[BUILD SERVICE] Build command:",
    buildCommand
  );

  const result =
    await executeCommand(
      buildCommand,
      {
        cwd:
          projectRoot,

        timeout:
          options.timeout ||
          DEFAULT_TIMEOUT,

        buildId:
          options.buildId,

        onLog:
          options.onLog,
      }
    );

  return {
    ...result,

    projectType:
      PROJECT_TYPES.JAVA_GRADLE,

    phase:
      "BUILD",
  };
}

// ======================================================
// FAILED BUILD RESULT
// ======================================================

function failedBuildResult(
  message,
  extra = {}
) {
  return {
    success: false,
    status: "FAILED",
    command: "",
    duration: 0,
    logs: "",
    error:
      message ||
      "Build failed.",
    cancelled: false,
    timedOut: false,
    exitCode: null,
    signal: null,
    skipped: false,
    ...extra,
  };
}

// ======================================================
// RUN BUILD
// ======================================================
//
// Supported usage:
//
// runBuild(projectPath)
//
// runBuild(projectPath, {
//   buildCommand,
//   timeout,
//   buildId,
//   onLog
// })
//
// Also supports:
//
// runBuild({
//   projectPath,
//   buildCommand,
//   timeout,
//   buildId,
//   onLog
// })
//
// ======================================================

async function runBuild(
  projectInput,
  options = {}
) {
  let projectPath =
    projectInput;

  let buildOptions = {
    ...options,
  };

  // ====================================================
  // OBJECT INPUT SUPPORT
  // ====================================================

  if (
    projectInput &&
    typeof projectInput ===
      "object" &&
    !Array.isArray(
      projectInput
    )
  ) {
    projectPath =
      projectInput.projectPath ||
      projectInput.path ||
      projectInput.value ||
      projectInput.project_path ||
      "";

    buildOptions = {
      ...projectInput,
      ...options,
    };
  }

  // ====================================================
  // NORMALIZE PROJECT PATH
  // ====================================================

  let projectRoot;

  try {
    projectRoot =
      normalizeProjectPath(
        projectPath
      );
  } catch (error) {
    return failedBuildResult(
      error.message,
      {
        projectType:
          PROJECT_TYPES.UNKNOWN,

        projectPath:
          typeof projectPath ===
            "string"
            ? projectPath
            : "",
      }
    );
  }

  // ====================================================
  // CENTRALIZED PROJECT-PATH SECURITY
  // ====================================================

  const projectSecurity =
    validateProjectPath(
      projectRoot
    );

  if (!projectSecurity.valid) {
    console.error(
      "[BUILD SERVICE] PROJECT PATH BLOCKED:",
      projectSecurity.error
    );

    return failedBuildResult(
      projectSecurity.error,
      {
        projectType:
          PROJECT_TYPES.UNKNOWN,

        projectPath:
          projectSecurity.projectPath ||
          projectRoot,

        securityBlocked:
          true,
      }
    );
  }

  // From this point onward use the canonical real path
  // returned by executionSecurity.js.
  projectRoot =
    projectSecurity.projectPath;

  // ====================================================
  // VALIDATE PROJECT
  // ====================================================

  if (!exists(projectRoot)) {
    return failedBuildResult(
      `Project path does not exist: ${projectRoot}`,
      {
        projectType:
          PROJECT_TYPES.UNKNOWN,

        projectPath:
          projectRoot,
      }
    );
  }

  let stats;

  try {
    stats =
      fs.statSync(
        projectRoot
      );
  } catch (error) {
    return failedBuildResult(
      `Unable to access project path: ${error.message}`,
      {
        projectType:
          PROJECT_TYPES.UNKNOWN,

        projectPath:
          projectRoot,
      }
    );
  }

  if (!stats.isDirectory()) {
    return failedBuildResult(
      `Project path is not a directory: ${projectRoot}`,
      {
        projectType:
          PROJECT_TYPES.UNKNOWN,

        projectPath:
          projectRoot,
      }
    );
  }

  // ====================================================
  // DETECT PROJECT TYPE
  // ====================================================

  const projectType =
    detectProjectType(
      projectRoot
    );

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "[BUILD SERVICE] PROJECT BUILD STARTED"
  );

  console.log(
    "Project Path:",
    projectRoot
  );

  console.log(
    "Project Type:",
    projectType
  );

  console.log(
    "Build ID:",
    buildOptions.buildId ||
      "none"
  );

  console.log(
    "Custom Build Command:",
    buildOptions.buildCommand ||
      "none"
  );

  console.log(
    "========================================"
  );

  // ====================================================
  // UNKNOWN PROJECT
  // ====================================================

  if (
    projectType ===
    PROJECT_TYPES.UNKNOWN
  ) {
    return failedBuildResult(
      "Unable to detect project type.",
      {
        projectType,
        projectPath:
          projectRoot,
      }
    );
  }

  // ====================================================
  // EXECUTE CORRECT BUILD STRATEGY
  // ====================================================

  let result;

  try {
    switch (projectType) {
      // -------------------------------------------------
      // NODE
      // -------------------------------------------------

      case PROJECT_TYPES.NODE:
        result =
          await runNodeBuild(
            projectRoot,
            buildOptions
          );

        break;

      // -------------------------------------------------
      // PYTHON
      // -------------------------------------------------

      case PROJECT_TYPES.PYTHON:
        result =
          await runPythonBuild(
            projectRoot,
            buildOptions
          );

        break;

      // -------------------------------------------------
      // MAVEN
      // -------------------------------------------------

      case PROJECT_TYPES.JAVA_MAVEN:
        result =
          await runMavenBuild(
            projectRoot,
            buildOptions
          );

        break;

      // -------------------------------------------------
      // GRADLE
      // -------------------------------------------------

      case PROJECT_TYPES.JAVA_GRADLE:
        result =
          await runGradleBuild(
            projectRoot,
            buildOptions
          );

        break;

      // -------------------------------------------------
      // UNKNOWN
      // -------------------------------------------------

      default:
        result =
          failedBuildResult(
            "Unsupported project type."
          );

        break;
    }
  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "[BUILD SERVICE] UNEXPECTED BUILD ERROR"
    );

    console.error(
      error
    );

    console.error(
      "========================================"
    );

    result =
      failedBuildResult(
        error.message ||
          "Unexpected build error."
      );
  }

  // ====================================================
  // NORMALIZE RESULT
  // ====================================================

  if (
    !result ||
    typeof result !==
      "object"
  ) {
    result =
      failedBuildResult(
        "Build service returned an invalid result."
      );
  }

  const finalResult = {
    success:
      Boolean(
        result.success
      ),

    status:
      result.status ||
      (
        result.success
          ? "SUCCESS"
          : "FAILED"
      ),

    command:
      result.command ||
      "",

    duration:
      Number(
        result.duration
      ) || 0,

    logs:
      result.logs ||
      "",

    error:
      result.error ??
      null,

    cancelled:
      Boolean(
        result.cancelled
      ),

    timedOut:
      Boolean(
        result.timedOut
      ),

    skipped:
      Boolean(
        result.skipped
      ),

    securityBlocked:
      Boolean(
        result.securityBlocked
      ),

    exitCode:
      result.exitCode ??
      null,

    signal:
      result.signal ??
      null,

    phase:
      result.phase ||
      "BUILD",

    projectType,

    projectPath:
      projectRoot,
  };
    // ====================================================
  // BUILD FINISHED LOG
  // ====================================================

  console.log("");

  console.log(
    "========================================"
  );

  console.log(
    "[BUILD SERVICE] PROJECT BUILD FINISHED"
  );

  console.log(
    "Project:",
    projectRoot
  );

  console.log(
    "Project Type:",
    projectType
  );

  console.log(
    "Status:",
    finalResult.status
  );

  console.log(
    "Success:",
    finalResult.success
  );

  console.log(
    "Skipped:",
    finalResult.skipped
  );

  console.log(
    "Cancelled:",
    finalResult.cancelled
  );

  console.log(
    "Timed Out:",
    finalResult.timedOut
  );

  console.log(
    "Security Blocked:",
    finalResult.securityBlocked
  );

  console.log(
    "Duration:",
    `${finalResult.duration}ms`
  );

  if (
    finalResult.error
  ) {
    console.log(
      "Error:",
      finalResult.error
    );
  }

  console.log(
    "========================================"
  );

  return finalResult;
}

// ======================================================
// BUILD PROJECT ALIAS
// ======================================================
//
// Kept for compatibility with older controllers/services.
//

async function buildProject(
  projectInput,
  options = {}
) {
  return runBuild(
    projectInput,
    options
  );
}

// ======================================================
// EXECUTE BUILD ALIAS
// ======================================================

async function executeBuild(
  projectInput,
  options = {}
) {
  return runBuild(
    projectInput,
    options
  );
}

// ======================================================
// RUN PROJECT BUILD ALIAS
// ======================================================

async function runProjectBuild(
  projectInput,
  options = {}
) {
  return runBuild(
    projectInput,
    options
  );
}

// ======================================================
// GET BUILD SERVICE STATUS
// ======================================================

function getBuildServiceStatus() {
  const activeBuildIds =
    getActiveBuildIds();

  return {
    success: true,

    service:
      "buildService",

    status:
      "READY",

    platform:
      process.platform,

    defaultTimeout:
      DEFAULT_TIMEOUT,

    forceFinishDelay:
      FORCE_FINISH_DELAY,

    activeProcessCount:
      activeBuildIds.length,

    activeBuildIds,
  };
}

// ======================================================
// GET ACTIVE PROCESS INFO
// ======================================================
//
// Returns serializable information rather than exposing
// the actual ChildProcess object.
//

function getActiveBuildProcessInfo(
  buildId
) {
  const processInfo =
    getBuildProcess(
      buildId
    );

  if (!processInfo) {
    return null;
  }

  return {
    buildId:
      String(buildId),

    pid:
      processInfo.pid ||
      null,

    command:
      processInfo.command ||
      "",

    cwd:
      processInfo.cwd ||
      "",

    startedAt:
      processInfo.startedAt ||
      null,

    cancelled:
      Boolean(
        processInfo.cancelled
      ),

    exitCode:
      processInfo.child
        ?.exitCode ??
      null,

    signalCode:
      processInfo.child
        ?.signalCode ??
      null,
  };
}

// ======================================================
// GET ALL ACTIVE PROCESS INFO
// ======================================================

function getAllActiveBuildProcesses() {
  return Array.from(
    activeProcesses.entries()
  ).map(
    (
      [
        buildId,
        processInfo,
      ]
    ) => ({
      buildId,

      pid:
        processInfo.pid ||
        null,

      command:
        processInfo.command ||
        "",

      cwd:
        processInfo.cwd ||
        "",

      startedAt:
        processInfo.startedAt ||
        null,

      cancelled:
        Boolean(
          processInfo.cancelled
        ),

      exitCode:
        processInfo.child
          ?.exitCode ??
        null,

      signalCode:
        processInfo.child
          ?.signalCode ??
        null,
    })
  );
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  // ----------------------------------------------------
  // Constants
  // ----------------------------------------------------

  PROJECT_TYPES,

  DEFAULT_TIMEOUT,

  FORCE_FINISH_DELAY,

  // ----------------------------------------------------
  // General helpers
  // ----------------------------------------------------

  exists,

  normalizeProjectPath,

  normalizeLogChunk,

  // ----------------------------------------------------
  // Security helpers
  // ----------------------------------------------------

  validateProjectPath,

  validateCommand,

  validateExecutionRequest,

  // ----------------------------------------------------
  // Project detection
  // ----------------------------------------------------

  detectProjectType,

  // ----------------------------------------------------
  // Command execution
  // ----------------------------------------------------

  executeCommand,

  // ----------------------------------------------------
  // Process management
  // ----------------------------------------------------

  registerBuildProcess,

  unregisterBuildProcess,

  getBuildProcess,

  hasActiveBuildProcess,

  getActiveBuildIds,

  getActiveBuildProcessInfo,

  getAllActiveBuildProcesses,

  killProcessTree,

  cancelBuildProcess,

  cancelCommand,

  // ----------------------------------------------------
  // Node helpers
  // ----------------------------------------------------

  readPackageJson,

  detectNodePackageManager,

  getNodeInstallCommand,

  getNodeBuildCommand,

  // ----------------------------------------------------
  // Build runners
  // ----------------------------------------------------

  runNodeBuild,

  runPythonBuild,

  runMavenBuild,

  runGradleBuild,

  // ----------------------------------------------------
  // Main build functions
  // ----------------------------------------------------

  runBuild,

  buildProject,

  executeBuild,

  runProjectBuild,

  // ----------------------------------------------------
  // Results / diagnostics
  // ----------------------------------------------------

  skippedBuildResult,

  failedBuildResult,

  getBuildServiceStatus,
};