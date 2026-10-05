const fs = require("fs");
const path = require("path");
const Pipeline = require("../models/Pipeline");
const Build = require("../models/Build");
const Notification = require("../models/Notification");
const {
  emitBuildEvent,
  emitBuildLog,
} = require("./socketService");

const {
  runBuild,
  cancelBuildProcess,
} = require("./buildService");

const {
  runTests,
} = require("./testService");

const {
  analyzeLogs,
} = require("./aiLogAnalysisService");

const {
  autoFix,
} = require("./autoFixService");
const {
  prepareGitHubWorkspace,
} = require("./gitService");

// ======================================================
// CONFIGURATION
// ======================================================

const BUILD_TIMEOUT = 5 * 60 * 1000;
const STALE_PIPELINE_TIMEOUT_MS = 10 * 60 * 1000;

// ======================================================
// IN-MEMORY STATE
// ======================================================

const runningPipelines = new Set();
const cancelledBuilds = new Set();

// ======================================================
// NORMALIZE PROJECT PATH
// ======================================================

function normalizeProjectPath(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.projectPath === "string") {
    return value.projectPath.trim();
  }

  if (typeof value.path === "string") {
    return value.path.trim();
  }

  if (typeof value.value === "string") {
    return value.value.trim();
  }

  return "";
}

// ======================================================
// ID HELPER
// ======================================================

function toId(value) {
  if (!value) {
    return null;
  }

  return value.toString();
}

// ======================================================
// VALID DATE
// ======================================================

function isValidDate(value) {
  return (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  );
}

// ======================================================
// CALCULATE DURATION
// ======================================================

function calculateDuration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) {
    return 0;
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((end - start) / 1000)
  );
}

// ======================================================
// TIMEOUT CHECK
// ======================================================

function isOlderThanTimeout(date, timeout) {
  if (!date) {
    return false;
  }

  const parsedDate = new Date(date);

  if (!isValidDate(parsedDate)) {
    return false;
  }

  return (
    Date.now() - parsedDate.getTime() >
    timeout
  );
}

// ======================================================
// APPEND LOGS
// ======================================================

function appendLogs(existingLogs, newLogs) {
  const oldLogs = existingLogs || "";
  const additionalLogs = newLogs || "";

  if (!additionalLogs) {
    return oldLogs;
  }

  if (!oldLogs) {
    return additionalLogs;
  }

  return `${oldLogs}\n${additionalLogs}`;
}

// ======================================================
// UPDATE BUILD + REAL-TIME STAGE EVENTS
// ======================================================

async function updateBuild(
  buildId,
  updates
) {
  const updatedBuild =
    await Build.findByIdAndUpdate(
      buildId,
      {
        $set: updates,
      },
      {
        returnDocument: "after",
      }
    );

  if (!updatedBuild) {
    return null;
  }

  // ==================================================
  // REAL-TIME STAGE / STATUS UPDATE
  // ==================================================

  const stageChanged =
    Object.prototype.hasOwnProperty.call(
      updates,
      "stage"
    );

  const statusChanged =
    Object.prototype.hasOwnProperty.call(
      updates,
      "status"
    );

  if (stageChanged || statusChanged) {
    emitBuildEvent({
      userId:
        updatedBuild.user,

      event:
        "build:stage",

      buildId:
        updatedBuild._id,

      pipelineId:
        updatedBuild.pipeline,

      buildNumber:
        updatedBuild.buildNumber,

      status:
        updatedBuild.status,

      stage:
        updatedBuild.stage,

      duration:
        updatedBuild.duration,

      error:
        updatedBuild.error,

      message:
        updatedBuild.stage
          ? `Build entered ${updatedBuild.stage} stage.`
          : "Build status updated.",
    });
  }

  return updatedBuild;
}

// ======================================================
// UPDATE PIPELINE
// ======================================================

async function updatePipeline(pipelineId, updates) {
  return Pipeline.findByIdAndUpdate(
    pipelineId,
    {
      $set: updates,
    },
    {
      returnDocument: "after",
    }
  );
}

// ======================================================
// CREATE NOTIFICATION
// ======================================================

async function createNotification({
  user,
  pipeline,
  message,
  status,
}) {
  try {
    if (!user || !pipeline) {
      return null;
    }

    return await Notification.create({
      user,
      pipeline,
      message,
      status,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION ERROR]",
      error.message
    );

    return null;
  }
}

// ======================================================
// EMPTY AUTO FIX RESULT
// ======================================================

function emptyAutoFix() {
  return {
    success: false,
    fixed: false,
    packageName: "",
    command: "",
    duration: 0,
    logs: "",
    error: null,
    message: "",
    autoFixAvailable: false,
  };
}

// ======================================================
// EMPTY REBUILD RESULT
// ======================================================

function emptyRebuild() {
  return {
    success: false,
    status: "",
    command: "",
    duration: 0,
    logs: "",
    error: null,
  };
}

// ======================================================
// EMPTY TEST RESULT
// ======================================================

function emptyTestResult() {
  return {
    success: false,
    status: "",
    command: "",
    duration: 0,
    logs: "",
    error: null,
  };
}

// ======================================================
// FALLBACK AI ANALYSIS
// ======================================================

function createFallbackAIAnalysis(error) {
  return {
    category: "UNKNOWN",
    severity: "UNKNOWN",

    detectedIssue:
      error ||
      "Unable to analyze build logs.",

    suggestedFix:
      "Review the build logs and fix the reported error.",

    confidence: 0,
    autoFixAvailable: false,
    packageName: "",

    details:
      "AI log analysis did not return a valid analysis.",

    logsAnalyzed: 0,
    analyzedAt: new Date(),
  };
}

// ======================================================
// SAFE AI ANALYSIS
// ======================================================

async function safeAnalyzeLogs(logs) {
  try {
    const analysis =
      await analyzeLogs(logs || "");

    if (
      !analysis ||
      typeof analysis !== "object"
    ) {
      return createFallbackAIAnalysis(
        "AI analysis returned an invalid response."
      );
    }

    return {
      category:
        analysis.category || "",

      severity:
        analysis.severity || "",

      detectedIssue:
        analysis.detectedIssue || "",

      suggestedFix:
        analysis.suggestedFix || "",

      confidence:
        typeof analysis.confidence === "number"
          ? analysis.confidence
          : 0,

      autoFixAvailable:
        Boolean(analysis.autoFixAvailable),

      packageName:
        analysis.packageName || "",

      details:
        analysis.details || "",

      logsAnalyzed:
        typeof analysis.logsAnalyzed === "number"
          ? analysis.logsAnalyzed
          : 0,

      analyzedAt:
        analysis.analyzedAt
          ? new Date(analysis.analyzedAt)
          : new Date(),
    };
  } catch (error) {
    console.error(
      "[AI ANALYSIS ERROR]",
      error.message
    );

    return createFallbackAIAnalysis(
      error.message
    );
  }
}

// ======================================================
// CANCELLATION HELPERS
// ======================================================

function isCancellationRequested(buildId) {
  return cancelledBuilds.has(
    toId(buildId)
  );
}

async function isBuildCancelled(buildId) {
  try {
    const build =
      await Build.findById(buildId)
        .select("status");

    return (
      build &&
      build.status === "Cancelled"
    );
  } catch (error) {
    console.error(
      "[CANCEL CHECK ERROR]",
      error.message
    );

    return false;
  }
}

async function shouldStopBuild(buildId) {
  if (isCancellationRequested(buildId)) {
    return true;
  }

  return isBuildCancelled(buildId);
}

// ======================================================
// FIND ACTIVE BUILD
// ======================================================

async function findActiveBuild(pipeline) {
  if (!pipeline) {
    return null;
  }

  if (pipeline.lastBuildId) {
    const lastBuild =
      await Build.findOne({
        _id: pipeline.lastBuildId,
        pipeline: pipeline._id,
        status: "Running",
      });

    if (lastBuild) {
      return lastBuild;
    }
  }

  return Build.findOne({
    pipeline: pipeline._id,
    status: "Running",
  }).sort({
    createdAt: -1,
  });
}

// ======================================================
// ALREADY RUNNING RESULT
// ======================================================

function alreadyRunningResult(
  pipeline,
  build
) {
  return {
    success: false,
    alreadyRunning: true,
    status: "RUNNING",

    pipelineId:
      pipeline._id.toString(),

    buildId:
      build
        ? build._id.toString()
        : null,

    buildNumber:
      build
        ? build.buildNumber
        : null,
  };
}

// ======================================================
// RECOVER STALE PIPELINE
// ======================================================

async function recoverStalePipeline(pipeline) {
  if (!pipeline) {
    return {
      recovered: false,
      active: false,
    };
  }

  if (pipeline.status !== "RUNNING") {
    return {
      recovered: false,
      active: false,
    };
  }

  const activeBuild =
    await findActiveBuild(pipeline);

  // Pipeline says RUNNING but no running build exists.
  if (!activeBuild) {
    const now = new Date();

    await updatePipeline(
      pipeline._id,
      {
        status: "FAILED",
        lastRunAt: now,

        lastError:
          "Pipeline was marked RUNNING but no active build was found.",
      }
    );

    await createNotification({
      user: pipeline.user,
      pipeline: pipeline._id,

      message:
        "Pipeline was marked as failed because no active build was found.",

      status: "Failed",
    });

    return {
      recovered: true,
      active: false,
      status: "FAILED",
    };
  }

  const startedAt =
    activeBuild.startedAt ||
    activeBuild.createdAt;

  if (
    !isOlderThanTimeout(
      startedAt,
      STALE_PIPELINE_TIMEOUT_MS
    )
  ) {
    return {
      recovered: false,
      active: true,

      buildId:
        activeBuild._id.toString(),

      buildNumber:
        activeBuild.buildNumber,
    };
  }

  const finishedAt = new Date();

  const staleMessage =
    "Pipeline execution was marked stale because it exceeded the allowed execution time.";

  const duration =
    calculateDuration(
      startedAt,
      finishedAt
    );

  const recoveryLog =
    `[PIPELINE RECOVERY] ${staleMessage}`;

  const updatedLogs =
    appendLogs(
      activeBuild.logs,
      recoveryLog
    );

  const updatedBuild =
    await Build.findOneAndUpdate(
      {
        _id: activeBuild._id,
        status: "Running",
      },

      {
        $set: {
          status: "Failed",
          stage: "FAILED",
          error: staleMessage,
          finishedAt,
          duration,
          logs: updatedLogs,
        },
      },

      {
        returnDocument: "after",
      }
    );

  if (!updatedBuild) {
    return {
      recovered: false,
      active: false,
    };
  }

  await updatePipeline(
    pipeline._id,
    {
      status: "FAILED",
      lastRunAt: finishedAt,

      lastBuildId:
        updatedBuild._id.toString(),

      lastError:
        staleMessage,
    }
  );

  await createNotification({
    user: updatedBuild.user,
    pipeline: pipeline._id,

    message:
      `Build #${updatedBuild.buildNumber} was marked as failed because it exceeded the allowed execution time.`,

    status: "Failed",
  });
  // ==================================================
// REAL-TIME STALE FAILURE EVENT
// ==================================================

emitBuildEvent({
  userId:
    updatedBuild.user,

  event:
    "build:failed",

  buildId:
    updatedBuild._id,

  pipelineId:
    pipeline._id,

  buildNumber:
    updatedBuild.buildNumber,

  status:
    updatedBuild.status,

  stage:
    updatedBuild.stage,

  duration:
    updatedBuild.duration,

  error:
    staleMessage,

  message:
    `Build #${updatedBuild.buildNumber} was marked as failed because it became stale.`,

  extra: {
    staleRecovery: true,
  },
});

  return {
    recovered: true,
    active: false,
    status: "FAILED",

    buildId:
      updatedBuild._id.toString(),

    buildNumber:
      updatedBuild.buildNumber,
  };
}

