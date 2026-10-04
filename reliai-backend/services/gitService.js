const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// ======================================================
// CONFIGURATION
// ======================================================

const GIT_TIMEOUT_MS = 2 * 60 * 1000;

const WORKSPACE_ROOT =
  process.env.RELIAI_WORKSPACE_ROOT ||
  path.join(process.cwd(), "workspaces");

// ======================================================
// CUSTOM ERROR
// ======================================================

class GitServiceError extends Error {
  constructor(message, code = "GIT_ERROR") {
    super(message);

    this.name = "GitServiceError";
    this.code = code;
  }
}

// ======================================================
// ENSURE WORKSPACE ROOT
// ======================================================

function ensureWorkspaceRoot() {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, {
      recursive: true,
    });
  }

  return WORKSPACE_ROOT;
}

// ======================================================
// NORMALIZE REPOSITORY URL
// ======================================================

function normalizeRepositoryUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

// ======================================================
// VALIDATE GITHUB REPOSITORY URL
// ======================================================
//
// Step 11 initially supports public HTTPS GitHub URLs:
//
// https://github.com/owner/repository
// https://github.com/owner/repository.git
//
// We intentionally do NOT accept arbitrary hosts,
// file:// URLs, SSH URLs, shell syntax, etc.
// ======================================================

function parseGitHubRepository(repositoryUrl) {
  const normalized =
    normalizeRepositoryUrl(repositoryUrl);

  if (!normalized) {
    throw new GitServiceError(
      "GitHub repository URL is required.",
      "INVALID_REPOSITORY"
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new GitServiceError(
      "Invalid GitHub repository URL.",
      "INVALID_REPOSITORY"
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new GitServiceError(
      "Only HTTPS GitHub repository URLs are supported.",
      "INVALID_REPOSITORY_PROTOCOL"
    );
  }

  if (
    parsedUrl.hostname.toLowerCase() !==
    "github.com"
  ) {
    throw new GitServiceError(
      "Only github.com repositories are supported.",
      "INVALID_REPOSITORY_HOST"
    );
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new GitServiceError(
      "GitHub repository URL contains unsupported components.",
      "INVALID_REPOSITORY"
    );
  }

  const parts = parsedUrl.pathname
    .split("/")
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new GitServiceError(
      "Repository URL must use the format https://github.com/owner/repository.",
      "INVALID_REPOSITORY"
    );
  }

  const owner = parts[0];

  let repositoryName =
    parts[1].replace(/\.git$/i, "");

  if (!owner || !repositoryName) {
    throw new GitServiceError(
      "Invalid GitHub owner or repository name.",
      "INVALID_REPOSITORY"
    );
  }

  const safeGitHubName =
    /^[A-Za-z0-9_.-]+$/;

  if (
    !safeGitHubName.test(owner) ||
    !safeGitHubName.test(repositoryName)
  ) {
    throw new GitServiceError(
      "GitHub owner or repository name contains unsupported characters.",
      "INVALID_REPOSITORY"
    );
  }

  if (
    owner === "." ||
    owner === ".." ||
    repositoryName === "." ||
    repositoryName === ".."
  ) {
    throw new GitServiceError(
      "Invalid GitHub repository name.",
      "INVALID_REPOSITORY"
    );
  }

  const cloneUrl =
    `https://github.com/${owner}/${repositoryName}.git`;

  return {
    repositoryUrl:
      `https://github.com/${owner}/${repositoryName}`,

    cloneUrl,

    owner,
    repositoryName,
  };
}

// ======================================================
// VALIDATE BRANCH
// ======================================================

function validateBranch(branch) {
  const normalized =
    typeof branch === "string"
      ? branch.trim()
      : "";

  const finalBranch =
    normalized || "main";

  if (finalBranch.length > 200) {
    throw new GitServiceError(
      "Branch name is too long.",
      "INVALID_BRANCH"
    );
  }

  if (
    finalBranch.startsWith("-") ||
    finalBranch.startsWith("/") ||
    finalBranch.endsWith("/") ||
    finalBranch.endsWith(".") ||
    finalBranch.includes("..") ||
    finalBranch.includes("@{") ||
    finalBranch.includes("\\") ||
    finalBranch.includes(" ") ||
    finalBranch.includes("~") ||
    finalBranch.includes("^") ||
    finalBranch.includes(":") ||
    finalBranch.includes("?") ||
    finalBranch.includes("*") ||
    finalBranch.includes("[") ||
    finalBranch.includes("//")
  ) {
    throw new GitServiceError(
      "Invalid Git branch name.",
      "INVALID_BRANCH"
    );
  }

  if (
    /[\x00-\x20\x7F]/.test(
      finalBranch
    )
  ) {
    throw new GitServiceError(
      "Git branch contains invalid control characters.",
      "INVALID_BRANCH"
    );
  }

  return finalBranch;
}

// ======================================================
// SAFE WORKSPACE NAME
// ======================================================

function createWorkspaceName({
  owner,
  repositoryName,
  pipelineId,
}) {
  const safeOwner =
    owner.replace(
      /[^A-Za-z0-9_.-]/g,
      "_"
    );

  const safeRepository =
    repositoryName.replace(
      /[^A-Za-z0-9_.-]/g,
      "_"
    );

  const safePipelineId =
    String(pipelineId || "")
      .replace(
        /[^A-Za-z0-9_-]/g,
        "_"
      );

  if (!safePipelineId) {
    throw new GitServiceError(
      "Pipeline ID is required for Git workspace creation.",
      "INVALID_PIPELINE_ID"
    );
  }

  return (
    `${safeOwner}__` +
    `${safeRepository}__` +
    `${safePipelineId}`
  );
}

// ======================================================
// GET WORKSPACE PATH
// ======================================================

function getWorkspacePath({
  owner,
  repositoryName,
  pipelineId,
}) {
  const root =
    ensureWorkspaceRoot();

  const workspaceName =
    createWorkspaceName({
      owner,
      repositoryName,
      pipelineId,
    });

  const workspacePath =
    path.resolve(
      root,
      workspaceName
    );

  const resolvedRoot =
    path.resolve(root);

  const relative =
    path.relative(
      resolvedRoot,
      workspacePath
    );

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new GitServiceError(
      "Unsafe workspace path detected.",
      "UNSAFE_WORKSPACE_PATH"
    );
  }

  return workspacePath;
}

