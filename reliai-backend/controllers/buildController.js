const mongoose = require("mongoose");
const path = require("path");

const Build = require("../models/Build");
const Pipeline = require("../models/Pipeline");

const {
  detectProjectType,
  runBuild: runBuildService,
} = require("../services/buildService");

const {
  runTests: runTestsService,
} = require("../services/testService");

const {
  executePipeline,
} = require("../services/pipelineExecutionService");

// ======================================================
// HELPERS
// ======================================================

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

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
// PROJECT TYPE NAME
// ======================================================

function getProjectTypeName(projectType) {
  if (!projectType) {
    return "unknown";
  }

  if (typeof projectType === "string") {
    return projectType;
  }

  return (
    projectType.type ||
    projectType.name ||
    "unknown"
  );
}

// ======================================================
// AUTH CHECK
// ======================================================

function getAuthenticatedUser(req) {
  if (!req.user || !req.user._id) {
    return null;
  }

  return req.user._id;
}

// ======================================================
// BUILD STATUS NORMALIZER
// ======================================================

function normalizeBuildStatus(status) {
  if (
    typeof status !== "string" ||
    !status.trim()
  ) {
    return null;
  }

  const allowedStatuses = [
    "Pending",
    "Running",
    "Success",
    "Failed",
    "Cancelled",
  ];

  return (
    allowedStatuses.find(
      (allowedStatus) =>
        allowedStatus.toLowerCase() ===
        status.trim().toLowerCase()
    ) || null
  );
}

// ======================================================
// PAGINATION HELPER
// ======================================================

function getPagination(query = {}) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || 10;

  if (page < 1) {
    page = 1;
  }

  if (limit < 1) {
    limit = 10;
  }

  // Prevent extremely large history requests
  if (limit > 100) {
    limit = 100;
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

// ======================================================
// SEARCH HELPER
// ======================================================

function buildSearchConditions(search) {
  if (
    typeof search !== "string" ||
    !search.trim()
  ) {
    return [];
  }

  const normalizedSearch = search.trim();

  const conditions = [
    {
      branch: {
        $regex: normalizedSearch,
        $options: "i",
      },
    },
    {
      commitId: {
        $regex: normalizedSearch,
        $options: "i",
      },
    },
  ];

  const buildNumber = Number(normalizedSearch);

  if (
    Number.isInteger(buildNumber) &&
    buildNumber >= 0
  ) {
    conditions.push({
      buildNumber,
    });
  }

  return conditions;
}

// ======================================================
// PAGINATION RESPONSE HELPER
// ======================================================

function createPaginationResponse({
  page,
  limit,
  totalBuilds,
}) {
  const totalPages =
    totalBuilds === 0
      ? 0
      : Math.ceil(totalBuilds / limit);

  return {
    page,
    limit,
    totalBuilds,
    totalPages,

    hasNextPage:
      page < totalPages,

    hasPreviousPage:
      page > 1,

    nextPage:
      page < totalPages
        ? page + 1
        : null,

    previousPage:
      page > 1
        ? page - 1
        : null,
  };
}

// ======================================================
// GET ALL BUILDS
// GET /api/build
//
// Supports:
//
// ?page=1
// ?limit=10
// ?status=Success
// ?pipelineId=<pipeline-id>
// ?search=25
// ?sort=newest
// ?sort=oldest
// ======================================================

exports.getAllBuilds = async (req, res) => {
  try {
    const userId =
      getAuthenticatedUser(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim()
        : "";

    const pipelineId =
      typeof req.query.pipelineId === "string"
        ? req.query.pipelineId.trim()
        : "";

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const sort =
      typeof req.query.sort === "string"
        ? req.query.sort.trim().toLowerCase()
        : "newest";

    const query = {
      user: userId,
    };

    // --------------------------------------------------
    // STATUS FILTER
    // --------------------------------------------------

    if (status) {
      const normalizedStatus =
        normalizeBuildStatus(status);

      if (!normalizedStatus) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid build status. Allowed values: Pending, Running, Success, Failed, Cancelled.",
        });
      }

      query.status = normalizedStatus;
    }

    // --------------------------------------------------
    // PIPELINE FILTER
    // --------------------------------------------------

    if (pipelineId) {
      if (!isValidObjectId(pipelineId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid pipeline ID.",
        });
      }

      const pipeline =
        await Pipeline.findOne({
          _id: pipelineId,
          user: userId,
        }).select("_id");

      if (!pipeline) {
        return res.status(404).json({
          success: false,
          message: "Pipeline not found.",
        });
      }

      query.pipeline = pipeline._id;
    }

    // --------------------------------------------------
    // SEARCH
    // --------------------------------------------------

    const searchConditions =
      buildSearchConditions(search);

    if (searchConditions.length > 0) {
      query.$or = searchConditions;
    }

    // --------------------------------------------------
    // SORT
    // --------------------------------------------------

    const sortOption =
      sort === "oldest"
        ? { createdAt: 1 }
        : { createdAt: -1 };

    // --------------------------------------------------
    // COUNT + FETCH
    // --------------------------------------------------

    const [
      totalBuilds,
      builds,
    ] = await Promise.all([
      Build.countDocuments(query),

      Build.find(query)
        .populate(
          "pipeline",
          "name repository branch status projectType"
        )
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,

      count: builds.length,

      builds,

      filters: {
        status:
          query.status || null,

        pipelineId:
          pipelineId || null,

        search:
          search || null,

        sort:
          sort === "oldest"
            ? "oldest"
            : "newest",
      },

      pagination:
        createPaginationResponse({
          page,
          limit,
          totalBuilds,
        }),
    });
  } catch (error) {
    console.error(
      "GET ALL BUILDS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch build history.",
      error: error.message,
    });
  }
};