// ======================================================
// RECOVER ALL STALE BUILDS
// ======================================================

async function recoverAllStaleBuilds() {
  const staleCutoff =
    new Date(
      Date.now() -
      STALE_PIPELINE_TIMEOUT_MS
    );

  const staleMessage =
    "Build execution was marked stale because it exceeded the allowed execution time.";

  let scanned = 0;
  let recovered = 0;

  try {
    const staleBuilds =
      await Build.find({
        status: "Running",

        $or: [
          {
            startedAt: {
              $lt: staleCutoff,
            },
          },

          {
            startedAt: null,

            createdAt: {
              $lt: staleCutoff,
            },
          },
        ],
      }).sort({
        createdAt: 1,
      });

    scanned = staleBuilds.length;

    console.log(
      `[PIPELINE RECOVERY] Found ${scanned} stale build(s).`
    );

    for (const staleBuild of staleBuilds) {
      try {
        const startedAt =
          staleBuild.startedAt ||
          staleBuild.createdAt;

        const finishedAt =
          new Date();

        const duration =
          calculateDuration(
            startedAt,
            finishedAt
          );

        const recoveryLog =
          `[PIPELINE RECOVERY] ${staleMessage}`;

        const updatedLogs =
          appendLogs(
            staleBuild.logs,
            recoveryLog
          );

        const updatedBuild =
          await Build.findOneAndUpdate(
            {
              _id: staleBuild._id,
              status: "Running",
            },

            {
              $set: {
                status: "Failed",
                stage: "FAILED",
                error: staleMessage,
                finishedAt,
                duration,
                logs: updatedLogs,
              },
            },

            {
              returnDocument: "after",
            }
          );

        if (!updatedBuild) {
          continue;
        }

        recovered++;

        const pipeline =
          await Pipeline.findById(
            updatedBuild.pipeline
          );

        if (!pipeline) {
          console.warn(
            `[PIPELINE RECOVERY] Pipeline not found for Build ${updatedBuild._id}.`
          );

          continue;
        }

        const activeBuild =
          await Build.findOne({
            pipeline: pipeline._id,
            status: "Running",
          }).sort({
            createdAt: -1,
          });

        const staleBuildWasCurrent =
          toId(pipeline.lastBuildId) ===
          toId(updatedBuild._id);

        if (
          !activeBuild &&
          (
            staleBuildWasCurrent ||
            pipeline.status === "RUNNING"
          )
        ) {
          await updatePipeline(
            pipeline._id,
            {
              status: "FAILED",
              lastRunAt: finishedAt,

              lastBuildId:
                updatedBuild._id.toString(),

              lastError:
                staleMessage,
            }
          );
        }

        await createNotification({
          user: updatedBuild.user,
          pipeline: pipeline._id,

          message:
            `Build #${updatedBuild.buildNumber} was marked as failed because it exceeded the allowed execution time.`,

          status: "Failed",
        });
      } catch (buildRecoveryError) {
        console.error(
          `[PIPELINE RECOVERY] Failed to recover Build ${staleBuild._id}:`,
          buildRecoveryError.message
        );
      }
    }

    return {
      success: true,
      scanned,
      recovered,
    };
  } catch (error) {
    console.error(
      "[STALE BUILD RECOVERY ERROR]",
      error
    );

    return {
      success: false,
      scanned,
      recovered,
      error: error.message,
    };
  }
}

// ======================================================
// NEXT BUILD NUMBER
// ======================================================

async function getNextBuildNumber(
  pipelineId
) {
  const lastBuild =
    await Build.findOne({
      pipeline: pipelineId,
    }).sort({
      buildNumber: -1,
    });

  if (!lastBuild) {
    return 1;
  }

  return Number(
    lastBuild.buildNumber
  ) + 1;
}

// ======================================================
// CREATE BUILD
// ======================================================

async function createBuild({
  pipeline,
  userId,
}) {
  const buildNumber =
    await getNextBuildNumber(
      pipeline._id
    );

  return Build.create({
    pipeline:
      pipeline._id,

    user:
      userId,

    buildNumber,

    status:
      "Running",

    stage:
      "QUEUED",

    duration:
      0,

    branch:
      pipeline.branch ||
      "main",

    // For GitHub pipelines this contains
    // the exact commit being executed.
    // Local pipelines continue using "".
    commitId:
      pipeline.lastCommitId ||
      "",

    logs:
      "",

    startedAt:
      new Date(),

    finishedAt:
      null,

    initialAIAnalysis: {
      category: "",
      severity: "",
      detectedIssue: "",
      suggestedFix: "",
      confidence: 0,
      autoFixAvailable: false,
      packageName: "",
      details: "",
      logsAnalyzed: 0,
      analyzedAt: null,
    },

    aiAnalysis: {
      category: "",
      severity: "",
      detectedIssue: "",
      suggestedFix: "",
      confidence: 0,
      autoFixAvailable: false,
      packageName: "",
      details: "",
      logsAnalyzed: 0,
      analyzedAt: null,
    },

    autoFixAttempted:
      false,

    autoFix:
      emptyAutoFix(),

    rebuildAttempted:
      false,

    rebuild:
      emptyRebuild(),

    testResult:
      emptyTestResult(),

    error:
      null,
  });
}

// ======================================================
// RESOLVE PIPELINE PROJECT PATH
// LOCAL  -> use configured local path
// GITHUB -> clone/update repository workspace
// ======================================================
// ======================================================
// RESOLVE GITHUB PROJECT DIRECTORY
// ======================================================
//
// Converts an optional relative GitHub project directory
// such as:
//
//   test-project
//   apps/backend
//
// into an absolute path INSIDE the cloned repository.
//
// This function performs its own security validation.
// We do not trust controller validation alone.
// ======================================================

function resolveGitHubProjectDirectory(
  workspacePath,
  projectDirectory
) {
  const workspaceRoot =
    path.resolve(workspacePath);

  let directory =
    typeof projectDirectory === "string"
      ? projectDirectory.trim()
      : "";

  // Blank or "." means repository root.
  if (!directory || directory === ".") {
    return workspaceRoot;
  }

  // Normalize Windows separators.
  directory =
    directory.replace(/\\/g, "/");

  // ----------------------------------------------
  // SECURITY: reject absolute paths
  // ----------------------------------------------

  if (
    directory.startsWith("/") ||
    directory.startsWith("//") ||
    /^[A-Za-z]:\//.test(directory)
  ) {
    throw new Error(
      "Project directory must be relative to the GitHub repository."
    );
  }

  // ----------------------------------------------
  // SECURITY: reject control characters
  // ----------------------------------------------

  if (
    /[\u0000-\u001F\u007F]/.test(
      directory
    )
  ) {
    throw new Error(
      "Project directory contains invalid characters."
    );
  }

  if (directory.length > 500) {
    throw new Error(
      "Project directory is too long."
    );
  }

  // ----------------------------------------------
  // SECURITY: reject traversal
  // ----------------------------------------------

  const segments =
    directory
      .split("/")
      .filter(Boolean);

  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".."
    )
  ) {
    throw new Error(
      "Project directory cannot contain '.' or '..' path segments."
    );
  }

  // ----------------------------------------------
  // BUILD ABSOLUTE PATH
  // ----------------------------------------------

  const resolvedProjectPath =
    path.resolve(
      workspaceRoot,
      ...segments
    );

  // ----------------------------------------------
  // SECURITY: final containment check
  // ----------------------------------------------

  const relativePath =
    path.relative(
      workspaceRoot,
      resolvedProjectPath
    );

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      "Project directory escapes the GitHub repository workspace."
    );
  }

  // ----------------------------------------------
  // EXISTENCE CHECK
  // ----------------------------------------------

  if (
    !fs.existsSync(
      resolvedProjectPath
    )
  ) {
    throw new Error(
      `GitHub project directory does not exist: ${directory}`
    );
  }

  // ----------------------------------------------
  // DIRECTORY CHECK
  // ----------------------------------------------

  const stats =
    fs.statSync(
      resolvedProjectPath
    );

  if (!stats.isDirectory()) {
    throw new Error(
      `GitHub project directory is not a directory: ${directory}`
    );
  }

  return resolvedProjectPath;
}

async function resolvePipelineProjectPath(
  pipeline,
  requestedProjectPath
) {
  const sourceType =
    String(
      pipeline.sourceType ||
      "LOCAL"
    )
      .trim()
      .toUpperCase();

  // ==================================================
  // LOCAL PIPELINE
  // ==================================================

  if (sourceType === "LOCAL") {
    const rawProjectPath =
      requestedProjectPath !== undefined &&
      requestedProjectPath !== null
        ? requestedProjectPath
        : pipeline.projectPath;

    return {
      projectPath:
        normalizeProjectPath(
          rawProjectPath
        ),

      commitId:
        "",

      sourceType:
        "LOCAL",
    };
  }

  // ==================================================
  // GITHUB PIPELINE
  // ==================================================

  if (sourceType !== "GITHUB") {
    throw new Error(
      `Unsupported pipeline source type: ${sourceType}`
    );
  }

  if (
    !pipeline.repository ||
    typeof pipeline.repository !==
      "string"
  ) {
    throw new Error(
      "GitHub repository URL is missing."
    );
  }

  const branch =
    typeof pipeline.branch ===
      "string" &&
    pipeline.branch.trim()
      ? pipeline.branch.trim()
      : "main";

  console.log(
    `[GIT] Preparing repository ${pipeline.repository} (${branch})`
  );

  // ==================================================
  // CLONE / UPDATE REPOSITORY
  // ==================================================

  const gitResult =
    await prepareGitHubWorkspace({
      repository:
        pipeline.repository,

      branch,

      pipelineId:
        pipeline._id,
    });

  if (
    !gitResult ||
    !gitResult.workspacePath
  ) {
    throw new Error(
      "GitHub workspace preparation did not return a project path."
    );
  }

  if (!gitResult.commitId) {
    throw new Error(
      "GitHub workspace preparation did not return a commit ID."
    );
  }

  // ==================================================
  // REPOSITORY WORKSPACE ROOT
  // ==================================================

  const workspacePath =
    normalizeProjectPath(
      gitResult.workspacePath
    );

  if (!workspacePath) {
    throw new Error(
      "GitHub workspace path is invalid."
    );
  }

  if (!fs.existsSync(workspacePath)) {
    throw new Error(
      `GitHub workspace does not exist: ${workspacePath}`
    );
  }

  // ==================================================
  // OPTIONAL MONOREPO PROJECT DIRECTORY
  // ==================================================
  //
  // Example:
  //
  // repository:
  //   reliai/
  //
  // projectDirectory:
  //   test-project
  //
  // execution path:
  //   <workspace>/test-project
  //
  // Blank projectDirectory means repository root.
  // ==================================================

  const projectDirectory =
    typeof pipeline.projectDirectory ===
      "string"
      ? pipeline.projectDirectory.trim()
      : "";

  const resolvedPath =
    resolveGitHubProjectDirectory(
      workspacePath,
      projectDirectory
    );

  // ==================================================
  // SAVE WORKSPACE + COMMIT
  // ==================================================

  await updatePipeline(
    pipeline._id,
    {
      projectPath:
        resolvedPath,

      lastCommitId:
        gitResult.commitId,

      repositoryOwner:
        gitResult.owner ||
        pipeline.repositoryOwner ||
        "",

      repositoryName:
        gitResult.repositoryName ||
        pipeline.repositoryName ||
        "",
    }
  );

  // Keep current Mongoose document synchronized because
  // createBuild() reads pipeline.lastCommitId.

  pipeline.projectPath =
    resolvedPath;

  pipeline.lastCommitId =
    gitResult.commitId;

  if (gitResult.owner) {
    pipeline.repositoryOwner =
      gitResult.owner;
  }

  if (gitResult.repositoryName) {
    pipeline.repositoryName =
      gitResult.repositoryName;
  }

  // ==================================================
  // LOG RESOLVED SOURCE
  // ==================================================

  console.log(
    `[GIT] Repository workspace: ${workspacePath}`
  );

  console.log(
    `[GIT] Project directory: ${
      projectDirectory ||
      "(repository root)"
    }`
  );

  console.log(
    `[GIT] Execution path: ${resolvedPath}`
  );

  console.log(
    `[GIT] Commit: ${gitResult.commitId}`
  );

  return {
    projectPath:
      resolvedPath,

    commitId:
      gitResult.commitId,

    sourceType:
      "GITHUB",
  };
}

