const mongoose = require("mongoose");

const Pipeline = require("../models/Pipeline");
const Build = require("../models/Build");
const Notification = require("../models/Notification");

const {
  executePipeline,
  retryFailedBuild,
  cancelBuild,
  recoverStalePipeline,
} = require("../services/pipelineExecutionService");
const {
  parseGitHubRepository,
  validateBranch,
} = require("../services/gitService");

// ======================================================
// HELPER: NORMALIZE PROJECT PATH
// ======================================================

const normalizeProjectPath = (value) => {
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
};

// ======================================================
// HELPER: VALIDATE OBJECT ID
// ======================================================

const isValidObjectId = (value) => {
  return (
    typeof value === "string" &&
    mongoose.Types.ObjectId.isValid(value)
  );
};

// ======================================================
// CREATE PIPELINE
// POST /api/pipeline/create
// ======================================================

exports.createPipeline = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      name,
      description,
      sourceType,
      repository,
      branch,
      projectPath,
      projectType,
      buildCommand,
      testCommand,
    } = req.body || {};

    // ==================================================
    // NAME
    // ==================================================

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Pipeline name is required.",
      });
    }

    // ==================================================
    // SOURCE TYPE
    // ==================================================

    const normalizedSourceType =
      typeof sourceType === "string" &&
      sourceType.trim()
        ? sourceType.trim().toUpperCase()
        : "LOCAL";

    if (
      !["LOCAL", "GITHUB"].includes(
        normalizedSourceType
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'sourceType must be either "LOCAL" or "GITHUB".',
      });
    }

    // ==================================================
    // REPOSITORY
    // ==================================================

    if (
      typeof repository !== "string" ||
      !repository.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Repository is required.",
      });
    }

    // ==================================================
    // COMMON VALUES
    // ==================================================

    let finalRepository =
      repository.trim();

    let finalBranch =
      typeof branch === "string" &&
      branch.trim()
        ? branch.trim()
        : "main";

    let finalProjectPath = "";

    let repositoryOwner = "";
    let repositoryName = "";

    // ==================================================
    // LOCAL PIPELINE
    // ==================================================

    if (normalizedSourceType === "LOCAL") {
      finalProjectPath =
        normalizeProjectPath(
          projectPath
        );

      if (!finalProjectPath) {
        return res.status(400).json({
          success: false,
          message:
            "Project path is required for a LOCAL pipeline.",
        });
      }

      if (
        finalProjectPath.includes(
          "[object Object]"
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid project path. Expected a valid string path.",
        });
      }
    }

    // ==================================================
    // GITHUB PIPELINE
    // ==================================================

    if (normalizedSourceType === "GITHUB") {
      try {
        const parsedRepository =
          parseGitHubRepository(
            finalRepository
          );

        finalBranch =
          validateBranch(
            finalBranch
          );

        finalRepository =
          parsedRepository.repositoryUrl;

        repositoryOwner =
          parsedRepository.owner;

        repositoryName =
          parsedRepository.repositoryName;

        // IMPORTANT:
        // GitHub projectPath is generated later by
        // gitService. Never trust a client-supplied path.
        finalProjectPath = "";
      } catch (error) {
        return res.status(400).json({
          success: false,

          message:
            error.message ||
            "Invalid GitHub repository configuration.",

          code:
            error.code ||
            "INVALID_GITHUB_CONFIGURATION",
        });
      }
    }

    // ==================================================
    // CREATE
    // ==================================================

    const pipeline =
      await Pipeline.create({
        name:
          name.trim(),

        description:
          typeof description === "string"
            ? description.trim()
            : "",

        sourceType:
          normalizedSourceType,

        repository:
          finalRepository,

        repositoryOwner,
        repositoryName,

        branch:
          finalBranch,

        projectPath:
          finalProjectPath,

        projectType:
          typeof projectType === "string" &&
          projectType.trim()
            ? projectType.trim()
            : "unknown",

        buildCommand:
          typeof buildCommand === "string"
            ? buildCommand.trim()
            : "",

        testCommand:
          typeof testCommand === "string"
            ? testCommand.trim()
            : "",

        lastCommitId: "",

        status: "IDLE",
        lastRunAt: null,
        lastBuildId: null,
        lastError: null,

        user:
          req.user._id,
      });

    return res.status(201).json({
      success: true,

      message:
        normalizedSourceType === "GITHUB"
          ? "GitHub pipeline created successfully."
          : "Local pipeline created successfully.",

      pipeline,
    });
  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "CREATE PIPELINE ERROR"
    );

    console.error(error);

    console.error(
      "========================================"
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create pipeline.",
      error:
        error.message,
    });
  }
};

// ======================================================
// GET ALL PIPELINES
// GET /api/pipeline
// ======================================================

exports.getAllPipelines = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelines = await Pipeline.find({
      user: req.user._id,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: pipelines.length,
      pipelines,
    });
  } catch (error) {
    console.error(
      "GET ALL PIPELINES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pipelines.",
      error: error.message,
    });
  }
};

// ======================================================
// GET PIPELINE BY ID
// GET /api/pipeline/:id
// ======================================================

exports.getPipelineById = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    const pipeline = await Pipeline.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    return res.status(200).json({
      success: true,
      pipeline,
    });
  } catch (error) {
    console.error(
      "GET PIPELINE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pipeline.",
      error: error.message,
    });
  }
};

// ======================================================
// UPDATE PIPELINE
// PUT /api/pipeline/:id
// ======================================================

exports.updatePipeline = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    const pipeline = await Pipeline.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    const body = req.body || {};

    const protectedFields = [
  "status",
  "lastRunAt",
  "lastBuildId",
  "lastError",
  "lastCommitId",
  "repositoryOwner",
  "repositoryName",
  "projectPath",
  "user",
];

    const attemptedProtectedField =
      protectedFields.find(
        (field) => body[field] !== undefined
      );

    if (attemptedProtectedField) {
      return res.status(400).json({
        success: false,
        message:
          `Field "${attemptedProtectedField}" cannot be changed manually.`,
      });
    }

    if (pipeline.status === "RUNNING") {
      return res.status(409).json({
        success: false,
        message:
          "Cannot update a pipeline while it is running.",
      });
    }

    if (body.name !== undefined) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Pipeline name cannot be empty.",
        });
      }

      pipeline.name = body.name.trim();
    }
    if (body.sourceType !== undefined) {
  if (typeof body.sourceType !== "string") {
    return res.status(400).json({
      success: false,
      message: "Source type must be a string.",
    });
  }

  const requestedSourceType =
    body.sourceType.trim().toUpperCase();

  if (
    !["LOCAL", "GITHUB"].includes(
      requestedSourceType
    )
  ) {
    return res.status(400).json({
      success: false,
      message:
        'sourceType must be either "LOCAL" or "GITHUB".',
    });
  }

  if (
    requestedSourceType !==
    pipeline.sourceType
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Changing pipeline source type after creation is not supported yet.",
    });
  }
}
    if (body.repository !== undefined) {
  if (
    typeof body.repository !== "string" ||
    !body.repository.trim()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Repository cannot be empty.",
    });
  }

  if (pipeline.sourceType === "GITHUB") {
    try {
      const parsedRepository =
        parseGitHubRepository(
          body.repository
        );

      pipeline.repository =
        parsedRepository.repositoryUrl;

      pipeline.repositoryOwner =
        parsedRepository.owner;

      pipeline.repositoryName =
        parsedRepository.repositoryName;

      // Existing workspace may correspond to the
      // previous repository. Force regeneration.
      pipeline.projectPath = "";
      pipeline.lastCommitId = "";
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Invalid GitHub repository.",
        code:
          error.code ||
          "INVALID_GITHUB_REPOSITORY",
      });
    }
  } else {
    pipeline.repository =
      body.repository.trim();
  }
}

