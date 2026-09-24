const express = require("express");
const {
    getUsers,
    createUser,
    updateUser,
    deactivateUser,
    reactivateUser,
    deleteUser,
    resetUserPassword,

    // Blocked users
    getBlockedUsers,
    unblockUser,
    blockUser,


    getHierarchy,
    addHierarchyLevel,
    updateHierarchyLevel,
    deleteHierarchyLevel

} = require("../controllers/admincontroller");

const {
    getSettings,
    updateSetting
} = require("../controllers/settingscontroller");

const { getHealth } = require("../controllers/healthcontroller");


const authenticateToken =
    require("../middleware/authMiddleware");


const authorizeRoles =
    require("../middleware/roleMiddleware");


const router = express.Router();

router.get(
    "/health",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getHealth
);


// ============================================================
// USER MANAGEMENT
// ============================================================


// ============================================================
// GET ALL USERS
// ADMIN ONLY
// ============================================================

router.get(

    "/users",

    authenticateToken,

    authorizeRoles("ADMIN"),

    getUsers

);


// ============================================================
// CREATE USER
// ADMIN ONLY
// ============================================================

router.post(

    "/users",

    authenticateToken,

    authorizeRoles("ADMIN"),

    createUser

);


// ============================================================
// UPDATE USER
// ADMIN ONLY
// ============================================================

router.put(

    "/users/:id",

    authenticateToken,

    authorizeRoles("ADMIN"),

    updateUser

);


// ============================================================
// DEACTIVATE USER
// ADMIN ONLY
// ============================================================

router.patch(

    "/users/:id/deactivate",

    authenticateToken,

    authorizeRoles("ADMIN"),

    deactivateUser

);


// ============================================================
// REACTIVATE USER
// ADMIN ONLY
// ============================================================

router.patch(

    "/users/:id/reactivate",

    authenticateToken,

    authorizeRoles("ADMIN"),

    reactivateUser

);


// ============================================================
// PERMANENTLY DELETE USER
// ADMIN ONLY
// ============================================================

router.delete(

    "/users/:id",

    authenticateToken,

    authorizeRoles("ADMIN"),

    deleteUser

);


// ============================================================
// APPROVAL WORKFLOW HIERARCHY
// ============================================================


// ============================================================
// GET APPROVAL WORKFLOW HIERARCHY
// ADMIN ONLY
// ============================================================

router.get(

    "/hierarchy",

    authenticateToken,

    authorizeRoles("ADMIN"),

    getHierarchy

);


// ============================================================
// ADD APPROVAL WORKFLOW LEVEL
// ADMIN ONLY
// ============================================================

router.post(

    "/hierarchy",

    authenticateToken,

    authorizeRoles("ADMIN"),

    addHierarchyLevel

);


// ============================================================
// UPDATE APPROVAL WORKFLOW LEVEL
// ADMIN ONLY
// ============================================================

router.put(

    "/hierarchy/:id",

    authenticateToken,

    authorizeRoles("ADMIN"),

    updateHierarchyLevel

);


// ============================================================
// DELETE APPROVAL WORKFLOW LEVEL
// ADMIN ONLY
// ============================================================

router.delete(

    "/hierarchy/:id",

    authenticateToken,

    authorizeRoles("ADMIN"),

    deleteHierarchyLevel

);

// ============================================================
// RESET USER PASSWORD
// ADMIN ONLY
// ============================================================
console.log("REGISTERING RESET PASSWORD ROUTE");
router.patch(

    "/users/:id/reset-password",

    authenticateToken,

    authorizeRoles("ADMIN"),

    resetUserPassword

);

console.log("RESET PASSWORD ROUTE LOADED");

// ============================================================
// SYSTEM SETTINGS
// ============================================================

// GET ALL SETTINGS
router.get(
    "/settings",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getSettings
);

// UPDATE A SETTING
router.patch(
    "/settings/:key",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updateSetting
);
// ============================================================
// BLOCKED USERS
// ADMIN ONLY
// ============================================================
//Block a user
router.post(
    "/blocked-users/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    blockUser
);
// GET ALL BLOCKED USERS
router.get(
    "/blocked-users",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getBlockedUsers
);


// UNBLOCK USER
router.delete(
    "/blocked-users/:userId",
    authenticateToken,
    authorizeRoles("ADMIN"),
    unblockUser
);


module.exports = router;
