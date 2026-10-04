const fs = require("fs");
const path = require("path");

const {
    detectProjectType,
    executeCommand,
    PROJECT_TYPES,
    normalizeProjectPath,
} = require("./buildService");

// =========================================================
// CONFIGURATION
// =========================================================

const DEFAULT_TEST_TIMEOUT = 5 * 60 * 1000;

// =========================================================
// HELPERS
// =========================================================

function exists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
}

// =========================================================
// HELPER: NORMALIZE TEST OPTIONS
// =========================================================

function normalizeTestOptions(options = {}) {
    if (
        !options ||
        typeof options !== "object" ||
        Array.isArray(options)
    ) {
        return {};
    }

    return options;
}

// =========================================================
// HELPER: GET TIMEOUT
// =========================================================

function getTimeout(options = {}) {
    const timeout = Number(options.timeout);

    if (
        Number.isFinite(timeout) &&
        timeout > 0
    ) {
        return timeout;
    }

    return DEFAULT_TEST_TIMEOUT;
}

// =========================================================
// HELPER: CHECK PYTHON TEST FILES
// =========================================================

function hasPythonTests(projectRoot) {
    if (!projectRoot) {
        return false;
    }

    // -----------------------------------------------------
    // Check common Python test directories
    // -----------------------------------------------------

    const testsDirectory = path.join(
        projectRoot,
        "tests"
    );

    const testDirectory = path.join(
        projectRoot,
        "test"
    );

    if (
        exists(testsDirectory) ||
        exists(testDirectory)
    ) {
        return true;
    }

    // -----------------------------------------------------
    // Check test files in project root
    // -----------------------------------------------------

    try {
        const files = fs.readdirSync(
            projectRoot
        );

        return files.some((file) => {
            return (
                /^test_.*\.py$/i.test(file) ||
                /.*_test\.py$/i.test(file)
            );
        });
    } catch (error) {
        return false;
    }
}

// =========================================================
// SKIPPED TEST RESULT
// =========================================================

function skippedResult(
    command,
    message
) {
    return {
        success: true,

        status: "SKIPPED",

        command:
            command || "",

        duration: 0,

        logs:
            `${message || "Tests skipped."}\n`,

        error: null,

        skipped: true,

        cancelled: false,

        timedOut: false,
    };
}

// =========================================================
// FAILED TEST RESULT
// =========================================================

function failedResult({
    command = "",
    error = "Test execution failed.",
    logs = "",
} = {}) {
    return {
        success: false,

        status: "FAILED",

        command,

        duration: 0,

        logs,

        error,

        skipped: false,

        cancelled: false,

        timedOut: false,
    };
}

// =========================================================
// NODE TESTS
// =========================================================