if (body.branch !== undefined) {
  if (
    body.branch !== null &&
    typeof body.branch !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Branch must be a string.",
    });
  }

  const requestedBranch =
    typeof body.branch === "string" &&
    body.branch.trim()
      ? body.branch.trim()
      : "main";

  if (pipeline.sourceType === "GITHUB") {
    try {
      pipeline.branch =
        validateBranch(
          requestedBranch
        );

      pipeline.lastCommitId = "";
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Invalid Git branch.",
        code:
          error.code ||
          "INVALID_BRANCH",
      });
    }
  } else {
    pipeline.branch =
      requestedBranch;
  }
}

   


    if (body.buildCommand !== undefined) {
      if (
        body.buildCommand !== null &&
        typeof body.buildCommand !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Build command must be a string.",
        });
      }

      pipeline.buildCommand =
        typeof body.buildCommand === "string"
          ? body.buildCommand.trim()
          : "";
    }

    if (body.testCommand !== undefined) {
      if (
        body.testCommand !== null &&
        typeof body.testCommand !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Test command must be a string.",
        });
      }

      pipeline.testCommand =
        typeof body.testCommand === "string"
          ? body.testCommand.trim()
          : "";
    }

    await pipeline.save();

    return res.status(200).json({
      success: true,
      message:
        "Pipeline updated successfully.",
      pipeline,
    });
  } catch (error) {
    console.error(
      "UPDATE PIPELINE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update pipeline.",
      error: error.message,
    });
  }
};

// ======================================================
// DELETE PIPELINE
// DELETE /api/pipeline/:id
// ======================================================

exports.deletePipeline = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    const pipeline = await Pipeline.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    if (pipeline.status === "RUNNING") {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete a pipeline while it is running. Cancel the running build first.",
      });
    }

    const runningBuild =
      await Build.findOne({
        pipeline: pipeline._id,
        status: "Running",
      }).select("_id buildNumber");

    if (runningBuild) {
      return res.status(409).json({
        success: false,

        message:
          `Cannot delete this pipeline because Build #${runningBuild.buildNumber} is still running.`,

        buildId:
          runningBuild._id.toString(),

        buildNumber:
          runningBuild.buildNumber,
      });
    }

    await Build.deleteMany({
      pipeline: pipeline._id,
    });

    await Notification.deleteMany({
      pipeline: pipeline._id,
    });

    await pipeline.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Pipeline deleted successfully.",
    });
  } catch (error) {
    console.error(
      "DELETE PIPELINE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete pipeline.",
      error: error.message,
    });
  }
};
// ======================================================
// RUN PIPELINE
// POST /api/pipeline/:id/run
// PUT  /api/pipeline/:id/run
// ======================================================

