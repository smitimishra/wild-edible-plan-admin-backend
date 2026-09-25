const jwt = require("jsonwebtoken");
const pool = require("../../../Admin-Desktop-Console/Desktop-Admin-App/backend/config/db");


const authenticateDesktopToken = async (
    req,
    res,
    next
) => {

    try {

        const authHeader =
            req.headers.authorization;


        if (
            !authHeader ||
            !authHeader.startsWith("Bearer ")
        ) {

            return res.status(401).json({

                message:
                    "Authorization token required"

            });

        }


        const token =
            authHeader.substring(7);


        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );


        /*
        |--------------------------------------------------------------------------
        | ADMIN CHECK
        |--------------------------------------------------------------------------
        */

        if (
            String(decoded.role)
                .toUpperCase() !== "ADMIN"
        ) {

            return res.status(403).json({

                message:
                    "Administrator access required"

            });

        }


        /*
        |--------------------------------------------------------------------------
        | SESSION CHECK
        |--------------------------------------------------------------------------
        */

        if (!decoded.session_id) {

            return res.status(401).json({

                message:
                    "Session ID missing"

            });

        }


        const result =
            await pool.query(
                `
                SELECT
                    user_id,
                    session_id,
                    is_active,
                    expires_at
                FROM user_sessions
                WHERE session_id = $1
                LIMIT 1
                `,
                [decoded.session_id]
            );


        if (result.rows.length === 0) {

            return res.status(401).json({

                message:
                    "Session not found"

            });

        }


        const session =
            result.rows[0];


        if (
            session.is_active !== true
        ) {

            return res.status(401).json({

                message:
                    "Session is no longer active"

            });

        }


        if (
            session.expires_at &&
            new Date(
                session.expires_at
            ).getTime() <= Date.now()
        ) {

            return res.status(401).json({

                message:
                    "Session has expired"

            });

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE ACTIVITY
        |--------------------------------------------------------------------------
        */

        await pool.query(
            `
            UPDATE user_sessions
            SET last_activity = CURRENT_TIMESTAMP
            WHERE session_id = $1
            `,
            [decoded.session_id]
        );


        req.user =
            decoded;


        next();


    } catch (error) {

        console.error(
            "Desktop authentication error:",
            error
        );


        return res.status(401).json({

            message:
                "Invalid or expired token"

        });

    }

};


module.exports = {
    authenticateDesktopToken
};