const mongoose = require("mongoose");


// ======================================================
// BUILD SCHEMA
// ======================================================

const buildSchema = new mongoose.Schema(
  {
    // --------------------------------------------------
    // PIPELINE
    // --------------------------------------------------

    pipeline: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pipeline",
      required: true,
      index: true,
    },


    // --------------------------------------------------
    // USER
    // --------------------------------------------------

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },


    // --------------------------------------------------
    // BUILD NUMBER
    // --------------------------------------------------

    buildNumber: {
      type: Number,
      required: true,
    },


    // --------------------------------------------------
    // BUILD STATUS
    // --------------------------------------------------
    //
    // Cancelled is different from Failed.
    //
    // Failed:
    // The build executed and failed because of an error.
    //
    // Cancelled:
    // The user/system intentionally stopped the build.
    //
    // --------------------------------------------------

    status: {
      type: String,

      enum: [
        "Pending",
        "Running",
        "Success",
        "Failed",
        "Cancelled",
      ],

      default: "Pending",

      index: true,
    },


    // --------------------------------------------------
    // BUILD STAGE
    // --------------------------------------------------

    stage: {
      type: String,

      enum: [
        "QUEUED",
        "BUILDING",
        "TESTING",
        "ANALYZING",
        "AUTO_FIXING",
        "REBUILDING",
        "RETESTING",
        "SUCCESS",
        "FAILED",
        "CANCELLED",
      ],

      default: "QUEUED",

      index: true,
    },


    // --------------------------------------------------
    // DURATION
    // --------------------------------------------------
    //
    // Stored in seconds.
    //
    // --------------------------------------------------

    duration: {
      type: Number,
      default: 0,
    },


    // --------------------------------------------------
    // BRANCH
    // --------------------------------------------------

    branch: {
      type: String,
      default: "main",
      trim: true,
    },


    // --------------------------------------------------
    // COMMIT ID
    // --------------------------------------------------

    commitId: {
      type: String,
      default: "",
      trim: true,
    },


    // --------------------------------------------------
    // BUILD LOGS
    // --------------------------------------------------

    logs: {
      type: String,
      default: "",
    },


    // --------------------------------------------------
    // STARTED AT
    // --------------------------------------------------

    startedAt: {
      type: Date,
      default: null,
    },


    // --------------------------------------------------
    // FINISHED AT
    // --------------------------------------------------

    finishedAt: {
      type: Date,
      default: null,
    },


    // ==================================================
    // INITIAL AI ANALYSIS
    // ==================================================

    initialAIAnalysis: {
      category: {
        type: String,
        default: "",
      },

      severity: {
        type: String,
        default: "",
      },

      packageName: {
        type: String,
        default: "",
      },

      details: {
        type: String,
        default: "",
      },

      logsAnalyzed: {
        type: Number,
        default: 0,
      },

      analyzedAt: {
        type: Date,
        default: null,
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
    },


    // ==================================================
    // AI ANALYSIS
    // ==================================================

    aiAnalysis: {
      category: {
        type: String,
        default: "",
      },

      severity: {
        type: String,
        default: "",
      },

      packageName: {
        type: String,
        default: "",
      },

      details: {
        type: String,
        default: "",
      },

      logsAnalyzed: {
        type: Number,
        default: 0,
      },

      analyzedAt: {
        type: Date,
        default: null,
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
    },


    // ==================================================
    // AUTO FIX
    // ==================================================

    autoFixAttempted: {
      type: Boolean,
      default: false,
    },


    autoFix: {
      success: {
        type: Boolean,
        default: false,
      },

      fixed: {
        type: Boolean,
        default: false,
      },

      packageName: {
        type: String,
        default: "",
      },

      command: {
        type: String,
        default: "",
      },

      duration: {
        type: Number,
        default: 0,
      },

      logs: {
        type: String,
        default: "",
      },

      error: {
        type: String,
        default: null,
      },

      message: {
        type: String,
        default: "",
      },

      autoFixAvailable: {
        type: Boolean,
        default: false,
      },
    },


    // ==================================================
    // REBUILD
    // ==================================================

    rebuildAttempted: {
      type: Boolean,
      default: false,
    },


    rebuild: {
      success: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        default: "",
      },

      command: {
        type: String,
        default: "",
      },

      duration: {
        type: Number,
        default: 0,
      },

      logs: {
        type: String,
        default: "",
      },

      error: {
        type: String,
        default: null,
      },
    },


    // ==================================================
    // TEST RESULT
    // ==================================================

    testResult: {
      success: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        default: "",
      },

      command: {
        type: String,
        default: "",
      },

      duration: {
        type: Number,
        default: 0,
      },

      logs: {
        type: String,
        default: "",
      },

      error: {
        type: String,
        default: null,
      },
    },


    // ==================================================
    // ERROR
    // ==================================================

    error: {
      type: String,
      default: null,
    },
  },


  {
    timestamps: true,
  }
);


// ======================================================
// INDEXES
// ======================================================

// Quickly find builds belonging to a pipeline
buildSchema.index({
  pipeline: 1,
  buildNumber: -1,
});


// Quickly find running builds
buildSchema.index({
  pipeline: 1,
  status: 1,
});


// Quickly find builds belonging to a user
buildSchema.index({
  user: 1,
  createdAt: -1,
});


// ======================================================
// EXPORT
// ======================================================

module.exports = mongoose.model(
  "Build",
  buildSchema
);