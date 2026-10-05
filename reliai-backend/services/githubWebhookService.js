const crypto = require("crypto");

const Pipeline = require("../models/Pipeline");
const Build = require("../models/Build");

const {
  executePipeline,
} = require("./pipelineExecutionService");

const {
  parseGitHubRepository,
  validateBranch,
} = require("./gitService");

// ======================================================
// WEBHOOK ERROR
// ======================================================

class GitHubWebhookError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);

    this.name = "GitHubWebhookError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ======================================================
// GET WEBHOOK SECRET
// ======================================================

const getWebhookSecret = () => {
  const secret =
    typeof process.env.GITHUB_WEBHOOK_SECRET === "string"
      ? process.env.GITHUB_WEBHOOK_SECRET.trim()
      : "";

  if (!secret) {
    throw new GitHubWebhookError(
      "GitHub webhook secret is not configured.",
      "WEBHOOK_SECRET_NOT_CONFIGURED",
      500
    );
  }

  return secret;
};

// ======================================================
// VERIFY GITHUB SIGNATURE
//
// GitHub sends:
//
// X-Hub-Signature-256: sha256=<hex>
//
// IMPORTANT:
// rawBody MUST be the original Buffer received from GitHub.
// ======================================================

const verifyGitHubSignature = ({
  rawBody,
  signature,
}) => {
  if (!Buffer.isBuffer(rawBody)) {
    throw new GitHubWebhookError(
      "Webhook raw request body is unavailable.",
      "INVALID_RAW_BODY",
      400
    );
  }

  if (
    typeof signature !== "string" ||
    !signature.startsWith("sha256=")
  ) {
    throw new GitHubWebhookError(
      "GitHub webhook signature is missing.",
      "MISSING_SIGNATURE",
      401
    );
  }

  const secret = getWebhookSecret();

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

  const receivedBuffer =
    Buffer.from(signature, "utf8");

  const expectedBuffer =
    Buffer.from(expectedSignature, "utf8");

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    throw new GitHubWebhookError(
      "Invalid GitHub webhook signature.",
      "INVALID_SIGNATURE",
      401
    );
  }

  const valid =
    crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    );

  if (!valid) {
    throw new GitHubWebhookError(
      "Invalid GitHub webhook signature.",
      "INVALID_SIGNATURE",
      401
    );
  }

  return true;
};

// ======================================================
// PARSE RAW JSON BODY
// ======================================================

const parseWebhookPayload = (rawBody) => {
  if (!Buffer.isBuffer(rawBody)) {
    throw new GitHubWebhookError(
      "Webhook body must be a Buffer.",
      "INVALID_RAW_BODY",
      400
    );
  }

  if (rawBody.length === 0) {
    throw new GitHubWebhookError(
      "Webhook body is empty.",
      "EMPTY_WEBHOOK_BODY",
      400
    );
  }

  try {
    return JSON.parse(
      rawBody.toString("utf8")
    );
  } catch (error) {
    throw new GitHubWebhookError(
      "Webhook body contains invalid JSON.",
      "INVALID_WEBHOOK_JSON",
      400
    );
  }
};

// ======================================================
// NORMALIZE REPOSITORY
// ======================================================

const normalizeRepositoryUrl = (payload) => {
  const repository =
    payload?.repository;

  const repositoryUrl =
    repository?.html_url ||
    repository?.clone_url ||
    "";

  if (!repositoryUrl) {
    throw new GitHubWebhookError(
      "Webhook payload does not contain a repository URL.",
      "MISSING_REPOSITORY",
      400
    );
  }

  const parsed =
    parseGitHubRepository(
      repositoryUrl
    );

  return {
    repositoryUrl:
      parsed.repositoryUrl,

    owner:
      parsed.owner,

    repositoryName:
      parsed.repositoryName,
  };
};

// ======================================================
// EXTRACT PUSH BRANCH
//
// refs/heads/main -> main
// ======================================================

