const mongoose = require("mongoose");

const buildLogSchema = new mongoose.Schema(
  {
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

    logs: [
      {
        type: String,
      },
    ],

    status: {
      type: String,
      enum: ["Running", "Success", "Failed"],
      default: "Running",
    },

    duration: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("BuildLog", buildLogSchema);