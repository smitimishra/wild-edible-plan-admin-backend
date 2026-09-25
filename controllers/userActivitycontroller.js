const pool = require("../config/db");


// ============================================================
// GET USER ACTIVITY
// ============================================================
//
// GET /api/admin/users/:id/activity
//
// Role-specific activity:
//
// FIELD_STAFF
// - Login activity
// - Sessions
// - Devices
// - Uploaded plants
// - Observations
// - Navigation history
//
// REVIEWER
// - Login activity
// - Sessions
// - Devices
// - Observations
// - Navigation history
// - Approval history
//
// ADMIN
// - Login activity
// - Sessions
// - Devices
//
// ============================================================

const getUserActivity = async (req, res) => {


       console.log(
        "=========================================="
    );

    console.log(
        "GET USER ACTIVITY REQUEST RECEIVED"
    );

    console.log(
        "User ID:",
        req.params.id
    );

    console.log(
        "=========================================="
    );


    const userId = Number(req.params.id);


    // ========================================================
    // VALIDATE USER ID
    // ========================================================

    if (!Number.isInteger(userId) || userId <= 0) {

        return res.status(400).json({
            message: "Invalid user ID"
        });

    }


    try {

        // ====================================================
        // GET USER
        // ====================================================

        const userResult = await pool.query(

            `
            SELECT
                u.user_id,
                u.user_name,
                u.email_id,
                u.employee_code,
                u.phone_number,
                u.role_id,
                u.is_active,

                CASE
                    WHEN u.role_id = 1
                        THEN 'ADMIN'

                    WHEN u.role_id = 2
                        THEN 'FIELD_STAFF'

                    WHEN u.role_id = 3
                        THEN 'REVIEWER'

                    ELSE 'UNKNOWN'
                END AS role

            FROM user_table u

            WHERE u.user_id = $1

            LIMIT 1
            `,

            [userId]

        );


        // ====================================================
        // USER NOT FOUND
        // ====================================================

        if (userResult.rows.length === 0) {

            return res.status(404).json({
                message: "User not found"
            });

        }


        const user = userResult.rows[0];


        // ====================================================
        // LOGIN ACTIVITY
        // ====================================================

        const loginActivityResult = await pool.query(

            `
            SELECT
                us.id AS activity_id,
                us.user_id,
                CASE
                    WHEN us.is_active = TRUE THEN 'ACTIVE'
                    ELSE 'ENDED'
                END AS login_status,
                us.created_at AS login_date_time

            FROM user_sessions us

            WHERE us.user_id = $1

            ORDER BY us.created_at DESC

            LIMIT 10
            `,

            [userId]

        );


        // ====================================================
        // USER SESSIONS
        // ====================================================

        const sessionsResult = await pool.query(

            `
            SELECT
                us.id,
                us.session_id,
                us.is_active,
                us.created_at,
                us.last_activity,
                us.expires_at,
                us.invalidated_at,
                us.invalidation_reason,
                us.device_type,
                us.location,
                us.ip_address

            FROM user_sessions us

            WHERE us.user_id = $1

            ORDER BY COALESCE(us.last_activity, us.created_at) DESC

            LIMIT 10
            `,

            [userId]

        );


        // ====================================================
        // SESSION SUMMARY
        // ====================================================

        const sessionSummaryResult = await pool.query(

            `
            SELECT
                COUNT(*)::int AS total_sessions,
                COUNT(*) FILTER (WHERE us.is_active = TRUE)::int AS active_sessions,
                MAX(COALESCE(us.last_activity, us.created_at)) AS last_activity

            FROM user_sessions us

            WHERE us.user_id = $1
            `,

            [userId]

        );


        // ====================================================
        // SESSION DEVICES
        // ====================================================

        const devicesResult = await pool.query(

            `
            SELECT
                usd.device_id,
                usd.session_id,
                usd.device,
                usd.device_type,
                usd.platform,
                usd.os,
                usd.os_version,
                usd.ip_address,
                usd.location

            FROM user_session_devices usd

            INNER JOIN user_sessions us
                ON us.id = usd.session_id

            WHERE us.user_id = $1

            ORDER BY usd.device_id DESC

            LIMIT 10
            `,

            [userId]

        );


        // ====================================================
        // FIELD STAFF - UPLOADED PLANTS
        // ====================================================

        let plants = [];


        if (Number(user.role_id) === 2) {

            const plantsResult = await pool.query(

                `
                SELECT
                    p.plant_id,
                    p.scientific_name,
                    p.common_name,
                    p.family,
                    p.habitat,
                    p.conservation_status,
                    p.verified_status,
                    p.created_date,
                    p.deleted_at

                FROM plant_table p

                WHERE p.uploaded_by = $1

                ORDER BY p.created_date DESC
                `,

                [userId]

            );


            plants = plantsResult.rows;

        }


        // ====================================================
        // OBSERVATIONS
        // ====================================================
        //
        // Field Staff and Reviewer activity.
        //
        // Admin does not receive observation records.
        //
        // ====================================================

        let observations = [];


        if (
            Number(user.role_id) === 2 ||
            Number(user.role_id) === 3
        ) {

            const observationsResult = await pool.query(

                `
                SELECT
                    o.observation_id,
                    o.user_id,
                    o.plant_id,

                    p.scientific_name,
                    p.common_name,

                    o.observation_image,
                    o.observation_status,
                    o.latitude,
                    o.longitude,
                    o.time_stamp

                FROM observation_table o

                LEFT JOIN plant_table p
                    ON p.plant_id = o.plant_id

                WHERE o.user_id = $1

                ORDER BY o.time_stamp DESC
                `,

                [userId]

            );


            observations = observationsResult.rows;

        }


        // ====================================================
        // NAVIGATION HISTORY
        // ====================================================
        //
        // Field Staff and Reviewer activity.
        //
        // ====================================================

        let navigation = [];


        if (
            Number(user.role_id) === 2 ||
            Number(user.role_id) === 3
        ) {

            const navigationResult = await pool.query(

                `
                SELECT
                    n.navigation_id,
                    n.user_id,
                    n.plant_id,

                    p.scientific_name,
                    p.common_name,

                    n.start_latitude,
                    n.start_longitude,
                    n.destination_latitude,
                    n.destination_longitude,

                    n.route_distance,
                    n.estimated_time,
                    n.navigation_date,
                    n.status

                FROM navigation_history_table n

                LEFT JOIN plant_table p
                    ON p.plant_id = n.plant_id

                WHERE n.user_id = $1

                ORDER BY n.navigation_date DESC
                `,

                [userId]

            );


            navigation = navigationResult.rows;

        }


        // ====================================================
        // REVIEWER - APPROVAL HISTORY
        // ====================================================

        let approvals = [];


        if (Number(user.role_id) === 3) {

            const approvalResult = await pool.query(

                `
                SELECT
                    ah.id,
                    ah.request_id,

                    ar.request_number,
                    ar.status AS request_status,

                    ah.approval_level,
                    ah.action,
                    ah.comments,
                    ah.action_at

                FROM approval_history ah

                LEFT JOIN approval_requests ar
                    ON ar.id = ah.request_id

                WHERE ah.approver_id = $1

                ORDER BY ah.action_at DESC
                `,

                [userId]

            );


            approvals = approvalResult.rows;

        }


        // ====================================================
        // SUMMARY
        // ====================================================

        const sessionSummary = sessionSummaryResult.rows[0] || {};

        const summary = {

            loginActivity:
                loginActivityResult.rows.length,

            sessions:
                Number(sessionSummary.total_sessions || 0),

            activeSessions:
                Number(sessionSummary.active_sessions || 0),

            lastActivity:
                sessionSummary.last_activity || null,

            devices:
                devicesResult.rows.length,

            plants:
                plants.length,

            observations:
                observations.length,

            navigation:
                navigation.length,

            approvals:
                approvals.length

        };


        // ====================================================
        // FINAL RESPONSE
        // ====================================================

        return res.status(200).json({

            user: {

                id:
                    user.user_id,

                name:
                    user.user_name,

                email:
                    user.email_id,

                employee_code:
                    user.employee_code,

                phone_number:
                    user.phone_number,

                role_id:
                    user.role_id,

                role:
                    user.role,

                is_active:
                    user.is_active

            },


            activity: {

                loginActivity:
                    loginActivityResult.rows,

                sessions:
                    sessionsResult.rows,

                devices:
                    devicesResult.rows,

                plants,

                observations,

                navigation,

                approvals

            },


            summary

        });

    }


    catch (error) {

        console.error(
            "Admin get user activity error:",
            error
        );


        return res.status(500).json({

            message:
                "Unable to load user activity"

        });

    }

};


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    getUserActivity

};