// ======================================================
// GET PIPELINE BUILDS
// GET /api/build/pipeline/:pipelineId
//
// Supports:
//
// ?page=1
// ?limit=10
// ?status=Success
// ?search=25
// ?sort=newest
// ?sort=oldest
// ======================================================

exports.getPipelineBuilds =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        pipelineId,
      } = req.params;

      // ------------------------------------------------
      // VALIDATE PIPELINE ID
      // ------------------------------------------------

      if (
        !isValidObjectId(
          pipelineId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid pipeline ID.",
        });
      }

      // ------------------------------------------------
      // VERIFY PIPELINE OWNERSHIP
      // ------------------------------------------------

      const pipeline =
        await Pipeline.findOne({
          _id: pipelineId,
          user: userId,
        });

      if (!pipeline) {
        return res.status(404).json({
          success: false,
          message:
            "Pipeline not found.",
        });
      }

      const {
        page,
        limit,
        skip,
      } = getPagination(req.query);

      const status =
        typeof req.query.status ===
        "string"
          ? req.query.status.trim()
          : "";

      const search =
        typeof req.query.search ===
        "string"
          ? req.query.search.trim()
          : "";

      const sort =
        typeof req.query.sort ===
        "string"
          ? req.query.sort
              .trim()
              .toLowerCase()
          : "newest";

      // ------------------------------------------------
      // QUERY
      // ------------------------------------------------

      const query = {
        pipeline:
          pipeline._id,

        user:
          userId,
      };

      // ------------------------------------------------
      // STATUS FILTER
      // ------------------------------------------------

      if (status) {
        const normalizedStatus =
          normalizeBuildStatus(status);

        if (!normalizedStatus) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid build status. Allowed values: Pending, Running, Success, Failed, Cancelled.",
          });
        }

        query.status =
          normalizedStatus;
      }

      // ------------------------------------------------
      // SEARCH
      // ------------------------------------------------

      const searchConditions =
        buildSearchConditions(search);

      if (
        searchConditions.length > 0
      ) {
        query.$or =
          searchConditions;
      }

      // ------------------------------------------------
      // SORT
      // ------------------------------------------------

      const sortOption =
        sort === "oldest"
          ? {
              buildNumber: 1,
            }
          : {
              buildNumber: -1,
            };

      // ------------------------------------------------
      // COUNT + FETCH
      // ------------------------------------------------

      const [
        totalBuilds,
        builds,
      ] = await Promise.all([
        Build.countDocuments(
          query
        ),

        Build.find(query)
          .populate(
            "pipeline",
            "name repository branch status projectType"
          )
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      return res.status(200).json({
        success: true,

        pipeline: {
          _id:
            pipeline._id,

          name:
            pipeline.name,

          status:
            pipeline.status,
        },

        count:
          builds.length,

        builds,

        filters: {
          status:
            query.status ||
            null,

          search:
            search || null,

          sort:
            sort === "oldest"
              ? "oldest"
              : "newest",
        },

        pagination:
          createPaginationResponse({
            page,
            limit,
            totalBuilds,
          }),
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

        error:
          error.message,
      });
    }
  };