// ======================================================
// PREPARE PIPELINE EXECUTION
// ======================================================

async function preparePipelineExecution({
  pipeline,
  userId,
  projectPath,
}) {
  const pipelineKey =
    toId(pipeline._id);

  // ==================================================
  // 1. IN-MEMORY RUNNING CHECK
  // ==================================================

  if (
    runningPipelines.has(
      pipelineKey
    )
  ) {
    const activeBuild =
      await findActiveBuild(
        pipeline
      );

    return {
      alreadyRunning: true,

      result:
        alreadyRunningResult(
          pipeline,
          activeBuild
        ),
    };
  }

  // ==================================================
  // 2. RECOVER STALE PIPELINE
  // ==================================================

  if (
    pipeline.status ===
    "RUNNING"
  ) {
    await recoverStalePipeline(
      pipeline
    );
  }

  // ==================================================
  // 3. RELOAD PIPELINE
  // ==================================================

  const freshPipeline =
    await Pipeline.findById(
      pipeline._id
    );

  if (!freshPipeline) {
    return {
      error:
        "Pipeline no longer exists.",
    };
  }

  // ==================================================
  // 4. CHECK WHETHER IT IS STILL RUNNING
  // ==================================================

  if (
    freshPipeline.status ===
    "RUNNING"
  ) {
    const activeBuild =
      await findActiveBuild(
        freshPipeline
      );

    return {
      alreadyRunning: true,

      result:
        alreadyRunningResult(
          freshPipeline,
          activeBuild
        ),
    };
  }

  // ==================================================
  // 5. RESOLVE LOCAL / GITHUB PROJECT PATH
  // ==================================================

  let resolved;

  try {
    resolved =
      await resolvePipelineProjectPath(
        freshPipeline,
        projectPath
      );
  } catch (error) {
    console.error(
      "[PIPELINE SERVICE] Workspace preparation failed:",
      error
    );

    return {
      error:
        error.message ||
        "Failed to prepare pipeline workspace.",
    };
  }

  const finalProjectPath =
    normalizeProjectPath(
      resolved?.projectPath
    );

  console.log(
    "========================================"
  );

  console.log(
    "[PIPELINE SERVICE] PROJECT PATH RESOLVED"
  );

  console.log(
    "Pipeline ID:",
    freshPipeline._id.toString()
  );

  console.log(
    "Source type:",
    resolved?.sourceType ||
      freshPipeline.sourceType ||
      "LOCAL"
  );

  console.log(
    "Project path:",
    finalProjectPath
  );

  if (resolved?.commitId) {
    console.log(
      "Commit ID:",
      resolved.commitId
    );
  }

  console.log(
    "========================================"
  );

  // ==================================================
  // 6. VALIDATE RESOLVED PATH
  // ==================================================

  if (!finalProjectPath) {
    return {
      error:
        "Project path is required and must be a valid string path.",
    };
  }

  if (
    finalProjectPath.includes(
      "[object Object]"
    )
  ) {
    return {
      error:
        "Invalid project path. The project path was converted from an object to [object Object].",
    };
  }

  if (
    !fs.existsSync(
      finalProjectPath
    )
  ) {
    return {
      error:
        `Project path does not exist: ${finalProjectPath}`,
    };
  }

  // ==================================================
  // 7. ACQUIRE PIPELINE LOCK
  // ==================================================

  runningPipelines.add(
    pipelineKey
  );

  try {
    // ==================================================
    // 8. CREATE BUILD
    // ==================================================

    const build =
      await createBuild({
        pipeline:
          freshPipeline,

        userId,
      });

    // ==================================================
    // 9. REAL-TIME BUILD START EVENT
    // ==================================================

    emitBuildEvent({
      userId,

      event:
        "build:started",

      buildId:
        build._id,

      pipelineId:
        freshPipeline._id,

      buildNumber:
        build.buildNumber,

      status:
        build.status,

      stage:
        build.stage,

      duration:
        build.duration,

      message:
        `Build #${build.buildNumber} started.`,
    });

    // ==================================================
    // 10. UPDATE PIPELINE
    // ==================================================

    await updatePipeline(
      freshPipeline._id,
      {
        status:
          "RUNNING",

        lastRunAt:
          new Date(),

        lastBuildId:
          build._id,

        lastError:
          null,
      }
    );

    // ==================================================
    // 11. NOTIFICATION
    // ==================================================

    await createNotification({
      user:
        userId,

      pipeline:
        freshPipeline._id,

      message:
        `Build #${build.buildNumber} started.`,

      status:
        "Running",
    });

    // ==================================================
    // 12. RETURN PREPARED EXECUTION
    // ==================================================

    return {
      success:
        true,

      pipeline:
        freshPipeline,

      build,

      projectPath:
        finalProjectPath,

      sourceType:
        resolved?.sourceType ||
        freshPipeline.sourceType ||
        "LOCAL",

      commitId:
        resolved?.commitId ||
        "",
    };
  } catch (error) {
    runningPipelines.delete(
      pipelineKey
    );

    throw error;
  }
}

// ======================================================
// EXECUTE PIPELINE
// ======================================================

async function executePipeline({
  pipelineId,
  userId,
  projectPath,
}) {
  if (!pipelineId) {
    return {
      success: false,
      status: "FAILED",
      error:
        "Pipeline ID is required.",
    };
  }

  if (!userId) {
    return {
      success: false,
      status: "FAILED",
      error:
        "User ID is required.",
    };
  }

  const normalizedInputPath =
    normalizeProjectPath(
      projectPath
    );

  const safeProjectPath =
    normalizedInputPath ||
    undefined;

  const pipeline =
    await Pipeline.findOne({
      _id: pipelineId,
      user: userId,
    });

  if (!pipeline) {
    return {
      success: false,
      status: "FAILED",
      error:
        "Pipeline not found.",
    };
  }

  const prepared =
    await preparePipelineExecution({
      pipeline,
      userId,

      projectPath:
        safeProjectPath,
    });

  if (prepared.error) {
    return {
      success: false,
      status: "FAILED",

      pipelineId:
        pipeline._id.toString(),

      error:
        prepared.error,
    };
  }

  if (
    prepared.alreadyRunning
  ) {
    return prepared.result;
  }

  const build =
    prepared.build;

  setImmediate(() => {
    runPipelineWorker({
      pipelineId:
        pipeline._id,

      buildId:
        build._id,

      userId,

      projectPath:
        prepared.projectPath,
    }).catch((error) => {
      console.error(
        "[PIPELINE WORKER ERROR]",
        error
      );
    });
  });

  return {
    success: true,
    status: "RUNNING",

    pipelineId:
      pipeline._id.toString(),

    buildId:
      build._id.toString(),

    buildNumber:
      build.buildNumber,
  };
}
// ======================================================
// PIPELINE WORKER
// ======================================================