exports.runPipeline = async (req, res) => {
  try {
    console.log("");
    console.log("=========================================");
    console.log("========== RUN PIPELINE START ==========");
    console.log("=========================================");

    // ==================================================
    // 1. AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      console.log(
        "[RUN PIPELINE] Authentication failed."
      );

      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId = req.params.id;
    const userId = req.user._id;

    console.log(
      "[RUN PIPELINE] Pipeline ID:",
      pipelineId
    );

    console.log(
      "[RUN PIPELINE] User ID:",
      userId.toString()
    );

    // ==================================================
    // 2. VALIDATE PIPELINE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      console.log(
        "[RUN PIPELINE] Invalid pipeline ID."
      );

      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // 3. LOAD PIPELINE
    // ==================================================

    console.log(
      "[RUN PIPELINE] Loading pipeline..."
    );

    let pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: userId,
      });

    console.log(
      "[RUN PIPELINE] Pipeline lookup finished."
    );

    if (!pipeline) {
      console.log(
        "[RUN PIPELINE] Pipeline not found."
      );

      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    console.log(
      "[RUN PIPELINE] Pipeline name:",
      pipeline.name
    );

    console.log(
      "[RUN PIPELINE] Current status:",
      pipeline.status
    );

    console.log(
      "[RUN PIPELINE] Project path:",
      pipeline.projectPath
    );

    console.log(
      "[RUN PIPELINE] Project type:",
      pipeline.projectType
    );

    console.log(
      "[RUN PIPELINE] Build command:",
      pipeline.buildCommand || "(automatic)"
    );

    console.log(
      "[RUN PIPELINE] Test command:",
      pipeline.testCommand || "(automatic)"
    );

    // ==================================================
    // 4. VALIDATE / NORMALIZE PROJECT PATH
    // ==================================================

    // ==================================================
// 4. VALIDATE PIPELINE SOURCE
// ==================================================

const sourceType =
  typeof pipeline.sourceType === "string"
    ? pipeline.sourceType.trim().toUpperCase()
    : "LOCAL";

console.log(
  "[RUN PIPELINE] Source type:",
  sourceType
);

if (
  !["LOCAL", "GITHUB"].includes(sourceType)
) {
  return res.status(400).json({
    success: false,
    message:
      `Unsupported pipeline source type: ${sourceType}`,
  });
}

// --------------------------------------------------
// LOCAL PIPELINE
//
// Local pipelines must already have a valid
// filesystem project path.
// --------------------------------------------------

if (sourceType === "LOCAL") {
  const normalizedProjectPath =
    normalizeProjectPath(
      pipeline.projectPath
    );

  if (!normalizedProjectPath) {
    console.log(
      "[RUN PIPELINE] Local project path is missing."
    );

    return res.status(400).json({
      success: false,
      message:
        "Pipeline project path is missing.",
    });
  }

  if (
    normalizedProjectPath.includes(
      "[object Object]"
    )
  ) {
    console.log(
      "[RUN PIPELINE] Invalid local project path detected."
    );

    return res.status(400).json({
      success: false,
      message:
        "Pipeline project path is invalid.",
    });
  }

  pipeline.projectPath =
    normalizedProjectPath;

  console.log(
    "[RUN PIPELINE] Local project path:",
    pipeline.projectPath
  );
}

// --------------------------------------------------
// GITHUB PIPELINE
//
// Do NOT require projectPath here.
// gitService generates the trusted workspace path
// during pipeline execution.
// --------------------------------------------------

if (sourceType === "GITHUB") {
  try {
    const parsedRepository =
      parseGitHubRepository(
        pipeline.repository
      );

    const validatedBranch =
      validateBranch(
        pipeline.branch || "main"
      );

    pipeline.repository =
      parsedRepository.repositoryUrl;

    pipeline.repositoryOwner =
      parsedRepository.owner;

    pipeline.repositoryName =
      parsedRepository.repositoryName;

    pipeline.branch =
      validatedBranch;

    console.log(
      "[RUN PIPELINE] GitHub repository:",
      pipeline.repository
    );

    console.log(
      "[RUN PIPELINE] GitHub branch:",
      pipeline.branch
    );

    console.log(
      "[RUN PIPELINE] GitHub workspace will be resolved by gitService."
    );
  } catch (error) {
    console.log(
      "[RUN PIPELINE] Invalid GitHub configuration:",
      error.message
    );

    return res.status(400).json({
      success: false,

      message:
        error.message ||
        "Invalid GitHub pipeline configuration.",

      code:
        error.code ||
        "INVALID_GITHUB_CONFIGURATION",
    });
  }
}

    // ==================================================
    // 5. HANDLE PIPELINE MARKED RUNNING
    // ==================================================

    if (pipeline.status === "RUNNING") {
      console.log(
        "[RUN PIPELINE] Pipeline is marked RUNNING."
      );

      console.log(
        "[RUN PIPELINE] Checking whether a real active build exists..."
      );

      const activeBuild =
        await Build.findOne({
          pipeline: pipeline._id,
          user: userId,
          status: "Running",
        }).sort({
          createdAt: -1,
        });

      console.log(
        "[RUN PIPELINE] Active-build lookup completed."
      );

      // ================================================
      // REAL RUNNING BUILD EXISTS
      // ================================================

      if (activeBuild) {
        console.log(
          "[RUN PIPELINE] Active build found:",
          activeBuild._id.toString()
        );

        console.log(
          "[RUN PIPELINE] Build number:",
          activeBuild.buildNumber
        );

        console.log(
          "[RUN PIPELINE] Build stage:",
          activeBuild.stage
        );

        return res.status(409).json({
          success: false,

          message:
            "This pipeline already has a running build.",

          pipelineId:
            pipeline._id.toString(),

          buildId:
            activeBuild._id.toString(),

          buildNumber:
            activeBuild.buildNumber,

          status:
            activeBuild.status,

          stage:
            activeBuild.stage,
        });
      }

      // ================================================
      // STALE RUNNING PIPELINE
      // ================================================

      console.warn(
        `Pipeline ${pipeline._id} had stale RUNNING status. Resetting to IDLE.`
      );

      console.log(
        "[RUN PIPELINE] Starting stale-state recovery..."
      );

      pipeline.status = "IDLE";

      pipeline.lastError =
        "Recovered from stale RUNNING state.";

      console.log(
        "[RUN PIPELINE] Saving recovered IDLE status..."
      );

      // ------------------------------------------------
      // THIS LOG IS IMPORTANT FOR DEBUGGING
      // ------------------------------------------------

      await pipeline.save();

      console.log(
        "[RUN PIPELINE] Stale IDLE status saved successfully."
      );

      // ================================================
      // RELOAD PIPELINE AFTER STALE RECOVERY
      // ================================================

      console.log(
        "[RUN PIPELINE] Reloading pipeline after stale recovery..."
      );

      pipeline =
        await Pipeline.findOne({
          _id: pipelineId,
          user: userId,
        });

      console.log(
        "[RUN PIPELINE] Pipeline reload completed."
      );

      if (!pipeline) {
        throw new Error(
          "Pipeline could not be reloaded after stale-state recovery."
        );
      }

      console.log(
        "[RUN PIPELINE] Status after stale recovery:",
        pipeline.status
      );

      console.log(
        "[RUN PIPELINE] Last error after recovery:",
        pipeline.lastError
      );
    }

    // ==================================================
    // 6. FINAL RUNNING BUILD CHECK
    // ==================================================

    console.log(
      "[RUN PIPELINE] Performing final running-build check..."
    );

    const existingRunningBuild =
      await Build.findOne({
        pipeline: pipeline._id,
        user: userId,
        status: "Running",
      }).sort({
        createdAt: -1,
      });

    console.log(
      "[RUN PIPELINE] Final running-build check completed."
    );

    if (existingRunningBuild) {
      console.log(
        "[RUN PIPELINE] Existing running build detected:",
        existingRunningBuild._id.toString()
      );

      return res.status(409).json({
        success: false,

        message:
          "A build is already running for this pipeline.",

        pipelineId:
          pipeline._id.toString(),

        buildId:
          existingRunningBuild._id.toString(),

        buildNumber:
          existingRunningBuild.buildNumber,

        status:
          existingRunningBuild.status,

        stage:
          existingRunningBuild.stage,
      });
    }

    // ==================================================
    // 7. MARK PIPELINE AS RUNNING
    // ==================================================

    console.log(
      "[RUN PIPELINE] Setting pipeline status to RUNNING..."
    );

    pipeline.status = "RUNNING";

    pipeline.lastRunAt =
      new Date();

    pipeline.lastError =
      null;

    console.log(
      "[RUN PIPELINE] Saving RUNNING pipeline state..."
    );

    await pipeline.save();

    console.log(
      "[RUN PIPELINE] RUNNING state saved successfully."
    );

    // ==================================================
    // 8. CALL EXECUTION SERVICE
    // ==================================================

    console.log("");
    console.log(
      "[RUN PIPELINE] ================================="
    );

    console.log(
      "[RUN PIPELINE] Calling executePipeline()..."
    );

    console.log(
      "[RUN PIPELINE] ================================="
    );

    console.log(
      "[RUN PIPELINE] Pipeline:",
      pipeline._id.toString()
    );

    console.log(
      "[RUN PIPELINE] User:",
      userId.toString()
    );

    console.log(
      "[RUN PIPELINE] Project path:",
      pipeline.projectPath
    );

    // --------------------------------------------------
    // This is the critical call.
    // --------------------------------------------------

    const executionResult =
  await executePipeline({
    pipelineId: pipeline._id,
    userId: userId,

    projectPath:
      sourceType === "LOCAL"
        ? pipeline.projectPath
        : "",
  });

    // ==================================================
    // 9. EXECUTION SERVICE RETURNED
    // ==================================================

    console.log("");
    console.log(
      "[RUN PIPELINE] executePipeline() RETURNED."
    );

    console.log(
      "[RUN PIPELINE] Execution result:"
    );

    console.dir(
      executionResult,
      {
        depth: 5,
      }
    );

    if (!executionResult) {
      throw new Error(
        "executePipeline returned no result."
      );
    }

    // ==================================================
    // 10. EXTRACT BUILD ID
    // ==================================================

    const buildId =
      executionResult.buildId ||
      executionResult.build?._id ||
      executionResult.build?.id ||
      null;

    console.log(
      "[RUN PIPELINE] Returned Build ID:",
      buildId
        ? buildId.toString()
        : "NONE"
    );

    // ==================================================
    // 11. UPDATE LAST BUILD ID
    // ==================================================

    if (buildId) {
      console.log(
        "[RUN PIPELINE] Updating pipeline.lastBuildId..."
      );

      await Pipeline.findOneAndUpdate(
        {
          _id: pipeline._id,
          user: userId,
        },
        {
          $set: {
            lastBuildId: buildId,
          },
        },
        {
          new: true,
        }
      );

      console.log(
        "[RUN PIPELINE] lastBuildId updated successfully."
      );
    }

    // ==================================================
    // 12. PIPELINE EXECUTION ACCEPTED
    // ==================================================

    console.log("");
    console.log(
      "========================================="
    );

    console.log(
      "======= PIPELINE EXECUTION STARTED ======"
    );

    console.log(
      "========================================="
    );

    console.log(
      "Pipeline:",
      pipeline.name
    );

    console.log(
      "Pipeline ID:",
      pipeline._id.toString()
    );

    console.log(
      "Build ID:",
      buildId
        ? buildId.toString()
        : "N/A"
    );

    console.log(
      "Status:",
      executionResult.status ||
        "RUNNING"
    );

    console.log(
      "========================================="
    );

    // ==================================================
    // 13. RESPONSE
    // ==================================================

    return res.status(202).json({
      success: true,

      message:
        executionResult.message ||
        "Pipeline execution started successfully.",

      status:
        executionResult.status ||
        "RUNNING",

      pipelineId:
        pipeline._id.toString(),

      buildId:
        buildId
          ? buildId.toString()
          : null,

      build:
        executionResult.build ||
        null,

      execution:
        executionResult,
    });
  } catch (error) {
    // ==================================================
    // ERROR
    // ==================================================

    console.error("");
    console.error(
      "========================================="
    );

    console.error(
      "========== RUN PIPELINE ERROR =========="
    );

    console.error(
      "========================================="
    );

    console.error(
      "[RUN PIPELINE] Error name:",
      error.name
    );

    console.error(
      "[RUN PIPELINE] Error message:",
      error.message
    );

    console.error(
      "[RUN PIPELINE] Stack:"
    );

    console.error(
      error.stack || error
    );

    // ==================================================
    // 14. CONTROLLER-LEVEL FAILURE RECOVERY
    // ==================================================

    try {
      const pipelineId =
        req.params?.id;

      const userId =
        req.user?._id;

      if (
        pipelineId &&
        userId &&
        isValidObjectId(pipelineId)
      ) {
        console.log(
          "[RUN PIPELINE] Checking pipeline state after error..."
        );

        const failedPipeline =
          await Pipeline.findOne({
            _id: pipelineId,
            user: userId,
          });

        if (failedPipeline) {
          console.log(
            "[RUN PIPELINE] Current pipeline status:",
            failedPipeline.status
          );

          // --------------------------------------------
          // Only change RUNNING → FAILED.
          //
          // Do not overwrite SUCCESS, FAILED,
          // CANCELLED or another finalized state.
          // --------------------------------------------

          if (
            failedPipeline.status ===
            "RUNNING"
          ) {
            failedPipeline.status =
              "FAILED";

            failedPipeline.lastError =
              error.message ||
              "Pipeline execution failed.";

            await failedPipeline.save();

            console.log(
              "[RUN PIPELINE] Pipeline marked FAILED."
            );
          }
        }
      }
    } catch (recoveryError) {
      console.error(
        "[RUN PIPELINE] Failure-state recovery itself failed:"
      );

      console.error(
        recoveryError
      );
    }

    // ==================================================
    // 15. ERROR RESPONSE
    // ==================================================

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to run pipeline.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};
// ======================================================
// GET PIPELINE BUILDS
// GET /api/pipeline/:id/builds
// ======================================================

