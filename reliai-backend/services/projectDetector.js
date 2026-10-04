const fs = require("fs");
const path = require("path");

// ======================================================
// Detect Project Type
// ======================================================
const detectProjectType = (projectPath) => {
  // Node.js
  if (fs.existsSync(path.join(projectPath, "package.json"))) {
    return {
      type: "node",
      name: "Node.js",
      installCommand: "npm install",
      buildCommand: "npm run build",
      testCommand: "npm test",
    };
  }

  // Java Maven
  if (fs.existsSync(path.join(projectPath, "pom.xml"))) {
    return {
      type: "maven",
      name: "Java Maven",
      installCommand: "mvn clean install",
      buildCommand: "mvn clean package",
      testCommand: "mvn test",
    };
  }

  // Java Gradle
  if (
    fs.existsSync(path.join(projectPath, "build.gradle")) ||
    fs.existsSync(path.join(projectPath, "build.gradle.kts"))
  ) {
    return {
      type: "gradle",
      name: "Java Gradle",
      installCommand: "gradle build",
      buildCommand: "gradle build",
      testCommand: "gradle test",
    };
  }

  // Python
  if (
    fs.existsSync(path.join(projectPath, "requirements.txt")) ||
    fs.existsSync(path.join(projectPath, "pyproject.toml"))
  ) {
    return {
      type: "python",
      name: "Python",
      installCommand: "pip install -r requirements.txt",
      buildCommand: "python -m compileall .",
      testCommand: "pytest",
    };
  }

  // PHP
  if (fs.existsSync(path.join(projectPath, "composer.json"))) {
    return {
      type: "php",
      name: "PHP",
      installCommand: "composer install",
      buildCommand: "composer dump-autoload",
      testCommand: "phpunit",
    };
  }

  // Go
  if (fs.existsSync(path.join(projectPath, "go.mod"))) {
    return {
      type: "go",
      name: "Go",
      installCommand: "go mod tidy",
      buildCommand: "go build",
      testCommand: "go test ./...",
    };
  }

  // Rust
  if (fs.existsSync(path.join(projectPath, "Cargo.toml"))) {
    return {
      type: "rust",
      name: "Rust",
      installCommand: "cargo build",
      buildCommand: "cargo build",
      testCommand: "cargo test",
    };
  }

  // .NET
  const files = fs.readdirSync(projectPath);

  const hasCsproj = files.some((file) => file.endsWith(".csproj"));

  if (hasCsproj) {
    return {
      type: "dotnet",
      name: ".NET",
      installCommand: "dotnet restore",
      buildCommand: "dotnet build",
      testCommand: "dotnet test",
    };
  }

  // Docker
  if (fs.existsSync(path.join(projectPath, "Dockerfile"))) {
    return {
      type: "docker",
      name: "Docker",
      installCommand: "",
      buildCommand: "docker build .",
      testCommand: "",
    };
  }

  // Unknown Project
  return {
    type: "unknown",
    name: "Unknown Project",
    installCommand: "",
    buildCommand: "",
    testCommand: "",
  };
};

// ======================================================
// Export
// ======================================================
module.exports = {
  detectProjectType,
};