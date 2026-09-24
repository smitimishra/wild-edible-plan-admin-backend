const express = require("express");

const router = express.Router();

const {
    createPlant
} = require("../controllers/plantcontroller");

const authenticateToken =
    require("../middleware/authMiddleware");

const upload =
    require("../middleware/plantUploadMiddleware");


// ============================================================
// CREATE PLANT SUBMISSION
// ============================================================

router.post(
    "/",
    authenticateToken,
    upload.single("photo"),
    createPlant
);

module.exports = router;