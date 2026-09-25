const pool = require("../config/db");

/**
 * Log an application activity for a user.
 *
 * @param {Object} data
 * @param {number} data.userId
 * @param {string} data.action
 * @param {string|null} data.description
 * @param {string|null} data.sessionId
 * @param {string|null} data.ipAddress
 * @param {string|null} data.deviceType
 */
const logApplicationUsage = async ({
    userId,
    action,
    description = null,
    sessionId = null,
    ipAddress = null,
    deviceType = null
}) => {

    try {

        if (!userId) {
            console.warn(
                "Application usage log skipped: userId is missing"
            );
            return null;
        }

        if (!action) {
            console.warn(
                "Application usage log skipped: action is missing"
            );
            return null;
        }

        const result = await pool.query(
            `
            INSERT INTO user_activity_table (
                user_id,
                action,
                login_date_time,
                description,
                session_id,
                ip_address,
                device_type
            )
            VALUES (
                $1,
                $2,
                CURRENT_TIMESTAMP,
                $3,
                $4,
                $5,
                $6
            )
            RETURNING
                activity_id,
                user_id,
                action,
                login_date_time,
                description,
                session_id,
                ip_address,
                device_type
            `,
            [
                userId,
                String(action).trim().toUpperCase(),
                description
                    ? String(description).trim()
                    : null,
                sessionId || null,
                ipAddress || null,
                deviceType || null
            ]
        );

        return result.rows[0];

    } catch (error) {

        /*
         * Activity logging should NEVER break
         * the actual application operation.
         */
        console.error(
            "Application usage logging error:",
            error
        );

        return null;
    }
};

module.exports = {
    logApplicationUsage
};