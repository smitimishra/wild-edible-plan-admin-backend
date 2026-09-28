const express = require("express");

const {
    submitFeedback
} = require("../controllers/feedbackController");

const authenticateToken = require("../middleware/authenticateToken");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();


// ============================================================
// REVIEWER - SUBMIT FEEDBACK
// ============================================================

// POST /api/feedback
//
// Authentication:
// 1. Verify JWT
// 2. Verify active session
// 3. Verify user has REVIEWER role
//
// The authenticated user ID is obtained from:
// req.authenticatedUser.user_id
// ============================================================

router.post(
    "/",
    authenticateToken,
    authorizeRoles("REVIEWER"),
    submitFeedback
);


module.exports = router;