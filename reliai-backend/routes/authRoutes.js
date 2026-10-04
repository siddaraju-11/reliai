const express = require("express");

const router = express.Router();

const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  changePassword,
  resetPassword,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

// ======================================================
// Register User
// POST /api/auth/register
// ======================================================
router.post(
  "/register",
  registerUser
);

// ======================================================
// Login User
// POST /api/auth/login
// ======================================================
router.post(
  "/login",
  loginUser
);

// ======================================================
// Get Logged-in User Profile
// GET /api/auth/profile
// ======================================================
router.get(
  "/profile",
  protect,
  getProfile
);

// ======================================================
// Update User Profile
// PUT /api/auth/profile
// ======================================================
router.put(
  "/profile",
  protect,
  updateProfile
);

// ======================================================
// Change Password
// PUT /api/auth/change-password
// ======================================================
router.put(
  "/change-password",
  protect,
  changePassword
);

// ======================================================
// Reset Password
// POST /api/auth/reset-password
// ======================================================
// Development password recovery endpoint
router.post(
  "/reset-password",
  resetPassword
);

// ======================================================
// Export Router
// ======================================================
module.exports = router;