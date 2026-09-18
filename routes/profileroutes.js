const express = require("express");

const {
    getCurrentUser
} = require("../controllers/profilecontroller");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// ============================================================
// GET CURRENT USER PROFILE
// ============================================================

router.get(
    "/me",
    authenticateToken,
    getCurrentUser
);


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;