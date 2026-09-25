const jwt = require("jsonwebtoken");


// ============================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ============================================================

const adminAuthMiddleware = (
    req,
    res,
    next
) => {

    try {

        // ----------------------------------------------------
        // GET AUTHORIZATION HEADER
        // ----------------------------------------------------

        const authHeader =
            req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {

            return res.status(401).json({
                message:
                    "Authentication token is required"
            });
        }


        // ----------------------------------------------------
        // EXTRACT TOKEN
        // ----------------------------------------------------

        const token =
            authHeader.substring(7).trim();

        if (!token) {

            return res.status(401).json({
                message:
                    "Authentication token is required"
            });
        }


        // ----------------------------------------------------
        // VERIFY JWT
        // ----------------------------------------------------

        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );


        // ----------------------------------------------------
        // VERIFY ADMIN ROLE
        // ----------------------------------------------------

        /*
         * Desktop authentication creates a JWT containing:
         *
         * id
         * name
         * email
         * role
         * role_id
         * employee_code
         * session_id
         */

        if (
            !decoded ||
            decoded.role !== "ADMIN" ||
            Number(decoded.role_id) !== 1
        ) {

            return res.status(403).json({
                message:
                    "Admin access required"
            });
        }


        // ----------------------------------------------------
        // ATTACH AUTHENTICATED ADMIN TO REQUEST
        // ----------------------------------------------------

        req.admin = {
            id:
                decoded.id,

            name:
                decoded.name,

            email:
                decoded.email,

            role:
                decoded.role,

            role_id:
                decoded.role_id,

            employee_code:
                decoded.employee_code,

            session_id:
                decoded.session_id
        };


        // ----------------------------------------------------
        // CONTINUE
        // ----------------------------------------------------

        next();

    } catch (error) {

        console.error(
            "Admin authentication error:",
            error
        );


        // ----------------------------------------------------
        // JWT EXPIRED
        // ----------------------------------------------------

        if (
            error.name ===
            "TokenExpiredError"
        ) {

            return res.status(401).json({
                message:
                    "Authentication token has expired"
            });
        }


        // ----------------------------------------------------
        // INVALID JWT
        // ----------------------------------------------------

        if (
            error.name ===
            "JsonWebTokenError"
        ) {

            return res.status(401).json({
                message:
                    "Invalid authentication token"
            });
        }


        // ----------------------------------------------------
        // OTHER ERROR
        // ----------------------------------------------------

        return res.status(401).json({
            message:
                "Authentication failed"
        });
    }
};


module.exports =
    adminAuthMiddleware;