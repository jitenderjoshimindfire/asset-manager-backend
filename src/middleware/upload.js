const multer = require("multer");
const path = require("path");

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = {
    "image/jpeg": true,
    "image/jpg": true,
    "image/png": true,
    "image/gif": true,
    "image/webp": true,
    "video/mp4": true,
    "video/avi": true,
    "video/mov": true,
    "video/webm": true,
    "video/wmv": true,
    "application/pdf": true,
    "text/plain": true,
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
    files: 10, // Maximum number of files
  },
  fileFilter: fileFilter,
});

// Enhanced error handling middleware for multer with detailed logging
const handleUploadErrors = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field",
      });
    }
    if (error.code === "LIMIT_PART_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many form parts",
      });
    }

    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.code}`,
    });
  } else if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  next();
};

module.exports = {
  upload,
  handleUploadErrors,
};