exports.getPipelineBuilds = async (req, res) => {
  try {
    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId = req.params.id;

    // --------------------------------------------------
    // Validate Pipeline ID
    // --------------------------------------------------

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    // --------------------------------------------------
    // Verify Pipeline Ownership
    // --------------------------------------------------

    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      user: req.user._id,
    });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    // --------------------------------------------------
    // Pagination
    // --------------------------------------------------

    const requestedPage =
      Number.parseInt(req.query.page, 10);

    const requestedLimit =
      Number.parseInt(req.query.limit, 10);

    const page =
      Number.isFinite(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isFinite(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;

    const skip =
      (page - 1) * limit;

    // --------------------------------------------------
    // Query
    // --------------------------------------------------

    const query = {
      pipeline: pipeline._id,
      user: req.user._id,
    };

    const [
      builds,
      totalBuilds,
    ] = await Promise.all([
      Build.find(query)
        .sort({
          buildNumber: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit),

      Build.countDocuments(query),
    ]);

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pipeline: {
        _id: pipeline._id,
        name: pipeline.name,
        status: pipeline.status,
        lastRunAt: pipeline.lastRunAt,
        lastBuildId: pipeline.lastBuildId,
      },

      builds,

      pagination: {
        page,
        limit,
        totalBuilds,

        totalPages:
          Math.ceil(
            totalBuilds / limit
          ),
      },
    });
  } catch (error) {
    console.error(
      "GET PIPELINE BUILDS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch pipeline builds.",
      error: error.message,
    });
  }
};

// ======================================================
// GET SINGLE PIPELINE BUILD
// GET /api/pipeline/:pipelineId/build/:buildId
// ======================================================

exports.getPipelineBuildById = async (
  req,
  res
) => {
  try {
    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      pipelineId,
      buildId,
    } = req.params;

    // --------------------------------------------------
    // Validate IDs
    // --------------------------------------------------

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    if (!isValidObjectId(buildId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid build ID.",
      });
    }

    // --------------------------------------------------
    // Verify Pipeline
    // --------------------------------------------------

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // --------------------------------------------------
    // Find Build
    // --------------------------------------------------

    const build =
      await Build.findOne({
        _id: buildId,
        pipeline: pipeline._id,
        user: req.user._id,
      });

    if (!build) {
      return res.status(404).json({
        success: false,
        message:
          "Build not found.",
      });
    }

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pipeline: {
        _id: pipeline._id,
        name: pipeline.name,
        status: pipeline.status,
      },

      build,
    });
  } catch (error) {
    console.error(
      "GET PIPELINE BUILD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch build.",
      error: error.message,
    });
  }
};

// ======================================================
// GET BUILD STATUS
// GET /api/pipeline/:pipelineId/build/:buildId/status
// ======================================================

exports.getPipelineBuildStatus = async (
  req,
  res
) => {
  try {
    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      pipelineId,
      buildId,
    } = req.params;

    // --------------------------------------------------
    // Validate IDs
    // --------------------------------------------------

    if (
      !isValidObjectId(pipelineId) ||
      !isValidObjectId(buildId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID or build ID.",
      });
    }

    // --------------------------------------------------
    // Verify Pipeline Ownership
    // --------------------------------------------------

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // --------------------------------------------------
    // Find Build
    // --------------------------------------------------

    const build =
      await Build.findOne({
        _id: buildId,
        pipeline: pipeline._id,
        user: req.user._id,
      }).select(
        [
          "_id",
          "buildNumber",
          "status",
          "stage",
          "duration",
          "startedAt",
          "finishedAt",
          "createdAt",
          "updatedAt",
          "error",
          "autoFixAttempted",
          "rebuildAttempted",
        ].join(" ")
      );

    if (!build) {
      return res.status(404).json({
        success: false,
        message:
          "Build not found.",
      });
    }

    // --------------------------------------------------
    // Running State
    // --------------------------------------------------

    const running =
      build.status === "Running";

    const finished =
      [
        "Success",
        "Failed",
        "Cancelled",
      ].includes(
        build.status
      );

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pipelineId:
        pipeline._id.toString(),

      pipelineStatus:
        pipeline.status,

      running,
      finished,

      build: {
        _id: build._id,

        buildNumber:
          build.buildNumber,

        status:
          build.status,

        stage:
          build.stage,

        duration:
          build.duration,

        startedAt:
          build.startedAt,

        finishedAt:
          build.finishedAt,

        createdAt:
          build.createdAt,

        updatedAt:
          build.updatedAt,

        error:
          build.error,

        autoFixAttempted:
          build.autoFixAttempted,

        rebuildAttempted:
          build.rebuildAttempted,
      },
    });
  } catch (error) {
    console.error(
      "GET PIPELINE BUILD STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch build status.",

      error:
        error.message,
    });
  }
};

