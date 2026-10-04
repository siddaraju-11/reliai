const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ======================================================
// PROTECT ROUTES
// ======================================================

exports.protect = async (req, res, next) => {
  try {
    console.log("========== AUTH MIDDLEWARE ==========");

    // --------------------------------------------------
    // Get Authorization Header
    // --------------------------------------------------

    const authHeader = req.headers.authorization;

    let token;

    // --------------------------------------------------
    // Extract Bearer Token
    // --------------------------------------------------

    if (
      authHeader &&
      authHeader.startsWith("Bearer ")
    ) {
      token = authHeader.split(" ")[1];
    }

    // --------------------------------------------------
    // No Token
    // --------------------------------------------------

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized. No Token",
      });
    }

    // --------------------------------------------------
    // Verify JWT
    // --------------------------------------------------

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // --------------------------------------------------
    // Find User
    // --------------------------------------------------

    const user = await User.findById(
      decoded.id
    ).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found from token",
      });
    }

    // --------------------------------------------------
    // Attach User To Request
    // --------------------------------------------------

    req.user = user;

    console.log(
      "Authenticated User ID:",
      req.user._id.toString()
    );

    next();

  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error.message
    );

    return res.status(401).json({
      success: false,
      message: "Invalid Token",
    });
  }
};