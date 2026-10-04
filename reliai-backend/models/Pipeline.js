const mongoose = require("mongoose");

// ======================================================
// PIPELINE SCHEMA
// ======================================================

const pipelineSchema = new mongoose.Schema(
  {
    // --------------------------------------------------
    // BASIC INFORMATION
    // --------------------------------------------------

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    // --------------------------------------------------
    // SOURCE TYPE
    // --------------------------------------------------
    //
    // LOCAL:
    // Uses an existing projectPath on the ReliAI machine.
    //
    // GITHUB:
    // ReliAI clones / updates the GitHub repository into
    // its own managed workspace.
    //
    // Existing pipelines automatically remain LOCAL.
    // --------------------------------------------------

    sourceType: {
      type: String,

      enum: [
        "LOCAL",
        "GITHUB",
      ],

      default: "LOCAL",

      index: true,
    },

    // --------------------------------------------------
    // REPOSITORY
    // --------------------------------------------------

    repository: {
      type: String,
      required: true,
      trim: true,
    },

    // --------------------------------------------------
    // GITHUB METADATA
    // --------------------------------------------------

    repositoryOwner: {
      type: String,
      default: "",
      trim: true,
    },

    repositoryName: {
      type: String,
      default: "",
      trim: true,
    },

    // --------------------------------------------------
    // BRANCH
    // --------------------------------------------------

    branch: {
      type: String,
      default: "main",
      trim: true,
    },

    // --------------------------------------------------
    // PROJECT / WORKSPACE PATH
    // --------------------------------------------------
    //
    // LOCAL:
    // User-selected local project directory.
    //
    // GITHUB:
    // ReliAI-managed cloned workspace directory.
    //
    // It is not required at schema level because a
    // GitHub pipeline does not have a workspace until
    // ReliAI prepares the repository.
    // --------------------------------------------------

    projectPath: {
      type: String,
      default: "",
      trim: true,
    },

    // --------------------------------------------------
    // PROJECT TYPE
    // --------------------------------------------------

    projectType: {
      type: String,
      default: "unknown",
      trim: true,
    },

    // --------------------------------------------------
    // BUILD COMMAND
    // --------------------------------------------------

    buildCommand: {
      type: String,
      default: "",
      trim: true,
    },

    // --------------------------------------------------
    // TEST COMMAND
    // --------------------------------------------------

    testCommand: {
      type: String,
      default: "",
      trim: true,
    },

    // --------------------------------------------------
    // LAST COMMIT
    // --------------------------------------------------
    //
    // For GitHub pipelines this stores the commit that
    // was checked out most recently.
    //
    // Each individual Build also stores its own commitId.
    // --------------------------------------------------

    lastCommitId: {
      type: String,
      default: "",
      trim: true,
    },

    // --------------------------------------------------
    // PIPELINE STATUS
    // --------------------------------------------------

    status: {
      type: String,

      enum: [
        "IDLE",
        "RUNNING",
        "SUCCESS",
        "FAILED",
        "CANCELLED",
      ],

      default: "IDLE",

      index: true,
    },

    // --------------------------------------------------
    // LAST RUN
    // --------------------------------------------------

    lastRunAt: {
      type: Date,
      default: null,
    },

    // --------------------------------------------------
    // LAST BUILD
    // --------------------------------------------------

    lastBuildId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Build",
      default: null,
    },

    // --------------------------------------------------
    // LAST ERROR
    // --------------------------------------------------

    lastError: {
      type: String,
      default: null,
    },

    // --------------------------------------------------
    // OWNER
    // --------------------------------------------------

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },

  {
    timestamps: true,
  }
);

// ======================================================
// INDEXES
// ======================================================

pipelineSchema.index({
  user: 1,
  createdAt: -1,
});

// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "Pipeline",
  pipelineSchema
);