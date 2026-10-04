const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");

// =====================================
// Extract ZIP File
// =====================================
const extractZip = async (zipFilePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(zipFilePath)) {
      throw new Error("ZIP file not found");
    }

    // Create extraction folder
    const extractFolder = path.join(
      __dirname,
      "../extracted",
      Date.now().toString()
    );

    fs.mkdirSync(extractFolder, {
      recursive: true,
    });

    // Read ZIP
    const zip = new AdmZip(zipFilePath);

    // Extract
    zip.extractAllTo(extractFolder, true);

    console.log("=================================");
    console.log("ZIP Extracted Successfully");
    console.log("ZIP :", zipFilePath);
    console.log("Extracted :", extractFolder);
    console.log("=================================");

    return extractFolder;

  } catch (error) {
    console.error("ZIP EXTRACTION ERROR:", error);

    throw error;
  }
};

module.exports = {
  extractZip,
};