const pool = require("../config/db");


// ============================================================
// HELPER: get a numeric setting with a fallback default
// ============================================================

const getNumericSetting = async (key, defaultValue) => {

    const result = await pool.query(
        `SELECT value FROM system_settings WHERE key = $1`,
        [key]
    );

    if (result.rows.length === 0) {
        return defaultValue;
    }

    const parsed = Number(result.rows[0].value);

    return Number.isFinite(parsed) ? parsed : defaultValue;

};


// ============================================================
// GET ALL SETTINGS
// ADMIN ONLY
// ============================================================

const getSettings = async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT key, value, description, updated_at
            FROM system_settings
            ORDER BY key ASC
            `
        );

        const settings = {};

        for (const row of result.rows) {
            settings[row.key] = {
                value:       row.value,
                description: row.description,
                updated_at:  row.updated_at
            };
        }

        return res.status(200).json({ settings });

    } catch (error) {

        console.error("Get settings error:", error);

        return res.status(500).json({
            message: "Unable to retrieve settings"
        });

    }

};


// ============================================================
// UPDATE SETTING
// ADMIN ONLY
// ============================================================

const updateSetting = async (req, res) => {

    try {

        const { key }  = req.params;
        const { value } = req.body;

        if (value === undefined || value === null || String(value).trim() === "") {
            return res.status(400).json({ message: "value is required" });
        }

        const normalizedValue = String(value).trim();


        // ----------------------------------------------------
        // VALIDATE SPECIFIC KEYS
        // ----------------------------------------------------

        if (
            key === "login_max_attempts" ||
            key === "login_lockout_hours"
        ) {
            const num = Number(normalizedValue);

            if (!Number.isInteger(num) || num < 1 || num > 1000) {
                return res.status(400).json({
                    message: `${key} must be a positive integer between 1 and 1000`
                });
            }
        }


        // ----------------------------------------------------
        // UPSERT
        // ----------------------------------------------------

        const result = await pool.query(
            `
            INSERT INTO system_settings (key, value, updated_at, updated_by)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            ON CONFLICT (key) DO UPDATE
                SET value      = EXCLUDED.value,
                    updated_at = EXCLUDED.updated_at,
                    updated_by = EXCLUDED.updated_by
            RETURNING key, value, description, updated_at
            `,
            [key, normalizedValue, req.user?.id ?? null]
        );

        return res.status(200).json({
            message: "Setting updated successfully",
            setting: result.rows[0]
        });

    } catch (error) {

        console.error("Update setting error:", error);

        return res.status(500).json({
            message: "Unable to update setting"
        });

    }

};


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    getSettings,
    updateSetting,
    getNumericSetting
};
