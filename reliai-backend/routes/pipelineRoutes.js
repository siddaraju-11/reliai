const express = require("express");

const router = express.Router();

// ======================================================
// CONTROLLER
// ======================================================

const {
  // Pipeline CRUD
  createPipeline,
  getAllPipelines,
  getPipelineById,
  updatePipeline,
  deletePipeline,

  // Pipeline execution
  runPipeline,

  // Build information
  getPipelineBuilds,
  getPipelineBuildById,
  getPipelineBuildStatus,
  getPipelineBuildLogs,
  getLatestBuild,
  getRunningBuild,
  getBuildHistory,

  // Build actions
  retryBuild,
  cancelBuild,

  // Recovery
  recoverPipeline,
  resetPipelineStatus,

  // Statistics / summary
  getPipelineStats,
  getPipelineSummary,
  getPipelineFailure,
  getAllPipelineStats,

  // Health
  pipelineControllerHealth,
} = require("../controllers/pipelineController");

// ======================================================
// AUTHENTICATION MIDDLEWARE
// ======================================================

const {
  protect,
} = require("../middleware/authMiddleware");

// ======================================================
// CONTROLLER HEALTH
// GET /api/pipeline/controller-health
// ======================================================
//
// IMPORTANT:
// Keep static routes ABOVE "/:id" routes.
//
// Otherwise Express may interpret:
//
// controller-health
//
// as a pipeline ID.
//

router.get(
  "/controller-health",
  pipelineControllerHealth
);

// ======================================================
// ALL PIPELINE STATISTICS
// GET /api/pipeline/stats/all
// ======================================================

router.get(
  "/stats/all",
  protect,
  getAllPipelineStats
);

// ======================================================
// CREATE PIPELINE
// POST /api/pipeline/create
// ======================================================

router.post(
  "/create",
  protect,
  createPipeline
);

// ======================================================
// GET ALL PIPELINES
// GET /api/pipeline
// ======================================================

router.get(
  "/",
  protect,
  getAllPipelines
);

// ======================================================
// RUN PIPELINE
// POST /api/pipeline/:id/run
// PUT  /api/pipeline/:id/run
// ======================================================
//
// Both are supported because your frontend previously
// called the PUT version.
//

router.post(
  "/:id/run",
  protect,
  runPipeline
);

router.put(
  "/:id/run",
  protect,
  runPipeline
);

// ======================================================
// GET PIPELINE BUILDS
// GET /api/pipeline/:id/builds
// ======================================================

router.get(
  "/:id/builds",
  protect,
  getPipelineBuilds
);

// ======================================================
// GET BUILD HISTORY
// GET /api/pipeline/:id/history
// ======================================================

router.get(
  "/:id/history",
  protect,
  getBuildHistory
);

// ======================================================
// GET LATEST BUILD
// GET /api/pipeline/:id/latest-build
// ======================================================

router.get(
  "/:id/latest-build",
  protect,
  getLatestBuild
);

// ======================================================
// GET RUNNING BUILD
// GET /api/pipeline/:id/running-build
// ======================================================

router.get(
  "/:id/running-build",
  protect,
  getRunningBuild
);

// ======================================================
// PIPELINE STATISTICS
// GET /api/pipeline/:id/stats
// ======================================================

router.get(
  "/:id/stats",
  protect,
  getPipelineStats
);

// ======================================================
// PIPELINE SUMMARY
// GET /api/pipeline/:id/summary
// ======================================================

router.get(
  "/:id/summary",
  protect,
  getPipelineSummary
);

// ======================================================
// PIPELINE FAILURE INFORMATION
// GET /api/pipeline/:id/failure
// ======================================================

router.get(
  "/:id/failure",
  protect,
  getPipelineFailure
);

// ======================================================
// MANUAL PIPELINE RECOVERY
// POST /api/pipeline/:id/recover
// ======================================================

router.post(
  "/:id/recover",
  protect,
  recoverPipeline
);

// ======================================================
// RESET PIPELINE STATUS
// PUT /api/pipeline/:id/reset
// ======================================================

router.put(
  "/:id/reset",
  protect,
  resetPipelineStatus
);

// ======================================================
// GET SINGLE BUILD
// GET /api/pipeline/:pipelineId/build/:buildId
// ======================================================

router.get(
  "/:pipelineId/build/:buildId",
  protect,
  getPipelineBuildById
);

// ======================================================
// GET BUILD STATUS
// GET /api/pipeline/:pipelineId/build/:buildId/status
// ======================================================

router.get(
  "/:pipelineId/build/:buildId/status",
  protect,
  getPipelineBuildStatus
);

// ======================================================
// GET BUILD LOGS
// GET /api/pipeline/:pipelineId/build/:buildId/logs
// ======================================================

router.get(
  "/:pipelineId/build/:buildId/logs",
  protect,
  getPipelineBuildLogs
);

// ======================================================
// RETRY FAILED BUILD
// POST /api/pipeline/:pipelineId/build/:buildId/retry
// ======================================================

router.post(
  "/:pipelineId/build/:buildId/retry",
  protect,
  retryBuild
);

// ======================================================
// CANCEL RUNNING BUILD
// POST /api/pipeline/:pipelineId/build/:buildId/cancel
// ======================================================

router.post(
  "/:pipelineId/build/:buildId/cancel",
  protect,
  cancelBuild
);

// ======================================================
// GET PIPELINE BY ID
// GET /api/pipeline/:id
// ======================================================
//
// Keep this AFTER specific "/:id/..." routes.
//

router.get(
  "/:id",
  protect,
  getPipelineById
);

// ======================================================
// UPDATE PIPELINE
// PUT /api/pipeline/:id
// ======================================================

router.put(
  "/:id",
  protect,
  updatePipeline
);

// ======================================================
// DELETE PIPELINE
// DELETE /api/pipeline/:id
// ======================================================

router.delete(
  "/:id",
  protect,
  deletePipeline
);

// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;