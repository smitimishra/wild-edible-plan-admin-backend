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
//
// Called periodically by the Admin dashboard.
//
// Checks:
// 1. Token exists
// 2. JWT is valid
// 3. session_id exists in JWT
// 4. Session exists in user_sessions
// 5. Session is active
// 6. Session has not expired
// 7. Updates last_activity
//
// Supports both:
//     session_id  -> new format
//     sessionId   -> old format
//
// This compatibility is intentional so old tokens do not
// immediately break while the backend is being updated.
// ============================================================

router.post(
    "/validate-session",
    async (req, res) => {

        console.log("");
        console.log("==============================================");
        console.log("         VALIDATE SESSION REQUEST");
        console.log("==============================================");

        try {

            // ----------------------------------------------------
            // GET TOKEN
            // ----------------------------------------------------

            const { token } = req.body || {};

            console.log(
                "Token received:",
                token ? "YES" : "NO"
            );

            if (!token) {

                console.error(
                    "VALIDATE SESSION ERROR: Token is missing"
                );

                return res.status(400).json({
                    valid: false,
                    message: "token is required"
                });
            }


            // ----------------------------------------------------
            // VERIFY JWT
            // ----------------------------------------------------

            let decoded;

            try {

                decoded = jwt.verify(
                    token,
                    process.env.JWT_SECRET
                );

            } catch (jwtError) {

                console.error(
                    "JWT VERIFICATION FAILED:",
                    jwtError.message
                );

                return res.status(401).json({
                    valid: false,
                    message: "Invalid or expired token"
                });
            }


            // ----------------------------------------------------
            // LOG JWT INFORMATION
            // ----------------------------------------------------

            console.log(
                "JWT successfully verified:"
            );

            console.log({
                id: decoded.id,
                email: decoded.email,
                role: decoded.role,
                session_id: decoded.session_id,
                sessionId: decoded.sessionId
            });


            // ----------------------------------------------------
            // GET SESSION ID
            //
            // New tokens use:
            //     session_id
            //
            // Old tokens may contain:
            //     sessionId
            // ----------------------------------------------------

            const sessionId =
                decoded.session_id ||
                decoded.sessionId;


            // ----------------------------------------------------
            // SESSION ID REQUIRED
            // ----------------------------------------------------

            if (!sessionId) {

                console.error(
                    "VALIDATE SESSION ERROR: No session ID found in JWT"
                );

                return res.status(401).json({
                    valid: false,
                    message: "Session ID missing from token"
                });
            }


            console.log(
                "Session ID being checked:",
                sessionId
            );


            // ----------------------------------------------------
            // FIND SESSION IN DATABASE
            // ----------------------------------------------------

            const result = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    session_id,
                    is_active,
                    created_at,
                    last_activity,
                    expires_at,
                    invalidated_at,
                    invalidation_reason
                FROM public.user_sessions
                WHERE session_id = $1
                LIMIT 1
                `,
                [sessionId]
            );


            console.log(
                "Session rows found:",
                result.rows.length
            );


            // ----------------------------------------------------
            // SESSION DOES NOT EXIST
            // ----------------------------------------------------

            if (result.rows.length === 0) {

                console.error(
                    "VALIDATE SESSION ERROR: Session not found in database"
                );

                return res.status(401).json({
                    valid: false,
                    message: "Session not found"
                });
            }


            const session = result.rows[0];


            // ----------------------------------------------------
            // LOG DATABASE SESSION
            // ----------------------------------------------------

            console.log(
                "Database session:"
            );

            console.log({
                id: session.id,
                user_id: session.user_id,
                session_id: session.session_id,
                is_active: session.is_active,
                created_at: session.created_at,
                last_activity: session.last_activity,
                expires_at: session.expires_at,
                invalidated_at: session.invalidated_at,
                invalidation_reason: session.invalidation_reason
            });


            // ----------------------------------------------------
            // CHECK ACTIVE STATUS
            // ----------------------------------------------------

            if (session.is_active !== true) {

                console.error(
                    "VALIDATE SESSION ERROR: Session is inactive"
                );

                console.error(
                    "Invalidation reason:",
                    session.invalidation_reason
                );

                return res.status(401).json({
                    valid: false,
                    message:
                        "Session has been invalidated. Please log in again."
                });
            }


            // ----------------------------------------------------
            // CHECK DATABASE EXPIRATION
            // ----------------------------------------------------

            if (
                session.expires_at &&
                new Date(session.expires_at).getTime() <= Date.now()
            ) {

                console.error(
                    "VALIDATE SESSION ERROR: Session has expired"
                );

                await pool.query(
                    `
                    UPDATE public.user_sessions
                    SET
                        is_active = false,
                        invalidated_at = CURRENT_TIMESTAMP,
                        invalidation_reason = 'session_expired'
                    WHERE session_id = $1
                    `,
                    [sessionId]
                );

                return res.status(401).json({
                    valid: false,
                    message: "Session expired"
                });
            }


            // ----------------------------------------------------
            // UPDATE LAST ACTIVITY
            // ----------------------------------------------------

            await pool.query(
                `
                UPDATE public.user_sessions
                SET
                    last_activity = CURRENT_TIMESTAMP
                WHERE session_id = $1
                `,
                [sessionId]
            );


            // ----------------------------------------------------
            // SESSION VALID
            // ----------------------------------------------------

            console.log(
                "SESSION VALID"
            );

            console.log(
                "Last activity updated successfully"
            );

            console.log(
                "=============================================="
            );
            console.log("");


            return res.status(200).json({
                valid: true,
                session_id: sessionId
            });


        } catch (error) {

            console.error(
                "=============================================="
            );

            console.error(
                "VALIDATE SESSION EXCEPTION:"
            );

            console.error(error);

            console.error(
                "Error message:",
                error.message
            );

            console.error(
                "=============================================="
            );

            return res.status(500).json({
                valid: false,
                message: "Unable to validate session"
            });
        }

    }
);


module.exports = router;