// ======================================================
// GET BUILD LOGS
// GET /api/pipeline/:pipelineId/build/:buildId/logs
// ======================================================

exports.getPipelineBuildLogs = async (
  req,
  res
) => {
  try {
    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      pipelineId,
      buildId,
    } = req.params;

    // --------------------------------------------------
    // Validate IDs
    // --------------------------------------------------

    if (
      !isValidObjectId(pipelineId) ||
      !isValidObjectId(buildId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID or build ID.",
      });
    }

    // --------------------------------------------------
    // Verify Pipeline
    // --------------------------------------------------

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // --------------------------------------------------
    // Find Build
    // --------------------------------------------------

    const build =
      await Build.findOne({
        _id: buildId,
        pipeline: pipeline._id,
        user: req.user._id,
      }).select(
        [
          "_id",
          "buildNumber",
          "status",
          "stage",
          "logs",
          "error",
          "startedAt",
          "finishedAt",
          "updatedAt",
        ].join(" ")
      );

    if (!build) {
      return res.status(404).json({
        success: false,
        message:
          "Build not found.",
      });
    }

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pipelineId:
        pipeline._id.toString(),

      buildId:
        build._id.toString(),

      buildNumber:
        build.buildNumber,

      status:
        build.status,

      stage:
        build.stage,

      logs:
        build.logs || "",

      error:
        build.error || null,

      startedAt:
        build.startedAt,

      finishedAt:
        build.finishedAt,

      updatedAt:
        build.updatedAt,
    });
  } catch (error) {
    console.error(
      "GET PIPELINE BUILD LOGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch build logs.",

      error:
        error.message,
    });
  }
};

// ======================================================
// GET LATEST BUILD
// GET /api/pipeline/:id/latest-build
// ======================================================

exports.getLatestBuild = async (
  req,
  res
) => {
  try {
    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId =
      req.params.id;

    // --------------------------------------------------
    // Validate Pipeline ID
    // --------------------------------------------------

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    // --------------------------------------------------
    // Verify Pipeline
    // --------------------------------------------------

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // --------------------------------------------------
    // Find Latest Build
    // --------------------------------------------------

    const build =
      await Build.findOne({
        pipeline: pipeline._id,
        user: req.user._id,
      }).sort({
        buildNumber: -1,
        createdAt: -1,
      });

    // --------------------------------------------------
    // No Build Yet
    // --------------------------------------------------

    if (!build) {
      return res.status(200).json({
        success: true,

        pipelineId:
          pipeline._id.toString(),

        pipelineStatus:
          pipeline.status,

        build:
          null,

        message:
          "This pipeline has no builds yet.",
      });
    }

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      pipelineId:
        pipeline._id.toString(),

      pipelineStatus:
        pipeline.status,

      build,
    });
  } catch (error) {
    console.error(
      "GET LATEST BUILD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch latest build.",

      error:
        error.message,
    });
  }
};

// ======================================================
// GET RUNNING BUILD
// GET /api/pipeline/:id/running-build
// ======================================================

exports.getRunningBuild = async (
  req,
  res
) => {
  try {
    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId =
      req.params.id;

    // --------------------------------------------------
    // Validate Pipeline ID
    // --------------------------------------------------

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    // --------------------------------------------------
    // Verify Pipeline
    // --------------------------------------------------

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // --------------------------------------------------
    // Find Running Build
    // --------------------------------------------------

    const build =
      await Build.findOne({
        pipeline:
          pipeline._id,

        user:
          req.user._id,

        status:
          "Running",
      }).sort({
        createdAt: -1,
      });

    // --------------------------------------------------
    // No Running Build
    // --------------------------------------------------

    if (!build) {
      return res.status(200).json({
        success: true,

        running: false,

        pipelineId:
          pipeline._id.toString(),

        pipelineStatus:
          pipeline.status,

        build:
          null,
      });
    }

    // --------------------------------------------------
    // Synchronize Pipeline if Required
    // --------------------------------------------------

    if (
      pipeline.status !==
      "RUNNING"
    ) {
      pipeline.status =
        "RUNNING";

      pipeline.lastBuildId =
        build._id;

      await pipeline.save();
    }

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      running: true,

      pipelineId:
        pipeline._id.toString(),

      pipelineStatus:
        "RUNNING",

      build: {
        _id:
          build._id,

        buildNumber:
          build.buildNumber,

        status:
          build.status,

        stage:
          build.stage,

        duration:
          build.duration,

        startedAt:
          build.startedAt,

        updatedAt:
          build.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "GET RUNNING BUILD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch running build.",

      error:
        error.message,
    });
  }
};
// ======================================================
// GET BUILD HISTORY
// GET /api/pipeline/:id/history
// ======================================================

exports.getBuildHistory = async (req, res) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId = req.params.id;

    // ==================================================
    // VALIDATE PIPELINE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // VERIFY PIPELINE OWNERSHIP
    // ==================================================

    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      user: req.user._id,
    });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    // ==================================================
    // PAGINATION
    // ==================================================

    const requestedPage =
      Number.parseInt(req.query.page, 10);

    const requestedLimit =
      Number.parseInt(req.query.limit, 10);

    const page =
      Number.isFinite(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isFinite(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;

    const skip =
      (page - 1) * limit;

    // ==================================================
    // QUERY
    // ==================================================

    const query = {
      pipeline: pipeline._id,
      user: req.user._id,
    };

    const [
      builds,
      totalBuilds,
    ] = await Promise.all([
      Build.find(query)
        .sort({
          buildNumber: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit),

      Build.countDocuments(query),
    ]);

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      pipeline: {
        _id: pipeline._id,
        name: pipeline.name,
        status: pipeline.status,
      },

      history: builds,

      pagination: {
        page,
        limit,
        totalBuilds,

        totalPages:
          Math.ceil(
            totalBuilds / limit
          ),
      },
    });
  } catch (error) {
    console.error(
      "GET BUILD HISTORY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch build history.",

      error:
        error.message,
    });
  }
};

// ======================================================
// RETRY FAILED BUILD
// POST /api/pipeline/:pipelineId/build/:buildId/retry
// ======================================================

