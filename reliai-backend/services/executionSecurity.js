const fs = require("fs");
const path = require("path");

// ======================================================
// ALLOWED EXECUTABLES
// ======================================================
//
// IMPORTANT:
//
// We store executable BASENAMES here.
//
// Examples:
//
// C:\Program Files\nodejs\npm.cmd -> npm.cmd
// ./gradlew                       -> gradlew
// .\gradlew.bat                  -> gradlew.bat
//
// This avoids platform-specific path differences.
//
// ======================================================

const ALLOWED_EXECUTABLES = new Set([
  // Node.js
  "node",
  "node.exe",

  // npm
  "npm",
  "npm.cmd",

  // npx
  "npx",
  "npx.cmd",

  // pnpm
  "pnpm",
  "pnpm.cmd",

  // yarn
  "yarn",
  "yarn.cmd",

  // Python
  "python",
  "python.exe",
  "python3",
  "python3.exe",

  // pip
  "pip",
  "pip.exe",
  "pip3",
  "pip3.exe",

  // pytest
  "pytest",
  "pytest.exe",

  // Maven
  "mvn",
  "mvn.cmd",
  "mvnw",
  "mvnw.cmd",

  // Gradle
  "gradle",
  "gradle.bat",
  "gradle.cmd",
  "gradlew",
  "gradlew.bat",
  "gradlew.cmd",
]);

// ======================================================
// DANGEROUS COMMAND PATTERNS
// ======================================================
//
// These checks are defense-in-depth.
//
// buildService currently executes commands with shell:true,
// so shell metacharacters must be rejected before spawning.
//
// Docker/process isolation will provide a stronger boundary
// later in the ReliAI roadmap.
//
// ======================================================