// ======================================================
// EXECUTE GIT SAFELY
// ======================================================
//
// No shell: true.
//
// Arguments are passed directly to git, preventing
// repository/branch input from becoming shell syntax.
// ======================================================

function executeGit(
  args,
  {
    cwd = undefined,
    timeout =
      GIT_TIMEOUT_MS,
    onLog = null,
  } = {}
) {
  return new Promise(
    (resolve, reject) => {
      if (
        !Array.isArray(args) ||
        args.length === 0
      ) {
        reject(
          new GitServiceError(
            "Git arguments are required.",
            "INVALID_GIT_ARGUMENTS"
          )
        );

        return;
      }

      const gitProcess =
        spawn(
          "git",
          args,
          {
            cwd,
            shell: false,
            windowsHide: true,
            env: {
              ...process.env,

              GIT_TERMINAL_PROMPT:
                "0",
            },
          }
        );

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer =
        setTimeout(() => {
          if (settled) {
            return;
          }

          try {
            gitProcess.kill();
          } catch {
            // Ignore termination error.
          }

          settled = true;

          reject(
            new GitServiceError(
              "Git operation timed out.",
              "GIT_TIMEOUT"
            )
          );
        }, timeout);

      const emitLog = (
        chunk,
        stream
      ) => {
        if (
          typeof onLog !==
          "function"
        ) {
          return;
        }

        try {
          onLog({
            chunk,
            stream,
          });
        } catch {
          // A logging callback must never
          // break Git execution.
        }
      };

      gitProcess.stdout.on(
        "data",
        (data) => {
          const chunk =
            data.toString();

          stdout += chunk;

          emitLog(
            chunk,
            "stdout"
          );
        }
      );

      gitProcess.stderr.on(
        "data",
        (data) => {
          const chunk =
            data.toString();

          stderr += chunk;

          emitLog(
            chunk,
            "stderr"
          );
        }
      );

      gitProcess.on(
        "error",
        (error) => {
          if (settled) {
            return;
          }

          clearTimeout(timer);
          settled = true;

          if (
            error.code ===
            "ENOENT"
          ) {
            reject(
              new GitServiceError(
                "Git is not installed or is not available in PATH.",
                "GIT_NOT_INSTALLED"
              )
            );

            return;
          }

          reject(
            new GitServiceError(
              `Unable to start Git: ${error.message}`,
              "GIT_START_ERROR"
            )
          );
        }
      );

      gitProcess.on(
        "close",
        (code) => {
          if (settled) {
            return;
          }

          clearTimeout(timer);
          settled = true;

          if (code !== 0) {
            const message =
              stderr.trim() ||
              stdout.trim() ||
              `Git exited with code ${code}.`;

            reject(
              new GitServiceError(
                message,
                "GIT_COMMAND_FAILED"
              )
            );

            return;
          }

          resolve({
            success: true,
            code,
            stdout:
              stdout.trim(),
            stderr:
              stderr.trim(),
          });
        }
      );
    }
  );
}

