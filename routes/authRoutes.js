const express = require("express");
const jwt     = require("jsonwebtoken");
const pool    = require("../config/db");

const {
    login,
    register,
    forgotPassword,
    resetPassword,
    forceLogoutSession
} = require("../controllers/authcontroller");

const router = express.Router();


// ============================================================
// LOGIN
// ============================================================

router.post(
    "/login",
    login
);


// ============================================================
// REGISTER
// ============================================================

router.post(
    "/register",
    register
);


// ============================================================
// FORGOT PASSWORD
// ============================================================

router.post(
    "/forgot-password",
    forgotPassword
);


// ============================================================
// RESET PASSWORD
// ============================================================

router.post(
    "/reset-password",
    resetPassword
);


// ============================================================
// FORCE LOGOUT EXISTING SESSION
// Called when the user accepts the "already logged in" popup
// ============================================================

router.post(
    "/force-logout-session",
    forceLogoutSession
);


// ============================================================
// VALIDATE SESSION
// Called periodically by the dashboard to check if the
// session is still active (not invalidated from another device).
// Returns { valid: true } or 401.
// ============================================================

router.post(
    "/validate-session",
    async (req, res) => {

        try {

            const { token } = req.body;

            if (!token) {
                return res.status(400).json({ message: "token is required" });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (!decoded.session_id) {
                // Old token without session_id — treat as valid
                return res.json({ valid: true });
            }

            const result = await pool.query(
                `SELECT is_active
                 FROM   user_sessions
                 WHERE  session_id = $1`,
                [decoded.session_id]
            );

            if (
                result.rows.length === 0 ||
                result.rows[0].is_active === false
            ) {
                return res.status(401).json({
                    message: "Session has been invalidated. Please log in again."
                });
            }

            return res.json({ valid: true });

        } catch (error) {

            return res.status(401).json({
                message: "Invalid or expired token"
            });

        }

    }
);


module.exports = router;