async function runNodeTests(
    projectRoot,
    options = {}
) {
    options =
        normalizeTestOptions(options);

    const packageJsonPath =
        path.join(
            projectRoot,
            "package.json"
        );

    // -----------------------------------------------------
    // Validate package.json
    // -----------------------------------------------------

    if (!exists(packageJsonPath)) {
        return failedResult({
            command: "npm test",

            error:
                "package.json was not found.",
        });
    }

    // -----------------------------------------------------
    // Read package.json
    // -----------------------------------------------------

    let packageJson;

    try {
        packageJson =
            JSON.parse(
                fs.readFileSync(
                    packageJsonPath,
                    "utf8"
                )
            );
    } catch (error) {
        return failedResult({
            command: "npm test",

            error:
                `Unable to parse package.json: ${error.message}`,
        });
    }

    // =====================================================
    // INSTALL DEPENDENCIES WHEN NEEDED
    // =====================================================

    const nodeModulesPath =
        path.join(
            projectRoot,
            "node_modules"
        );

    if (!exists(nodeModulesPath)) {
        console.log(
            "[TEST SERVICE] node_modules not found."
        );

        console.log(
            "[TEST SERVICE] Installing dependencies..."
        );

        const installResult =
            await executeCommand(
                "npm install",
                {
                    cwd: projectRoot,

                    timeout:
                        getTimeout(
                            options
                        ),

                    buildId:
                        options.buildId,

                    onLog:
                        options.onLog,
                }
            );

        // -------------------------------------------------
        // Installation cancelled
        // -------------------------------------------------

        if (
            installResult.cancelled ||
            installResult.status ===
                "CANCELLED"
        ) {
            return installResult;
        }

        // -------------------------------------------------
        // Installation failed
        // -------------------------------------------------

        if (!installResult.success) {
            return {
                ...installResult,

                error:
                    installResult.error ||
                    "Failed to install Node.js dependencies.",
            };
        }
    }

    // =====================================================
    // DETERMINE TEST COMMAND
    // =====================================================

    let testCommand =
        typeof options.testCommand ===
            "string"
            ? options.testCommand.trim()
            : "";

    // -----------------------------------------------------
    // Custom command has priority
    // -----------------------------------------------------

    if (!testCommand) {
        const npmTestScript =
            packageJson.scripts &&
            typeof packageJson.scripts
                .test === "string"
                ? packageJson.scripts.test.trim()
                : "";

        // -------------------------------------------------
        // No test script
        // -------------------------------------------------

        if (!npmTestScript) {
            return skippedResult(
                "npm test",

                "No npm test script found. Skipping Node.js tests."
            );
        }

        // -------------------------------------------------
        // Detect default npm placeholder
        // -------------------------------------------------

        const normalizedScript =
            npmTestScript.toLowerCase();

        if (
            normalizedScript.includes(
                "error: no test specified"
            )
        ) {
            return skippedResult(
                "npm test",

                "Default npm test placeholder detected. Skipping Node.js tests."
            );
        }

        testCommand = "npm test";
    }

    // =====================================================
    // EXECUTE TESTS
    // =====================================================

    console.log(
        "========================================"
    );

    console.log(
        "[TEST SERVICE] NODE TESTS"
    );

    console.log(
        "Project:",
        projectRoot
    );

    console.log(
        "Command:",
        testCommand
    );

    console.log(
        "========================================"
    );

    return executeCommand(
        testCommand,
        {
            cwd: projectRoot,

            timeout:
                getTimeout(options),

            buildId:
                options.buildId,

            onLog:
                options.onLog,
        }
    );
}

// =========================================================
// PYTHON TESTS
// =========================================================

async function runPythonTests(
    projectRoot,
    options = {}
) {
    options =
        normalizeTestOptions(options);

    // =====================================================
    // CUSTOM TEST COMMAND
    // =====================================================

    const customCommand =
        typeof options.testCommand ===
            "string"
            ? options.testCommand.trim()
            : "";

    if (customCommand) {
        console.log(
            "========================================"
        );

        console.log(
            "[TEST SERVICE] PYTHON CUSTOM TEST"
        );

        console.log(
            "Command:",
            customCommand
        );

        console.log(
            "========================================"
        );

        return executeCommand(
            customCommand,
            {
                cwd: projectRoot,

                timeout:
                    getTimeout(
                        options
                    ),

                buildId:
                    options.buildId,

                onLog:
                    options.onLog,
            }
        );
    }

    // =====================================================
    // CHECK WHETHER TESTS EXIST
    // =====================================================

    if (!hasPythonTests(projectRoot)) {
        return skippedResult(
            "python -m pytest",

            "No Python test files or test directory found. Skipping Python tests."
        );
    }

    // =====================================================
    // RUN PYTEST
    // =====================================================

    const command =
        "python -m pytest";

    console.log(
        "========================================"
    );

    console.log(
        "[TEST SERVICE] PYTHON TESTS"
    );

    console.log(
        "Project:",
        projectRoot
    );

    console.log(
        "Command:",
        command
    );

    console.log(
        "========================================"
    );

    return executeCommand(
        command,
        {
            cwd: projectRoot,

            timeout:
                getTimeout(options),

            buildId:
                options.buildId,

            onLog:
                options.onLog,
        }
    );
}