async function runPipelineWorker({
  pipelineId,
  buildId,
  userId,
  projectPath,
}) {
  const pipelineKey =
    toId(pipelineId);

  let build = null;
  let pipeline = null;

  try {
    pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: userId,
      });

    build =
      await Build.findOne({
        _id: buildId,
        pipeline: pipelineId,
        user: userId,
      });

    if (!pipeline) {
      throw new Error(
        "Pipeline not found while executing build."
      );
    }

    if (!build) {
      throw new Error(
        "Build not found while executing pipeline."
      );
    }

    // ==================================================
    // CHECK CANCELLATION BEFORE START
    // ==================================================

    if (
      await shouldStopBuild(
        build._id
      )
    ) {
      await finalizeCancelledBuild({
        pipeline,
        build,
        reason:
          "Build was cancelled before execution started.",
      });

      return;
    }

    // ==================================================
    // BUILDING STAGE
    // ==================================================

    console.log(
      `[PIPELINE] Build #${build.buildNumber} entering BUILDING stage.`
    );

    build =
      await updateBuild(
        build._id,
        {
          status: "Running",
          stage: "BUILDING",
          error: null,
        }
      );

    const buildResult =
      await runBuild(
        projectPath,
        {
          buildCommand:
            pipeline.buildCommand ||
            undefined,

          timeout:
            BUILD_TIMEOUT,

          buildId:
            build._id,

          onLog: async (
            logChunk
          ) => {
            await appendBuildLog(
              build._id,
              logChunk
            );
          },
        }
      );

    // ==================================================
    // BUILD CANCELLED
    // ==================================================

    if (
      buildResult.cancelled ||
      buildResult.status ===
        "CANCELLED" ||
      await shouldStopBuild(
        build._id
      )
    ) {
      const freshBuild =
        await Build.findById(
          build._id
        );

      await finalizeCancelledBuild({
        pipeline,
        build:
          freshBuild || build,

        reason:
          buildResult.error ||
          "Build execution was cancelled.",
      });

      return;
    }

    // ==================================================
    // SAVE BUILD LOGS
    // ==================================================

    build =
      await Build.findById(
        build._id
      );

    const buildLogs =
      buildResult.logs || "";

    const combinedBuildLogs =
      mergeExecutionLogs(
        build.logs,
        buildLogs
      );

    build =
      await updateBuild(
        build._id,
        {
          logs:
            combinedBuildLogs,
        }
      );

    // ==================================================
    // BUILD FAILED
    // ==================================================

    if (!buildResult.success) {
      console.log(
        `[PIPELINE] Build #${build.buildNumber} failed during BUILDING.`
      );

      await handleExecutionFailure({
        pipeline,
        build,

        projectPath,

        failureStage:
          "BUILDING",

        result:
          buildResult,
      });

      return;
    }

    // ==================================================
    // CHECK CANCELLATION BEFORE TESTS
    // ==================================================

    if (
      await shouldStopBuild(
        build._id
      )
    ) {
      build =
        await Build.findById(
          build._id
        );

      await finalizeCancelledBuild({
        pipeline,
        build,

        reason:
          "Build was cancelled before tests started.",
      });

      return;
    }

    // ==================================================
    // TESTING STAGE
    // ==================================================

    console.log(
      `[PIPELINE] Build #${build.buildNumber} entering TESTING stage.`
    );

    build =
      await updateBuild(
        build._id,
        {
          stage: "TESTING",
        }
      );

    const testResult =
      await runTests(
        projectPath,
        {
          testCommand:
            pipeline.testCommand ||
            undefined,

          timeout:
            BUILD_TIMEOUT,

          buildId:
            build._id,

          onLog: async (
            logChunk
          ) => {
            await appendBuildLog(
              build._id,
              logChunk
            );
          },
        }
      );

    // ==================================================
    // TEST CANCELLED
    // ==================================================

    if (
      testResult.cancelled ||
      testResult.status ===
        "CANCELLED" ||
      await shouldStopBuild(
        build._id
      )
    ) {
      const freshBuild =
        await Build.findById(
          build._id
        );

      await finalizeCancelledBuild({
        pipeline,
        build:
          freshBuild || build,

        reason:
          testResult.error ||
          "Testing was cancelled.",
      });

      return;
    }

    // ==================================================
    // SAVE TEST RESULT
    // ==================================================

    build =
      await Build.findById(
        build._id
      );

    const combinedTestLogs =
      mergeExecutionLogs(
        build.logs,
        testResult.logs || ""
      );

    build =
      await updateBuild(
        build._id,
        {
          logs:
            combinedTestLogs,

          testResult:
            normalizeTestResult(
              testResult
            ),
        }
      );

    // ==================================================
    // TEST FAILED
    // ==================================================

    if (!testResult.success) {
      console.log(
        `[PIPELINE] Build #${build.buildNumber} failed during TESTING.`
      );

      await handleExecutionFailure({
        pipeline,
        build,

        projectPath,

        failureStage:
          "TESTING",

        result:
          testResult,
      });

      return;
    }

    // ==================================================
    // SUCCESS
    // ==================================================

    await finalizeSuccessfulBuild({
      pipeline,
      build,
      testResult,
    });
  } catch (error) {
    console.error(
      "[PIPELINE WORKER ERROR]",
      error
    );

    try {
      const currentBuild =
        build ||
        await Build.findById(
          buildId
        );

      const currentPipeline =
        pipeline ||
        await Pipeline.findById(
          pipelineId
        );

      if (
        currentBuild &&
        currentPipeline
      ) {
        if (
          await shouldStopBuild(
            currentBuild._id
          )
        ) {
          await finalizeCancelledBuild({
            pipeline:
              currentPipeline,

            build:
              currentBuild,

            reason:
              "Build was cancelled.",
          });
        } else {
          await finalizeFailedBuild({
            pipeline:
              currentPipeline,

            build:
              currentBuild,

            error:
              error.message ||
              "Unexpected pipeline execution error.",

            stage:
              "FAILED",
          });
        }
      }
    } catch (
      finalizationError
    ) {
      console.error(
        "[PIPELINE FINALIZATION ERROR]",
        finalizationError
      );
    }
  } finally {
    runningPipelines.delete(
      pipelineKey
    );

    cancelledBuilds.delete(
      toId(buildId)
    );

    console.log(
      `[PIPELINE] Worker finished for Build ${toId(buildId)}.`
    );
  }
}

// ======================================================
// APPEND BUILD LOG
// ======================================================

// ======================================================
// APPEND BUILD LOG + REAL-TIME LOG STREAM
// ======================================================

async function appendBuildLog(
  buildId,
  logChunk
) {
  if (
    logChunk === null ||
    logChunk === undefined
  ) {
    return;
  }

  let text;

  if (
    typeof logChunk === "string"
  ) {
    text = logChunk;
  } else {
    try {
      text =
        JSON.stringify(
          logChunk
        );
    } catch (error) {
      text =
        String(logChunk);
    }
  }

  if (!text) {
    return;
  }

  try {
    // ==================================================
    // LOAD BUILD
    // ==================================================

    const build =
      await Build.findById(
        buildId
      );

    if (!build) {
      return;
    }

    // ==================================================
    // SAVE LOG TO DATABASE
    // ==================================================

    const updatedLogs =
      appendLogs(
        build.logs,
        text
      );

    const updatedBuild =
      await Build.findByIdAndUpdate(
        buildId,
        {
          $set: {
            logs:
              updatedLogs,
          },
        },
        {
          returnDocument:
            "after",
        }
      );

    if (!updatedBuild) {
      return;
    }

    // ==================================================
    // REAL-TIME LOG EVENT
    // ==================================================

    emitBuildLog({
      userId:
        updatedBuild.user,

      buildId:
        updatedBuild._id,

      pipelineId:
        updatedBuild.pipeline,

      buildNumber:
        updatedBuild.buildNumber,

      stage:
        updatedBuild.stage,

      logChunk:
        text,
    });
  } catch (error) {
    console.error(
      "[APPEND BUILD LOG ERROR]",
      error.message
    );
  }
}
    

// ======================================================
// MERGE EXECUTION LOGS
// ======================================================

function mergeExecutionLogs(
  existingLogs,
  resultLogs
) {
  const oldLogs =
    existingLogs || "";

  const newLogs =
    resultLogs || "";

  if (!newLogs) {
    return oldLogs;
  }

  /*
   * executeCommand may already stream logs
   * through onLog.
   *
   * Avoid appending the complete result again
   * when it is already present.
   */

  if (
    oldLogs &&
    oldLogs.includes(
      newLogs
    )
  ) {
    return oldLogs;
  }

  return appendLogs(
    oldLogs,
    newLogs
  );
}

// ======================================================
// NORMALIZE TEST RESULT
// ======================================================

function normalizeTestResult(
  result
) {
  if (!result) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        "No test result was returned.",
    };
  }

  return {
    success:
      Boolean(
        result.success
      ),

    status:
      result.status || "",

    command:
      result.command || "",

    duration:
      Number(
        result.duration || 0
      ),

    logs:
      result.logs || "",

    error:
      result.error || null,
  };
}

// ======================================================
// NORMALIZE REBUILD RESULT
// ======================================================

function normalizeRebuildResult(
  result
) {
  if (!result) {
    return {
      success: false,
      status: "FAILED",
      command: "",
      duration: 0,
      logs: "",
      error:
        "No rebuild result was returned.",
    };
  }

  return {
    success:
      Boolean(
        result.success
      ),

    status:
      result.status || "",

    command:
      result.command || "",

    duration:
      Number(
        result.duration || 0
      ),

    logs:
      result.logs || "",

    error:
      result.error || null,
  };
}

// ======================================================
// NORMALIZE AUTO FIX RESULT
// ======================================================

function normalizeAutoFixResult(
  result
) {
  if (!result) {
    return {
      success: false,
      fixed: false,
      packageName: "",
      command: "",
      duration: 0,
      logs: "",
      error:
        "No auto-fix result was returned.",
      message: "",
      autoFixAvailable: false,
    };
  }

  return {
    success:
      Boolean(
        result.success
      ),

    fixed:
      Boolean(
        result.fixed
      ),

    packageName:
      result.packageName || "",

    command:
      result.command || "",

    duration:
      Number(
        result.duration || 0
      ),

    logs:
      result.logs || "",

    error:
      result.error || null,

    message:
      result.message || "",

    autoFixAvailable:
      result.autoFixAvailable !==
      undefined
        ? Boolean(
            result.autoFixAvailable
          )
        : Boolean(
            result.fixed
          ),
  };
}

// ======================================================
// HANDLE EXECUTION FAILURE
// ======================================================

async function handleExecutionFailure({
  pipeline,
  build,
  projectPath,
  failureStage,
  result,
}) {
  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled.",
    });

    return;
  }

  // ==================================================
  // ANALYZING
  // ==================================================

  build =
    await updateBuild(
      build._id,
      {
        stage: "ANALYZING",
      }
    );

  const failureLogs =
    [
      build.logs || "",
      result &&
      result.logs
        ? result.logs
        : "",
      result &&
      result.error
        ? result.error
        : "",
    ]
      .filter(Boolean)
      .join("\n");

  const analysis =
    await safeAnalyzeLogs(
      failureLogs
    );

  build =
    await updateBuild(
      build._id,
      {
        initialAIAnalysis:
          analysis,

        aiAnalysis:
          analysis,
      }
    );

  // ==================================================
  // CHECK CANCELLATION AFTER ANALYSIS
  // ==================================================

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled during failure analysis.",
    });

    return;
  }

  // ==================================================
  // AUTO FIX NOT AVAILABLE
  // ==================================================

  if (
    !analysis.autoFixAvailable
  ) {
    const errorMessage =
      analysis.detectedIssue ||
      (
        result &&
        result.error
      ) ||
      `${failureStage} failed.`;

    await finalizeFailedBuild({
      pipeline,
      build,

      error:
        errorMessage,

      stage:
        "FAILED",
    });

    return;
  }

  // ==================================================
  // AUTO FIXING
  // ==================================================

  console.log(
    `[PIPELINE] Build #${build.buildNumber} entering AUTO_FIXING stage.`
  );

  build =
    await updateBuild(
      build._id,
      {
        stage:
          "AUTO_FIXING",

        autoFixAttempted:
          true,
      }
    );

  let autoFixResult;

  try {
    autoFixResult =
      await autoFix({
        projectPath,

        analysis,

        logs:
          failureLogs,

        options: {
          timeout:
            BUILD_TIMEOUT,

          buildId:
            build._id,
        },
      });
  } catch (error) {
    autoFixResult = {
      success: false,
      fixed: false,

      packageName:
        analysis.packageName ||
        "",

      command: "",
      duration: 0,
      logs: "",

      error:
        error.message,

      message:
        "Automatic fix failed.",

      autoFixAvailable:
        true,
    };
  }

  const normalizedAutoFix =
    normalizeAutoFixResult(
      autoFixResult
    );

  build =
    await Build.findById(
      build._id
    );

  const logsAfterFix =
    mergeExecutionLogs(
      build.logs,

      normalizedAutoFix.logs
    );

  build =
    await updateBuild(
      build._id,
      {
        logs:
          logsAfterFix,

        autoFix:
          normalizedAutoFix,
      }
    );

  // ==================================================
  // AUTO FIX CANCELLED
  // ==================================================

  if (
    autoFixResult &&
    (
      autoFixResult.cancelled ||
      autoFixResult.status ===
        "CANCELLED"
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        autoFixResult.error ||
        "Automatic fix was cancelled.",
    });

    return;
  }

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled during automatic fixing.",
    });

    return;
  }

  // ==================================================
  // AUTO FIX FAILED
  // ==================================================

  if (
    !normalizedAutoFix.success ||
    !normalizedAutoFix.fixed
  ) {
    const autoFixError =
      normalizedAutoFix.error ||
      normalizedAutoFix.message ||
      analysis.detectedIssue ||
      "Automatic fix could not repair the failure.";

    await finalizeFailedBuild({
      pipeline,
      build,

      error:
        autoFixError,

      stage:
        "FAILED",
    });

    return;
  }

  // ==================================================
  // AUTO FIX SUCCESSFUL
  // ==================================================

  console.log(
    `[PIPELINE] Automatic fix succeeded for Build #${build.buildNumber}.`
  );

  await rebuildAfterAutoFix({
    pipeline,
    build,
    projectPath,
    failureStage,
  });
}

