const express = require("express");

const router = express.Router();


// ============================================================
// CONTROLLER
// ============================================================

const {
    getUsers,
    createUser,
    updateUser,
    updateUserRole,
    deactivateUser,
    reactivateUser,
    deleteUser,
    resetUserPassword
} = require(
    "../../../Admin-Desktop-Console/Desktop-Admin-App/backend/controllers/desktopadmincontroller"
);


// ============================================================
// USER MANAGEMENT
// ============================================================

// Get all users
// GET /api/admin/users
router.get(
    "/users",
    getUsers
);


// Create user
// POST /api/admin/users
router.post(
    "/users",
    createUser
);


// Update user
// PUT /api/admin/users/:id
router.put(
    "/users/:id",
    updateUser
);


// Update user role
//
// NOTE:
// The Angular service also uses:
// PUT /api/admin/users/:id
//
// Therefore this route is kept for compatibility.
// The main PUT route above handles the request.
//
// PUT /api/admin/users/:id
router.put(
    "/users/:id/role",
    updateUserRole
);


// Deactivate user
// PATCH /api/admin/users/:id/deactivate
router.patch(
    "/users/:id/deactivate",
    deactivateUser
);


// Reactivate user
// PATCH /api/admin/users/:id/reactivate
router.patch(
    "/users/:id/reactivate",
    reactivateUser
);


// Delete user
// DELETE /api/admin/users/:id
router.delete(
    "/users/:id",
    deleteUser
);


// Reset user password
// PATCH /api/admin/users/:id/reset-password
router.patch(
    "/users/:id/reset-password",
    resetUserPassword
);


// ============================================================
// EXPORT
// ============================================================

module.exports = router;