// ======================================================
// GET BUILD BY ID
// GET /api/build/:id
// ======================================================

exports.getBuildById =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid build ID.",
        });
      }

      const build =
        await Build.findOne({
          _id: id,
          user: userId,
        }).populate(
          "pipeline",
          "name description repository branch status projectType buildCommand testCommand"
        );

      if (!build) {
        return res.status(404).json({
          success: false,

          message:
            "Build not found.",
        });
      }

      return res.status(200).json({
        success: true,
        build,
      });
    } catch (error) {
      console.error(
        "GET BUILD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch build.",

        error:
          error.message,
      });
    }
  };

// ======================================================
// DELETE BUILD
// DELETE /api/build/:id
// ======================================================

exports.deleteBuild =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid build ID.",
        });
      }

      const build =
        await Build.findOne({
          _id: id,
          user: userId,
        });

      if (!build) {
        return res.status(404).json({
          success: false,

          message:
            "Build not found.",
        });
      }

      // ------------------------------------------------
      // NEVER DELETE RUNNING BUILD
      // ------------------------------------------------

      if (
        build.status ===
        "Running"
      ) {
        return res.status(409).json({
          success: false,

          message:
            "A running build cannot be deleted.",
        });
      }

      await build.deleteOne();

      return res.status(200).json({
        success: true,

        message:
          "Build deleted successfully.",
      });
    } catch (error) {
      console.error(
        "DELETE BUILD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to delete build.",

        error:
          error.message,
      });
    }
  };

// ======================================================
// RUN STANDALONE BUILD
// POST /api/build/run
// ======================================================
//
// IMPORTANT:
//
// This endpoint directly tests buildService.
//
// It DOES NOT:
//
// - create Build document
// - update Pipeline
// - perform AI analysis
// - perform auto-fix
//
// Complete pipeline execution must use executePipeline().
//
// ======================================================