// ======================================================
// REBUILD AFTER AUTO FIX
// ======================================================

async function rebuildAfterAutoFix({
  pipeline,
  build,
  projectPath,
  failureStage,
}) {
  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled before rebuild.",
    });

    return;
  }

  // ==================================================
  // REBUILDING
  // ==================================================

  build =
    await updateBuild(
      build._id,
      {
        stage:
          "REBUILDING",

        rebuildAttempted:
          true,
      }
    );

  console.log(
    `[PIPELINE] Build #${build.buildNumber} entering REBUILDING stage.`
  );

  const rebuildResult =
    await runBuild(
      projectPath,
      {
        buildCommand:
          pipeline.buildCommand ||
          undefined,

        timeout:
          BUILD_TIMEOUT,

        buildId:
          build._id,

        onLog: async (
          logChunk
        ) => {
          await appendBuildLog(
            build._id,
            logChunk
          );
        },
      }
    );

  // ==================================================
  // REBUILD CANCELLED
  // ==================================================

  if (
    rebuildResult.cancelled ||
    rebuildResult.status ===
      "CANCELLED" ||
    await shouldStopBuild(
      build._id
    )
  ) {
    const freshBuild =
      await Build.findById(
        build._id
      );

    await finalizeCancelledBuild({
      pipeline,

      build:
        freshBuild || build,

      reason:
        rebuildResult.error ||
        "Rebuild was cancelled.",
    });

    return;
  }

  const normalizedRebuild =
    normalizeRebuildResult(
      rebuildResult
    );

  build =
    await Build.findById(
      build._id
    );

  const rebuildLogs =
    mergeExecutionLogs(
      build.logs,

      normalizedRebuild.logs
    );

  build =
    await updateBuild(
      build._id,
      {
        logs:
          rebuildLogs,

        rebuild:
          normalizedRebuild,
      }
    );

  // ==================================================
  // REBUILD FAILED
  // ==================================================

  if (
    !normalizedRebuild.success
  ) {
    await analyzeFinalFailure({
      pipeline,
      build,

      logs:
        [
          build.logs,
          normalizedRebuild.logs,
          normalizedRebuild.error,
        ]
          .filter(Boolean)
          .join("\n"),

      fallbackError:
        normalizedRebuild.error ||
        "Rebuild failed after automatic fix.",
    });

    return;
  }

  // ==================================================
  // REBUILD SUCCESS
  // ==================================================

  console.log(
    `[PIPELINE] Rebuild succeeded for Build #${build.buildNumber}.`
  );

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled before retesting.",
    });

    return;
  }

  // ==================================================
  // RETESTING
  // ==================================================

  build =
    await updateBuild(
      build._id,
      {
        stage:
          "RETESTING",
      }
    );

  console.log(
    `[PIPELINE] Build #${build.buildNumber} entering RETESTING stage.`
  );

  const retestResult =
    await runTests(
      projectPath,
      {
        testCommand:
          pipeline.testCommand ||
          undefined,

        timeout:
          BUILD_TIMEOUT,

        buildId:
          build._id,

        onLog: async (
          logChunk
        ) => {
          await appendBuildLog(
            build._id,
            logChunk
          );
        },
      }
    );

  // ==================================================
  // RETEST CANCELLED
  // ==================================================

  if (
    retestResult.cancelled ||
    retestResult.status ===
      "CANCELLED" ||
    await shouldStopBuild(
      build._id
    )
  ) {
    const freshBuild =
      await Build.findById(
        build._id
      );

    await finalizeCancelledBuild({
      pipeline,

      build:
        freshBuild || build,

      reason:
        retestResult.error ||
        "Retesting was cancelled.",
    });

    return;
  }

  const normalizedRetest =
    normalizeTestResult(
      retestResult
    );

  build =
    await Build.findById(
      build._id
    );

  const retestLogs =
    mergeExecutionLogs(
      build.logs,

      normalizedRetest.logs
    );

  build =
    await updateBuild(
      build._id,
      {
        logs:
          retestLogs,

        testResult:
          normalizedRetest,
      }
    );

  // ==================================================
  // RETEST FAILED
  // ==================================================

  if (
    !normalizedRetest.success
  ) {
    await analyzeFinalFailure({
      pipeline,
      build,

      logs:
        [
          build.logs,
          normalizedRetest.logs,
          normalizedRetest.error,
        ]
          .filter(Boolean)
          .join("\n"),

      fallbackError:
        normalizedRetest.error ||
        "Tests still failed after automatic fix.",
    });

    return;
  }

  // ==================================================
  // EVERYTHING SUCCESSFUL
  // ==================================================

  await finalizeSuccessfulBuild({
    pipeline,
    build,

    testResult:
      normalizedRetest,

    recoveredByAutoFix:
      true,

    originalFailureStage:
      failureStage,
  });
}
// ======================================================
// ANALYZE FINAL FAILURE
// ======================================================

async function analyzeFinalFailure({
  pipeline,
  build,
  logs,
  fallbackError,
}) {
  if (!build) {
    return;
  }

  // --------------------------------------------------
  // Check cancellation
  // --------------------------------------------------

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled before final failure analysis.",
    });

    return;
  }

  // --------------------------------------------------
  // ANALYZING
  // --------------------------------------------------

  build =
    await updateBuild(
      build._id,
      {
        stage:
          "ANALYZING",
      }
    );

  // --------------------------------------------------
  // Run final AI analysis
  // --------------------------------------------------

  const finalAnalysis =
    await safeAnalyzeLogs(
      logs || build.logs || ""
    );

  // --------------------------------------------------
  // Check cancellation again
  // --------------------------------------------------

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled during final failure analysis.",
    });

    return;
  }

  // --------------------------------------------------
  // Save final analysis
  // --------------------------------------------------

  build =
    await updateBuild(
      build._id,
      {
        aiAnalysis:
          finalAnalysis,

        logs:
          appendLogs(
            build.logs,

            `[FINAL AI ANALYSIS] ${
              finalAnalysis.detectedIssue ||
              fallbackError ||
              "Build failed."
            }`
          ),
      }
    );

  // --------------------------------------------------
  // Determine final error
  // --------------------------------------------------

  const finalError =
    finalAnalysis.detectedIssue ||
    fallbackError ||
    "Pipeline execution failed.";

  // --------------------------------------------------
  // Finalize
  // --------------------------------------------------

  await finalizeFailedBuild({
    pipeline,
    build,

    error:
      finalError,

    stage:
      "FAILED",
  });
}


// ======================================================
// FINALIZE SUCCESSFUL BUILD
// ======================================================

async function finalizeSuccessfulBuild({
  pipeline,
  build,
  testResult,
  recoveredByAutoFix = false,
  originalFailureStage = null,
}) {
  if (!pipeline || !build) {
    return null;
  }

  // --------------------------------------------------
  // Do not overwrite cancellation
  // --------------------------------------------------

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build was cancelled before successful finalization.",
    });

    return null;
  }

  const finishedAt =
    new Date();

  const startedAt =
    build.startedAt ||
    build.createdAt;

  const duration =
    calculateDuration(
      startedAt,
      finishedAt
    );

  // --------------------------------------------------
  // Success message
  // --------------------------------------------------

  let successMessage =
    "Pipeline completed successfully.";

  if (recoveredByAutoFix) {
    successMessage =
      "Pipeline completed successfully after automatic repair.";

    if (originalFailureStage) {
      successMessage +=
        ` Original failure stage: ${originalFailureStage}.`;
    }
  }

  // --------------------------------------------------
  // Prepare update
  // --------------------------------------------------

  const updates = {
    status:
      "Success",

    stage:
      "SUCCESS",

    finishedAt,

    duration,

    error:
      null,

    logs:
      appendLogs(
        build.logs,

        recoveredByAutoFix
          ? "[PIPELINE] BUILD + AUTO-FIX + REBUILD + RETEST SUCCESSFUL"
          : "[PIPELINE] BUILD + TEST SUCCESSFUL"
      ),
  };

  // --------------------------------------------------
  // Preserve latest test result
  // --------------------------------------------------

  if (testResult) {
    updates.testResult =
      normalizeTestResult(
        testResult
      );
  }

  // --------------------------------------------------
  // Atomic build update
  // --------------------------------------------------
  //
  // Only a Running build may become Success.
  //
  // If cancellation happened first, this update
  // returns null.
  //
  // --------------------------------------------------

  const updatedBuild =
    await Build.findOneAndUpdate(
      {
        _id:
          build._id,

        status:
          "Running",
      },

      {
        $set:
          updates,
      },

      {
        returnDocument:
          "after",
      }
    );

  // --------------------------------------------------
  // Build already finalized
  // --------------------------------------------------

  if (!updatedBuild) {
    const latestBuild =
      await Build.findById(
        build._id
      );

    console.log(
      `[PIPELINE] Build ${build._id} was not changed to Success because current status is ${
        latestBuild
          ? latestBuild.status
          : "unknown"
      }.`
    );

    return latestBuild;
  }

  // --------------------------------------------------
  // Update pipeline only if this is still
  // the current build
  // --------------------------------------------------

  const currentPipeline =
    await Pipeline.findById(
      pipeline._id
    );

  if (
    currentPipeline &&
    toId(
      currentPipeline.lastBuildId
    ) ===
      toId(
        updatedBuild._id
      )
  ) {
    await updatePipeline(
      pipeline._id,
      {
        status:
          "SUCCESS",

        lastRunAt:
          finishedAt,

        lastBuildId:
          updatedBuild._id,

        lastError:
          null,
      }
    );
  }

  // --------------------------------------------------
  // Notification
  // --------------------------------------------------

  await createNotification({
    user:
      updatedBuild.user,

    pipeline:
      pipeline._id,

    message:
      recoveredByAutoFix
        ? `Build #${updatedBuild.buildNumber} completed successfully after automatic repair.`
        : `Build #${updatedBuild.buildNumber} completed successfully.`,

    status:
      "Success",
  });
  // ==================================================
// REAL-TIME SUCCESS EVENT
// ==================================================

emitBuildEvent({
  userId:
    updatedBuild.user,

  event:
    "build:completed",

  buildId:
    updatedBuild._id,

  pipelineId:
    pipeline._id,

  buildNumber:
    updatedBuild.buildNumber,

  status:
    updatedBuild.status,

  stage:
    updatedBuild.stage,

  duration:
    updatedBuild.duration,

  message:
    recoveredByAutoFix
      ? "Pipeline completed successfully after automatic repair."
      : "Pipeline completed successfully.",

  extra: {
    recoveredByAutoFix,
    originalFailureStage,
  },
});

  console.log(
    "========================================"
  );

  console.log(
    `[PIPELINE] Build #${updatedBuild.buildNumber} SUCCESS`
  );

  console.log(
    `Duration: ${duration} second(s)`
  );

  console.log(
    "========================================"
  );

  return updatedBuild;
}


// ======================================================
// FINALIZE FAILED BUILD
// ======================================================

