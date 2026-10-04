const { runBuild } = require("./buildService");
const { runTests } = require("./testService");
const { analyzeLogs } = require("./aiLogAnalysisService");
const { autoFix } = require("./autoFixService");

// ============================================================
// CONFIGURATION
// ============================================================

const DEFAULT_BUILD_TIMEOUT = 5 * 60 * 1000;
const DEFAULT_TEST_TIMEOUT = 5 * 60 * 1000;

// ============================================================
// EMPTY RESULT HELPERS
// ============================================================

function emptyAutoFix() {
    return {
        success: false,
        fixed: false,
        packageName: null,
        command: null,
        duration: 0,
        logs: "",
        error: null,
        message: null,
        autoFixAvailable: false
    };
}

function emptyRebuild() {
    return {
        success: false,
        status: "NOT_ATTEMPTED",
        command: null,
        duration: 0,
        logs: "",
        error: null
    };
}

function emptyTestResult() {
    return {
        success: false,
        status: "NOT_ATTEMPTED",
        command: null,
        duration: 0,
        logs: "",
        error: null
    };
}

// ============================================================
// MAIN AUTOMATIC BUILD FIX
// ============================================================
//
// Flow:
//
// BUILD FAILED
//      ↓
// AI LOG ANALYSIS
//      ↓
// AUTO FIX
//      ↓
// REBUILD
//      ↓
// RETEST
//      ↓
// SUCCESS / FAILURE
//
// ============================================================

