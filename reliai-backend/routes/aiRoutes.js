const express = require("express");
const router = express.Router();

// =====================================
// Middleware
// =====================================
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// =====================================
// Controller
// =====================================
const {
  uploadProject,
  generateReport,
  analyzeError,
} = require("../controllers/aiController");

// =====================================
// Upload & Analyze Project
// POST /api/ai/upload
// =====================================
router.post(
  "/upload",
  protect,
  upload.single("project"),
  uploadProject
);

// =====================================
// Generate AI PDF Report
// POST /api/ai/report
// =====================================
router.post(
  "/report",
  protect,
  generateReport
);

// =====================================
// AI Log/Error Analysis
// POST /api/ai/analyze
// =====================================
router.post(
  "/analyze",
  protect,
  analyzeError
);

module.exports = router;