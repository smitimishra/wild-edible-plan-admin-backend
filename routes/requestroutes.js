const express = require("express");
const upload = require("../middleware/uploadMiddleware");

const {
    createRequest,
    managerApproveRequest,
    hrApproveRequest,
    rejectRequest,
    getAllRequests,
    getMyRequests,
    getPendingManagerRequests,
    getPendingHRRequests,
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
// GET PENDING MANAGER REQUESTS
// ============================================================

router.get(
    "/pending-manager",
    authenticateToken,
    authorizeRoles("MANAGER"),
    getPendingManagerRequests
);


// ============================================================
// GET PENDING HR REQUESTS
// ============================================================

router.get(
    "/pending-hr",
    authenticateToken,
    authorizeRoles("HR"),
    getPendingHRRequests
);


// ============================================================
// DOWNLOAD REQUEST IMAGE
//
// Example:
// GET /api/requests/attachments/15/download
// ============================================================

router.get(
    "/attachments/:id/download",
    authenticateToken,
    authorizeRoles("MANAGER", "HR", "EMPLOYEE"),
    downloadAttachment
);


// ============================================================
// EMPLOYEE SUBMITS PLANT REQUEST
//
// multipart/form-data
//
// Fields:
// plant_name
// common_name
// request_type
//
// Images:
// images
//
// Maximum:
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
// MANAGER APPROVES REQUEST
//
// Body:
// scientific_name
// description
// comments
// ============================================================

router.put(
    "/:id/manager-approve",
    authenticateToken,
    authorizeRoles("MANAGER"),
    managerApproveRequest
);


// ============================================================
// HR APPROVES REQUEST
//
// Body:
// comments
// ============================================================

router.put(
    "/:id/hr-approve",
    authenticateToken,
    authorizeRoles("HR"),
    hrApproveRequest
);


// ============================================================
// MANAGER / HR REJECT REQUEST
//
// Body:
// comments
// ============================================================

router.put(
    "/:id/reject",
    authenticateToken,
    authorizeRoles("MANAGER", "HR"),
    rejectRequest
);


// ============================================================
// GET REQUEST DETAILS
//
// Includes:
// - Request
// - Plant information
// - Images
// - Approval history
// - Permanent plant_details record if approved
// ============================================================

router.get(
    "/:id",
    authenticateToken,
    getRequestById
);

// ============================================================
// ADD IMAGE TO EXISTING REQUEST
// MANAGER / HR
//
// multipart/form-data
//
// Field:
// image
//
// Maximum:
// 1 image per request
// ============================================================

router.post(
    "/:id/attachments",
    authenticateToken,
    authorizeRoles("MANAGER", "HR"),
    upload.single("image"),
    addAttachment
);

// ============================================================
// DELETE REQUEST IMAGE
// MANAGER / HR
//
// Example:
// DELETE /api/requests/attachments/15
// ============================================================

router.delete(
    "/attachments/:id",
    authenticateToken,
    authorizeRoles("MANAGER", "HR"),
    deleteAttachment
);


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;