async function autoBuildFix({
    projectPath,
    buildResult,
    pipeline = {},
    options = {}
} = {}) {

    const startedAt = Date.now();

    // ==========================================================
    // 1. VALIDATE PROJECT PATH
    // ==========================================================

    if (!projectPath) {
        return {
            success: false,
            fixed: false,

            stage: "AUTO_FIX",

            duration:
                Date.now() - startedAt,

            analysis: null,

            autoFixAttempted: false,

            autoFix:
                emptyAutoFix(),

            rebuildAttempted: false,

            rebuild:
                emptyRebuild(),

            testResult:
                emptyTestResult(),

            error:
                "Project path is required.",

            message:
                "Automatic build fix could not start."
        };
    }

    // ==========================================================
    // 2. COLLECT BUILD LOGS
    // ==========================================================

    const buildLogs =
        buildResult?.logs ||
        buildResult?.error ||
        "";

    // ==========================================================
    // 3. ANALYZE BUILD FAILURE
    // ==========================================================

    let analysis;

    try {

        analysis =
            await analyzeLogs(
                buildLogs,
                {
                    projectType:
                        buildResult?.projectType ||
                        pipeline?.projectType ||
                        "unknown"
                }
            );

    } catch (error) {

        return {
            success: false,
            fixed: false,

            stage: "AI_ANALYSIS",

            duration:
                Date.now() - startedAt,

            analysis: null,

            autoFixAttempted: false,

            autoFix:
                emptyAutoFix(),

            rebuildAttempted: false,

            rebuild:
                emptyRebuild(),

            testResult:
                emptyTestResult(),

            error:
                error.message,

            message:
                "AI log analysis failed."
        };
    }

    // ==========================================================
    // 4. CHECK WHETHER AUTO FIX IS AVAILABLE
    // ==========================================================

    if (
        !analysis ||
        analysis.autoFixAvailable !== true
    ) {

        return {
            success: false,

            fixed: false,

            stage: "AI_ANALYSIS",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: false,

            autoFix:
                emptyAutoFix(),

            rebuildAttempted: false,

            rebuild:
                emptyRebuild(),

            testResult:
                emptyTestResult(),

            autoFixAvailable: false,

            message:
                "No automatic fix is available for this build failure."
        };
    }

    // ==========================================================
    // 5. EXECUTE AUTO FIX
    // ==========================================================

    let fixResult;

    try {

        fixResult =
            await autoFix({
                projectPath,

                analysis,

                logs: buildLogs,

                options
            });

    } catch (error) {

        return {
            success: false,

            fixed: false,

            stage: "AUTO_FIX",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: true,

            autoFix: {
                ...emptyAutoFix(),

                error:
                    error.message,

                message:
                    "Automatic fix execution failed."
            },

            rebuildAttempted: false,

            rebuild:
                emptyRebuild(),

            testResult:
                emptyTestResult(),

            autoFixAvailable: true,

            error:
                error.message,

            message:
                "Automatic fix execution failed."
        };
    }

    // ==========================================================
    // 6. NORMALIZE AUTO FIX RESULT
    // ==========================================================

    const normalizedFixResult = {
        ...emptyAutoFix(),

        ...(fixResult || {})
    };

    // ==========================================================
    // 7. AUTO FIX FAILED
    // ==========================================================

    if (
        !normalizedFixResult.success ||
        !normalizedFixResult.fixed
    ) {

        return {
            success: false,

            fixed: false,

            stage: "AUTO_FIX",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: true,

            autoFix:
                normalizedFixResult,

            rebuildAttempted: false,

            rebuild:
                emptyRebuild(),

            testResult:
                emptyTestResult(),

            autoFixAvailable: true,

            message:
                normalizedFixResult.message ||
                "Automatic fix was attempted but failed."
        };
    }

    // ==========================================================
    // 8. REBUILD AFTER SUCCESSFUL FIX
    // ==========================================================

    let rebuildResult;

    try {

        rebuildResult =
            await runBuild(
                projectPath,
                {
                    buildCommand:
                        pipeline?.buildCommand ||
                        options?.buildCommand ||
                        "",

                    timeout:
                        options?.buildTimeout ||
                        options?.timeout ||
                        DEFAULT_BUILD_TIMEOUT,

                    installDependencies:
                        true
                }
            );

    } catch (error) {

        return {
            success: false,

            fixed: true,

            stage: "REBUILD",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: true,

            autoFix:
                normalizedFixResult,

            rebuildAttempted: true,

            rebuild: {
                ...emptyRebuild(),

                error:
                    error.message,

                message:
                    "Rebuild could not start."
            },

            testResult:
                emptyTestResult(),

            autoFixAvailable: true,

            error:
                error.message,

            message:
                "Automatic fix succeeded, but rebuild could not start."
        };
    }

    // ==========================================================
    // 9. NORMALIZE REBUILD RESULT
    // ==========================================================

    const normalizedRebuildResult = {
        ...emptyRebuild(),

        ...(rebuildResult || {})
    };

    // ==========================================================
    // 10. REBUILD FAILED
    // ==========================================================

    if (
        !normalizedRebuildResult.success
    ) {

        return {
            success: false,

            fixed: true,

            stage: "REBUILD",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: true,

            autoFix:
                normalizedFixResult,

            rebuildAttempted: true,

            rebuild:
                normalizedRebuildResult,

            testResult:
                emptyTestResult(),

            autoFixAvailable: true,

            message:
                "Automatic fix succeeded, but the rebuild still failed."
        };
    }

    // ==========================================================
    // 11. RETEST AFTER SUCCESSFUL REBUILD
    // ==========================================================

    let testResult;

    try {

        testResult =
            await runTests(
                projectPath,
                {
                    testCommand:
                        pipeline?.testCommand ||
                        options?.testCommand ||
                        "",

                    timeout:
                        options?.testTimeout ||
                        options?.timeout ||
                        DEFAULT_TEST_TIMEOUT
                }
            );

    } catch (error) {

        return {
            success: false,

            fixed: true,

            stage: "TEST",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: true,

            autoFix:
                normalizedFixResult,

            rebuildAttempted: true,

            rebuild:
                normalizedRebuildResult,

            testResult: {
                ...emptyTestResult(),

                error:
                    error.message
            },

            autoFixAvailable: true,

            error:
                error.message,

            message:
                "Rebuild succeeded, but retesting could not start."
        };
    }

    // ==========================================================
    // 12. NORMALIZE TEST RESULT
    // ==========================================================

    const normalizedTestResult = {
        ...emptyTestResult(),

        ...(testResult || {})
    };

    // ==========================================================
    // 13. RETEST FAILED
    // ==========================================================

    if (
        !normalizedTestResult.success
    ) {

        return {
            success: false,

            fixed: true,

            stage: "TEST",

            duration:
                Date.now() - startedAt,

            analysis,

            autoFixAttempted: true,

            autoFix:
                normalizedFixResult,

            rebuildAttempted: true,

            rebuild:
                normalizedRebuildResult,

            testResult:
                normalizedTestResult,

            autoFixAvailable: true,

            message:
                "Automatic fix and rebuild succeeded, but tests failed."
        };
    }

    // ==========================================================
    // 14. EVERYTHING SUCCESSFUL
    // ==========================================================

    return {
        success: true,

        fixed: true,

        stage: "SUCCESS",

        duration:
            Date.now() - startedAt,

        analysis,

        autoFixAttempted: true,

        autoFix:
            normalizedFixResult,

        rebuildAttempted: true,

        rebuild:
            normalizedRebuildResult,

        testResult:
            normalizedTestResult,

        autoFixAvailable: true,

        message:
            "Automatic fix succeeded. The project was rebuilt and tests passed."
    };
}

// ============================================================
// COMPATIBILITY ALIASES
// ============================================================

async function runAutoBuildFix(params = {}) {
    return autoBuildFix(params);
}

async function applyAutoBuildFix(params = {}) {
    return autoBuildFix(params);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    autoBuildFix,
    runAutoBuildFix,
    applyAutoBuildFix
};