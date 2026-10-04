const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  analyzeGithubRepository,
  fullGithubAnalysis,
} = require("../controllers/githubController");

// ======================================
// Analyze GitHub Repository
// POST /api/github/analyze
// ======================================
router.post(
  "/analyze",
  protect,
  analyzeGithubRepository
);

// ======================================
// Full GitHub Repository Analysis
// POST /api/github/full-analysis
// ======================================
router.post(
  "/full-analysis",
  protect,
  fullGithubAnalysis
);

module.exports = router;