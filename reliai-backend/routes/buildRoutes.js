const express = require("express");

const router = express.Router();

// ======================================================
// CONTROLLERS
// ======================================================

const {
  getAllBuilds,
  getPipelineBuilds,
  getBuildById,
  deleteBuild,
  runBuild,
  runTests,
  getBuildStatus,
  getBuildLogs,
  runPipelineBuild,
} = require("../controllers/buildController");

// ======================================================
// AUTHENTICATION MIDDLEWARE
// ======================================================

const {
  protect,
} = require("../middleware/authMiddleware");

// ======================================================
// GET ALL BUILDS
// GET /api/build
// ======================================================

router.get(
  "/",
  protect,
  getAllBuilds
);

// ======================================================
// GET BUILDS FOR A PIPELINE
// GET /api/build/pipeline/:pipelineId
// ======================================================

router.get(
  "/pipeline/:pipelineId",
  protect,
  getPipelineBuilds
);

// ======================================================
// RUN STANDALONE BUILD
// POST /api/build/run
// ======================================================

router.post(
  "/run",
  protect,
  runBuild
);

// ======================================================
// RUN STANDALONE TESTS
// POST /api/build/test
// ======================================================

router.post(
  "/test",
  protect,
  runTests
);

// ======================================================
// RUN COMPLETE PIPELINE
// POST /api/build/pipeline/:pipelineId/run
// ======================================================

router.post(
  "/pipeline/:pipelineId/run",
  protect,
  runPipelineBuild
);

// ======================================================
// GET BUILD STATUS
// GET /api/build/status/:id
// ======================================================

router.get(
  "/status/:id",
  protect,
  getBuildStatus
);

// ======================================================
// GET BUILD LOGS
// GET /api/build/logs/:id
// ======================================================

router.get(
  "/logs/:id",
  protect,
  getBuildLogs
);

// ======================================================
// GET SINGLE BUILD
// GET /api/build/:id
// ======================================================

router.get(
  "/:id",
  protect,
  getBuildById
);

// ======================================================
// DELETE BUILD
// DELETE /api/build/:id
// ======================================================

router.delete(
  "/:id",
  protect,
  deleteBuild
);

// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;