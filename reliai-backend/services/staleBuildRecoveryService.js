const {
  recoverAllStaleBuilds,
} = require("./pipelineExecutionService");

// ======================================================
// CONFIGURATION
// ======================================================

// Run stale-build recovery every 1 minute.
const RECOVERY_INTERVAL_MS =
  60 * 1000;

// ======================================================
// INTERNAL STATE
// ======================================================

// Holds the setInterval reference.
let recoveryTimer = null;

// Prevents overlapping recovery cycles.
//
// Example:
//
// Recovery #1 takes 90 seconds.
// Timer fires again after 60 seconds.
//
// Without this flag, Recovery #2 would start while
// Recovery #1 is still running.
let recoveryRunning = false;

// ======================================================
// RUN SINGLE RECOVERY CYCLE
// ======================================================

const runRecovery = async () => {
  // --------------------------------------------------
  // Prevent overlapping recovery
  // --------------------------------------------------

  if (recoveryRunning) {
    console.log(
      "[STALE RECOVERY] Previous recovery cycle is still running. Skipping this cycle."
    );

    return {
      success: false,
      skipped: true,
      reason:
        "Recovery cycle already running.",
    };
  }

  recoveryRunning = true;

  try {
    console.log(
      "[STALE RECOVERY] Checking for stale builds..."
    );

    // ------------------------------------------------
    // Run recovery
    // ------------------------------------------------

    const result =
      await recoverAllStaleBuilds();

    // ------------------------------------------------
    // No result
    // ------------------------------------------------

    if (!result) {
      console.warn(
        "[STALE RECOVERY] Recovery service returned no result."
      );

      return {
        success: false,
        scanned: 0,
        recovered: 0,
      };
    }

    // ------------------------------------------------
    // Recovery itself failed
    // ------------------------------------------------

    if (result.success === false) {
      console.error(
        "[STALE RECOVERY] Recovery failed:",
        result.error ||
          "Unknown recovery error."
      );

      return result;
    }

    // ------------------------------------------------
    // Extract statistics
    // ------------------------------------------------

    const scanned =
      Number(result.scanned) || 0;

    const recovered =
      Number(result.recovered) || 0;

    // ------------------------------------------------
    // Log result
    // ------------------------------------------------

    if (recovered > 0) {
      console.log(
        `[STALE RECOVERY] Recovered ${recovered} stale build(s).`
      );
    } else {
      console.log(
        `[STALE RECOVERY] No stale builds required recovery. Scanned: ${scanned}.`
      );
    }

    return {
      success: true,
      scanned,
      recovered,
    };

  } catch (error) {
    console.error(
      "[STALE RECOVERY] Recovery cycle failed:",
      error
    );

    return {
      success: false,

      scanned: 0,

      recovered: 0,

      error:
        error.message ||
        "Unknown stale recovery error.",
    };

  } finally {
    // ------------------------------------------------
    // Always release recovery lock
    // ------------------------------------------------

    recoveryRunning = false;
  }
};

// ======================================================
// START AUTOMATIC STALE BUILD RECOVERY
// ======================================================

const startStaleBuildRecovery = () => {
  // --------------------------------------------------
  // Already running
  // --------------------------------------------------

  if (recoveryTimer) {
    console.log(
      "[STALE RECOVERY] Scheduler is already running."
    );

    return false;
  }

  console.log(
    "========================================="
  );

  console.log(
    "[STALE RECOVERY] Automatic stale-build recovery started."
  );

  console.log(
    `[STALE RECOVERY] Interval: ${RECOVERY_INTERVAL_MS / 1000} seconds`
  );

  console.log(
    "========================================="
  );

  // --------------------------------------------------
  // IMPORTANT
  // --------------------------------------------------
  //
  // server.js already runs:
  //
  // recoverAllStaleBuilds()
  //
  // once during startup.
  //
  // Therefore we DO NOT call runRecovery() immediately
  // here because that would perform duplicate startup
  // recovery.
  //
  // The first scheduled recovery will happen after
  // RECOVERY_INTERVAL_MS.
  //
  // --------------------------------------------------

  recoveryTimer =
    setInterval(
      () => {
        runRecovery().catch(
          (error) => {
            console.error(
              "[STALE RECOVERY] Unexpected scheduled recovery error:",
              error
            );
          }
        );
      },
      RECOVERY_INTERVAL_MS
    );

  // --------------------------------------------------
  // Do not keep Node alive only because of this timer
  // --------------------------------------------------

  if (
    recoveryTimer &&
    typeof recoveryTimer.unref ===
      "function"
  ) {
    recoveryTimer.unref();
  }

  return true;
};

// ======================================================
// STOP AUTOMATIC STALE BUILD RECOVERY
// ======================================================

const stopStaleBuildRecovery = () => {
  // --------------------------------------------------
  // Scheduler is not running
  // --------------------------------------------------

  if (!recoveryTimer) {
    console.log(
      "[STALE RECOVERY] Scheduler is not running."
    );

    return false;
  }

  // --------------------------------------------------
  // Stop timer
  // --------------------------------------------------

  clearInterval(
    recoveryTimer
  );

  recoveryTimer = null;

  console.log(
    "[STALE RECOVERY] Automatic stale-build recovery stopped."
  );

  return true;
};

// ======================================================
// CHECK SCHEDULER STATUS
// ======================================================

const isStaleBuildRecoveryRunning =
  () => {
    return Boolean(
      recoveryTimer
    );
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  runRecovery,

  startStaleBuildRecovery,

  stopStaleBuildRecovery,

  isStaleBuildRecoveryRunning,

  RECOVERY_INTERVAL_MS,
};