async function finalizeFailedBuild({
  pipeline,
  build,
  error,
  stage = "FAILED",
}) {
  if (!pipeline || !build) {
    return null;
  }

  // --------------------------------------------------
  // Never overwrite cancellation
  // --------------------------------------------------

  if (
    await shouldStopBuild(
      build._id
    )
  ) {
    await finalizeCancelledBuild({
      pipeline,
      build,

      reason:
        "Build cancellation took priority over failure finalization.",
    });

    return null;
  }

  const finishedAt =
    new Date();

  const startedAt =
    build.startedAt ||
    build.createdAt;

  const duration =
    calculateDuration(
      startedAt,
      finishedAt
    );

  const finalError =
    error ||
    "Pipeline execution failed.";

  // --------------------------------------------------
  // Atomic Build update
  // --------------------------------------------------

  const updatedBuild =
    await Build.findOneAndUpdate(
      {
        _id:
          build._id,

        status:
          "Running",
      },

      {
        $set: {
          status:
            "Failed",

          stage:
            stage || "FAILED",

          finishedAt,

          duration,

          error:
            finalError,

          logs:
            appendLogs(
              build.logs,

              `[PIPELINE] FAILED: ${finalError}`
            ),
        },
      },

      {
        returnDocument:
          "after",
      }
    );

  // --------------------------------------------------
  // Build already completed/cancelled
  // --------------------------------------------------

  if (!updatedBuild) {
    const latestBuild =
      await Build.findById(
        build._id
      );

    console.log(
      `[PIPELINE] Build ${build._id} was not changed to Failed because current status is ${
        latestBuild
          ? latestBuild.status
          : "unknown"
      }.`
    );

    return latestBuild;
  }

  // --------------------------------------------------
  // Update Pipeline only when this is still
  // the latest/current build
  // --------------------------------------------------

  const currentPipeline =
    await Pipeline.findById(
      pipeline._id
    );

  if (
    currentPipeline &&
    toId(
      currentPipeline.lastBuildId
    ) ===
      toId(
        updatedBuild._id
      )
  ) {
    await updatePipeline(
      pipeline._id,
      {
        status:
          "FAILED",

        lastRunAt:
          finishedAt,

        lastBuildId:
          updatedBuild._id,

        lastError:
          finalError,
      }
    );
  }

  // --------------------------------------------------
  // Notification
  // --------------------------------------------------

  await createNotification({
    user:
      updatedBuild.user,

    pipeline:
      pipeline._id,

    message:
      `Build #${updatedBuild.buildNumber} failed: ${finalError}`,

    status:
      "Failed",
  });

  console.log(
    "========================================"
  );

  console.log(
    `[PIPELINE] Build #${updatedBuild.buildNumber} FAILED`
  );

  console.log(
    "Error:",
    finalError
  );

  console.log(
    `Duration: ${duration} second(s)`
  );

  console.log(
    "========================================"
  );

  return updatedBuild;
}


// ======================================================
// FINALIZE CANCELLED BUILD
// ======================================================

async function finalizeCancelledBuild({
  pipeline,
  build,
  reason,
}) {
  if (!pipeline || !build) {
    return null;
  }

  const finishedAt =
    new Date();

  const startedAt =
    build.startedAt ||
    build.createdAt;

  const duration =
    calculateDuration(
      startedAt,
      finishedAt
    );

  const cancellationReason =
    reason ||
    "Build cancelled.";

  // --------------------------------------------------
  // Refresh build
  // --------------------------------------------------

  const currentBuild =
    await Build.findById(
      build._id
    );

  if (!currentBuild) {
    return null;
  }

  // --------------------------------------------------
  // Already cancelled
  // --------------------------------------------------

  if (
    currentBuild.status ===
    "Cancelled"
  ) {
    return currentBuild;
  }

  // --------------------------------------------------
  // Never overwrite a completed build
  // --------------------------------------------------

  if (
    currentBuild.status ===
      "Success" ||
    currentBuild.status ===
      "Failed"
  ) {
    return currentBuild;
  }

  // --------------------------------------------------
  // Atomic cancellation
  // --------------------------------------------------

  const updatedBuild =
    await Build.findOneAndUpdate(
      {
        _id:
          currentBuild._id,

        status:
          "Running",
      },

      {
        $set: {
          status:
            "Cancelled",

          stage:
            "CANCELLED",

          finishedAt,

          duration,

          error:
            cancellationReason,

          logs:
            appendLogs(
              currentBuild.logs,

              `[CANCEL] ${cancellationReason}`
            ),
        },
      },

      {
        returnDocument:
          "after",
      }
    );

  // --------------------------------------------------
  // Another operation won the race
  // --------------------------------------------------

  if (!updatedBuild) {
    return Build.findById(
      currentBuild._id
    );
  }

  // --------------------------------------------------
  // Update pipeline only when this build is current
  // --------------------------------------------------

  const currentPipeline =
    await Pipeline.findById(
      pipeline._id
    );

  if (
    currentPipeline &&
    toId(
      currentPipeline.lastBuildId
    ) ===
      toId(
        updatedBuild._id
      )
  ) {
    await updatePipeline(
      pipeline._id,
      {
        status:
          "CANCELLED",

        lastRunAt:
          finishedAt,

        lastBuildId:
          updatedBuild._id,

        lastError:
          cancellationReason,
      }
    );
  }

  // --------------------------------------------------
  // Notification
  // --------------------------------------------------

  await createNotification({
    user:
      updatedBuild.user,

    pipeline:
      pipeline._id,

    message:
      `Build #${updatedBuild.buildNumber} was cancelled.`,

    status:
      "Cancelled",
  });
  // ==================================================
// REAL-TIME CANCELLATION EVENT
// ==================================================

emitBuildEvent({
  userId:
    updatedBuild.user,

  event:
    "build:cancelled",

  buildId:
    updatedBuild._id,

  pipelineId:
    pipeline._id,

  buildNumber:
    updatedBuild.buildNumber,

  status:
    updatedBuild.status,

  stage:
    updatedBuild.stage,

  duration:
    updatedBuild.duration,

  error:
    cancellationReason,

  message:
    `Build #${updatedBuild.buildNumber} was cancelled.`,
});

  console.log(
    "========================================"
  );

  console.log(
    `[PIPELINE] Build #${updatedBuild.buildNumber} CANCELLED`
  );

  console.log(
    "Reason:",
    cancellationReason
  );

  console.log(
    "========================================"
  );

  return updatedBuild;
}


// ======================================================
// CANCEL RUNNING BUILD
// ======================================================

async function cancelBuild({
  pipelineId,
  buildId,
  userId,
}) {
  // --------------------------------------------------
  // Validate required values
  // --------------------------------------------------

  if (!pipelineId) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Pipeline ID is required.",
    };
  }

  if (!buildId) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Build ID is required.",
    };
  }

  if (!userId) {
    return {
      success: false,
      status: "FAILED",

      error:
        "User ID is required.",
    };
  }

  const buildKey =
    toId(buildId);

  const pipelineKey =
    toId(pipelineId);

  // --------------------------------------------------
  // Find pipeline
  // --------------------------------------------------

  const pipeline =
    await Pipeline.findOne({
      _id:
        pipelineId,

      user:
        userId,
    });

  if (!pipeline) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Pipeline not found.",
    };
  }

  // --------------------------------------------------
  // Find Build
  // --------------------------------------------------

  const build =
    await Build.findOne({
      _id:
        buildId,

      pipeline:
        pipeline._id,

      user:
        userId,
    });

  if (!build) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Build not found or does not belong to this pipeline.",
    };
  }

  // --------------------------------------------------
  // Already cancelled
  // --------------------------------------------------

  if (
    build.status ===
    "Cancelled"
  ) {
    return {
      success: true,

      alreadyCancelled:
        true,

      status:
        "CANCELLED",

      message:
        "Build is already cancelled.",

      pipelineId:
        pipeline._id.toString(),

      buildId:
        build._id.toString(),

      buildNumber:
        build.buildNumber,
    };
  }

  // --------------------------------------------------
  // Only running build can be cancelled
  // --------------------------------------------------

  if (
    build.status !==
    "Running"
  ) {
    return {
      success: false,

      status:
        build.status
          ? build.status.toUpperCase()
          : "FAILED",

      error:
        `Only running builds can be cancelled. Current build status: ${build.status}`,
    };
  }

  // ==================================================
  // SET CANCELLATION MARKER FIRST
  // ==================================================
  //
  // This immediately tells the worker that it must
  // stop moving to the next stage.
  //
  // ==================================================

  cancelledBuilds.add(
    buildKey
  );

  console.log(
    "========================================"
  );

  console.log(
    `[CANCEL] Cancellation requested for Build #${build.buildNumber}`
  );

  console.log(
    "Build ID:",
    buildKey
  );

  console.log(
    "========================================"
  );

  try {
    // ==================================================
    // STOP UNDERLYING PROCESS
    // ==================================================

    let processResult =
      null;

    try {
      processResult =
        await cancelBuildProcess(
          buildKey
        );

      console.log(
        "[CANCEL] Process cancellation result:",
        processResult
      );
    } catch (
      processCancelError
    ) {
      /*
       * Do not automatically abort DB cancellation.
       *
       * The child process may already have exited
       * between the status check and cancellation.
       */

      console.error(
        "[CANCEL PROCESS ERROR]",
        processCancelError.message
      );
    }

    // ==================================================
    // REFRESH BUILD
    // ==================================================

    const latestBuild =
      await Build.findById(
        build._id
      );

    if (!latestBuild) {
      cancelledBuilds.delete(
        buildKey
      );

      return {
        success: false,

        status:
          "FAILED",

        error:
          "Build no longer exists.",
      };
    }

    // --------------------------------------------------
    // Worker finished before cancellation update
    // --------------------------------------------------

    if (
      latestBuild.status !==
      "Running"
    ) {
      cancelledBuilds.delete(
        buildKey
      );

      return {
        success: false,

        status:
          latestBuild.status
            ? latestBuild.status.toUpperCase()
            : "FAILED",

        error:
          `Build could not be cancelled because its status changed to ${latestBuild.status}.`,

        pipelineId:
          pipeline._id.toString(),

        buildId:
          latestBuild._id.toString(),

        buildNumber:
          latestBuild.buildNumber,
      };
    }

    // ==================================================
    // FINALIZE CANCELLATION
    // ==================================================

    const cancelledBuild =
      await finalizeCancelledBuild({
        pipeline,

        build:
          latestBuild,

        reason:
          "Build cancelled by user.",
      });

    // --------------------------------------------------
    // Cancellation race
    // --------------------------------------------------

    if (
      !cancelledBuild ||
      cancelledBuild.status !==
        "Cancelled"
    ) {
      cancelledBuilds.delete(
        buildKey
      );

      const finalBuild =
        await Build.findById(
          build._id
        );

      return {
        success: false,

        status:
          finalBuild &&
          finalBuild.status
            ? finalBuild.status.toUpperCase()
            : "FAILED",

        error:
          `Build could not be cancelled because its status changed to ${
            finalBuild
              ? finalBuild.status
              : "another state"
          }.`,
      };
    }

    // --------------------------------------------------
    // Release in-memory pipeline lock
    // --------------------------------------------------

    runningPipelines.delete(
      pipelineKey
    );

    // --------------------------------------------------
    // IMPORTANT:
    //
    // Do NOT remove cancelledBuilds marker here.
    //
    // The worker may still be unwinding.
    // runPipelineWorker().finally removes it safely.
    // --------------------------------------------------

    return {
      success: true,

      status:
        "CANCELLED",

      message:
        "Build cancelled successfully.",

      pipelineId:
        pipeline._id.toString(),

      buildId:
        cancelledBuild._id.toString(),

      buildNumber:
        cancelledBuild.buildNumber,

      processResult:
        processResult || null,
    };

  } catch (error) {
    console.error(
      "[CANCEL BUILD ERROR]",
      error
    );

    /*
     * Only remove marker when cancellation itself
     * failed and build is still running.
     */

    const latestBuild =
      await Build.findById(
        buildId
      ).catch(() => null);

    if (
      !latestBuild ||
      latestBuild.status !==
        "Cancelled"
    ) {
      cancelledBuilds.delete(
        buildKey
      );
    }

    return {
      success: false,

      status:
        "FAILED",

      error:
        error.message ||
        "Failed to cancel build.",
    };
  }
}
// ======================================================
// RETRY FAILED BUILD
// ======================================================
//
// Creates a NEW build.
//
// Example:
//
// Build #10 -> Failed
//
// Retry:
//
// Build #10 -> Failed
// Build #11 -> Running
//
// The old build remains unchanged for history.
//
// ======================================================