exports.runBuild =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        projectPath,
        buildCommand,
        timeout,
      } = req.body || {};

      // ------------------------------------------------
      // NORMALIZE PROJECT PATH
      // ------------------------------------------------

      const normalizedPath =
        normalizeProjectPath(
          projectPath
        );

      if (!normalizedPath) {
        return res.status(400).json({
          success: false,

          message:
            "projectPath is required and must be a valid string path.",
        });
      }

      // ------------------------------------------------
      // REJECT [object Object]
      // ------------------------------------------------

      if (
        normalizedPath.includes(
          "[object Object]"
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid projectPath.",
        });
      }

      // ------------------------------------------------
      // RESOLVE ABSOLUTE PATH
      // ------------------------------------------------

      const absoluteProjectPath =
        path.resolve(
          normalizedPath
        );

      console.log(
        "========================================"
      );

      console.log(
        "STANDALONE BUILD REQUEST"
      );

      console.log(
        "User ID:",
        userId.toString()
      );

      console.log(
        "Project Path:",
        absoluteProjectPath
      );

      console.log(
        "========================================"
      );

      // ------------------------------------------------
      // DETECT PROJECT TYPE
      // ------------------------------------------------

      const detected =
        detectProjectType(
          absoluteProjectPath
        );

      const projectType =
        getProjectTypeName(
          detected
        );

      if (
        !detected ||
        projectType ===
          "unknown"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Unable to detect project type.",

          projectPath:
            absoluteProjectPath,
        });
      }

      // ------------------------------------------------
      // EXECUTE BUILD
      // ------------------------------------------------

      const result =
        await runBuildService(
          absoluteProjectPath,
          {
            buildCommand:
              typeof buildCommand ===
                "string"
                ? buildCommand.trim()
                : "",

            timeout:
              Number(timeout) > 0
                ? Number(timeout)
                : 180000,
          }
        );

      // ------------------------------------------------
      // RESULT
      // ------------------------------------------------

      return res.status(
        result.success
          ? 200
          : 500
      ).json({
        success:
          Boolean(
            result.success
          ),

        message:
          result.success
            ? "Build completed successfully."
            : "Build failed.",

        projectPath:
          absoluteProjectPath,

        projectType,

        status:
          result.status,

        duration:
          result.duration || 0,

        command:
          result.command || "",

        logs:
          result.logs || "",

        error:
          result.error || null,

        cancelled:
          Boolean(
            result.cancelled
          ),

        timedOut:
          Boolean(
            result.timedOut
          ),
      });
    } catch (error) {
      console.error(
        "RUN BUILD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to execute build.",

        error:
          error.message,
      });
    }
  };

// ======================================================
// RUN STANDALONE TESTS
// POST /api/build/test
// ======================================================

exports.runTests =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        projectPath,
        testCommand,
        timeout,
      } = req.body || {};

      // ------------------------------------------------
      // NORMALIZE PROJECT PATH
      // ------------------------------------------------

      const normalizedPath =
        normalizeProjectPath(
          projectPath
        );

      if (!normalizedPath) {
        return res.status(400).json({
          success: false,

          message:
            "projectPath is required and must be a valid string path.",
        });
      }

      if (
        normalizedPath.includes(
          "[object Object]"
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid projectPath.",
        });
      }

      const absoluteProjectPath =
        path.resolve(
          normalizedPath
        );

      console.log(
        "========================================"
      );

      console.log(
        "STANDALONE TEST REQUEST"
      );

      console.log(
        "User ID:",
        userId.toString()
      );

      console.log(
        "Project Path:",
        absoluteProjectPath
      );

      console.log(
        "========================================"
      );

      // ------------------------------------------------
      // RUN TESTS
      // ------------------------------------------------

      const result =
        await runTestsService(
          absoluteProjectPath,
          {
            testCommand:
              typeof testCommand ===
                "string"
                ? testCommand.trim()
                : "",

            timeout:
              Number(timeout) > 0
                ? Number(timeout)
                : 120000,
          }
        );

      return res.status(
        result.success
          ? 200
          : 500
      ).json({
        success:
          Boolean(
            result.success
          ),

        message:
          result.success
            ? result.status ===
              "SKIPPED"
              ? "Tests skipped."
              : "Tests completed successfully."
            : "Tests failed.",

        projectPath:
          absoluteProjectPath,

        projectType:
          result.projectType ||
          "unknown",

        status:
          result.status,

        duration:
          result.duration || 0,

        command:
          result.command || "",

        logs:
          result.logs || "",

        error:
          result.error || null,

        skipped:
          Boolean(
            result.skipped
          ),

        cancelled:
          Boolean(
            result.cancelled
          ),

        timedOut:
          Boolean(
            result.timedOut
          ),
      });
    } catch (error) {
      console.error(
        "RUN TESTS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to execute tests.",

        error:
          error.message,
      });
    }
  };

// ======================================================
// GET BUILD STATUS
// GET /api/build/status/:id
// ======================================================

