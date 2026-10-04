const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ======================================
    // User Name
    // ======================================
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    // ======================================
    // User Email
    // ======================================
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // ======================================
    // User Password
    // ======================================
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },

    // ======================================
    // User Role
    // ======================================
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // ======================================
    // Profile Image
    // ======================================
    profileImage: {
      type: String,
      default: "",
    },

    // ======================================
    // Phone Number (Optional)
    // ======================================
    phone: {
      type: String,
      default: "",
    },

    // ======================================
    // Bio (Optional)
    // ======================================
    bio: {
      type: String,
      default: "",
      maxlength: 250,
    },

    // ======================================
    // Account Status
    // ======================================
    isActive: {
      type: Boolean,
      default: true,
    },

    // ======================================
    // Last Login Time
    // ======================================
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);