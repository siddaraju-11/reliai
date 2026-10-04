const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");

// ======================================================
// Generate JWT Token
// ======================================================
const generateToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

// ======================================================
// Register User
// POST /api/auth/register
// ======================================================
exports.registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
    } = req.body;

    // ==========================================
    // Validation
    // ==========================================
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ==========================================
    // Check Existing User
    // ==========================================
    const normalizedEmail =
      email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // ==========================================
    // Hash Password
    // ==========================================
    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    // ==========================================
    // Create User
    // ==========================================
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    // ==========================================
    // Generate JWT
    // ==========================================
    const token = generateToken(user._id);

    // ==========================================
    // Response
    // ==========================================
    return res.status(201).json({
      success: true,
      message: "Registration Successful",

      token,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
      },
    });

  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ======================================================
// Login User
// POST /api/auth/login
// ======================================================
exports.loginUser = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    // ==========================================
    // Validation
    // ==========================================
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    // ==========================================
    // Find User
    // ==========================================
    const normalizedEmail =
      email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // Check Account Status
    // ==========================================
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    // ==========================================
    // Compare Password
    // ==========================================
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid Password",
      });
    }

    // ==========================================
    // Update Last Login
    // ==========================================
    user.lastLogin = new Date();

    await user.save();

    // ==========================================
    // Generate JWT
    // ==========================================
    const token = generateToken(user._id);

    // ==========================================
    // Response
    // ==========================================
    return res.status(200).json({
      success: true,
      message: "Login Successful",

      token,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
      },
    });

  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ======================================================
// Get Logged-in User Profile
// GET /api/auth/profile
// ======================================================
exports.getProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    return res.status(200).json({
      success: true,

      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        phone: req.user.phone,
        bio: req.user.bio,
        profileImage: req.user.profileImage,
        createdAt: req.user.createdAt,
      },
    });

  } catch (error) {
    console.error(
      "PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ======================================================
// Update User Profile
// PUT /api/auth/profile
// ======================================================
exports.updateProfile = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      bio,
      profileImage,
    } = req.body;

    // ==========================================
    // Find Logged-in User
    // ==========================================
    const user = await User.findById(
      req.user._id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // Update Name
    // ==========================================
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Name cannot be empty",
        });
      }

      user.name = name.trim();
    }

    // ==========================================
    // Update Email
    // ==========================================
    if (email !== undefined) {
      const normalizedEmail =
        email.trim().toLowerCase();

      if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Email",
        });
      }

      const existingUser =
        await User.findOne({
          email: normalizedEmail,
        });

      if (
        existingUser &&
        existingUser._id.toString() !==
          user._id.toString()
      ) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }

      user.email = normalizedEmail;
    }

    // ==========================================
    // Update Phone
    // ==========================================
    if (phone !== undefined) {
      user.phone = phone;
    }

    // ==========================================
    // Update Bio
    // ==========================================
    if (bio !== undefined) {
      if (bio.length > 250) {
        return res.status(400).json({
          success: false,
          message:
            "Bio cannot exceed 250 characters",
        });
      }

      user.bio = bio;
    }

    // ==========================================
    // Update Profile Image
    // ==========================================
    if (profileImage !== undefined) {
      user.profileImage =
        profileImage;
    }

    // ==========================================
    // Save Changes
    // ==========================================
    await user.save();

    // ==========================================
    // Response
    // ==========================================
    return res.status(200).json({
      success: true,
      message:
        "Profile Updated Successfully",

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        bio: user.bio,
        profileImage:
          user.profileImage,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });

  } catch (error) {
    console.error(
      "UPDATE PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
// ======================================================
// Change Password
// PUT /api/auth/change-password
// ======================================================
exports.changePassword = async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    // ==========================================
    // Validation
    // ==========================================
    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    // ==========================================
    // Check Password Match
    // ==========================================
    if (
      newPassword !== confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New passwords do not match",
      });
    }

    // ==========================================
    // Password Length
    // ==========================================
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters",
      });
    }

    // ==========================================
    // Find User
    // ==========================================
    const user = await User.findById(
      req.user._id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // Verify Current Password
    // ==========================================
    const isMatch =
      await bcrypt.compare(
        currentPassword,
        user.password
      );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message:
          "Current password is incorrect",
      });
    }

    // ==========================================
    // Prevent Same Password
    // ==========================================
    const samePassword =
      await bcrypt.compare(
        newPassword,
        user.password
      );

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password cannot be the same as the current password",
      });
    }

    // ==========================================
    // Hash New Password
    // ==========================================
    const hashedPassword =
      await bcrypt.hash(
        newPassword,
        10
      );

    user.password =
      hashedPassword;

    await user.save();

    // ==========================================
    // Response
    // ==========================================
    return res.status(200).json({
      success: true,
      message:
        "Password changed successfully",
    });

  } catch (error) {
    console.error(
      "CHANGE PASSWORD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ======================================================
// Reset Password
// Development Recovery Endpoint
// POST /api/auth/reset-password
//
// IMPORTANT:
// This endpoint is intended for development/testing.
// It should be replaced with a secure OTP/email-token
// password recovery system before production.
// ======================================================
exports.resetPassword = async (req, res) => {
  try {
    const {
      email,
      newPassword,
      confirmPassword,
    } = req.body;

    // ==========================================
    // Validation
    // ==========================================
    if (
      !email ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    // ==========================================
    // Validate Email
    // ==========================================
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid email address",
      });
    }

    // ==========================================
    // Check Password Match
    // ==========================================
    if (
      newPassword !== confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New passwords do not match",
      });
    }

    // ==========================================
    // Password Length
    // ==========================================
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters",
      });
    }

    // ==========================================
    // Normalize Email
    // ==========================================
    const normalizedEmail =
      email.trim().toLowerCase();

    // ==========================================
    // Find User
    // ==========================================
    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // Hash New Password
    // ==========================================
    const hashedPassword =
      await bcrypt.hash(
        newPassword,
        10
      );

    // ==========================================
    // Update Password
    // ==========================================
    user.password =
      hashedPassword;

    await user.save();

    // ==========================================
    // Generate New Token
    // ==========================================
    const token =
      generateToken(user._id);

    // ==========================================
    // Response
    // ==========================================
    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully",

      token,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage:
          user.profileImage,
      },
    });

  } catch (error) {
    console.error(
      "RESET PASSWORD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