// ======================================================
// CHECK GIT INSTALLATION
// ======================================================

async function checkGitInstallation() {
  const result =
    await executeGit([
      "--version",
    ]);

  return {
    installed: true,
    version:
      result.stdout,
  };
}

// ======================================================
// CHECK WHETHER DIRECTORY IS A GIT REPOSITORY
// ======================================================

async function isGitRepository(
  workspacePath
) {
  if (
    !workspacePath ||
    !fs.existsSync(workspacePath)
  ) {
    return false;
  }

  try {
    const result =
      await executeGit(
        [
          "rev-parse",
          "--is-inside-work-tree",
        ],
        {
          cwd:
            workspacePath,
        }
      );

    return (
      result.stdout.trim() ===
      "true"
    );
  } catch {
    return false;
  }
}

// ======================================================
// REMOVE WORKSPACE
// ======================================================

function removeWorkspace(
  workspacePath
) {
  if (
    !workspacePath ||
    !fs.existsSync(workspacePath)
  ) {
    return;
  }

  const resolvedRoot =
    path.resolve(
      ensureWorkspaceRoot()
    );

  const resolvedWorkspace =
    path.resolve(
      workspacePath
    );

  const relative =
    path.relative(
      resolvedRoot,
      resolvedWorkspace
    );

  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new GitServiceError(
      "Refusing to remove unsafe workspace path.",
      "UNSAFE_WORKSPACE_PATH"
    );
  }

  fs.rmSync(
    resolvedWorkspace,
    {
      recursive: true,
      force: true,
    }
  );
}

// ======================================================
// CLONE REPOSITORY
// ======================================================

async function cloneRepository({
  cloneUrl,
  branch,
  workspacePath,
  onLog = null,
}) {
  if (
    fs.existsSync(
      workspacePath
    )
  ) {
    removeWorkspace(
      workspacePath
    );
  }

  const parentDirectory =
    path.dirname(
      workspacePath
    );

  fs.mkdirSync(
    parentDirectory,
    {
      recursive: true,
    }
  );

  await executeGit(
    [
      "clone",

      "--branch",
      branch,

      "--single-branch",

      "--",

      cloneUrl,
      workspacePath,
    ],
    {
      cwd:
        parentDirectory,

      onLog,
    }
  );

  return workspacePath;
}

// ======================================================
// VERIFY REMOTE
// ======================================================

async function getOriginUrl(
  workspacePath
) {
  const result =
    await executeGit(
      [
        "remote",
        "get-url",
        "origin",
      ],
      {
        cwd:
          workspacePath,
      }
    );

  return result.stdout.trim();
}

// ======================================================
// FETCH REPOSITORY
// ======================================================

async function fetchRepository({
  workspacePath,
  onLog = null,
}) {
  await executeGit(
    [
      "fetch",
      "--prune",
      "origin",
    ],
    {
      cwd:
        workspacePath,

      onLog,
    }
  );
}

// ======================================================
// CHECKOUT BRANCH
// ======================================================

async function checkoutBranch({
  workspacePath,
  branch,
  onLog = null,
}) {
  await executeGit(
    [
      "checkout",
      "-B",
      branch,
      `origin/${branch}`,
    ],
    {
      cwd:
        workspacePath,

      onLog,
    }
  );
}

// ======================================================
// RESET TO REMOTE BRANCH
// ======================================================

async function resetToRemoteBranch({
  workspacePath,
  branch,
  onLog = null,
}) {
  await executeGit(
    [
      "reset",
      "--hard",
      `origin/${branch}`,
    ],
    {
      cwd:
        workspacePath,

      onLog,
    }
  );
}

// ======================================================
// CLEAN WORKSPACE
// ======================================================

async function cleanWorkspace({
  workspacePath,
  onLog = null,
}) {
  await executeGit(
    [
      "clean",
      "-fd",
    ],
    {
      cwd:
        workspacePath,

      onLog,
    }
  );
}

// ======================================================
// GET COMMIT SHA
// ======================================================

async function getCommitId(
  workspacePath
) {
  const result =
    await executeGit(
      [
        "rev-parse",
        "HEAD",
      ],
      {
        cwd:
          workspacePath,
      }
    );

  const commitId =
    result.stdout.trim();

  if (
    !/^[a-f0-9]{40}$/i.test(
      commitId
    )
  ) {
    throw new GitServiceError(
      "Git returned an invalid commit SHA.",
      "INVALID_COMMIT_ID"
    );
  }

  return commitId;
}