async function retryFailedBuild({
  pipelineId,
  buildId,
  userId,
}) {
  // --------------------------------------------------
  // Validation
  // --------------------------------------------------

  if (!pipelineId) {
    return {
      success: false,
      status: "FAILED",
      error:
        "Pipeline ID is required.",
    };
  }

  if (!buildId) {
    return {
      success: false,
      status: "FAILED",
      error:
        "Build ID is required.",
    };
  }

  if (!userId) {
    return {
      success: false,
      status: "FAILED",
      error:
        "User ID is required.",
    };
  }

  // --------------------------------------------------
  // Find Pipeline
  // --------------------------------------------------

  const pipeline =
    await Pipeline.findOne({
      _id:
        pipelineId,

      user:
        userId,
    });

  if (!pipeline) {
    return {
      success: false,
      status: "FAILED",
      error:
        "Pipeline not found.",
    };
  }

  // --------------------------------------------------
  // Find Original Build
  // --------------------------------------------------

  const failedBuild =
    await Build.findOne({
      _id:
        buildId,

      pipeline:
        pipeline._id,

      user:
        userId,
    });

  if (!failedBuild) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Build not found or does not belong to this pipeline.",
    };
  }

  // --------------------------------------------------
  // Only Failed Builds Can Be Retried
  // --------------------------------------------------

  if (
    failedBuild.status !==
    "Failed"
  ) {
    return {
      success: false,
      status: "FAILED",

      error:
        `Only failed builds can be retried. Current build status: ${failedBuild.status}`,
    };
  }

  const pipelineKey =
    toId(
      pipeline._id
    );

  // ==================================================
  // CHECK IN-MEMORY LOCK
  // ==================================================

  if (
    runningPipelines.has(
      pipelineKey
    )
  ) {
    const activeBuild =
      await findActiveBuild(
        pipeline
      );

    return alreadyRunningResult(
      pipeline,
      activeBuild
    );
  }

  // ==================================================
  // CHECK DATABASE STATE
  // ==================================================

  if (
    pipeline.status ===
    "RUNNING"
  ) {
    await recoverStalePipeline(
      pipeline
    );
  }

  // --------------------------------------------------
  // Reload Pipeline
  // --------------------------------------------------

  const freshPipeline =
    await Pipeline.findOne({
      _id:
        pipeline._id,

      user:
        userId,
    });

  if (!freshPipeline) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Pipeline no longer exists.",
    };
  }

  // --------------------------------------------------
  // Still Running
  // --------------------------------------------------

  if (
    freshPipeline.status ===
    "RUNNING"
  ) {
    const activeBuild =
      await findActiveBuild(
        freshPipeline
      );

    return alreadyRunningResult(
      freshPipeline,
      activeBuild
    );
  }

  // ==================================================
  // PROJECT PATH
  // ==================================================

  // ==================================================
// RESOLVE LOCAL / GITHUB PROJECT PATH
// ==================================================

let projectPath;

try {
  const resolved =
    await resolvePipelineProjectPath(
      freshPipeline,
      undefined
    );

  projectPath =
    normalizeProjectPath(
      resolved.projectPath
    );

  if (!projectPath) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Pipeline project path is missing or invalid.",
    };
  }

  if (
    projectPath.includes(
      "[object Object]"
    )
  ) {
    return {
      success: false,
      status: "FAILED",

      error:
        "Invalid project path: [object Object].",
    };
  }

  if (
    !fs.existsSync(
      projectPath
    )
  ) {
    return {
      success: false,
      status: "FAILED",

      error:
        `Project path does not exist: ${projectPath}`,
    };
  }

} catch (error) {
  return {
    success: false,
    status: "FAILED",

    error:
      error.message ||
      "Failed to prepare pipeline workspace for retry.",
  };
}

  // ==================================================
  // ACQUIRE LOCK
  // ==================================================

  runningPipelines.add(
    pipelineKey
  );

  try {
    // ------------------------------------------------
    // Create New Build
    // ------------------------------------------------

    const newBuild =
      await createBuild({
        pipeline:
          freshPipeline,

        userId,
      });

    // ------------------------------------------------
    // Add Retry Information
    // ------------------------------------------------

    const retryMessage =
      `[RETRY] Build #${failedBuild.buildNumber} retried as Build #${newBuild.buildNumber}.`;

    await updateBuild(
      newBuild._id,
      {
        logs:
          retryMessage,
      }
    );

    // ------------------------------------------------
    // Pipeline -> RUNNING
    // ------------------------------------------------

    await updatePipeline(
      freshPipeline._id,
      {
        status:
          "RUNNING",

        lastRunAt:
          new Date(),

        lastBuildId:
          newBuild._id,

        lastError:
          null,
      }
    );

    // ------------------------------------------------
    // Notification
    // ------------------------------------------------

    await createNotification({
      user:
        userId,

      pipeline:
        freshPipeline._id,

      message:
        `Build #${failedBuild.buildNumber} retry started as Build #${newBuild.buildNumber}.`,

      status:
        "Running",
    });

    // ------------------------------------------------
    // Start Worker
    // ------------------------------------------------

    setImmediate(() => {
      runPipelineWorker({
        pipelineId:
          freshPipeline._id,

        buildId:
          newBuild._id,

        userId,

        projectPath,
      }).catch(
        (error) => {
          console.error(
            "[RETRY PIPELINE WORKER ERROR]",
            error
          );
        }
      );
    });

    // ------------------------------------------------
    // Return Immediately
    // ------------------------------------------------

    return {
      success: true,

      status:
        "RUNNING",

      retry:
        true,

      originalBuildId:
        failedBuild._id.toString(),

      originalBuildNumber:
        failedBuild.buildNumber,

      pipelineId:
        freshPipeline._id.toString(),

      buildId:
        newBuild._id.toString(),

      buildNumber:
        newBuild.buildNumber,
    };

  } catch (error) {
    // ------------------------------------------------
    // Release Lock
    // ------------------------------------------------

    runningPipelines.delete(
      pipelineKey
    );

    console.error(
      "[RETRY FAILED]",
      error
    );

    return {
      success: false,

      status:
        "FAILED",

      error:
        error.message ||
        "Failed to start build retry.",
    };
  }
}


// ======================================================
// RECOVER SINGLE STALE PIPELINE
// ======================================================
//
// This handles situations such as:
//
// Node server crashes
//
// Pipeline:
// RUNNING
//
// Build:
// Running
//
// But the actual child process no longer exists.
//
// After STALE_PIPELINE_TIMEOUT_MS the build can be
// safely marked Failed.
//
// ======================================================

async function recoverStalePipeline(
  pipeline
) {
  if (!pipeline) {
    return {
      recovered: false,
      active: false,
    };
  }

  // --------------------------------------------------
  // Nothing to Recover
  // --------------------------------------------------

  if (
    pipeline.status !==
    "RUNNING"
  ) {
    return {
      recovered: false,
      active: false,
    };
  }

  // --------------------------------------------------
  // Find Running Build
  // --------------------------------------------------

  const activeBuild =
    await findActiveBuild(
      pipeline
    );

  // ==================================================
  // PIPELINE RUNNING BUT NO ACTIVE BUILD
  // ==================================================

  if (!activeBuild) {
    const finishedAt =
      new Date();

    const message =
      "Pipeline was marked RUNNING but no active build was found.";

    await updatePipeline(
      pipeline._id,
      {
        status:
          "FAILED",

        lastRunAt:
          finishedAt,

        lastError:
          message,
      }
    );

    await createNotification({
      user:
        pipeline.user,

      pipeline:
        pipeline._id,

      message:
        "Pipeline was marked as failed because no active build was found.",

      status:
        "Failed",
    });

    return {
      recovered: true,

      active: false,

      status:
        "FAILED",
    };
  }

  // ==================================================
  // DETERMINE START TIME
  // ==================================================

  const startedAt =
    activeBuild.startedAt ||
    activeBuild.createdAt;

  // --------------------------------------------------
  // Still Inside Allowed Time
  // --------------------------------------------------

  if (
    !isOlderThanTimeout(
      startedAt,
      STALE_PIPELINE_TIMEOUT_MS
    )
  ) {
    return {
      recovered: false,

      active: true,

      buildId:
        activeBuild._id.toString(),

      buildNumber:
        activeBuild.buildNumber,
    };
  }

  // ==================================================
  // BUILD IS STALE
  // ==================================================

  const finishedAt =
    new Date();

  const staleMessage =
    "Pipeline execution was marked stale because it exceeded the allowed execution time.";

  const duration =
    calculateDuration(
      startedAt,
      finishedAt
    );

  const updatedLogs =
    appendLogs(
      activeBuild.logs,

      `[PIPELINE RECOVERY] ${staleMessage}`
    );

  // --------------------------------------------------
  // Try To Stop Any Remaining Process
  // --------------------------------------------------

  try {
    await cancelBuildProcess(
      activeBuild._id.toString()
    );
  } catch (error) {
    console.error(
      "[STALE PROCESS TERMINATION ERROR]",
      error.message
    );
  }

  // --------------------------------------------------
  // Atomic Update
  // --------------------------------------------------

  const updatedBuild =
    await Build.findOneAndUpdate(
      {
        _id:
          activeBuild._id,

        status:
          "Running",
      },

      {
        $set: {
          status:
            "Failed",

          stage:
            "FAILED",

          error:
            staleMessage,

          finishedAt,

          duration,

          logs:
            updatedLogs,
        },
      },

      {
        returnDocument:
          "after",
      }
    );

  // --------------------------------------------------
  // Another Worker Already Finished It
  // --------------------------------------------------

  if (!updatedBuild) {
    return {
      recovered: false,
      active: false,
    };
  }

  // --------------------------------------------------
  // Update Pipeline
  // --------------------------------------------------

  const currentPipeline =
    await Pipeline.findById(
      pipeline._id
    );

  if (
    currentPipeline &&
    toId(
      currentPipeline.lastBuildId
    ) ===
      toId(
        updatedBuild._id
      )
  ) {
    await updatePipeline(
      pipeline._id,
      {
        status:
          "FAILED",

        lastRunAt:
          finishedAt,

        lastBuildId:
          updatedBuild._id,

        lastError:
          staleMessage,
      }
    );
  }

  // --------------------------------------------------
  // Remove Locks
  // --------------------------------------------------

  runningPipelines.delete(
    toId(
      pipeline._id
    )
  );

  cancelledBuilds.delete(
    toId(
      updatedBuild._id
    )
  );

  // --------------------------------------------------
  // Notification
  // --------------------------------------------------

  await createNotification({
    user:
      updatedBuild.user,

    pipeline:
      pipeline._id,

    message:
      `Build #${updatedBuild.buildNumber} was marked as failed because it exceeded the allowed execution time.`,

    status:
      "Failed",
  });

  console.log(
    `[PIPELINE RECOVERY] Build #${updatedBuild.buildNumber} marked Failed.`
  );

  return {
    recovered: true,

    active: false,

    status:
      "FAILED",

    buildId:
      updatedBuild._id.toString(),

    buildNumber:
      updatedBuild.buildNumber,
  };
}


