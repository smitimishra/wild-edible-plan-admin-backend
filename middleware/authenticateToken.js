const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const authenticateToken = async (req, res, next) => {
    try {
        // ----------------------------------------------------
        // 1. Get Authorization header
        // ----------------------------------------------------
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "Authorization header is required"
            });
        }


        // ----------------------------------------------------
        // 2. Validate Bearer token format
        // ----------------------------------------------------
        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                message: "Invalid authorization format"
            });
        }

        const token = parts[1];


        // ----------------------------------------------------
        // 3. Verify JWT
        // ----------------------------------------------------
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );


        // ----------------------------------------------------
        // 4. Validate active session if session_id exists
        // ----------------------------------------------------
        if (decoded.session_id) {

            const sessionResult = await pool.query(
                `
                SELECT is_active
                FROM user_sessions
                WHERE session_id = $1
                `,
                [decoded.session_id]
            );

            if (
                sessionResult.rows.length === 0 ||
                sessionResult.rows[0].is_active === false
            ) {
                return res.status(401).json({
                    message:
                        "Session has been invalidated. Please log in again."
                });
            }


            // ------------------------------------------------
            // 5. Update last activity
            // ------------------------------------------------
            await pool.query(
                `
                UPDATE user_sessions
                SET last_activity = CURRENT_TIMESTAMP
                WHERE session_id = $1
                `,
                [decoded.session_id]
            );
        }


        // ----------------------------------------------------
        // 6. Store decoded JWT information
        // ----------------------------------------------------
        req.user = decoded;

        next();

    } catch (error) {

        console.error(
            "Authentication error:",
            error.message
        );

        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};

module.exports = authenticateToken;