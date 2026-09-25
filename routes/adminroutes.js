const express = require("express");

const {

    // ========================================================
    // USER MANAGEMENT
    // ========================================================

    getUsers,
    createUser,
    updateUser,
    deactivateUser,
    reactivateUser,
    deleteUser,



    // Plant management
    getPlants,
    getPlantById,
    updatePlant,
    deletePlant,

      // ========================================================
    // PERMANENT DELETE - PLANT CONTENT
    // ========================================================

    getPermanentDeletePlants,
    getPermanentDeletePlantById,
    permanentlyDeletePlant,



    // ========================================================
    // APPROVAL WORKFLOW HIERARCHY
    // ========================================================

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
// PERMANENT DELETE - PLANT CONTENT
// ADMIN ONLY
// ============================================================

// GET ALL SOFT-DELETED PLANTS

router.get(
    "/permanent-delete",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getPermanentDeletePlants
);


// GET ONE SOFT-DELETED PLANT

router.get(
    "/permanent-delete/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getPermanentDeletePlantById
);


// PERMANENTLY DELETE PLANT

router.delete(
    "/permanent-delete/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    permanentlyDeletePlant
);

// ==================== PLANT MANAGEMENT ====================

// Get all active plants
router.get(
    "/plants",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getPlants
);

// Get one active plant by ID
router.get(
    "/plants/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    getPlantById
);

// Update an active plant
router.put(
    "/plants/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    updatePlant
);

// Soft-delete an active plant
router.delete(
    "/plants/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    deletePlant
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


module.exports = router;