// =========================================================
// MAVEN TESTS
// =========================================================

async function runMavenTests(
    projectRoot,
    options = {}
) {
    options =
        normalizeTestOptions(options);

    const pomPath =
        path.join(
            projectRoot,
            "pom.xml"
        );

    // -----------------------------------------------------
    // Validate Maven project
    // -----------------------------------------------------

    if (!exists(pomPath)) {
        return failedResult({
            command: "mvn test",

            error:
                "pom.xml was not found.",
        });
    }

    // -----------------------------------------------------
    // Determine command
    // -----------------------------------------------------

    const customCommand =
        typeof options.testCommand ===
            "string"
            ? options.testCommand.trim()
            : "";

    const command =
        customCommand ||
        "mvn test";

    console.log(
        "========================================"
    );

    console.log(
        "[TEST SERVICE] MAVEN TESTS"
    );

    console.log(
        "Project:",
        projectRoot
    );

    console.log(
        "Command:",
        command
    );

    console.log(
        "========================================"
    );

    return executeCommand(
        command,
        {
            cwd: projectRoot,

            timeout:
                getTimeout(options),

            buildId:
                options.buildId,

            onLog:
                options.onLog,
        }
    );
}

// =========================================================
// GRADLE TESTS
// =========================================================

async function runGradleTests(
    projectRoot,
    options = {}
) {
    options =
        normalizeTestOptions(options);

    // -----------------------------------------------------
    // Detect Gradle files
    // -----------------------------------------------------

    const gradleBuild =
        path.join(
            projectRoot,
            "build.gradle"
        );

    const gradleBuildKts =
        path.join(
            projectRoot,
            "build.gradle.kts"
        );

    if (
        !exists(gradleBuild) &&
        !exists(gradleBuildKts)
    ) {
        return failedResult({
            command: "gradle test",

            error:
                "Gradle build file was not found.",
        });
    }

    // =====================================================
    // CUSTOM TEST COMMAND
    // =====================================================

    const customCommand =
        typeof options.testCommand ===
            "string"
            ? options.testCommand.trim()
            : "";

    let command =
        customCommand;

    // =====================================================
    // AUTOMATIC COMMAND
    // =====================================================

    if (!command) {
        const windowsWrapper =
            path.join(
                projectRoot,
                "gradlew.bat"
            );

        const unixWrapper =
            path.join(
                projectRoot,
                "gradlew"
            );

        // -------------------------------------------------
        // Windows
        // -------------------------------------------------

        if (
            process.platform ===
            "win32"
        ) {
            if (
                exists(
                    windowsWrapper
                )
            ) {
                command =
                    "gradlew.bat test";
            } else {
                command =
                    "gradle test";
            }
        }

        // -------------------------------------------------
        // Linux / macOS
        // -------------------------------------------------

        else {
            if (
                exists(
                    unixWrapper
                )
            ) {
                command =
                    "./gradlew test";
            } else {
                command =
                    "gradle test";
            }
        }
    }

    console.log(
        "========================================"
    );

    console.log(
        "[TEST SERVICE] GRADLE TESTS"
    );

    console.log(
        "Project:",
        projectRoot
    );

    console.log(
        "Command:",
        command
    );

    console.log(
        "========================================"
    );

    return executeCommand(
        command,
        {
            cwd: projectRoot,

            timeout:
                getTimeout(options),

            buildId:
                options.buildId,

            onLog:
                options.onLog,
        }
    );
}

// =========================================================
// MAIN TEST FUNCTION
// =========================================================