const extractPushBranch = (payload) => {
  const ref =
    typeof payload?.ref === "string"
      ? payload.ref.trim()
      : "";

  const prefix =
    "refs/heads/";

  if (!ref.startsWith(prefix)) {
    return null;
  }

  const branch =
    ref.slice(prefix.length);

  if (!branch) {
    return null;
  }

  return validateBranch(branch);
};

// ======================================================
// CHECK ACTIVE BUILD
// ======================================================

const findActiveBuild = async ({
  pipelineId,
  userId,
}) => {
  return Build.findOne({
    pipeline: pipelineId,
    user: userId,
    status: "Running",
  }).sort({
    createdAt: -1,
  });
};

// ======================================================
// TRIGGER ONE PIPELINE
// ======================================================

const triggerPipelineFromWebhook = async (
  pipeline
) => {
  if (!pipeline) {
    throw new GitHubWebhookError(
      "Pipeline is required.",
      "PIPELINE_REQUIRED",
      500
    );
  }

  const pipelineId =
    pipeline._id;

  const userId =
    pipeline.user;

  if (!pipelineId || !userId) {
    throw new GitHubWebhookError(
      "Pipeline does not contain required identifiers.",
      "INVALID_PIPELINE",
      500
    );
  }

  // ----------------------------------------------------
  // First check for a real active build.
  // ----------------------------------------------------

  const activeBuild =
    await findActiveBuild({
      pipelineId,
      userId,
    });

  if (activeBuild) {
    return {
      triggered: false,
      reason: "ALREADY_RUNNING",

      pipelineId:
        pipelineId.toString(),

      buildId:
        activeBuild._id.toString(),

      buildNumber:
        activeBuild.buildNumber,
    };
  }

  // ----------------------------------------------------
  // Recover stale RUNNING pipeline state.
  //
  // If status says RUNNING but no Running Build exists,
  // the state is stale.
  // ----------------------------------------------------

  if (pipeline.status === "RUNNING") {
    pipeline.status = "IDLE";

    pipeline.lastError =
      "Recovered from stale RUNNING state before GitHub webhook execution.";

    await pipeline.save();
  }

  // ----------------------------------------------------
  // Atomic lock.
  //
  // Only a pipeline that is NOT currently RUNNING may
  // transition to RUNNING here.
  //
  // This helps prevent two webhook deliveries from
  // starting the same pipeline simultaneously.
  // ----------------------------------------------------

  const lockedPipeline =
    await Pipeline.findOneAndUpdate(
      {
        _id: pipelineId,
        user: userId,
        status: {
          $ne: "RUNNING",
        },
      },
      {
        $set: {
          status: "RUNNING",
          lastRunAt: new Date(),
          lastError: null,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!lockedPipeline) {
    return {
      triggered: false,
      reason: "PIPELINE_BUSY",

      pipelineId:
        pipelineId.toString(),
    };
  }

  try {
    // --------------------------------------------------
    // IMPORTANT:
    //
    // GitHub pipelines do not receive a client supplied
    // projectPath. gitService resolves the trusted
    // workspace during execution.
    // --------------------------------------------------

    const executionResult =
      await executePipeline({
        pipelineId:
          lockedPipeline._id,

        userId:
          lockedPipeline.user,

        projectPath: "",
      });

    const buildId =
      executionResult?.buildId ||
      executionResult?.build?._id ||
      executionResult?.build?.id ||
      null;

    if (buildId) {
      await Pipeline.findOneAndUpdate(
        {
          _id:
            lockedPipeline._id,

          user:
            lockedPipeline.user,
        },
        {
          $set: {
            lastBuildId:
              buildId,
          },
        }
      );
    }

    return {
      triggered: true,

      pipelineId:
        lockedPipeline._id.toString(),

      buildId:
        buildId
          ? buildId.toString()
          : null,

      status:
        executionResult?.status ||
        "RUNNING",

      execution:
        executionResult,
    };
  } catch (error) {
    // --------------------------------------------------
    // Controller-equivalent failure recovery.
    // --------------------------------------------------

    try {
      const currentPipeline =
        await Pipeline.findOne({
          _id:
            lockedPipeline._id,

          user:
            lockedPipeline.user,
        });

      if (
        currentPipeline &&
        currentPipeline.status ===
          "RUNNING"
      ) {
        currentPipeline.status =
          "FAILED";

        currentPipeline.lastError =
          error.message ||
          "GitHub webhook pipeline execution failed.";

        await currentPipeline.save();
      }
    } catch (recoveryError) {
      console.error(
        "[WEBHOOK] Failed to recover pipeline state:",
        recoveryError
      );
    }

    throw error;
  }
};

// ======================================================
// PROCESS PUSH EVENT
// ======================================================

const processPushEvent = async (
  payload
) => {
  const repository =
    normalizeRepositoryUrl(
      payload
    );

  const branch =
    extractPushBranch(
      payload
    );

  // ----------------------------------------------------
  // Ignore tag pushes and other non-branch refs.
  // ----------------------------------------------------

  if (!branch) {
    return {
      accepted: true,
      ignored: true,
      reason:
        "Push does not target a branch.",
      triggered: [],
    };
  }

  // ----------------------------------------------------
  // Branch deletion.
  // GitHub push payload has deleted=true.
  // We do not build a deleted branch.
  // ----------------------------------------------------

  if (payload?.deleted === true) {
    return {
      accepted: true,
      ignored: true,
      reason:
        "Deleted branch push ignored.",
      repository:
        repository.repositoryUrl,
      branch,
      triggered: [],
    };
  }

  // ----------------------------------------------------
  // Find GitHub pipelines matching repository + branch.
  //
  // repositoryOwner/repositoryName were populated by
  // Step 11, so we use them as the primary lookup.
  // ----------------------------------------------------

  const pipelines =
    await Pipeline.find({
      sourceType: "GITHUB",

      repositoryOwner:
        repository.owner,

      repositoryName:
        repository.repositoryName,

      branch,
    });

  if (pipelines.length === 0) {
    return {
      accepted: true,
      ignored: true,

      reason:
        "No ReliAI pipeline matches this repository and branch.",

      repository:
        repository.repositoryUrl,

      branch,

      triggered: [],
    };
  }

  // ----------------------------------------------------
  // Trigger matching pipelines independently.
  //
  // One pipeline failure should not prevent another
  // matching pipeline from being considered.
  // ----------------------------------------------------

  const results = [];

  for (const pipeline of pipelines) {
    try {
      const result =
        await triggerPipelineFromWebhook(
          pipeline
        );

      results.push({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error(
        "[WEBHOOK] Pipeline trigger failed:",
        pipeline._id.toString(),
        error
      );

      results.push({
        success: false,

        triggered: false,

        pipelineId:
          pipeline._id.toString(),

        error:
          error.message ||
          "Pipeline trigger failed.",
      });
    }
  }

  return {
    accepted: true,
    ignored: false,

    repository:
      repository.repositoryUrl,

    branch,

    commitId:
      typeof payload?.after ===
        "string"
        ? payload.after
        : null,

    matchedPipelines:
      pipelines.length,

    triggered:
      results,
  };
};

// ======================================================
// PROCESS GITHUB EVENT
// ======================================================

const processGitHubEvent = async ({
  event,
  payload,
}) => {
  const eventName =
    typeof event === "string"
      ? event.trim().toLowerCase()
      : "";

  // GitHub sends "ping" when a webhook is created.
  if (eventName === "ping") {
    return {
      accepted: true,
      event: "ping",
      message:
        "ReliAI GitHub webhook is active.",
    };
  }

  if (eventName === "push") {
    return processPushEvent(
      payload
    );
  }

  // Other GitHub events are acknowledged but ignored.
  return {
    accepted: true,
    ignored: true,

    event:
      eventName || "unknown",

    reason:
      "GitHub event is not handled by ReliAI.",
  };
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  GitHubWebhookError,
  verifyGitHubSignature,
  parseWebhookPayload,
  processGitHubEvent,
  processPushEvent,
  triggerPipelineFromWebhook,
};