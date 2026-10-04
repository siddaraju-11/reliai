const Pipeline = require("../models/Pipeline");
const Build = require("../models/Build");

// ======================================================
// GET DASHBOARD
// ======================================================

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    // ==================================================
    // FETCH USER PIPELINES
    // ==================================================

    const pipelines = await Pipeline.find({
      user: userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    // ==================================================
    // PIPELINE STATISTICS
    // ==================================================

    const pipelineStats = {
      total: pipelines.length,
      idle: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const pipeline of pipelines) {
      const status = String(
        pipeline.status || ""
      ).toUpperCase();

      switch (status) {
        case "IDLE":
          pipelineStats.idle += 1;
          break;

        case "RUNNING":
          pipelineStats.running += 1;
          break;

        case "SUCCESS":
          pipelineStats.success += 1;
          break;

        case "FAILED":
          pipelineStats.failed += 1;
          break;

        case "CANCELLED":
          pipelineStats.cancelled += 1;
          break;

        default:
          break;
      }
    }

    // ==================================================
    // BUILD STATISTICS USING MONGODB AGGREGATION
    // ==================================================

    const buildStatsResult = await Build.aggregate([
      {
        $match: {
          user: userId,
        },
      },

      {
        $group: {
          _id: null,

          total: {
            $sum: 1,
          },

          pending: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", "Pending"],
                },
                1,
                0,
              ],
            },
          },

          running: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", "Running"],
                },
                1,
                0,
              ],
            },
          },

          success: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", "Success"],
                },
                1,
                0,
              ],
            },
          },

          failed: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", "Failed"],
                },
                1,
                0,
              ],
            },
          },

          cancelled: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", "Cancelled"],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const rawBuildStats =
      buildStatsResult.length > 0
        ? buildStatsResult[0]
        : {};

    const buildStats = {
      total: rawBuildStats.total || 0,
      pending: rawBuildStats.pending || 0,
      running: rawBuildStats.running || 0,
      success: rawBuildStats.success || 0,
      failed: rawBuildStats.failed || 0,
      cancelled: rawBuildStats.cancelled || 0,
      successRate: 0,
      averageDuration: 0,
    };

    // ==================================================
    // SUCCESS RATE
    // ==================================================
    //
    // Cancelled builds are intentionally excluded.
    //
    // completed = Success + Failed
    //
    // successRate =
    // Success / completed * 100
    //
    // ==================================================

    const completedBuilds =
      buildStats.success + buildStats.failed;

    if (completedBuilds > 0) {
      buildStats.successRate = Number(
        (
          (buildStats.success /
            completedBuilds) *
          100
        ).toFixed(2)
      );
    }

    // ==================================================
    // AVERAGE BUILD DURATION
    // ==================================================
    //
    // Only completed builds with duration > 0.
    //
    // Cancelled / Running / Pending are excluded.
    //
    // ==================================================

    const durationResult = await Build.aggregate([
      {
        $match: {
          user: userId,

          status: {
            $in: ["Success", "Failed"],
          },

          duration: {
            $gt: 0,
          },
        },
      },

      {
        $group: {
          _id: null,

          averageDuration: {
            $avg: "$duration",
          },
        },
      },
    ]);

    if (
      durationResult.length > 0 &&
      durationResult[0].averageDuration
    ) {
      buildStats.averageDuration = Number(
        durationResult[0].averageDuration.toFixed(2)
      );
    }

    // ==================================================
    // RECENT BUILDS
    // ==================================================

    const recentBuilds = await Build.find({
      user: userId,
    })
      .sort({
        createdAt: -1,
      })
      .limit(10)
      .select(
        "pipeline buildNumber status stage duration branch commitId startedAt finishedAt createdAt"
      )
      .populate(
        "pipeline",
        "name repository branch status"
      )
      .lean();

    // ==================================================
    // RECENT PIPELINES
    // ==================================================

    const recentPipelines = pipelines
      .slice(0, 10)
      .map((pipeline) => ({
        _id: pipeline._id,
        name: pipeline.name,
        status: pipeline.status,
        branch: pipeline.branch,
        repository: pipeline.repository,
        projectType: pipeline.projectType,
        lastRunAt: pipeline.lastRunAt,
        lastBuildId: pipeline.lastBuildId,
        updatedAt: pipeline.updatedAt,
      }));

    // ==================================================
    // RESPONSE
    // ==================================================

    res.status(200).json({
      success: true,

      dashboard: {
        // ----------------------------------------------
        // Backward-compatible fields
        // ----------------------------------------------

        total: pipelineStats.total,

        pending: pipelineStats.idle,

        running: pipelineStats.running,

        success: pipelineStats.success,

        failed: pipelineStats.failed,

        cancelled: pipelineStats.cancelled,

        // ----------------------------------------------
        // New structured statistics
        // ----------------------------------------------

        pipelines: pipelineStats,

        builds: buildStats,

        recentBuilds,

        recentPipelines,
      },
    });
  } catch (error) {
    console.error(
      "[DASHBOARD ERROR]",
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to load dashboard statistics.",
    });
  }
};