exports.getBuildStatus =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid build ID.",
        });
      }

      const build =
        await Build.findOne({
          _id: id,
          user: userId,
        }).populate(
          "pipeline",
          "name repository branch status projectType buildCommand testCommand"
        );

      if (!build) {
        return res.status(404).json({
          success: false,

          message:
            "Build not found.",
        });
      }

      return res.status(200).json({
        success: true,

        build: {
          _id:
            build._id,

          pipeline:
            build.pipeline,

          buildNumber:
            build.buildNumber,

          status:
            build.status,

          stage:
            build.stage,

          duration:
            build.duration,

          branch:
            build.branch,

          commitId:
            build.commitId,

          startedAt:
            build.startedAt,

          finishedAt:
            build.finishedAt,

          error:
            build.error,

          createdAt:
            build.createdAt,

          updatedAt:
            build.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        "GET BUILD STATUS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to get build status.",

        error:
          error.message,
      });
    }
  };

// ======================================================
// GET BUILD LOGS
// GET /api/build/logs/:id
// ======================================================

exports.getBuildLogs =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        id,
      } = req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid build ID.",
        });
      }

      const build =
        await Build.findOne({
          _id: id,
          user: userId,
        });

      if (!build) {
        return res.status(404).json({
          success: false,

          message:
            "Build not found.",
        });
      }

      return res.status(200).json({
        success: true,

        buildId:
          build._id,

        buildNumber:
          build.buildNumber,

        status:
          build.status,

        stage:
          build.stage,

        branch:
          build.branch,

        commitId:
          build.commitId,

        startedAt:
          build.startedAt,

        finishedAt:
          build.finishedAt,

        duration:
          build.duration,

        logs:
          build.logs || "",

        error:
          build.error || null,

        initialAIAnalysis:
          build.initialAIAnalysis ||
          null,

        aiAnalysis:
          build.aiAnalysis ||
          null,

        autoFixAttempted:
          Boolean(
            build.autoFixAttempted
          ),

        autoFix:
          build.autoFix ||
          null,

        rebuildAttempted:
          Boolean(
            build.rebuildAttempted
          ),

        rebuild:
          build.rebuild ||
          null,

        testResult:
          build.testResult ||
          null,
      });
    } catch (error) {
      console.error(
        "GET BUILD LOGS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to get build logs.",

        error:
          error.message,
      });
    }
  };

// ======================================================
// RUN COMPLETE PIPELINE FROM BUILD ENDPOINT
// POST /api/build/pipeline/:pipelineId/run
// ======================================================
//
// IMPORTANT:
//
// This controller DOES NOT execute the CI/CD stages.
//
// pipelineExecutionService.js is the single execution
// engine.
//
// This prevents:
//
// - duplicate builds
// - duplicate build numbers
// - conflicting pipeline state
// - duplicate AI analysis
// - duplicate auto-fix execution
//
// ======================================================

