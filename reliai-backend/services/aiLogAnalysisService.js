const fs = require("fs");
const path = require("path");


/*
|--------------------------------------------------------------------------
| Issue categories
|--------------------------------------------------------------------------
*/

const ISSUE_CATEGORIES = {
    MISSING_MODULE: "MISSING_MODULE",
    BUILD_SCRIPT_ERROR: "BUILD_SCRIPT_ERROR",
    TEST_FAILURE: "TEST_FAILURE",
    SYNTAX_ERROR: "SYNTAX_ERROR",
    DEPENDENCY_ERROR: "DEPENDENCY_ERROR",
    COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND",
    PERMISSION_ERROR: "PERMISSION_ERROR",
    JAVA_COMPILATION_ERROR: "JAVA_COMPILATION_ERROR",
    PYTHON_ERROR: "PYTHON_ERROR",
    UNKNOWN: "UNKNOWN"
};


/*
|--------------------------------------------------------------------------
| Convert any input into safe log text
|--------------------------------------------------------------------------
*/

function normalizeLogs(logs) {

    if (logs === null || logs === undefined) {
        return "";
    }

    if (typeof logs === "string") {
        return logs;
    }

    if (Array.isArray(logs)) {
        return logs.join("\n");
    }

    if (typeof logs === "object") {
        return JSON.stringify(logs, null, 2);
    }

    return String(logs);
}


/*
|--------------------------------------------------------------------------
| Extract package name from:
|
| Cannot find module 'express'
| Cannot find package 'express'
| Module not found: express
|--------------------------------------------------------------------------
*/

function extractPackageName(logs) {

    const patterns = [
        /Cannot find module ['"]([^'"]+)['"]/i,
        /Cannot find package ['"]([^'"]+)['"]/i,
        /Module not found[:\s]+['"]?([@\w./-]+)['"]?/i,
        /ERR_MODULE_NOT_FOUND.*['"]([^'"]+)['"]/i
    ];


    for (const pattern of patterns) {

        const match = logs.match(pattern);

        if (!match) {
            continue;
        }

        let packageName = match[1];

        /*
         * Ignore relative/local modules.
         */
        if (
            packageName.startsWith(".") ||
            packageName.startsWith("/") ||
            packageName.includes("\\")
        ) {
            continue;
        }


        /*
         * For scoped packages such as:
         *
         * @angular/core
         *
         * preserve the complete package name.
         */
        if (packageName.startsWith("@")) {

            const parts = packageName.split("/");

            if (parts.length >= 2) {
                return `${parts[0]}/${parts[1]}`;
            }
        }


        /*
         * Remove accidental path portions.
         */
        packageName = packageName
            .replace(/[),;]+$/, "")
            .trim();


        return packageName;
    }


    return null;
}


/*
|--------------------------------------------------------------------------
| Detect issue from logs
|--------------------------------------------------------------------------
*/