// ======================================================
// RECOVER ALL STALE BUILDS
// ======================================================
//
// Recommended usage:
//
// Call this once when the backend starts.
//
// Example in server.js:
//
// await recoverAllStaleBuilds();
//
// This repairs builds left Running after:
// - server crash
// - forced shutdown
// - machine restart
// - process termination
//
// ======================================================

async function recoverAllStaleBuilds() {
  const staleCutoff =
    new Date(
      Date.now() -
        STALE_PIPELINE_TIMEOUT_MS
    );

  const staleMessage =
    "Build execution was marked stale because it exceeded the allowed execution time.";

  let scanned = 0;
  let recovered = 0;

  try {
    // ==================================================
    // FIND STALE BUILDS
    // ==================================================

    const staleBuilds =
      await Build.find({
        status:
          "Running",

        $or: [
          {
            startedAt: {
              $lt:
                staleCutoff,
            },
          },

          {
            startedAt:
              null,

            createdAt: {
              $lt:
                staleCutoff,
            },
          },
        ],
      }).sort({
        createdAt:
          1,
      });

    scanned =
      staleBuilds.length;

    console.log(
      "========================================"
    );

    console.log(
      `[PIPELINE RECOVERY] Found ${scanned} stale build(s).`
    );

    console.log(
      "========================================"
    );

    // ==================================================
    // PROCESS EACH BUILD
    // ==================================================

    for (
      const staleBuild
      of staleBuilds
    ) {
      try {
        const startedAt =
          staleBuild.startedAt ||
          staleBuild.createdAt;

        const finishedAt =
          new Date();

        const duration =
          calculateDuration(
            startedAt,
            finishedAt
          );

        const updatedLogs =
          appendLogs(
            staleBuild.logs,

            `[PIPELINE RECOVERY] ${staleMessage}`
          );

        // ----------------------------------------------
        // Attempt Process Termination
        // ----------------------------------------------

        try {
          await cancelBuildProcess(
            staleBuild._id.toString()
          );
        } catch (
          processError
        ) {
          console.error(
            `[PIPELINE RECOVERY] Unable to terminate process for Build ${staleBuild._id}:`,
            processError.message
          );
        }

        // ----------------------------------------------
        // Atomic Build Update
        // ----------------------------------------------

        const updatedBuild =
          await Build.findOneAndUpdate(
            {
              _id:
                staleBuild._id,

              status:
                "Running",
            },

            {
              $set: {
                status:
                  "Failed",

                stage:
                  "FAILED",

                error:
                  staleMessage,

                finishedAt,

                duration,

                logs:
                  updatedLogs,
              },
            },

            {
              returnDocument:
                "after",
            }
          );

        // ----------------------------------------------
        // Already Completed Elsewhere
        // ----------------------------------------------

        if (!updatedBuild) {
          continue;
        }

        recovered++;

        // ----------------------------------------------
        // Remove Memory Markers
        // ----------------------------------------------

        cancelledBuilds.delete(
          toId(
            updatedBuild._id
          )
        );

        // ----------------------------------------------
        // Find Pipeline
        // ----------------------------------------------

        const pipeline =
          await Pipeline.findById(
            updatedBuild.pipeline
          );

        if (!pipeline) {
          console.warn(
            `[PIPELINE RECOVERY] Pipeline not found for Build ${updatedBuild._id}.`
          );

          continue;
        }

        runningPipelines.delete(
          toId(
            pipeline._id
          )
        );

        // ----------------------------------------------
        // Check For Another Running Build
        // ----------------------------------------------

        const anotherActiveBuild =
          await Build.findOne({
            pipeline:
              pipeline._id,

            status:
              "Running",
          }).sort({
            createdAt:
              -1,
          });

        // ----------------------------------------------
        // Was This Pipeline's Current Build?
        // ----------------------------------------------

        const staleWasCurrent =
          toId(
            pipeline.lastBuildId
          ) ===
          toId(
            updatedBuild._id
          );

        // ----------------------------------------------
        // Repair Pipeline
        // ----------------------------------------------

        if (
          !anotherActiveBuild &&
          (
            staleWasCurrent ||
            pipeline.status ===
              "RUNNING"
          )
        ) {
          await updatePipeline(
            pipeline._id,
            {
              status:
                "FAILED",

              lastRunAt:
                finishedAt,

              lastBuildId:
                updatedBuild._id,

              lastError:
                staleMessage,
            }
          );
        }

        // ----------------------------------------------
        // Notification
        // ----------------------------------------------

        await createNotification({
          user:
            updatedBuild.user,

          pipeline:
            pipeline._id,

          message:
            `Build #${updatedBuild.buildNumber} was marked as failed because it exceeded the allowed execution time.`,

          status:
            "Failed",
        });

        console.log(
          `[PIPELINE RECOVERY] Build #${updatedBuild.buildNumber} recovered as Failed.`
        );

      } catch (
        buildRecoveryError
      ) {
        console.error(
          `[PIPELINE RECOVERY] Failed to recover Build ${staleBuild._id}:`,
          buildRecoveryError.message
        );
      }
    }

    // ==================================================
    // SUMMARY
    // ==================================================

    console.log(
      "========================================"
    );

    console.log(
      "[PIPELINE RECOVERY] COMPLETE"
    );

    console.log(
      `Scanned: ${scanned}`
    );

    console.log(
      `Recovered: ${recovered}`
    );

    console.log(
      "========================================"
    );

    return {
      success: true,

      scanned,

      recovered,
    };

  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "STALE BUILD RECOVERY ERROR"
    );

    console.error(error);

    console.error(
      "========================================"
    );

    return {
      success: false,

      scanned,

      recovered,

      error:
        error.message,
    };
  }
}


// ======================================================
// CLEANUP ORPHAN RUNNING PIPELINES
// ======================================================
//
// Handles:
//
// Pipeline.status = RUNNING
//
// but:
//
// no Build.status = Running
//
// ======================================================

async function cleanupOrphanRunningPipelines() {
  let scanned = 0;
  let repaired = 0;

  try {
    const runningPipelineDocuments =
      await Pipeline.find({
        status:
          "RUNNING",
      });

    scanned =
      runningPipelineDocuments.length;

    for (
      const pipeline
      of runningPipelineDocuments
    ) {
      try {
        const activeBuild =
          await findActiveBuild(
            pipeline
          );

        // ----------------------------------------------
        // Valid Active Pipeline
        // ----------------------------------------------

        if (activeBuild) {
          continue;
        }

        const message =
          "Pipeline was marked RUNNING but no active build exists.";

        const now =
          new Date();

        await updatePipeline(
          pipeline._id,
          {
            status:
              "FAILED",

            lastRunAt:
              now,

            lastError:
              message,
          }
        );

        runningPipelines.delete(
          toId(
            pipeline._id
          )
        );

        await createNotification({
          user:
            pipeline.user,

          pipeline:
            pipeline._id,

          message:
            "Pipeline state was recovered because no active build was found.",

          status:
            "Failed",
        });

        repaired++;

      } catch (
        pipelineError
      ) {
        console.error(
          `[PIPELINE CLEANUP] Failed for Pipeline ${pipeline._id}:`,
          pipelineError.message
        );
      }
    }

    return {
      success: true,

      scanned,

      repaired,
    };

  } catch (error) {
    console.error(
      "[PIPELINE CLEANUP ERROR]",
      error
    );

    return {
      success: false,

      scanned,

      repaired,

      error:
        error.message,
    };
  }
}


// ======================================================
// RECOVER PIPELINE SYSTEM
// ======================================================
//
// Convenience startup function.
//
// Recommended:
//
// await recoverPipelineSystem();
//
// instead of calling recovery functions separately.
//
// ======================================================

async function recoverPipelineSystem() {
  console.log(
    "========================================"
  );

  console.log(
    "[PIPELINE SYSTEM] Starting recovery..."
  );

  console.log(
    "========================================"
  );

  const staleRecovery =
    await recoverAllStaleBuilds();

  const orphanRecovery =
    await cleanupOrphanRunningPipelines();

  console.log(
    "========================================"
  );

  console.log(
    "[PIPELINE SYSTEM] Recovery complete."
  );

  console.log(
    "========================================"
  );

  return {
    success:
      Boolean(
        staleRecovery.success &&
        orphanRecovery.success
      ),

    staleBuilds:
      staleRecovery,

    orphanPipelines:
      orphanRecovery,
  };
}


// ======================================================
// GET PIPELINE EXECUTION STATE
// ======================================================
//
// Optional helper useful for controllers/debugging.
//
// ======================================================

async function getPipelineExecutionState({
  pipelineId,
  userId,
}) {
  if (
    !pipelineId ||
    !userId
  ) {
    return null;
  }

  const pipeline =
    await Pipeline.findOne({
      _id:
        pipelineId,

      user:
        userId,
    });

  if (!pipeline) {
    return null;
  }

  const activeBuild =
    await findActiveBuild(
      pipeline
    );

  return {
    pipelineId:
      pipeline._id.toString(),

    pipelineStatus:
      pipeline.status,

    runningInMemory:
      runningPipelines.has(
        toId(
          pipeline._id
        )
      ),

    activeBuild:
      activeBuild
        ? {
            buildId:
              activeBuild._id.toString(),

            buildNumber:
              activeBuild.buildNumber,

            status:
              activeBuild.status,

            stage:
              activeBuild.stage,

            startedAt:
              activeBuild.startedAt,
          }
        : null,
  };
}


// ======================================================
// MODULE EXPORTS
// ======================================================

module.exports = {
  // --------------------------------------------------
  // Main Execution
  // --------------------------------------------------

  executePipeline,

  runPipelineWorker,

  // --------------------------------------------------
  // Retry
  // --------------------------------------------------

  retryFailedBuild,

  // --------------------------------------------------
  // Cancellation
  // --------------------------------------------------

  cancelBuild,

  // --------------------------------------------------
  // Recovery
  // --------------------------------------------------

  recoverStalePipeline,

  recoverAllStaleBuilds,

  cleanupOrphanRunningPipelines,

  recoverPipelineSystem,

  // --------------------------------------------------
  // State
  // --------------------------------------------------

  getPipelineExecutionState,

  // --------------------------------------------------
  // Memory State
  // --------------------------------------------------

  runningPipelines,

  cancelledBuilds,
};