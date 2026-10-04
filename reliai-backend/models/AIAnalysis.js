const mongoose = require("mongoose");

const aiAnalysisSchema = new mongoose.Schema(
  {
    build: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Build",
      required: true,
    },

    pipeline: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pipeline",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    detectedIssue: {
      type: String,
      default: "",
    },

    suggestedFix: {
      type: String,
      default: "",
    },

    confidence: {
      type: Number,
      default: 0,
    },

    autoFixAvailable: {
      type: Boolean,
      default: false,
    },

    autoFixApplied: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["Pending", "Analyzed"],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AIAnalysis",
  aiAnalysisSchema
);