const DANGEROUS_COMMAND_PATTERNS = [
  {
    regex: /[\r\n]/,
    reason:
      "Multi-line commands are not allowed.",
  },

  {
    regex: /&&/,
    reason:
      "Command chaining using && is not allowed.",
  },

  {
    regex: /\|\|/,
    reason:
      "Command chaining using || is not allowed.",
  },

  {
    regex: /[|;]/,
    reason:
      "Pipes and command separators are not allowed.",
  },

  {
    regex: /[<>]/,
    reason:
      "Shell redirection is not allowed.",
  },

  {
    regex: /`/,
    reason:
      "Command substitution is not allowed.",
  },

  {
    regex: /\$\(/,
    reason:
      "Command substitution is not allowed.",
  },

  {
    regex: /%COMSPEC%/i,
    reason:
      "Shell indirection is not allowed.",
  },

  {
    regex: /\bcmd(?:\.exe)?\s+\/c\b/i,
    reason:
      "Nested command shells are not allowed.",
  },

  {
    regex: /\bpowershell(?:\.exe)?\b/i,
    reason:
      "PowerShell execution is not allowed.",
  },

  {
    regex: /\bpwsh(?:\.exe)?\b/i,
    reason:
      "PowerShell execution is not allowed.",
  },

  {
    regex:
      /(?:^|\s)(?:sh|bash|zsh|fish)\s+-c(?:\s|$)/i,

    reason:
      "Nested command shells are not allowed.",
  },
];

// ======================================================
// NORMALIZE PATH INPUT
// ======================================================

function normalizePathInput(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

// ======================================================
// READ ALLOWED PROJECT ROOTS
// ======================================================
//
// Windows example:
//
// RELIAI_ALLOWED_PROJECT_ROOTS=C:\Projects;D:\Projects
//
// Linux/macOS:
//
// RELIAI_ALLOWED_PROJECT_ROOTS=/home/user/projects:/opt/reliai
//
// path.delimiter automatically handles:
//
// Windows -> ;
// Linux/macOS -> :
//
// ======================================================

function splitAllowedRoots(rawValue) {
  if (
    !rawValue ||
    typeof rawValue !== "string"
  ) {
    return [];
  }

  return rawValue
    .split(path.delimiter)
    .map((item) =>
      item.trim()
    )
    .filter(Boolean)
    .map((item) =>
      path.resolve(item)
    );
}

function getAllowedProjectRoots() {
  return splitAllowedRoots(
    process.env
      .RELIAI_ALLOWED_PROJECT_ROOTS ||
      ""
  );
}

// ======================================================
// CHECK WHETHER PATH IS INSIDE ROOT
// ======================================================

function isPathInsideRoot(
  targetPath,
  rootPath
) {
  const relative =
    path.relative(
      rootPath,
      targetPath
    );

  return (
    relative === "" ||
    (
      relative !== ".." &&
      !relative.startsWith(
        `..${path.sep}`
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  );
}

// ======================================================
// VALIDATE PROJECT PATH
// ======================================================

function validateProjectPath(
  projectPath,
  options = {}
) {
  const normalized =
    normalizePathInput(
      projectPath
    );

  // ====================================================
  // MISSING PATH
  // ====================================================

  if (!normalized) {
    return {
      valid: false,

      error:
        "Project path is required.",

      projectPath: "",
    };
  }

  // ====================================================
  // NULL BYTE PROTECTION
  // ====================================================

  if (
    normalized.includes(
      "\0"
    )
  ) {
    return {
      valid: false,

      error:
        "Project path contains an invalid null character.",

      projectPath: "",
    };
  }

  // ====================================================
  // RESOLVE ABSOLUTE PATH
  // ====================================================

  const absolutePath =
    path.resolve(
      normalized
    );

  // ====================================================
  // VERIFY PATH EXISTS
  // ====================================================

  let stat;

  try {
    stat =
      fs.statSync(
        absolutePath
      );
  } catch (error) {
    return {
      valid: false,

      error:
        `Project path does not exist: ${absolutePath}`,

      projectPath:
        absolutePath,
    };
  }

  // ====================================================
  // MUST BE DIRECTORY
  // ====================================================

  if (
    !stat.isDirectory()
  ) {
    return {
      valid: false,

      error:
        "Project path must point to a directory.",

      projectPath:
        absolutePath,
    };
  }

  // ====================================================
  // RESOLVE REAL PATH
  // ====================================================
  //
  // Resolving the real path prevents a symbolic link
  // from being used to escape an allowed directory.
  //
  // ====================================================

  let realPath;

  try {
    realPath =
      fs.realpathSync(
        absolutePath
      );
  } catch (error) {
    return {
      valid: false,

      error:
        "Unable to resolve the project directory safely.",

      projectPath:
        absolutePath,
    };
  }

  // ====================================================
  // ALLOWED PROJECT ROOTS
  // ====================================================

  const allowedRoots =
    getAllowedProjectRoots();

  const isProduction =
    process.env.NODE_ENV ===
    "production";

  const requireAllowedRoot =
    options.requireAllowedRoot ===
      true ||
    isProduction;

  // ====================================================
  // PRODUCTION MUST CONFIGURE ROOTS
  // ====================================================

  if (
    requireAllowedRoot &&
    allowedRoots.length === 0
  ) {
    return {
      valid: false,

      error:
        "RELIAI_ALLOWED_PROJECT_ROOTS must be configured before project execution.",

      projectPath:
        realPath,
    };
  }

  // ====================================================
  // CHECK PATH AGAINST ALLOWED ROOTS
  // ====================================================

  if (
    allowedRoots.length > 0 &&
    !allowedRoots.some(
      (root) =>
        isPathInsideRoot(
          realPath,
          root
        )
    )
  ) {
    return {
      valid: false,

      error:
        "Project path is outside the allowed ReliAI project roots.",

      projectPath:
        realPath,
    };
  }

  // ====================================================
  // VALID PATH
  // ====================================================

  return {
    valid: true,

    error: null,

    projectPath:
      realPath,
  };
}

// ======================================================
// GET EXECUTABLE FROM COMMAND
// ======================================================
//
// Examples:
//
// npm run build
// -> npm
//
// python app.py
// -> python
//
// .\gradlew.bat build
// -> .\gradlew.bat
//
// "./mvnw" clean package
// -> ./mvnw
//
// ======================================================

function getCommandExecutable(
  command
) {
  const trimmed =
    String(
      command || ""
    ).trim();

  if (!trimmed) {
    return "";
  }

  const firstToken =
    trimmed.match(
      /^(?:"([^"]+)"|'([^']+)'|(\S+))/
    );

  if (!firstToken) {
    return "";
  }

  const token =
    firstToken[1] ||
    firstToken[2] ||
    firstToken[3] ||
    "";

  return token
    .replace(/\\/g, "/")
    .toLowerCase();
}

// ======================================================
// NORMALIZE EXECUTABLE FOR ALLOWLIST
// ======================================================
//
// IMPORTANT FIX:
//
// Always compare the executable BASENAME.
//
// ./gradlew
// -> gradlew
//
// .\gradlew.bat
// -> gradlew.bat
//
// C:\something\npm.cmd
// -> npm.cmd
//
// ./mvnw
// -> mvnw
//
// ======================================================

function normalizeExecutableForAllowlist(
  executable
) {
  if (!executable) {
    return "";
  }

  const normalized =
    String(executable)
      .trim()
      .replace(/\\/g, "/")
      .toLowerCase();

  return path.posix.basename(
    normalized
  );
}

// ======================================================
// VALIDATE COMMAND
// ======================================================

function validateCommand(
  command
) {
  // ====================================================
  // MUST BE STRING
  // ====================================================

  if (
    typeof command !==
      "string" ||
    !command.trim()
  ) {
    return {
      valid: false,

      error:
        "A valid command is required.",

      command: "",

      executable: "",
    };
  }

  const normalizedCommand =
    command.trim();

  // ====================================================
  // COMMAND LENGTH LIMIT
  // ====================================================

  if (
    normalizedCommand.length >
    1000
  ) {
    return {
      valid: false,

      error:
        "Command is too long.",

      command:
        normalizedCommand,

      executable: "",
    };
  }

  // ====================================================
  // DANGEROUS COMMAND PATTERNS
  // ====================================================

  for (
    const rule of
    DANGEROUS_COMMAND_PATTERNS
  ) {
    if (
      rule.regex.test(
        normalizedCommand
      )
    ) {
      return {
        valid: false,

        error:
          `Unsafe command rejected: ${rule.reason}`,

        command:
          normalizedCommand,

        executable: "",
      };
    }
  }

  // ====================================================
  // SINGLE & PROTECTION
  // ====================================================
  //
  // Example:
  //
  // npm run build & whoami
  //
  // ====================================================

  if (
    /(^|[^&])&([^&]|$)/.test(
      normalizedCommand
    )
  ) {
    return {
      valid: false,

      error:
        "Unsafe command rejected: background/command separator '&' is not allowed.",

      command:
        normalizedCommand,

      executable: "",
    };
  }

  // ====================================================
  // DETERMINE EXECUTABLE
  // ====================================================

  const executable =
    getCommandExecutable(
      normalizedCommand
    );

  const allowlistName =
    normalizeExecutableForAllowlist(
      executable
    );

  // ====================================================
  // EXECUTABLE ALLOWLIST
  // ====================================================

  if (
    !ALLOWED_EXECUTABLES.has(
      allowlistName
    )
  ) {
    return {
      valid: false,

      error:
        `Executable is not allowed by ReliAI: ${
          executable ||
          "unknown"
        }`,

      command:
        normalizedCommand,

      executable,
    };
  }

  // ====================================================
  // COMMAND ACCEPTED
  // ====================================================

  return {
    valid: true,

    error: null,

    command:
      normalizedCommand,

    executable,

    allowlistName,
  };
}

// ======================================================
// VALIDATE COMPLETE EXECUTION REQUEST
// ======================================================

function validateExecutionRequest({
  command,
  projectPath,
} = {}) {
  // ====================================================
  // VALIDATE PROJECT PATH
  // ====================================================

  const pathResult =
    validateProjectPath(
      projectPath
    );

  if (!pathResult.valid) {
    return {
      valid: false,

      error:
        pathResult.error,

      command:
        typeof command ===
          "string"
          ? command.trim()
          : "",

      projectPath:
        pathResult.projectPath,

      executable: "",
    };
  }

  // ====================================================
  // VALIDATE COMMAND
  // ====================================================

  const commandResult =
    validateCommand(
      command
    );

  if (
    !commandResult.valid
  ) {
    return {
      valid: false,

      error:
        commandResult.error,

      command:
        commandResult.command,

      projectPath:
        pathResult.projectPath,

      executable:
        commandResult.executable ||
        "",
    };
  }

  // ====================================================
  // EVERYTHING VALID
  // ====================================================

  return {
    valid: true,

    error: null,

    command:
      commandResult.command,

    executable:
      commandResult.executable,

    allowlistName:
      commandResult.allowlistName,

    projectPath:
      pathResult.projectPath,
  };
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  ALLOWED_EXECUTABLES,

  DANGEROUS_COMMAND_PATTERNS,

  getAllowedProjectRoots,

  isPathInsideRoot,

  validateProjectPath,

  getCommandExecutable,

  normalizeExecutableForAllowlist,

  validateCommand,

  validateExecutionRequest,
};