const pool = require("../config/db");

const authorizeRoles = (...allowedRoles) => {

    return async (req, res, next) => {

        try {

            // ========================================================
            // AUTHENTICATION CHECK
            // ========================================================

            if (!req.user) {

                return res.status(401).json({
                    message: "Authentication required"
                });

            }


            // ========================================================
            // NORMALIZE ALLOWED ROLES
            // ========================================================

            const normalizedAllowedRoles = allowedRoles.map((role) =>
                String(role)
                    .trim()
                    .toUpperCase()
            );


            // ========================================================
            // GET USER ID FROM JWT
            // ========================================================
            //
            // Depending on your JWT implementation, the user ID may
            // be stored under one of these names.
            //
            // We support the common possibilities without changing
            // your authentication flow.
            // ========================================================

            const userId =
                req.user.user_id ||
                req.user.userId ||
                req.user.id;


            if (!userId) {

                console.error(
                    "Authorization failed: user ID is missing from JWT.",
                    req.user
                );

                return res.status(403).json({
                    message: "User information is missing from authentication token"
                });

            }


            // ========================================================
            // GET ACTUAL ROLE FROM DATABASE
            // ========================================================
            //
            // user_table.role_id
            //          ↓
            // role_table.role_id
            //          ↓
            // role_table.role_name
            //
            // This makes REVIEWER authorization independent of the
            // exact role claim stored inside the JWT.
            // ========================================================

            const result = await pool.query(
                `
                SELECT
                    u.user_id,
                    u.role_id,
                    u.is_active,
                    r.role_name
                FROM public.user_table u
                LEFT JOIN public.role_table r
                    ON r.role_id = u.role_id
                WHERE u.user_id = $1
                LIMIT 1
                `,
                [userId]
            );


            // ========================================================
            // USER NOT FOUND
            // ========================================================

            if (result.rows.length === 0) {

                console.error(
                    "Authorization failed: user not found.",
                    userId
                );

                return res.status(403).json({
                    message: "User account was not found"
                });

            }


            const dbUser = result.rows[0];


            // ========================================================
            // ACTIVE USER CHECK
            // ========================================================

            if (dbUser.is_active === false) {

                return res.status(403).json({
                    message: "Your account is inactive"
                });

            }


            // ========================================================
            // GET DATABASE ROLE
            // ========================================================

            const userRole = String(
                dbUser.role_name || ""
            )
                .trim()
                .toUpperCase();


            // ========================================================
            // LOG AUTHORIZATION INFORMATION
            // ========================================================

            console.log(
                "Authorization check:",
                {
                    userId: dbUser.user_id,
                    roleId: dbUser.role_id,
                    databaseRole: userRole,
                    allowedRoles: normalizedAllowedRoles
                }
            );


            // ========================================================
            // ROLE CHECK
            // ========================================================

            if (!normalizedAllowedRoles.includes(userRole)) {

                console.error(
                    "Authorization denied:",
                    {
                        userId: dbUser.user_id,
                        userRole,
                        allowedRoles: normalizedAllowedRoles
                    }
                );

                return res.status(403).json({
                    message:
                        "Your account does not have permission to perform this action"
                });

            }


            // ========================================================
            // STORE DATABASE USER/ROLE ON REQUEST
            // ========================================================
            //
            // This is useful for controllers because they can now
            // reliably access the authenticated user's database role.
            // ========================================================

            req.authenticatedUser = {
                user_id: dbUser.user_id,
                role_id: dbUser.role_id,
                role: userRole,
                is_active: dbUser.is_active
            };


            // ========================================================
            // AUTHORIZATION SUCCESS
            // ========================================================

            next();

        } catch (error) {

            console.error(
                "Authorization error:",
                error
            );

            return res.status(500).json({
                message: "Authorization check failed"
            });

        }

    };

};


module.exports = authorizeRoles;