function detectIssue(logs, projectType = "unknown") {

    const text = logs.toLowerCase();


    /*
     * Missing npm/node module
     */
    if (
        text.includes("cannot find module") ||
        text.includes("cannot find package") ||
        text.includes("err_module_not_found") ||
        text.includes("module not found")
    ) {

        const packageName = extractPackageName(logs);

        return {
            category: ISSUE_CATEGORIES.MISSING_MODULE,
            detectedIssue:
                packageName
                    ? `Missing Node.js module: ${packageName}`
                    : "A required Node.js module is missing.",
            packageName,
            autoFixAvailable: Boolean(packageName),
            confidence: packageName ? 0.98 : 0.85
        };
    }


    /*
     * npm dependency problems
     */
    if (
        text.includes("npm err!") ||
        text.includes("npm error") ||
        text.includes("eresolve unable to resolve dependency tree") ||
        text.includes("peer dependency")
    ) {

        return {
            category: ISSUE_CATEGORIES.DEPENDENCY_ERROR,
            detectedIssue:
                "A Node.js dependency installation or dependency resolution error occurred.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.90
        };
    }


    /*
     * Command not found
     */
    if (
        text.includes("command not found") ||
        text.includes("is not recognized as an internal or external command") ||
        text.includes("'npm' is not recognized") ||
        text.includes("'python' is not recognized") ||
        text.includes("'mvn' is not recognized") ||
        text.includes("'gradle' is not recognized")
    ) {

        return {
            category: ISSUE_CATEGORIES.COMMAND_NOT_FOUND,
            detectedIssue:
                "The required build or test command could not be found.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.95
        };
    }


    /*
     * Java compilation error
     */
    if (
        text.includes("compilation failure") ||
        text.includes("compilation error") ||
        text.includes("cannot find symbol") ||
        text.includes("javac") ||
        (
            projectType === "JAVA_MAVEN" &&
            text.includes("failed to execute goal")
        )
    ) {

        return {
            category: ISSUE_CATEGORIES.JAVA_COMPILATION_ERROR,
            detectedIssue:
                "A Java compilation error was detected.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.92
        };
    }


    /*
     * Python errors
     */
    if (
        text.includes("syntaxerror") ||
        text.includes("indentationerror") ||
        text.includes("modulenotfounderror") ||
        text.includes("importerror")
    ) {

        /*
         * Python missing package
         */
        if (
            text.includes("modulenotfounderror") ||
            text.includes("no module named")
        ) {

            const pythonPackage =
                extractPythonPackageName(logs);


            return {
                category: ISSUE_CATEGORIES.PYTHON_ERROR,
                detectedIssue:
                    pythonPackage
                        ? `Missing Python module: ${pythonPackage}`
                        : "A Python module or import error occurred.",
                packageName: pythonPackage,
                autoFixAvailable: Boolean(pythonPackage),
                confidence: pythonPackage ? 0.95 : 0.85
            };
        }


        return {
            category: ISSUE_CATEGORIES.SYNTAX_ERROR,
            detectedIssue:
                "A Python syntax or indentation error was detected.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.95
        };
    }


    /*
     * Generic JavaScript syntax errors
     */
    if (
        text.includes("syntaxerror") ||
        text.includes("unexpected token") ||
        text.includes("unexpected identifier")
    ) {

        return {
            category: ISSUE_CATEGORIES.SYNTAX_ERROR,
            detectedIssue:
                "A JavaScript syntax error was detected.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.93
        };
    }


    /*
     * Permission errors
     */
    if (
        text.includes("eacces") ||
        text.includes("eperm") ||
        text.includes("permission denied") ||
        text.includes("access is denied")
    ) {

        return {
            category: ISSUE_CATEGORIES.PERMISSION_ERROR,
            detectedIssue:
                "The build or test process does not have sufficient permissions.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.95
        };
    }


    /*
     * Build script failure
     */
    if (
        text.includes("npm run build") &&
        (
            text.includes("failed") ||
            text.includes("error")
        )
    ) {

        return {
            category: ISSUE_CATEGORIES.BUILD_SCRIPT_ERROR,
            detectedIssue:
                "The project's build script failed.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.85
        };
    }


    /*
     * Test failure
     */
    if (
        text.includes("test failed") ||
        text.includes("tests failed") ||
        text.includes("failing tests") ||
        text.includes("assertionerror") ||
        text.includes("failed test")
    ) {

        return {
            category: ISSUE_CATEGORIES.TEST_FAILURE,
            detectedIssue:
                "One or more automated tests failed.",
            packageName: null,
            autoFixAvailable: false,
            confidence: 0.90
        };
    }


    /*
     * Nothing recognizable
     */
    return {
        category: ISSUE_CATEGORIES.UNKNOWN,
        detectedIssue:
            "The build or test failure could not be automatically classified.",
        packageName: null,
        autoFixAvailable: false,
        confidence: 0.40
    };
}


/*
|--------------------------------------------------------------------------
| Extract Python package
|--------------------------------------------------------------------------
*/