exports.retryBuild = async (req, res) => {
  try {
    console.log("");
    console.log(
      "========================================="
    );
    console.log(
      "============ RETRY BUILD ================"
    );
    console.log(
      "========================================="
    );

    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      pipelineId,
      buildId,
    } = req.params;

    // ==================================================
    // VALIDATE IDS
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    if (!isValidObjectId(buildId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid build ID.",
      });
    }

    // ==================================================
    // LOAD PIPELINE
    // ==================================================

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    // ==================================================
    // LOAD ORIGINAL BUILD
    // ==================================================

    const originalBuild =
      await Build.findOne({
        _id: buildId,
        pipeline: pipeline._id,
        user: req.user._id,
      });

    if (!originalBuild) {
      return res.status(404).json({
        success: false,
        message: "Build not found.",
      });
    }

    console.log(
      "[RETRY BUILD] Original Build:",
      originalBuild._id.toString()
    );

    console.log(
      "[RETRY BUILD] Original Status:",
      originalBuild.status
    );

    // ==================================================
    // ONLY FAILED / CANCELLED BUILDS CAN BE RETRIED
    // ==================================================

    if (
      ![
        "Failed",
        "Cancelled",
      ].includes(
        originalBuild.status
      )
    ) {
      return res.status(409).json({
        success: false,

        message:
          `Build cannot be retried because its current status is "${originalBuild.status}".`,
      });
    }

    // ==================================================
    // CHECK FOR EXISTING RUNNING BUILD
    // ==================================================

    const runningBuild =
      await Build.findOne({
        pipeline: pipeline._id,
        user: req.user._id,
        status: "Running",
      }).sort({
        createdAt: -1,
      });

    if (runningBuild) {
      return res.status(409).json({
        success: false,

        message:
          "Cannot retry because another build is currently running.",

        buildId:
          runningBuild._id.toString(),

        buildNumber:
          runningBuild.buildNumber,
      });
    }

    // ==================================================
    // RECOVER STALE PIPELINE STATUS
    // ==================================================

    if (pipeline.status === "RUNNING") {
      console.warn(
        `[RETRY BUILD] Pipeline ${pipeline._id} is RUNNING but no running build exists. Resetting stale status.`
      );

      pipeline.status = "IDLE";

      pipeline.lastError =
        "Recovered from stale RUNNING state before retry.";

      await pipeline.save();
    }

    // ==================================================
    // CALL RETRY SERVICE
    // ==================================================

    console.log(
      "[RETRY BUILD] Calling retryFailedBuild()..."
    );

    const result =
      await retryFailedBuild(
        pipeline,
        originalBuild,
        req.user._id
      );

    console.log(
      "[RETRY BUILD] retryFailedBuild() returned."
    );

    if (!result) {
      throw new Error(
        "retryFailedBuild returned no result."
      );
    }

    // ==================================================
    // EXTRACT NEW BUILD
    // ==================================================

    const newBuild =
      result.build ||
      null;

    const newBuildId =
      result.buildId ||
      newBuild?._id ||
      newBuild?.id ||
      null;

    // ==================================================
    // UPDATE PIPELINE LAST BUILD
    // ==================================================

    if (newBuildId) {
      await Pipeline.findOneAndUpdate(
        {
          _id: pipeline._id,
          user: req.user._id,
        },
        {
          $set: {
            lastBuildId:
              newBuildId,

            lastRunAt:
              new Date(),
          },
        }
      );
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(202).json({
      success: true,

      message:
        result.message ||
        "Build retry started successfully.",

      pipelineId:
        pipeline._id.toString(),

      originalBuildId:
        originalBuild._id.toString(),

      buildId:
        newBuildId
          ? newBuildId.toString()
          : null,

      build:
        newBuild,

      execution:
        result,
    });
  } catch (error) {
    console.error("");
    console.error(
      "========================================="
    );
    console.error(
      "============ RETRY ERROR ================"
    );
    console.error(
      "========================================="
    );

    console.error(error);

    // ==================================================
    // PIPELINE FAILURE RECOVERY
    // ==================================================

    try {
      if (
        req.params?.pipelineId &&
        isValidObjectId(
          req.params.pipelineId
        ) &&
        req.user?._id
      ) {
        const pipeline =
          await Pipeline.findOne({
            _id:
              req.params.pipelineId,

            user:
              req.user._id,
          });

        if (
          pipeline &&
          pipeline.status === "RUNNING"
        ) {
          const actualRunningBuild =
            await Build.findOne({
              pipeline:
                pipeline._id,

              user:
                req.user._id,

              status:
                "Running",
            });

          if (!actualRunningBuild) {
            pipeline.status =
              "FAILED";

            pipeline.lastError =
              error.message ||
              "Build retry failed.";

            await pipeline.save();
          }
        }
      }
    } catch (recoveryError) {
      console.error(
        "[RETRY BUILD] Recovery error:",
        recoveryError
      );
    }

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to retry build.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// CANCEL BUILD
// POST /api/pipeline/:pipelineId/build/:buildId/cancel
// ======================================================

exports.cancelBuild = async (req, res) => {
  try {
    console.log("");
    console.log(
      "========================================="
    );
    console.log(
      "============ CANCEL BUILD ==============="
    );
    console.log(
      "========================================="
    );

    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      pipelineId,
      buildId,
    } = req.params;

    // ==================================================
    // VALIDATE IDS
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    if (!isValidObjectId(buildId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid build ID.",
      });
    }

    // ==================================================
    // LOAD PIPELINE
    // ==================================================

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    // ==================================================
    // LOAD BUILD
    // ==================================================

    const build =
      await Build.findOne({
        _id: buildId,
        pipeline: pipeline._id,
        user: req.user._id,
      });

    if (!build) {
      return res.status(404).json({
        success: false,
        message: "Build not found.",
      });
    }

    console.log(
      "[CANCEL BUILD] Build:",
      build._id.toString()
    );

    console.log(
      "[CANCEL BUILD] Status:",
      build.status
    );

    console.log(
      "[CANCEL BUILD] Stage:",
      build.stage
    );

    // ==================================================
    // CHECK BUILD STATUS
    // ==================================================

    if (build.status !== "Running") {
      return res.status(409).json({
        success: false,

        message:
          `Build cannot be cancelled because its status is "${build.status}".`,

        build: {
          _id:
            build._id,

          buildNumber:
            build.buildNumber,

          status:
            build.status,

          stage:
            build.stage,
        },
      });
    }

    // ==================================================
    // CALL CANCELLATION SERVICE
    // ==================================================

    console.log(
      "[CANCEL BUILD] Calling cancellation service..."
    );

    const result = await cancelBuild({
     pipelineId: pipeline._id,
     buildId: build._id,
     userId: req.user._id,
   });

    console.log(
      "[CANCEL BUILD] Cancellation service returned."
    );

    console.dir(
      result,
      {
        depth: 4,
      }
    );

    // ==================================================
    // RELOAD BUILD
    // ==================================================

    const updatedBuild =
      await Build.findOne({
        _id: build._id,
        pipeline: pipeline._id,
        user: req.user._id,
      });

    // ==================================================
    // SYNCHRONIZE PIPELINE
    // ==================================================

    const remainingRunningBuild =
      await Build.findOne({
        pipeline:
          pipeline._id,

        user:
          req.user._id,

        status:
          "Running",

        _id: {
          $ne:
            build._id,
        },
      });

    if (!remainingRunningBuild) {
      pipeline.status =
        "CANCELLED";

      pipeline.lastBuildId =
        build._id;

      pipeline.lastError =
        null;

      await pipeline.save();
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      message:
        result?.message ||
        "Build cancellation requested successfully.",

      pipelineId:
        pipeline._id.toString(),

      buildId:
        build._id.toString(),

      build:
        updatedBuild || build,

      cancellation:
        result || null,
    });
  } catch (error) {
    console.error("");
    console.error(
      "========================================="
    );
    console.error(
      "=========== CANCEL BUILD ERROR =========="
    );
    console.error(
      "========================================="
    );

    console.error(error);

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to cancel build.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================================
// RECOVER PIPELINE
// POST /api/pipeline/:id/recover
// ======================================================

exports.recoverPipeline = async (
  req,
  res
) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId =
      req.params.id;

    // ==================================================
    // VALIDATE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // VERIFY OWNERSHIP
    // ==================================================

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    console.log(
      "[PIPELINE RECOVERY] Manual recovery requested for:",
      pipeline._id.toString()
    );

    // ==================================================
    // CALL RECOVERY SERVICE
    // ==================================================

    const result =
      await recoverStalePipeline(
        pipeline
      );

    // ==================================================
    // RELOAD PIPELINE
    // ==================================================

    const updatedPipeline =
      await Pipeline.findOne({
        _id: pipeline._id,
        user: req.user._id,
      });

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      message:
        result?.message ||
        "Pipeline recovery completed.",

      recovered:
        result?.recovered ??
        false,

      pipeline:
        updatedPipeline,

      recovery:
        result || null,
    });
  } catch (error) {
    console.error(
      "RECOVER PIPELINE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to recover pipeline.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};
// ======================================================
// GET PIPELINE STATISTICS
// GET /api/pipeline/:id/stats
// ======================================================

exports.getPipelineStats = async (req, res) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId = req.params.id;

    // ==================================================
    // VALIDATE PIPELINE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // VERIFY PIPELINE OWNERSHIP
    // ==================================================

    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      user: req.user._id,
    });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Pipeline not found.",
      });
    }

    // ==================================================
    // BUILD QUERY
    // ==================================================

    const buildQuery = {
      pipeline: pipeline._id,
      user: req.user._id,
    };

    // ==================================================
    // COUNTS
    // ==================================================

    const [
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      cancelledBuilds,
      runningBuilds,
      pendingBuilds,
    ] = await Promise.all([
      Build.countDocuments(
        buildQuery
      ),

      Build.countDocuments({
        ...buildQuery,
        status: "Success",
      }),

      Build.countDocuments({
        ...buildQuery,
        status: "Failed",
      }),

      Build.countDocuments({
        ...buildQuery,
        status: "Cancelled",
      }),

      Build.countDocuments({
        ...buildQuery,
        status: "Running",
      }),

      Build.countDocuments({
        ...buildQuery,
        status: "Pending",
      }),
    ]);

    // ==================================================
    // AVERAGE BUILD DURATION
    // ==================================================

    const durationAggregation =
      await Build.aggregate([
        {
          $match: {
            pipeline:
              pipeline._id,

            user:
              req.user._id,

            duration: {
              $gt: 0,
            },
          },
        },

        {
          $group: {
            _id: null,

            averageDuration: {
              $avg: "$duration",
            },

            totalDuration: {
              $sum: "$duration",
            },

            fastestBuild: {
              $min: "$duration",
            },

            slowestBuild: {
              $max: "$duration",
            },
          },
        },
      ]);

    const durationStats =
      durationAggregation[0] || {
        averageDuration: 0,
        totalDuration: 0,
        fastestBuild: 0,
        slowestBuild: 0,
      };

    // ==================================================
    // SUCCESS RATE
    // ==================================================

    const completedBuilds =
      successfulBuilds +
      failedBuilds +
      cancelledBuilds;

    const successRate =
      completedBuilds > 0
        ? Number(
            (
              (successfulBuilds /
                completedBuilds) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // LATEST BUILD
    // ==================================================

    const latestBuild =
      await Build.findOne(
        buildQuery
      )
        .sort({
          buildNumber: -1,
          createdAt: -1,
        })
        .select(
          [
            "_id",
            "buildNumber",
            "status",
            "stage",
            "duration",
            "startedAt",
            "finishedAt",
            "createdAt",
          ].join(" ")
        );

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      pipeline: {
        _id:
          pipeline._id,

        name:
          pipeline.name,

        status:
          pipeline.status,

        projectType:
          pipeline.projectType,

        lastRunAt:
          pipeline.lastRunAt,

        lastBuildId:
          pipeline.lastBuildId,

        lastError:
          pipeline.lastError,
      },

      statistics: {
        totalBuilds,

        successfulBuilds,

        failedBuilds,

        cancelledBuilds,

        runningBuilds,

        pendingBuilds,

        completedBuilds,

        successRate,

        averageDuration:
          Number(
            (
              durationStats.averageDuration ||
              0
            ).toFixed(2)
          ),

        totalDuration:
          Number(
            (
              durationStats.totalDuration ||
              0
            ).toFixed(2)
          ),

        fastestBuild:
          durationStats.fastestBuild ||
          0,

        slowestBuild:
          durationStats.slowestBuild ||
          0,
      },

      latestBuild:
        latestBuild || null,
    });
  } catch (error) {
    console.error(
      "GET PIPELINE STATS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch pipeline statistics.",

      error:
        error.message,
    });
  }
};

