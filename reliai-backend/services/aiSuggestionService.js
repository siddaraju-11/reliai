// ======================================================
// AI Suggestion Service
// Generates Fix Suggestions & Auto Fixes
// ======================================================

const generateSuggestion = (issue) => {
  switch (issue.type) {
    // ==================================================
    // Debug Code
    // ==================================================
    case "Debug Code":
      return {
        title: "Remove Debug Statement",
        explanation:
          "console.log() statements should not be present in production because they expose internal information and reduce performance.",
        recommendation:
          "Delete the console.log() statement or replace it with a proper logger.",
        autoFix: "Remove the console.log() line.",
        confidence: "99%",
      };

    // ==================================================
    // TODO
    // ==================================================
    case "TODO":
      return {
        title: "Complete Pending Task",
        explanation:
          "A TODO comment indicates unfinished functionality.",
        recommendation:
          "Implement the missing feature or remove the TODO comment.",
        autoFix:
          "Complete the implementation before deployment.",
        confidence: "95%",
      };

    // ==================================================
    // FIXME
    // ==================================================
    case "FIXME":
      return {
        title: "Fix Existing Bug",
        explanation:
          "FIXME comments indicate known bugs that should be resolved.",
        recommendation:
          "Investigate the issue and correct the implementation.",
        autoFix:
          "Replace the faulty logic with the corrected implementation.",
        confidence: "96%",
      };

    // ==================================================
    // eval()
    // ==================================================
    case "Security":
      if (
        issue.message.toLowerCase().includes("eval")
      ) {
        return {
          title: "Avoid eval()",
          explanation:
            "eval() executes arbitrary JavaScript and can lead to Remote Code Execution attacks.",
          recommendation:
            "Use JSON.parse(), functions, or safe alternatives.",
          autoFix:
            "Replace eval() with JSON.parse() or a safe parser.",
          confidence: "100%",
        };
      }

      return {
        title: "Sensitive Information Detected",
        explanation:
          "Sensitive credentials should never be stored directly in source code.",
        recommendation:
          "Move secrets into environment variables.",
        autoFix:
          "Store credentials inside a .env file and access them using process.env.",
        confidence: "98%",
      };

    // ==================================================
    // Code Quality
    // ==================================================
    case "Code Quality":
      return {
        title: "Improve Error Handling",
        explanation:
          "Empty catch blocks hide runtime errors and make debugging difficult.",
        recommendation:
          "Log the error or return an appropriate response.",
        autoFix:
          "Add console.error(error) or throw the exception.",
        confidence: "94%",
      };

    // ==================================================
    // Default
    // ==================================================
    default:
      return {
        title: "Review Required",
        explanation:
          "This issue requires manual inspection.",
        recommendation:
          "Inspect the highlighted code carefully.",
        autoFix:
          "Manual correction required.",
        confidence: "80%",
      };
  }
};

module.exports = {
  generateSuggestion,
};