// ======================================================
// PREPARE GITHUB WORKSPACE
// ======================================================

async function prepareGitHubWorkspace({
  repository,
  branch = "main",
  pipelineId,
  onLog = null,
}) {
  const parsedRepository =
    parseGitHubRepository(
      repository
    );

  const safeBranch =
    validateBranch(branch);

  const workspacePath =
    getWorkspacePath({
      owner:
        parsedRepository.owner,

      repositoryName:
        parsedRepository.repositoryName,

      pipelineId,
    });

  const log = (
    message
  ) => {
    if (
      typeof onLog ===
      "function"
    ) {
      onLog({
        chunk:
          `${message}\n`,

        stream:
          "system",
      });
    }
  };

  log(
    `[GIT] Preparing ${parsedRepository.owner}/${parsedRepository.repositoryName}`
  );

  log(
    `[GIT] Branch: ${safeBranch}`
  );

  let existingRepository =
    await isGitRepository(
      workspacePath
    );

  // ----------------------------------------------------
  // Existing directory that is not a valid repository.
  // Remove it and perform a clean clone.
  // ----------------------------------------------------

  if (
    fs.existsSync(
      workspacePath
    ) &&
    !existingRepository
  ) {
    log(
      "[GIT] Existing workspace is invalid. Recreating it."
    );

    removeWorkspace(
      workspacePath
    );

    existingRepository =
      false;
  }

  // ----------------------------------------------------
  // Existing repository
  // ----------------------------------------------------

  if (existingRepository) {
    const currentOrigin =
      await getOriginUrl(
        workspacePath
      );

    const normalizedOrigin =
      currentOrigin.replace(
        /\.git$/i,
        ""
      );

    const expectedOrigin =
      parsedRepository.repositoryUrl.replace(
        /\.git$/i,
        ""
      );

    if (
      normalizedOrigin !==
      expectedOrigin
    ) {
      log(
        "[GIT] Repository origin changed. Re-cloning workspace."
      );

      removeWorkspace(
        workspacePath
      );

      existingRepository =
        false;
    }
  }

  // ----------------------------------------------------
  // Clone
  // ----------------------------------------------------

  if (!existingRepository) {
    log(
      "[GIT] Cloning repository..."
    );

    await cloneRepository({
      cloneUrl:
        parsedRepository.cloneUrl,

      branch:
        safeBranch,

      workspacePath,

      onLog,
    });

    log(
      "[GIT] Repository cloned successfully."
    );
  } else {
    // --------------------------------------------------
    // Update
    // --------------------------------------------------

    log(
      "[GIT] Existing repository found."
    );

    log(
      "[GIT] Fetching latest changes..."
    );

    await fetchRepository({
      workspacePath,
      onLog,
    });

    log(
      "[GIT] Checking out branch..."
    );

    await checkoutBranch({
      workspacePath,

      branch:
        safeBranch,

      onLog,
    });

    log(
      "[GIT] Resetting workspace to remote branch..."
    );

    await resetToRemoteBranch({
      workspacePath,

      branch:
        safeBranch,

      onLog,
    });

    log(
      "[GIT] Cleaning workspace..."
    );

    await cleanWorkspace({
      workspacePath,
      onLog,
    });
  }

  // ----------------------------------------------------
  // Commit SHA
  // ----------------------------------------------------

  const commitId =
    await getCommitId(
      workspacePath
    );

  log(
    `[GIT] Commit: ${commitId}`
  );

  log(
    "[GIT] Workspace ready."
  );

  return {
    success: true,

    sourceType:
      "GITHUB",

    repository:
      parsedRepository.repositoryUrl,

    cloneUrl:
      parsedRepository.cloneUrl,

    owner:
      parsedRepository.owner,

    repositoryName:
      parsedRepository.repositoryName,

    branch:
      safeBranch,

    workspacePath,

    commitId,
  };
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  GitServiceError,

  WORKSPACE_ROOT,

  normalizeRepositoryUrl,
  parseGitHubRepository,
  validateBranch,

  ensureWorkspaceRoot,
  getWorkspacePath,

  executeGit,
  checkGitInstallation,
  isGitRepository,

  getOriginUrl,
  getCommitId,

  cloneRepository,
  fetchRepository,
  checkoutBranch,
  resetToRemoteBranch,
  cleanWorkspace,

  prepareGitHubWorkspace,
};