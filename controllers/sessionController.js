const pool = require("../config/db");

// ============================================================
// GET LOGGED-IN DEVICES
// ============================================================
//
// IMPORTANT:
// The database keeps every session record.
// This API only groups identical devices for display in
// Admin -> Settings -> Logged-in Devices.
//
// Device uniqueness is based on:
//     device_type + ip_address + location
//
// If the same device has multiple sessions, only the latest
// session is returned to the frontend.
// ============================================================

const getLoggedInDevices = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        const result = await pool.query(
            `
            WITH normalized AS (
                SELECT
                    id,
                    user_id,
                    session_id,

                    COALESCE(
                        NULLIF(TRIM(device_type), ''),
                        'Browser'
                    ) AS normalized_device_type,

                    COALESCE(
                        NULLIF(TRIM(ip_address), ''),
                        'Unknown'
                    ) AS normalized_ip_address,

                    COALESCE(
                        NULLIF(TRIM(location), ''),
                        'Unknown'
                    ) AS normalized_location,

                    created_at,
                    last_activity,
                    expires_at,
                    invalidated_at,
                    invalidation_reason,
                    is_active
                FROM public.user_sessions
                WHERE user_id = $1
            ),

            latest_device_session AS (
                SELECT DISTINCT ON (
                    normalized_device_type,
                    normalized_ip_address,
                    normalized_location
                )
                    id,
                    user_id,
                    session_id,
                    normalized_device_type,
                    normalized_ip_address,
                    normalized_location,
                    created_at,
                    last_activity,
                    expires_at,
                    invalidated_at,
                    invalidation_reason,
                    is_active
                FROM normalized
                ORDER BY
                    normalized_device_type,
                    normalized_ip_address,
                    normalized_location,
                    last_activity DESC NULLS LAST,
                    created_at DESC
            ),

            device_activity AS (
                SELECT
                    normalized_device_type,
                    normalized_ip_address,
                    normalized_location,

                    BOOL_OR(is_active) AS any_active,

                    MAX(last_activity) AS latest_activity,
                    MAX(created_at) AS latest_created_at

                FROM normalized

                GROUP BY
                    normalized_device_type,
                    normalized_ip_address,
                    normalized_location
            )

            SELECT
                latest.id,
                latest.user_id,
                latest.session_id,

                latest.normalized_device_type AS device_type,
                latest.normalized_location AS location,
                latest.normalized_ip_address AS ip_address,

                latest.created_at,
                latest.last_activity,

                latest.expires_at,
                latest.invalidated_at,
                latest.invalidation_reason,

                activity.any_active AS is_active

            FROM latest_device_session latest

            INNER JOIN device_activity activity
                ON activity.normalized_device_type =
                   latest.normalized_device_type

               AND activity.normalized_ip_address =
                   latest.normalized_ip_address

               AND activity.normalized_location =
                   latest.normalized_location

            ORDER BY
                latest.last_activity DESC NULLS LAST,
                latest.created_at DESC
            `,
            [userId]
        );

        const devices = result.rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            session_id: row.session_id,

            device_type: row.device_type || "Browser",
            location: row.location || "Unknown",
            ip_address: row.ip_address || "Unknown",

            created_at: row.created_at,
            last_activity: row.last_activity,

            loginTime: row.created_at,
            last_active: row.last_activity,

            expires_at: row.expires_at,
            invalidated_at: row.invalidated_at,
            invalidation_reason: row.invalidation_reason,

            is_active: row.is_active === true,
            active: row.is_active === true
        }));

        return res.status(200).json({
            success: true,
            data: devices
        });

    } catch (error) {

        console.error("Get logged-in devices error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve logged-in devices"
        });
    }
};


// ============================================================
// UPDATE CURRENT SESSION LOCATION
// ============================================================
//
// The Angular Admin panel will send a readable location such as:
//
//     Bengaluru, Karnataka, India
//
// or:
//
//     Mumbai, Maharashtra, India
//
// Only the CURRENT authenticated session is updated.
//
// Latitude/longitude is NOT stored in the database.
// ============================================================

const updateSessionLocation = async (req, res) => {
    try {

        const userId = req.user?.id;

        // Support both possible JWT property names.
        // session_id is the preferred/current property.
        const sessionId =
            req.user?.session_id ||
            req.user?.sessionId;

        const { location } = req.body || {};

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        if (!sessionId) {
            return res.status(401).json({
                success: false,
                message: "Session ID is missing from authentication token"
            });
        }

        if (
            !location ||
            typeof location !== "string" ||
            !location.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Location is required"
            });
        }

        // Prevent excessively long location values.
        const cleanLocation = location
            .trim()
            .substring(0, 255);

        const result = await pool.query(
            `
            UPDATE public.user_sessions
            SET
                location = $1,
                last_activity = CURRENT_TIMESTAMP
            WHERE session_id = $2
              AND user_id = $3
              AND is_active = true
            RETURNING
                id,
                user_id,
                session_id,
                device_type,
                location,
                ip_address,
                last_activity,
                is_active
            `,
            [
                cleanLocation,
                sessionId,
                userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Active session not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Session location updated successfully",
            data: result.rows[0]
        });

    } catch (error) {

        console.error("Update session location error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update session location"
        });
    }
};


// ============================================================
// LOGOUT ALL DEVICES
// ============================================================

const logoutAllDevices = async (req, res) => {
    try {

        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        await pool.query(
            `
            UPDATE public.user_sessions
            SET
                is_active = false,
                invalidated_at = CURRENT_TIMESTAMP,
                invalidation_reason = 'logout_all_devices'
            WHERE user_id = $1
              AND is_active = true
            `,
            [userId]
        );

        return res.status(200).json({
            success: true,
            message: "All devices have been logged out successfully"
        });

    } catch (error) {

        console.error("Logout all devices error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to logout all devices"
        });
    }
};


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    getLoggedInDevices,
    updateSessionLocation,
    logoutAllDevices
};