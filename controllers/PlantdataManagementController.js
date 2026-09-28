const pool = require("../config/db");

const ROLE_IDS = {
  ADMIN: 1,
  FIELD_STAFF: 2,
  REVIEWER: 3,
};

// DATA MANAGEMENT

// GET PLANT RECORDS

const getPlants = async (req, res) => {
  try {
    const result = await pool.query(
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
                    p.deleted_at,
                    p.version,
                    p.uploaded_by,

                    u.user_name AS uploaded_by_name,
                    u.employee_code AS uploaded_by_employee_code

                FROM plant_table p

                LEFT JOIN user_table u
                    ON u.user_id = p.uploaded_by

                ORDER BY
                    p.plant_id DESC
            `,
    );

    return res.status(200).json({
      plants: result.rows,
    });
  } catch (error) {
    console.error("Data Management - Get plants error:", error);

    return res.status(500).json({
      message: "Failed to fetch plant records",
    });
  }
};

// PERMANENTLY DELETE PLANT

const permanentlyDeletePlant = async (req, res) => {
  const client = await pool.connect();

  try {
    const plantId = Number(req.params.id);

    if (!Number.isInteger(plantId)) {
      return res.status(400).json({
        message: "Invalid plant ID",
      });
    }

    await client.query("BEGIN");

    // Find and lock the plant

    const plantResult = await client.query(
      `
                SELECT
                    plant_id,
                    scientific_name,
                    common_name,
                    uploaded_by
                FROM plant_table
                WHERE plant_id = $1
                FOR UPDATE
            `,
      [plantId],
    );

    if (plantResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Plant record not found",
      });
    }

    const plant = plantResult.rows[0];

    // Delete navigation history

    await client.query(
      `
                DELETE FROM navigation_history_table
                WHERE plant_id = $1
            `,
      [plantId],
    );

    // Delete observations

    await client.query(
      `
                DELETE FROM observation_table
                WHERE plant_id = $1
            `,
      [plantId],
    );

    // Delete plant

    const deleteResult = await client.query(
      `
                DELETE FROM plant_table
                WHERE plant_id = $1
                RETURNING
                    plant_id,
                    scientific_name,
                    common_name
            `,
      [plantId],
    );

    if (deleteResult.rows.length === 0) {
      throw new Error("Plant deletion failed");
    }

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Plant permanently deleted successfully",

      plant: deleteResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Data Management - Permanent plant deletion error:", error);

    return res.status(500).json({
      message: "Failed to permanently delete plant",
    });
  } finally {
    client.release();
  }
};

// GET OLD / INACTIVE USERS

const getOldUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `
                SELECT
                    u.user_id,
                    u.employee_code,
                    u.user_name,
                    u.email_id,
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

                WHERE
                    u.is_active = FALSE
                    AND u.role_id <> $1

                ORDER BY
                    u.user_id ASC
            `,
      [ROLE_IDS.ADMIN],
    );

    const users = result.rows.map((user) => ({
      id: user.user_id,

      employee_code: user.employee_code,

      name: user.user_name,

      email: user.email_id,

      phone_number: user.phone_number,

      role: user.role,

      role_id: user.role_id,

      is_active: user.is_active,
    }));

    return res.status(200).json({
      users,
    });
  } catch (error) {
    console.error("Data Management - Get old users error:", error);

    return res.status(500).json({
      message: "Failed to fetch old users",
    });
  }
};

// GET OLD USER DATA SUMMARY

const getOldUserById = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // Get user

    const userResult = await pool.query(
      `
                SELECT
                    u.user_id,
                    u.employee_code,
                    u.user_name,
                    u.email_id,
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

                WHERE
                    u.user_id = $1
            `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // Only inactive users

    if (user.is_active) {
      return res.status(400).json({
        message: "Only inactive users can be permanently removed",
      });
    }

    // Admin protection

    if (Number(user.role_id) === ROLE_IDS.ADMIN) {
      return res.status(403).json({
        message: "Admin accounts cannot be permanently removed",
      });
    }

    // Account/activity data

    const activityResult = await pool.query(
      `
                SELECT COUNT(*)::integer AS count
                FROM user_activity_table
                WHERE user_id = $1
            `,
      [userId],
    );

    const sessionResult = await pool.query(
      `
                SELECT COUNT(*)::integer AS count
                FROM user_sessions
                WHERE user_id = $1
            `,
      [userId],
    );

    const otpResult = await pool.query(
      `
                SELECT COUNT(*)::integer AS count
                FROM otp_table
                WHERE user_id = $1
            `,
      [userId],
    );

    // Data that WILL be preserved

    const plantResult = await pool.query(
      `
                SELECT COUNT(*)::integer AS count
                FROM plant_table
                WHERE uploaded_by = $1
            `,
      [userId],
    );

    const observationResult = await pool.query(
      `
                SELECT COUNT(*)::integer AS count
                FROM observation_table
                WHERE user_id = $1
            `,
      [userId],
    );

    const navigationResult = await pool.query(
      `
                SELECT COUNT(*)::integer AS count
                FROM navigation_history_table
                WHERE user_id = $1
            `,
      [userId],
    );

    return res.status(200).json({
      user: {
        id: user.user_id,

        employee_code: user.employee_code,

        name: user.user_name,

        email: user.email_id,

        phone_number: user.phone_number,

        role: user.role,

        role_id: user.role_id,

        is_active: user.is_active,
      },

      dataSummary: {
        // Data that will be deleted
        activityRecords: activityResult.rows[0].count,

        sessionRecords: sessionResult.rows[0].count,

        otpRecords: otpResult.rows[0].count,

        // Data that will be preserved
        uploadedPlants: plantResult.rows[0].count,

        observations: observationResult.rows[0].count,

        navigationRecords: navigationResult.rows[0].count,
      },
    });
  } catch (error) {
    console.error("Data Management - Get old user summary error:", error);

    return res.status(500).json({
      message: "Failed to fetch old user data",
    });
  }
};

// PERMANENTLY DELETE OLD USER ACCOUNT DATA

const permanentlyDeleteOldUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    await client.query("BEGIN");

    // Lock user record

    const userResult = await client.query(
      `
                SELECT
                    user_id,
                    employee_code,
                    user_name,
                    email_id,
                    role_id,
                    is_active
                FROM user_table
                WHERE user_id = $1
                FOR UPDATE
            `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // Only inactive users

    if (user.is_active) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Only inactive users can be permanently removed",
      });
    }

    // Never delete Admin account

    if (Number(user.role_id) === ROLE_IDS.ADMIN) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "Admin accounts cannot be permanently removed",
      });
    }

    // ====================================================
    // PRESERVE USER'S UPLOADED PLANTS
    // ====================================================

    await client.query(
      `
                UPDATE plant_table
                SET
                    uploaded_by = NULL
                WHERE uploaded_by = $1
            `,
      [userId],
    );

    // ====================================================
    // DELETE OTP RECORDS
    // ====================================================

    await client.query(
      `
                DELETE FROM otp_table
                WHERE user_id = $1
            `,
      [userId],
    );

    // ====================================================
    // DELETE USER ACTIVITY
    // ====================================================

    await client.query(
      `
                DELETE FROM user_activity_table
                WHERE user_id = $1
            `,
      [userId],
    );

    // ====================================================
    // DELETE USER SESSIONS
    //
    // user_session_devices.session_id has
    // ON DELETE CASCADE.
    //
    // Therefore deleting the session automatically
    // removes its device records.
    // ====================================================

    await client.query(
      `
                DELETE FROM user_sessions
                WHERE user_id = $1
            `,
      [userId],
    );

    // ====================================================
    // DELETE USER ACCOUNT LAST
    // ====================================================

    const deleteResult = await client.query(
      `
                DELETE FROM user_table
                WHERE user_id = $1
                RETURNING
                    user_id,
                    employee_code,
                    user_name,
                    email_id
            `,
      [userId],
    );

    if (deleteResult.rows.length === 0) {
      throw new Error("User deletion failed");
    }

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Old user account data permanently deleted successfully",

      user: deleteResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Data Management - Permanent old user deletion error:",
      error,
    );

    return res.status(500).json({
      message: "Failed to permanently delete old user data",
    });
  } finally {
    client.release();
  }
};

// EXPORTS

module.exports = {
  getPlants,
  permanentlyDeletePlant,

  getOldUsers,
  getOldUserById,
  permanentlyDeleteOldUser,
};
