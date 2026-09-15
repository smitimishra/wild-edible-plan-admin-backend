const express = require("express");

const {
    getLoggedInDevices,
    updateSessionLocation,
    logoutAllDevices
} = require("../controllers/sessionController");

const authenticateToken =
    require("../middleware/authMiddleware");

const authorizeRoles =
    require("../middleware/roleMiddleware");

const router = express.Router();


// ============================================================
// GET LOGGED-IN DEVICES
// ADMIN ONLY
// ============================================================

router.get(
    "/logged-in-devices",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getLoggedInDevices
);


// ============================================================
// UPDATE CURRENT SESSION LOCATION
// ADMIN ONLY
// ============================================================

router.post(
    "/update-location",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateSessionLocation
);


// ============================================================
// LOGOUT ALL DEVICES
// ADMIN ONLY
// ============================================================

router.post(
    "/logout-all",
    authenticateToken,
    authorizeRoles("ADMIN"),
    logoutAllDevices
);


module.exports = router;