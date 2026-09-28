const express = require("express");

const {
    getAllFeedback,
    getFeedbackById,
    updateFeedbackStatus,
    updateFeedbackResponse,
    deleteFeedback
} = require("../controllers/feedbackController");

const router = express.Router();


// ============================================================
// ADMIN - FEEDBACK MANAGEMENT
// ============================================================

// GET ALL FEEDBACK
// GET /api/admin/feedback
router.get(
    "/",
    getAllFeedback
);


// GET FEEDBACK BY ID
// GET /api/admin/feedback/:id
router.get(
    "/:id",
    getFeedbackById
);


// UPDATE FEEDBACK STATUS
// PATCH /api/admin/feedback/:id/status
router.patch(
    "/:id/status",
    updateFeedbackStatus
);


// UPDATE ADMIN RESPONSE
// PATCH /api/admin/feedback/:id/response
router.patch(
    "/:id/response",
    updateFeedbackResponse
);


// DELETE FEEDBACK
// DELETE /api/admin/feedback/:id
router.delete(
    "/:id",
    deleteFeedback
);


module.exports = router;