exports.runPipelineBuild =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUser(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not Authorized",
        });
      }

      const {
        pipelineId,
      } = req.params;

      // ------------------------------------------------
      // VALIDATE ID
      // ------------------------------------------------

      if (
        !isValidObjectId(
          pipelineId
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid pipeline ID.",
        });
      }

      // ------------------------------------------------
      // VERIFY PIPELINE OWNERSHIP
      // ------------------------------------------------

      const pipeline =
        await Pipeline.findOne({
          _id: pipelineId,
          user: userId,
        });

      if (!pipeline) {
        return res.status(404).json({
          success: false,

          message:
            "Pipeline not found.",
        });
      }

      // ------------------------------------------------
      // DETERMINE PROJECT PATH
      // ------------------------------------------------

      const requestedPath =
        req.body &&
        req.body.projectPath !==
          undefined
          ? req.body.projectPath
          : pipeline.projectPath;

      const projectPath =
        normalizeProjectPath(
          requestedPath
        );

      if (!projectPath) {
        return res.status(400).json({
          success: false,

          message:
            "Pipeline project path is missing or invalid.",
        });
      }

      if (
        projectPath.includes(
          "[object Object]"
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid project path.",
        });
      }

      console.log(
        "========================================"
      );

      console.log(
        "[BUILD CONTROLLER] RUN PIPELINE"
      );

      console.log(
        "Pipeline ID:",
        pipeline._id.toString()
      );

      console.log(
        "Pipeline Name:",
        pipeline.name
      );

      console.log(
        "Project Path:",
        projectPath
      );

      console.log(
        "========================================"
      );

      // ------------------------------------------------
      // EXECUTE PIPELINE
      // ------------------------------------------------

      const result =
        await executePipeline({
          pipelineId:
            pipeline._id,

          userId,

          projectPath,
        });

      // ------------------------------------------------
      // INVALID RESULT
      // ------------------------------------------------

      if (!result) {
        return res.status(500).json({
          success: false,

          status:
            "FAILED",

          message:
            "Pipeline execution returned no result.",
        });
      }

      // ------------------------------------------------
      // ALREADY RUNNING
      // ------------------------------------------------

      if (
        result.alreadyRunning
      ) {
        return res.status(409).json({
          success: false,

          alreadyRunning:
            true,

          status:
            "RUNNING",

          message:
            "Pipeline is already running.",

          pipelineId:
            result.pipelineId ||
            pipeline._id.toString(),

          buildId:
            result.buildId ||
            null,

          buildNumber:
            result.buildNumber ||
            null,
        });
      }

      // ------------------------------------------------
      // IMMEDIATE EXECUTION FAILURE
      // ------------------------------------------------

      if (
        result.success ===
        false
      ) {
        return res.status(500).json({
          success: false,

          status:
            result.status ||
            "FAILED",

          message:
            result.error ||
            result.message ||
            "Failed to start pipeline.",

          pipelineId:
            result.pipelineId ||
            pipeline._id.toString(),

          buildId:
            result.buildId ||
            null,

          buildNumber:
            result.buildNumber ||
            null,

          error:
            result.error ||
            null,
        });
      }

      // ------------------------------------------------
      // COMPATIBILITY
      //
      // Support:
      //
      // {
      //   build: BuildDocument
      // }
      //
      // and:
      //
      // {
      //   buildId,
      //   buildNumber
      // }
      // ------------------------------------------------

      const returnedBuild =
        result.build &&
        result.build._id
          ? result.build
          : null;

      const buildId =
        result.buildId ||
        (
          returnedBuild
            ? returnedBuild._id.toString()
            : null
        );

      const buildNumber =
        result.buildNumber ||
        (
          returnedBuild
            ? returnedBuild.buildNumber
            : null
        );

      const returnedPipeline =
        result.pipeline &&
        result.pipeline._id
          ? result.pipeline
          : null;

      const returnedPipelineId =
        result.pipelineId ||
        (
          returnedPipeline
            ? returnedPipeline._id.toString()
            : pipeline._id.toString()
        );

      // ------------------------------------------------
      // VALIDATE RESULT
      // ------------------------------------------------

      if (!buildId) {
        console.error(
          "[BUILD CONTROLLER] Invalid pipeline execution result:",
          result
        );

        return res.status(500).json({
          success: false,

          message:
            "Pipeline execution did not return a valid build.",
        });
      }

      // ------------------------------------------------
      // STARTED SUCCESSFULLY
      // ------------------------------------------------

      return res.status(202).json({
        success: true,

        message:
          "Pipeline build started successfully.",

        pipelineId:
          returnedPipelineId,

        buildId,

        buildNumber,

        status:
          result.status ||
          "RUNNING",
      });
    } catch (error) {
      console.error(
        "========================================"
      );

      console.error(
        "RUN PIPELINE BUILD ERROR"
      );

      console.error(error);

      console.error(
        "========================================"
      );

      return res.status(500).json({
        success: false,

        status:
          "FAILED",

        message:
          "Failed to start pipeline build.",

        error:
          error.message,
      });
    }
  };