// ======================================================
// GET PIPELINE SUMMARY
// GET /api/pipeline/:id/summary
// ======================================================

exports.getPipelineSummary = async (
  req,
  res
) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId =
      req.params.id;

    // ==================================================
    // VALIDATE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // PIPELINE
    // ==================================================

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // ==================================================
    // LATEST BUILDS
    // ==================================================

    const latestBuilds =
      await Build.find({
        pipeline:
          pipeline._id,

        user:
          req.user._id,
      })
        .sort({
          buildNumber: -1,
          createdAt: -1,
        })
        .limit(10)
        .select(
          [
            "_id",
            "buildNumber",
            "status",
            "stage",
            "duration",
            "startedAt",
            "finishedAt",
            "createdAt",
            "error",
          ].join(" ")
        );

    // ==================================================
    // RUNNING BUILD
    // ==================================================

    const runningBuild =
      latestBuilds.find(
        (build) =>
          build.status ===
          "Running"
      ) ||
      await Build.findOne({
        pipeline:
          pipeline._id,

        user:
          req.user._id,

        status:
          "Running",
      }).sort({
        createdAt: -1,
      });

    // ==================================================
    // TOTAL BUILDS
    // ==================================================

    const totalBuilds =
      await Build.countDocuments({
        pipeline:
          pipeline._id,

        user:
          req.user._id,
      });

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      pipeline: {
        _id:
          pipeline._id,

        name:
          pipeline.name,

        description:
          pipeline.description,

        repository:
          pipeline.repository,

        branch:
          pipeline.branch,

        projectPath:
          pipeline.projectPath,

        projectType:
          pipeline.projectType,

        buildCommand:
          pipeline.buildCommand,

        testCommand:
          pipeline.testCommand,

        status:
          pipeline.status,

        lastRunAt:
          pipeline.lastRunAt,

        lastBuildId:
          pipeline.lastBuildId,

        lastError:
          pipeline.lastError,

        createdAt:
          pipeline.createdAt,

        updatedAt:
          pipeline.updatedAt,
      },

      totalBuilds,

      running:
        Boolean(runningBuild),

      runningBuild:
        runningBuild || null,

      latestBuild:
        latestBuilds.length > 0
          ? latestBuilds[0]
          : null,

      recentBuilds:
        latestBuilds,
    });
  } catch (error) {
    console.error(
      "GET PIPELINE SUMMARY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch pipeline summary.",

      error:
        error.message,
    });
  }
};