function extractPythonPackageName(logs) {

    const patterns = [
        /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i,
        /No module named ['"]([^'"]+)['"]/i
    ];


    for (const pattern of patterns) {

        const match = logs.match(pattern);

        if (match && match[1]) {
            return match[1].split(".")[0];
        }
    }


    return null;
}


/*
|--------------------------------------------------------------------------
| Generate suggested fix
|--------------------------------------------------------------------------
*/

function generateSuggestedFix(issue) {

    switch (issue.category) {

        case ISSUE_CATEGORIES.MISSING_MODULE:

            if (issue.packageName) {
                return `Install the missing Node.js package using npm install ${issue.packageName}.`;
            }

            return "Install the missing Node.js dependency.";


        case ISSUE_CATEGORIES.PYTHON_ERROR:

            if (issue.packageName) {
                return `Install the missing Python package using pip install ${issue.packageName}.`;
            }

            return "Install the missing Python dependency.";


        case ISSUE_CATEGORIES.DEPENDENCY_ERROR:

            return "Review package dependency versions and resolve the dependency tree conflict.";


        case ISSUE_CATEGORIES.COMMAND_NOT_FOUND:

            return "Install or configure the required build/test command and ensure it is available in PATH.";


        case ISSUE_CATEGORIES.JAVA_COMPILATION_ERROR:

            return "Review the Java compilation errors and correct the source code or dependency configuration.";


        case ISSUE_CATEGORIES.SYNTAX_ERROR:

            return "Correct the syntax error reported in the build logs.";


        case ISSUE_CATEGORIES.BUILD_SCRIPT_ERROR:

            return "Review the project's build script and correct the failing command.";


        case ISSUE_CATEGORIES.TEST_FAILURE:

            return "Review the failing test cases and correct the implementation or test expectations.";


        case ISSUE_CATEGORIES.PERMISSION_ERROR:

            return "Check file and directory permissions required by the build process.";


        default:

            return "Review the complete build logs to identify the root cause.";
    }
}


/*
|--------------------------------------------------------------------------
| Main AI log analysis function
|--------------------------------------------------------------------------
|
| This is intentionally deterministic for now.
|
| Later you can replace this section with OpenAI/Gemini/etc.
| without changing pipelineExecutionService.
|--------------------------------------------------------------------------
*/

async function analyzeLogs(logs, options = {}) {

    const normalizedLogs =
        normalizeLogs(logs);


    const projectType =
        options.projectType ||
        "unknown";


    if (!normalizedLogs.trim()) {

        return {
            success: false,
            category: ISSUE_CATEGORIES.UNKNOWN,
            detectedIssue: "No logs were provided for analysis.",
            suggestedFix: "Run the build or test again and collect the generated logs.",
            confidence: 0,
            autoFixAvailable: false,
            packageName: null,
            logsAnalyzed: ""
        };
    }


    const issue =
        detectIssue(
            normalizedLogs,
            projectType
        );


    const suggestedFix =
        generateSuggestedFix(issue);


    return {
        success: true,

        category: issue.category,

        detectedIssue:
            issue.detectedIssue,

        suggestedFix,

        confidence:
            issue.confidence,

        autoFixAvailable:
            issue.autoFixAvailable,

        packageName:
            issue.packageName || null,

        logsAnalyzed:
            normalizedLogs,

        projectType,

        analyzedAt:
            new Date()
    };
}


/*
|--------------------------------------------------------------------------
| Compatibility aliases
|--------------------------------------------------------------------------
|
| Different parts of your existing project may use different names.
|--------------------------------------------------------------------------
*/

async function aiLogAnalyzer(logs, options = {}) {
    return analyzeLogs(logs, options);
}


async function aiLogAnalysis(logs, options = {}) {
    return analyzeLogs(logs, options);
}


module.exports = {
    ISSUE_CATEGORIES,

    analyzeLogs,

    aiLogAnalyzer,

    aiLogAnalysis,

    detectIssue,

    generateSuggestedFix,

    extractPackageName,

    extractPythonPackageName,

    normalizeLogs
};