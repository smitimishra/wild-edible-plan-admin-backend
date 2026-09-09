const express = require("express");

const upload = require("../middleware/uploadMiddleware");

const {
    createRequest,

    reviewerApproveRequest,

    hrApproveRequest,

    rejectRequest,

    getAllRequests,

    getMyRequests,

    getPendingReviewerRequests,

    getPendingHRRequests,

    getApprovedRequests,

    getRequestById,

    downloadAttachment,

    addAttachment,

    deleteAttachment

} = require("../controllers/requestcontroller");

const authenticateToken = require("../middleware/authMiddleware");

const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();


// ============================================================
// GET ALL REQUESTS
// ============================================================

router.get(
    "/",
    authenticateToken,
    getAllRequests
);


// ============================================================
// GET EMPLOYEE'S OWN REQUESTS
// ============================================================

router.get(
    "/my",
    authenticateToken,
    authorizeRoles("EMPLOYEE"),
    getMyRequests
);


// ============================================================
// GET PENDING REVIEWER REQUESTS
//
// Workflow:
//
// EMPLOYEE
//    ↓
// PENDING_REVIEWER
//
// Only REVIEWER can access these requests.
// ============================================================

router.get(
    "/pending-reviewer",
    authenticateToken,
    authorizeRoles("REVIEWER"),
    getPendingReviewerRequests
);


// ============================================================
// GET PENDING HR REQUESTS
//
// Workflow:
//
// REVIEWER APPROVES
//        ↓
// PENDING_HR
//
// Only HR can access these requests.
// ============================================================

router.get(
    "/pending-hr",
    authenticateToken,
    authorizeRoles("HR"),
    getPendingHRRequests
);


// ============================================================
// GET APPROVED REQUESTS
//
// Used for displaying completed/approved plant requests.
// ============================================================

router.get(
    "/approved",
    authenticateToken,
    getApprovedRequests
);


// ============================================================
// DOWNLOAD REQUEST IMAGE
//
// Example:
//
// GET /api/requests/attachments/15/download
//
// Allowed:
//
// REVIEWER
// HR
// EMPLOYEE
// ============================================================

router.get(
    "/attachments/:id/download",
    authenticateToken,
    authorizeRoles(
        "REVIEWER",
        "HR",
        "EMPLOYEE"
    ),
    downloadAttachment
);


// ============================================================
// EMPLOYEE SUBMITS PLANT REQUEST
//
// multipart/form-data
//
// Fields:
//
// plant_name
// common_name
// request_type
// request_data
//
// Images:
//
// images
//
// Maximum:
//
// 10 images
// ============================================================

router.post(
    "/",
    authenticateToken,
    authorizeRoles("EMPLOYEE"),
    upload.array("images", 10),
    createRequest
);


// ============================================================
// REVIEWER APPROVES REQUEST
//
// Workflow:
//
// PENDING_REVIEWER
//        ↓
// REVIEWER APPROVES
//        ↓
// PENDING_HR
//
// Body:
//
// scientific_name
// description
// comments
// ============================================================

router.put(
    "/:id/reviewer-approve",
    authenticateToken,
    authorizeRoles("REVIEWER"),
    reviewerApproveRequest
);


// ============================================================
// HR APPROVES REQUEST
//
// Workflow:
//
// PENDING_HR
//      ↓
// HR APPROVES
//      ↓
// APPROVED
//
// Body:
//
// comments
// ============================================================

router.put(
    "/:id/hr-approve",
    authenticateToken,
    authorizeRoles("HR"),
    hrApproveRequest
);


// ============================================================
// REVIEWER / HR REJECT REQUEST
//
// Reviewer:
//
// PENDING_REVIEWER → REJECTED
//
// HR:
//
// PENDING_HR → REJECTED
//
// Body:
//
// comments
// ============================================================

router.put(
    "/:id/reject",
    authenticateToken,
    authorizeRoles(
        "REVIEWER",
        "HR"
    ),
    rejectRequest
);


// ============================================================
// GET REQUEST DETAILS
//
// Includes:
//
// - Request
// - Plant information
// - Images
// - Approval history
//
// Example:
//
// GET /api/requests/25
// ============================================================

router.get(
    "/:id",
    authenticateToken,
    getRequestById
);


// ============================================================
// ADD IMAGE TO EXISTING REQUEST
//
// REVIEWER / HR
//
// multipart/form-data
//
// Field:
//
// image
//
// Maximum:
//
// 1 image per request
// ============================================================

router.post(
    "/:id/attachments",
    authenticateToken,
    authorizeRoles(
        "REVIEWER",
        "HR"
    ),
    upload.single("image"),
    addAttachment
);


// ============================================================
// DELETE REQUEST IMAGE
//
// REVIEWER / HR
//
// Example:
//
// DELETE /api/requests/attachments/15
// ============================================================

router.delete(
    "/attachments/:id",
    authenticateToken,
    authorizeRoles(
        "REVIEWER",
        "HR"
    ),
    deleteAttachment
);


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;