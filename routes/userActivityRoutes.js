const express = require("express");

const {
    getUserActivity
} = require("../../../Admin-Desktop-Console/Desktop-Admin-App/backend/controllers/userActivitycontroller");


const router = express.Router();


// ============================================================
// USER ACTIVITY
// ============================================================
//
// GET /api/admin/users/:id/activity
//
// Admin authentication is applied by the parent
// /api/admin route in server.js.
// ============================================================

router.get(
    "/users/:id/activity",
    getUserActivity
);


module.exports = router;