// ======================================================
// GET PIPELINE FAILURE INFORMATION
// GET /api/pipeline/:id/failure
// ======================================================

exports.getPipelineFailure = async (
  req,
  res
) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId =
      req.params.id;

    // ==================================================
    // VALIDATE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // PIPELINE
    // ==================================================

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // ==================================================
    // LATEST FAILED BUILD
    // ==================================================

    const failedBuild =
      await Build.findOne({
        pipeline:
          pipeline._id,

        user:
          req.user._id,

        status:
          "Failed",
      })
        .sort({
          buildNumber: -1,
          createdAt: -1,
        });

    // ==================================================
    // NO FAILED BUILD
    // ==================================================

    if (!failedBuild) {
      return res.status(200).json({
        success: true,

        hasFailure: false,

        pipelineId:
          pipeline._id.toString(),

        pipelineStatus:
          pipeline.status,

        lastError:
          pipeline.lastError,

        failedBuild:
          null,
      });
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      hasFailure: true,

      pipelineId:
        pipeline._id.toString(),

      pipelineStatus:
        pipeline.status,

      lastError:
        pipeline.lastError,

      failedBuild: {
        _id:
          failedBuild._id,

        buildNumber:
          failedBuild.buildNumber,

        status:
          failedBuild.status,

        stage:
          failedBuild.stage,

        error:
          failedBuild.error,

        logs:
          failedBuild.logs,

        initialAIAnalysis:
          failedBuild.initialAIAnalysis,

        aiAnalysis:
          failedBuild.aiAnalysis,

        autoFixAttempted:
          failedBuild.autoFixAttempted,

        autoFix:
          failedBuild.autoFix,

        rebuildAttempted:
          failedBuild.rebuildAttempted,

        rebuild:
          failedBuild.rebuild,

        testResult:
          failedBuild.testResult,

        startedAt:
          failedBuild.startedAt,

        finishedAt:
          failedBuild.finishedAt,

        createdAt:
          failedBuild.createdAt,
      },
    });
  } catch (error) {
    console.error(
      "GET PIPELINE FAILURE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch pipeline failure information.",

      error:
        error.message,
    });
  }
};

// ======================================================
// RESET PIPELINE STATUS
// PUT /api/pipeline/:id/reset
// ======================================================

exports.resetPipelineStatus = async (
  req,
  res
) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const pipelineId =
      req.params.id;

    // ==================================================
    // VALIDATE ID
    // ==================================================

    if (!isValidObjectId(pipelineId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid pipeline ID.",
      });
    }

    // ==================================================
    // PIPELINE
    // ==================================================

    const pipeline =
      await Pipeline.findOne({
        _id: pipelineId,
        user: req.user._id,
      });

    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message:
          "Pipeline not found.",
      });
    }

    // ==================================================
    // CHECK FOR REAL RUNNING BUILD
    // ==================================================

    const runningBuild =
      await Build.findOne({
        pipeline:
          pipeline._id,

        user:
          req.user._id,

        status:
          "Running",
      });

    if (runningBuild) {
      return res.status(409).json({
        success: false,

        message:
          "Pipeline cannot be reset because a build is currently running.",

        buildId:
          runningBuild._id.toString(),

        buildNumber:
          runningBuild.buildNumber,

        stage:
          runningBuild.stage,
      });
    }

    // ==================================================
    // RESET
    // ==================================================

    const previousStatus =
      pipeline.status;

    pipeline.status =
      "IDLE";

    pipeline.lastError =
      null;

    await pipeline.save();

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      message:
        "Pipeline status reset successfully.",

      previousStatus,

      currentStatus:
        pipeline.status,

      pipeline,
    });
  } catch (error) {
    console.error(
      "RESET PIPELINE STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to reset pipeline status.",

      error:
        error.message,
    });
  }
};

// ======================================================
// GET ALL USER PIPELINE STATISTICS
// GET /api/pipeline/stats/all
// ======================================================

exports.getAllPipelineStats = async (
  req,
  res
) => {
  try {
    // ==================================================
    // AUTHENTICATION
    // ==================================================

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    // ==================================================
    // PIPELINE COUNTS
    // ==================================================

    const [
      totalPipelines,
      idlePipelines,
      runningPipelines,
      successPipelines,
      failedPipelines,
      cancelledPipelines,
    ] = await Promise.all([
      Pipeline.countDocuments({
        user:
          req.user._id,
      }),

      Pipeline.countDocuments({
        user:
          req.user._id,

        status:
          "IDLE",
      }),

      Pipeline.countDocuments({
        user:
          req.user._id,

        status:
          "RUNNING",
      }),

      Pipeline.countDocuments({
        user:
          req.user._id,

        status:
          "SUCCESS",
      }),

      Pipeline.countDocuments({
        user:
          req.user._id,

        status:
          "FAILED",
      }),

      Pipeline.countDocuments({
        user:
          req.user._id,

        status:
          "CANCELLED",
      }),
    ]);

    // ==================================================
    // BUILD COUNTS
    // ==================================================

    const [
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      cancelledBuilds,
      runningBuilds,
    ] = await Promise.all([
      Build.countDocuments({
        user:
          req.user._id,
      }),

      Build.countDocuments({
        user:
          req.user._id,

        status:
          "Success",
      }),

      Build.countDocuments({
        user:
          req.user._id,

        status:
          "Failed",
      }),

      Build.countDocuments({
        user:
          req.user._id,

        status:
          "Cancelled",
      }),

      Build.countDocuments({
        user:
          req.user._id,

        status:
          "Running",
      }),
    ]);

    // ==================================================
    // SUCCESS RATE
    // ==================================================

    const completedBuilds =
      successfulBuilds +
      failedBuilds +
      cancelledBuilds;

    const successRate =
      completedBuilds > 0
        ? Number(
            (
              (successfulBuilds /
                completedBuilds) *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      pipelines: {
        total:
          totalPipelines,

        idle:
          idlePipelines,

        running:
          runningPipelines,

        success:
          successPipelines,

        failed:
          failedPipelines,

        cancelled:
          cancelledPipelines,
      },

      builds: {
        total:
          totalBuilds,

        successful:
          successfulBuilds,

        failed:
          failedBuilds,

        cancelled:
          cancelledBuilds,

        running:
          runningBuilds,

        successRate,
      },
    });
  } catch (error) {
    console.error(
      "GET ALL PIPELINE STATS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch pipeline statistics.",

      error:
        error.message,
    });
  }
};

// ======================================================
// HEALTH / CONTROLLER TEST
// GET /api/pipeline/controller-health
// ======================================================

exports.pipelineControllerHealth = async (
  req,
  res
) => {
  return res.status(200).json({
    success: true,

    message:
      "Pipeline controller is working.",

    timestamp:
      new Date(),
  });
};