const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// ============================================
// Create ZIP from Folder
// ============================================
const createFixedZip = (sourceFolder, outputZip) => {
  return new Promise((resolve, reject) => {

    if (!fs.existsSync(sourceFolder)) {
      return reject(new Error("Folder not found"));
    }

    const output = fs.createWriteStream(outputZip);

    const archive = archiver("zip", {
      zlib: {
        level: 9,
      },
    });

    output.on("close", () => {
      console.log(
        `ZIP Created (${archive.pointer()} bytes)`
      );

      resolve(outputZip);
    });

    archive.on("error", reject);

    archive.pipe(output);

    archive.directory(sourceFolder, false);

    archive.finalize();
  });
};

module.exports = {
  createFixedZip,
};