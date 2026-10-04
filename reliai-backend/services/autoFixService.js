const fs = require("fs");

const path = require("path");

const {
    executeCommand
} = require("./buildService");

/*
|--------------------------------------------------------------------------
| Supported automatic fixes
|--------------------------------------------------------------------------
*/

const FIX_TYPES = {

    NODE_MISSING_MODULE: "NODE_MISSING_MODULE",

    PYTHON_MISSING_MODULE: "PYTHON_MISSING_MODULE"

};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function exists(targetPath) {

    try {

        return fs.existsSync(targetPath);

    } catch (error) {

        return false;

    }

}

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
| Validate npm package name
|--------------------------------------------------------------------------
|
| Prevent accidental execution of arbitrary shell commands.
|
| Examples:
| express
| mongoose
| lodash
| @angular/core
| @types/node
|
|--------------------------------------------------------------------------
*/

function isValidNpmPackage(packageName) {

    if (!packageName || typeof packageName !== "string") {

        return false;

    }

    const npmPackageRegex =
        /^(?:@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/;

    return npmPackageRegex.test(packageName);

}

/*
|--------------------------------------------------------------------------
| Validate Python package name
|--------------------------------------------------------------------------
*/

function isValidPythonPackage(packageName) {

    if (!packageName || typeof packageName !== "string") {

        return false;

    }

    const pythonPackageRegex =
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

    return pythonPackageRegex.test(packageName);

}

/*
|--------------------------------------------------------------------------
| Extract analysis object
|--------------------------------------------------------------------------
*/

function normalizeAnalysis(analysis) {

    if (!analysis) {

        return {};

    }

    if (typeof analysis === "string") {

        return {

            detectedIssue: analysis

        };

    }

    return analysis;

}

/*
|--------------------------------------------------------------------------
| Install missing Node.js package
|--------------------------------------------------------------------------
*/

async function installNodePackage(

    projectPath,

    packageName,

    options = {}

) {

    if (!isValidNpmPackage(packageName)) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs:
                `Invalid npm package name: ${packageName}`,

            error:
                `Invalid npm package name: ${packageName}`

        };

    }

    if (!projectPath) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs: "Project path is required.",

            error: "Project path is required."

        };

    }

    const absoluteProjectPath =
        path.resolve(projectPath);

    if (!exists(absoluteProjectPath)) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs:
                `Project path does not exist: ${absoluteProjectPath}`,

            error:
                `Project path does not exist: ${absoluteProjectPath}`

        };

    }

    const packageJsonPath =
        path.join(

            absoluteProjectPath,

            "package.json"

        );

    if (!exists(packageJsonPath)) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs:
                "package.json was not found. This does not appear to be a Node.js project.",

            error:
                "package.json not found."

        };

    }

    const command =
        `npm install ${packageName} --save`;

    console.log(

        `AUTO-FIX: Installing missing Node.js package: ${packageName}`

    );

    const result =
        await executeCommand(

            command,

            {

                cwd: absoluteProjectPath,

                timeout:
                    options.timeout || 120000,

                buildId:
                    options.buildId,

                onLog:
                    options.onLog

            }

        );

    return {

        ...result,

        fixed:
            result.success,

        packageName,

        fixType:
            FIX_TYPES.NODE_MISSING_MODULE

    };

}

/*
|--------------------------------------------------------------------------
| Install missing Python package
|--------------------------------------------------------------------------
*/

