const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ==============================
// Create uploads folder
// ==============================
const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ==============================
// Storage Configuration
// ==============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const fileName = `${Date.now()}-${file.originalname}`;
    cb(null, fileName);
  },
});

// ==============================
// Allowed Extensions
// ==============================
const allowedExtensions = [
  ".zip",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".java",
  ".py",
  ".cpp",
  ".c",
  ".json",
  ".html",
  ".css",
  ".md",
  ".txt",
];

// ==============================
// File Filter
// ==============================
const fileFilter = (req, file, cb) => {
  console.log("=================================");
  console.log("Uploading File...");
  console.log("Original Name :", file.originalname);
  console.log("Mime Type     :", file.mimetype);

  const ext = path.extname(file.originalname).toLowerCase();

  console.log("Extension     :", ext);

  if (allowedExtensions.includes(ext)) {
    console.log("Status        : ACCEPTED");
    console.log("=================================");
    cb(null, true);
  } else {
    console.log("Status        : REJECTED");
    console.log("=================================");

    cb(new Error(`Unsupported file type: ${ext}`), false);
  }
};

// ==============================
// Export Multer
// ==============================
module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});