async function runTests(
    projectInput,
    options = {}
) {
    let projectPath =
        projectInput;

    let testOptions =
        normalizeTestOptions(
            options
        );

    // =====================================================
    // SUPPORT OBJECT INPUT
    // =====================================================
    //
    // Supported:
    //
    // runTests(
    //     projectPath,
    //     options
    // )
    //
    // OR
    //
    // runTests({
    //     projectPath,
    //     testCommand,
    //     timeout,
    //     buildId
    // })
    //
    // =====================================================

    if (
        projectInput &&
        typeof projectInput ===
            "object" &&
        !Array.isArray(
            projectInput
        )
    ) {
        projectPath =
            projectInput.projectPath ||
            projectInput.path ||
            projectInput.value ||
            projectInput.project_path ||
            "";

        testOptions = {
            ...projectInput,
            ...testOptions,
        };
    }

    // =====================================================
    // NORMALIZE PROJECT PATH
    // =====================================================

    let projectRoot;

    try {
        projectRoot =
            normalizeProjectPath(
                projectPath
            );
    } catch (error) {
        return {
            success: false,

            status: "FAILED",

            command: null,

            duration: 0,

            logs: "",

            error:
                error.message,

            projectType:
                PROJECT_TYPES.UNKNOWN,

            projectPath:
                typeof projectPath ===
                    "string"
                    ? projectPath
                    : "",

            cancelled: false,

            timedOut: false,

            skipped: false,
        };
    }

    // =====================================================
    // VALIDATE PROJECT PATH
    // =====================================================

    if (!projectRoot) {
        return {
            success: false,

            status: "FAILED",

            command: null,

            duration: 0,

            logs: "",

            error:
                "Project path is required.",

            projectType:
                PROJECT_TYPES.UNKNOWN,

            projectPath: "",

            cancelled: false,

            timedOut: false,

            skipped: false,
        };
    }

    // -----------------------------------------------------
    // Protect against accidental object conversion
    // -----------------------------------------------------

    if (
        projectRoot.includes(
            "[object Object]"
        )
    ) {
        return {
            success: false,

            status: "FAILED",

            command: null,

            duration: 0,

            logs: "",

            error:
                "Invalid project path: [object Object].",

            projectType:
                PROJECT_TYPES.UNKNOWN,

            projectPath:
                projectRoot,

            cancelled: false,

            timedOut: false,

            skipped: false,
        };
    }

    // -----------------------------------------------------
    // Check path existence
    // -----------------------------------------------------

    if (!exists(projectRoot)) {
        return {
            success: false,

            status: "FAILED",

            command: null,

            duration: 0,

            logs: "",

            error:
                `Project path does not exist: ${projectRoot}`,

            projectType:
                PROJECT_TYPES.UNKNOWN,

            projectPath:
                projectRoot,

            cancelled: false,

            timedOut: false,

            skipped: false,
        };
    }

    // -----------------------------------------------------
    // Make sure it is a directory
    // -----------------------------------------------------

    try {
        const stats =
            fs.statSync(
                projectRoot
            );

        if (!stats.isDirectory()) {
            return {
                success: false,

                status: "FAILED",

                command: null,

                duration: 0,

                logs: "",

                error:
                    `Project path is not a directory: ${projectRoot}`,

                projectType:
                    PROJECT_TYPES.UNKNOWN,

                projectPath:
                    projectRoot,

                cancelled: false,

                timedOut: false,

                skipped: false,
            };
        }
    } catch (error) {
        return {
            success: false,

            status: "FAILED",

            command: null,

            duration: 0,

            logs: "",

            error:
                `Unable to access project path: ${error.message}`,

            projectType:
                PROJECT_TYPES.UNKNOWN,

            projectPath:
                projectRoot,

            cancelled: false,

            timedOut: false,

            skipped: false,
        };
    }

    // =====================================================
    // DETECT PROJECT TYPE
    // =====================================================

    let projectType;

    try {
        projectType =
            detectProjectType(
                projectRoot
            );
    } catch (error) {
        return {
            success: false,

            status: "FAILED",

            command: null,

            duration: 0,

            logs: "",

            error:
                `Unable to detect project type: ${error.message}`,

            projectType:
                PROJECT_TYPES.UNKNOWN,

            projectPath:
                projectRoot,

            cancelled: false,

            timedOut: false,

            skipped: false,
        };
    }

    console.log(
        "========================================"
    );

    console.log(
        "[TEST SERVICE] TEST EXECUTION"
    );

    console.log(
        "Project Path:",
        projectRoot
    );

    console.log(
        "Project Type:",
        projectType
    );

    console.log(
        "Build ID:",
        testOptions.buildId
            ? testOptions.buildId.toString()
            : "N/A"
    );

    console.log(
        "========================================"
    );

    // =====================================================
    // EXECUTE TESTS
    // =====================================================

    let result;

    try {
        switch (projectType) {
            // =============================================
            // NODE.JS
            // =============================================

            case PROJECT_TYPES.NODE:
                result =
                    await runNodeTests(
                        projectRoot,
                        testOptions
                    );

                break;

            // =============================================
            // PYTHON
            // =============================================

            case PROJECT_TYPES.PYTHON:
                result =
                    await runPythonTests(
                        projectRoot,
                        testOptions
                    );

                break;

            // =============================================
            // JAVA MAVEN
            // =============================================

            case PROJECT_TYPES.JAVA_MAVEN:
                result =
                    await runMavenTests(
                        projectRoot,
                        testOptions
                    );

                break;

            // =============================================
            // JAVA GRADLE
            // =============================================

            case PROJECT_TYPES.JAVA_GRADLE:
                result =
                    await runGradleTests(
                        projectRoot,
                        testOptions
                    );

                break;

            // =============================================
            // UNKNOWN
            // =============================================

            default:
                result =
                    failedResult({
                        command: "",

                        error:
                            "Unable to detect project type.",
                    });

                break;
        }
    } catch (error) {
        result =
            failedResult({
                command: "",

                error:
                    error.message ||
                    "Unexpected test execution error.",
            });
    }

    // =====================================================
    // NORMALIZE RESULT
    // =====================================================

    if (
        !result ||
        typeof result !== "object"
    ) {
        result =
            failedResult({
                error:
                    "Test service returned an invalid result.",
            });
    }

    const finalResult = {
        success:
            Boolean(
                result.success
            ),

        status:
            result.status ||
            (
                result.success
                    ? "SUCCESS"
                    : "FAILED"
            ),

        command:
            result.command || "",

        duration:
            Number.isFinite(
                Number(
                    result.duration
                )
            )
                ? Number(
                    result.duration
                )
                : 0,

        logs:
            result.logs || "",

        error:
            result.error || null,

        skipped:
            Boolean(
                result.skipped
            ),

        cancelled:
            Boolean(
                result.cancelled
            ),

        timedOut:
            Boolean(
                result.timedOut
            ),

        projectType,

        projectPath:
            projectRoot,
    };

    // =====================================================
    // LOG RESULT
    // =====================================================

    console.log(
        "========================================"
    );

    console.log(
        "[TEST SERVICE] TEST RESULT"
    );

    console.log(
        "Status:",
        finalResult.status
    );

    console.log(
        "Success:",
        finalResult.success
    );

    console.log(
        "Skipped:",
        finalResult.skipped
    );

    console.log(
        "Cancelled:",
        finalResult.cancelled
    );

    console.log(
        "Timed Out:",
        finalResult.timedOut
    );

    console.log(
        "Duration:",
        finalResult.duration
    );

    if (finalResult.error) {
        console.log(
            "Error:",
            finalResult.error
        );
    }

    console.log(
        "========================================"
    );

    return finalResult;
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    // -----------------------------------------------------
    // Configuration
    // -----------------------------------------------------

    DEFAULT_TEST_TIMEOUT,

    // -----------------------------------------------------
    // Helpers
    // -----------------------------------------------------

    exists,

    hasPythonTests,

    skippedResult,

    failedResult,

    // -----------------------------------------------------
    // Individual test runners
    // -----------------------------------------------------

    runNodeTests,

    runPythonTests,

    runMavenTests,

    runGradleTests,

    // -----------------------------------------------------
    // Main API
    // -----------------------------------------------------

    runTests,
};