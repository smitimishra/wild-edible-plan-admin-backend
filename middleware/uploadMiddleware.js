const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Upload directory
const uploadDirectory = path.join(
    __dirname,
    "..",
    "uploads",
    "requests"
);

// Create upload directory if it doesn't exist
if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirectory);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname);

        const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;

        cb(null, uniqueName);
    }
});

// Allow image files only
const fileFilter = (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed"), false);
    }
};

// Multer configuration
const upload = multer({
    storage: storage,

    fileFilter: fileFilter,

    limits: {
        files: 10,
        fileSize: 5 * 1024 * 1024 // 5 MB per image
    }
});

module.exports = upload;