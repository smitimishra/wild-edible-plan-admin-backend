const pool = require("../config/db");

const getApplicationUsageLogs = async (req, res) => {
    try {
        const {
            userId,
            action,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 50
        } = req.query;

        const currentPage = Math.max(Number(page) || 1, 1);
        const pageLimit = Math.min(
            Math.max(Number(limit) || 50, 1),
            200
        );

        const offset =
            (currentPage - 1) * pageLimit;

        const conditions = [];
        const values = [];

        if (userId) {
            values.push(Number(userId));

            conditions.push(
                `ua.user_id = $${values.length}`
            );
        }

        if (action) {
            values.push(
                String(action).trim().toUpperCase()
            );

            conditions.push(
                `UPPER(ua.action) = $${values.length}`
            );
        }

        if (startDate) {
            values.push(startDate);

            conditions.push(
                `ua.login_date_time >= $${values.length}::date`
            );
        }

        if (endDate) {
            values.push(endDate);

            conditions.push(
                `ua.login_date_time < ($${values.length}::date + INTERVAL '1 day')`
            );
        }

        if (search) {
            values.push(
                `%${String(search).trim()}%`
            );

            conditions.push(`
                (
                    CAST(ua.user_id AS TEXT) ILIKE $${values.length}
                    OR COALESCE(ut.user_name, '') ILIKE $${values.length}
                    OR COALESCE(ut.email_id, '') ILIKE $${values.length}
                    OR COALESCE(ua.action, '') ILIKE $${values.length}
                    OR COALESCE(ua.description, '') ILIKE $${values.length}
                    OR COALESCE(ua.ip_address, '') ILIKE $${values.length}
                    OR COALESCE(ua.device_type, '') ILIKE $${values.length}
                )
            `);
        }

        const whereClause =
            conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "";

        const countResult = await pool.query(
            `
            SELECT COUNT(*) AS total
            FROM user_activity_table ua
            LEFT JOIN user_table ut
                ON ut.user_id = ua.user_id
            ${whereClause}
            `,
            values
        );

        const total =
            Number(countResult.rows[0].total) || 0;

        const totalPages =
            Math.ceil(total / pageLimit);

        const dataValues = [
            ...values,
            pageLimit,
            offset
        ];

        const logsResult = await pool.query(
            `
            SELECT
                ua.activity_id,
                ua.user_id,
                ut.user_name,
                ut.email_id,
                ua.action,
                ua.login_date_time,
                ua.description,
                ua.session_id,
                ua.ip_address,
                ua.device_type
            FROM user_activity_table ua
            LEFT JOIN user_table ut
                ON ut.user_id = ua.user_id
            ${whereClause}
            ORDER BY ua.login_date_time DESC,
                     ua.activity_id DESC
            LIMIT $${dataValues.length - 1}
            OFFSET $${dataValues.length}
            `,
            dataValues
        );

        return res.status(200).json({
            success: true,
            data: logsResult.rows,
            pagination: {
                page: currentPage,
                limit: pageLimit,
                total,
                totalPages
            }
        });

    } catch (error) {

        console.error(
            "Get application usage logs error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to retrieve application usage logs"
        });
    }
};

const getApplicationUsageSummary = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                COUNT(*) AS total_activities,
                COUNT(DISTINCT user_id) AS active_users,
                COUNT(*) FILTER (
                    WHERE action = 'LOGIN'
                ) AS total_logins,
                COUNT(*) FILTER (
                    WHERE action = 'LOGIN_FAILED'
                ) AS failed_logins,
                COUNT(*) FILTER (
                    WHERE action = 'OTP_FAILED'
                ) AS failed_otps,
                COUNT(*) FILTER (
                    WHERE action = 'LOGOUT'
                ) AS total_logouts
            FROM user_activity_table
            `
        );

        return res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {

        console.error(
            "Get application usage summary error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to retrieve application usage summary"
        });
    }
};

module.exports = {
    getApplicationUsageLogs,
    getApplicationUsageSummary
};