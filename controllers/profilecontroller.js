const pool = require("../config/db");

async function getCurrentProfile(req, res) {
    try {
        const email = String(req.user?.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                message: "Authenticated email is missing"
            });
        }

        const result = await pool.query(
            `
            SELECT user_name, email_id
            FROM public.user_table
            WHERE LOWER(email_id) = LOWER($1)
            LIMIT 1
            `,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User profile was not found"
            });
        }

        return res.json({
            user_name: result.rows[0].user_name,
            email: result.rows[0].email_id
        });
    } catch (error) {
        console.error("Unable to load current user profile:", error);
        return res.status(500).json({
            message: "Unable to load current user profile"
        });
    }
}

module.exports = { getCurrentProfile };