async function installPythonPackage(

    projectPath,

    packageName,

    options = {}

) {

    if (!isValidPythonPackage(packageName)) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs:
                `Invalid Python package name: ${packageName}`,

            error:
                `Invalid Python package name: ${packageName}`

        };

    }

    if (!projectPath) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs: "Project path is required.",

            error: "Project path is required."

        };

    }

    const absoluteProjectPath =
        path.resolve(projectPath);

    if (!exists(absoluteProjectPath)) {

        return {

            success: false,

            fixed: false,

            packageName,

            command: "",

            duration: 0,

            logs:
                `Project path does not exist: ${absoluteProjectPath}`,

            error:
                `Project path does not exist: ${absoluteProjectPath}`

        };

    }

    const command =
        `python -m pip install ${packageName}`;

    console.log(

        `AUTO-FIX: Installing missing Python package: ${packageName}`

    );

    const result =
        await executeCommand(

            command,

            {

                cwd: absoluteProjectPath,

                timeout:
                    options.timeout || 120000,

                buildId:
                    options.buildId,

                onLog:
                    options.onLog

            }

        );

    return {

        ...result,

        fixed:
            result.success,

        packageName,

        fixType:
            FIX_TYPES.PYTHON_MISSING_MODULE

    };

}

/*
|--------------------------------------------------------------------------
| Main automatic fix function
|--------------------------------------------------------------------------
*/

async function autoFix({

    projectPath,

    analysis,

    logs,

    options = {}

} = {}) {

    const normalizedAnalysis =
        normalizeAnalysis(analysis);

    const normalizedLogs =
        normalizeLogs(logs);

    console.log(

        "AUTO-FIX: Starting automatic fix..."

    );

    /*
    |--------------------------------------------------------------------------
    | 1. Missing Node.js module
    |--------------------------------------------------------------------------
    */

    const nodeCategory =
        normalizedAnalysis.category ===
        "MISSING_MODULE";

    if (

        nodeCategory &&

        normalizedAnalysis.packageName

    ) {

        return await installNodePackage(

            projectPath,

            normalizedAnalysis.packageName,

            options

        );

    }

    /*
    |--------------------------------------------------------------------------
    | 2. Missing Python module
    |--------------------------------------------------------------------------
    */

    const pythonCategory =
        normalizedAnalysis.category ===
        "PYTHON_ERROR";

    if (

        pythonCategory &&

        normalizedAnalysis.packageName

    ) {

        return await installPythonPackage(

            projectPath,

            normalizedAnalysis.packageName,

            options

        );

    }

    /*
    |--------------------------------------------------------------------------
    | 3. Fallback detection
    |--------------------------------------------------------------------------
    |
    | This allows autoFix to work even when the analysis object
    | is incomplete but the logs clearly show a missing module.
    |
    */

    if (

        normalizedLogs &&

        (

            normalizedLogs.includes("Cannot find module") ||

            normalizedLogs.includes("Cannot find package")

        )

    ) {

        const match =
            normalizedLogs.match(

                /Cannot find (?:module|package) ['"]([^'"]+)['"]/i

            );

        if (

            match &&

            match[1]

        ) {

            const packageName =
                match[1];

            /*
            |--------------------------------------------------------------------------
            | Ignore local/relative modules.
            |--------------------------------------------------------------------------
            */

            if (

                !packageName.startsWith(".") &&

                !packageName.startsWith("/")

            ) {

                return await installNodePackage(

                    projectPath,

                    packageName,

                    options

                );

            }

        }

    }

    /*
    |--------------------------------------------------------------------------
    | No supported automatic fix
    |--------------------------------------------------------------------------
    */

    return {

        success: false,

        fixed: false,

        autoFixAvailable: false,

        packageName:
            normalizedAnalysis.packageName || null,

        command: "",

        duration: 0,

        logs:
            "No supported automatic fix was available for this failure.",

        error:
            "No supported automatic fix was available."

    };

}

/*
|--------------------------------------------------------------------------
| Compatibility aliases
|--------------------------------------------------------------------------
*/

async function runAutoFix(params = {}) {

    return autoFix(params);

}

async function applyAutoFix(params = {}) {

    return autoFix(params);

}

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = {

    FIX_TYPES,

    autoFix,

    runAutoFix,

    applyAutoFix,

    installNodePackage,

    installPythonPackage,

    isValidNpmPackage,

    isValidPythonPackage

};