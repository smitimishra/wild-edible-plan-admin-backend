const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// ADMIN CONTROLLER
//
// ROLE MAPPING
//
// role_id = 1  -> ADMIN
// role_id = 2  -> EMPLOYEE / FIELD STAFF
// role_id = 3  -> REVIEWER
//
// EMPLOYEE CODE
//
// ADMIN              -> AD001, AD002, ...
// EMPLOYEE/FIELD     -> FDS001, FDS002, ...
// REVIEWER           -> RE001, RE002, ...
//
// APPROVAL POSITION
//
// ADMIN              -> NULL
// EMPLOYEE/FIELD     -> NULL
// REVIEWER           -> REVIEWER
//

// CONSTANTS

const ROLE_NAMES = {
  1: "ADMIN",
  2: "EMPLOYEE",
  3: "REVIEWER",
};

const ROLE_PREFIXES = {
  1: "AD",
  2: "FDS",
  3: "RE",
};

const ALLOWED_ROLE_IDS = [1, 2, 3];

// HELPER FUNCTIONS

const getRoleName = (roleId) => {
  return ROLE_NAMES[Number(roleId)] || "";
};

const getRoleId = (role) => {
  if (role === undefined || role === null || String(role).trim() === "") {
    return NaN;
  }

  if (typeof role === "number" || !isNaN(Number(role))) {
    return Number(role);
  }

  const normalizedRole = String(role).trim().toUpperCase();

  if (normalizedRole === "ADMIN") {
    return 1;
  }

  if (
    normalizedRole === "EMPLOYEE" ||
    normalizedRole === "FIELD STAFF" ||
    normalizedRole === "FIELD_STAFF"
  ) {
    return 2;
  }

  if (normalizedRole === "REVIEWER") {
    return 3;
  }

  return NaN;
};

const normalizeEmail = (email) => {
  if (email === undefined || email === null) {
    return null;
  }

  const value = String(email).trim().toLowerCase();

  return value || null;
};

const normalizeName = (name) => {
  if (name === undefined || name === null) {
    return null;
  }

  const value = String(name).trim();

  return value || null;
};

const normalizePhone = (phone) => {
  if (phone === undefined || phone === null || String(phone).trim() === "") {
    return null;
  }

  return String(phone).trim();
};

// GENERATE EMPLOYEE CODE
//
// Examples:
//
// ADMIN     -> AD001
// EMPLOYEE  -> FDS001
// REVIEWER  -> RE001
//
// A transaction advisory lock is used so two Admin users
// cannot generate the same employee code simultaneously.

const generateEmployeeCode = async (client, roleId) => {
  const prefix = ROLE_PREFIXES[Number(roleId)];

  if (!prefix) {
    throw new Error("Invalid role for employee code generation");
  }

  await client.query(
    `
        SELECT pg_advisory_xact_lock(
            hashtext('admin_employee_code_generation')
        )
        `,
  );

  const result = await client.query(
    `
            SELECT
                COALESCE(
                    MAX(
                        CAST(
                            SUBSTRING(
                                employee_code
                                FROM LENGTH($1) + 1
                            ) AS INTEGER
                        )
                    ),
                    0
                ) + 1 AS next_number

            FROM user_table

            WHERE employee_code ~
                ('^' || $1 || '[0-9]+$')
            `,
    [prefix],
  );

  const nextNumber = Number(result.rows[0].next_number);

  return prefix + String(nextNumber).padStart(3, "0");
};

// GET REVIEWER APPROVAL POSITION

const getReviewerApprovalPosition = async (client) => {
  const result = await client.query(
    `
            SELECT
                id,
                approval_level,
                role

            FROM approval_workflow_hierarchy

            WHERE UPPER(TRIM(role)) = 'REVIEWER'

            ORDER BY approval_level ASC

            LIMIT 1
            `,
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    role: "REVIEWER",
  };
};

// BUILD USER RESPONSE

const formatUser = (user) => {
  return {
    id: user.user_id,
    user_id: user.user_id,

    role_id: user.role_id,
    role: getRoleName(user.role_id),

    name: user.user_name,
    user_name: user.user_name,

    phone_number: user.phone_number,

    email: user.email_id,
    email_id: user.email_id,

    employee_code: user.employee_code,

    is_active:
      user.is_active === undefined || user.is_active === null
        ? true
        : user.is_active,

    approval_position_id: user.approval_position_id,

    approval_position: user.approval_position,
  };
};

// GET ALL USERS

const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `
                SELECT
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active,
                    approval_position_id,
                    approval_position

                FROM user_table

                ORDER BY user_name ASC
                `,
    );

    const users = result.rows.map(formatUser);

    return res.status(200).json({
      users,
    });
  } catch (error) {
    console.error("Admin get users error:", error);

    return res.status(500).json({
      message: "Unable to retrieve users",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// CREATE USER

const createUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      user_id,
      role_id,
      user_name,
      phone_number,
      email_id,

      // Frontend compatibility
      name,
      email,
      role,
    } = req.body;

    // RESOLVE VALUES

    const finalRoleId = getRoleId(
      role_id !== undefined && role_id !== null ? role_id : role,
    );

    const finalUserName = normalizeName(
      user_name !== undefined && user_name !== null ? user_name : name,
    );

    const finalEmail = normalizeEmail(
      email_id !== undefined && email_id !== null ? email_id : email,
    );

    const finalPhone = normalizePhone(phone_number) ?? "";

    // VALIDATION

    if (!ALLOWED_ROLE_IDS.includes(finalRoleId)) {
      return res.status(400).json({
        message: "Role must be ADMIN, EMPLOYEE, or REVIEWER",
      });
    }

    if (!finalUserName) {
      return res.status(400).json({
        message: "User name is required",
      });
    }

    if (!finalEmail) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // START TRANSACTION

    await client.query("BEGIN");

    // CHECK DUPLICATE EMAIL

    const existingEmail = await client.query(
      `
                SELECT user_id

                FROM user_table

                WHERE LOWER(email_id) = $1

                LIMIT 1
                `,
      [finalEmail],
    );

    if (existingEmail.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    // GENERATE USER ID
    //
    // Normally user_id should be generated by PostgreSQL.
    //
    // The fallback below is retained for compatibility
    // with the existing table if no sequence/default exists.

    let finalUserId = null;

    if (
      user_id !== undefined &&
      user_id !== null &&
      String(user_id).trim() !== ""
    ) {
      finalUserId = Number(user_id);

      if (!Number.isInteger(finalUserId) || finalUserId <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Invalid user ID",
        });
      }

      const existingId = await client.query(
        `
                    SELECT user_id

                    FROM user_table

                    WHERE user_id = $1
                    `,
        [finalUserId],
      );

      if (existingId.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message: "A user with this user ID already exists",
        });
      }
    } else {
      const nextIdResult = await client.query(
        `
                    SELECT
                        COALESCE(
                            MAX(user_id),
                            0
                        ) + 1 AS next_user_id

                    FROM user_table
                    `,
      );

      finalUserId = Number(nextIdResult.rows[0].next_user_id);
    }

    // GENERATE EMPLOYEE CODE

    const employeeCode = await generateEmployeeCode(client, finalRoleId);

    // APPROVAL POSITION

    let approvalPositionId = null;

    let approvalPosition = null;

    if (finalRoleId === 3) {
      const reviewerPosition = await getReviewerApprovalPosition(client);

      if (!reviewerPosition) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "REVIEWER approval position is not configured in the approval hierarchy",
        });
      }

      approvalPositionId = reviewerPosition.id;

      approvalPosition = "REVIEWER";
    }

    // GENERATE TEMPORARY PASSWORD

    const temporaryPassword = crypto.randomBytes(9).toString("base64url");

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    // INSERT USER

    const result = await client.query(
      `
                INSERT INTO user_table
                (
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    password_hash,
                    employee_code,
                    is_active,
                    approval_position_id,
                    approval_position
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    TRUE,
                    $8,
                    $9
                )

                RETURNING
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active,
                    approval_position_id,
                    approval_position
                `,
      [
        finalUserId,
        finalRoleId,
        finalUserName,
        finalPhone,
        finalEmail,
        passwordHash,
        employeeCode,
        approvalPositionId,
        approvalPosition,
      ],
    );

    // COMMIT

    await client.query("COMMIT");

    const createdUser = result.rows[0];

    return res.status(201).json({
      message: "User created successfully",

      user: formatUser(createdUser),

      // Temporary password is returned
      // because the existing frontend/backend
      // flow expects it.
      temporaryPassword,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Admin create user rollback error:", rollbackError);
    }

    console.error("Admin create user error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "User ID, email, or employee code already exists",
      });
    }

    if (error.code === "23502") {
      return res.status(400).json({
        message: error.column
          ? `Missing required field: ${error.column}`
          : "Missing a required field",

        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    return res.status(500).json({
      message: "Unable to create user",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

// UPDATE USER

const updateUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = Number(req.params.id);

    // VALIDATE USER ID

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const {
      role_id,
      user_name,
      phone_number,
      email_id,

      // Frontend compatibility
      name,
      email,
      role,
    } = req.body;

    const finalRoleId = getRoleId(
      role_id !== undefined && role_id !== null ? role_id : role,
    );

    const finalUserName = normalizeName(
      user_name !== undefined && user_name !== null ? user_name : name,
    );

    const finalEmail = normalizeEmail(
      email_id !== undefined && email_id !== null ? email_id : email,
    );

    // VALIDATION

    if (!ALLOWED_ROLE_IDS.includes(finalRoleId)) {
      return res.status(400).json({
        message: "Role must be ADMIN, EMPLOYEE, or REVIEWER",
      });
    }

    if (!finalUserName) {
      return res.status(400).json({
        message: "User name is required",
      });
    }

    if (!finalEmail) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // START TRANSACTION

    await client.query("BEGIN");

    // GET CURRENT USER

    const existing = await client.query(
      `
        SELECT
          user_id,
          role_id,
          user_name,
          phone_number,
          email_id,
          employee_code,
          is_active

        FROM user_table

        WHERE user_id = $1

        FOR UPDATE
      `,
      [userId],
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "User not found",
      });
    }

    const currentUser = existing.rows[0];

    // KEEP EXISTING PHONE NUMBER
    // when frontend does not send one

    const finalPhone =
      phone_number !== undefined && phone_number !== null
        ? normalizePhone(phone_number)
        : currentUser.phone_number;

    // ADMIN ROLE PROTECTION

    if (Number(currentUser.role_id) === 1 && finalRoleId !== 1) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "The ADMIN account role cannot be changed",
      });
    }

    // PREVENT CHANGING ANOTHER USER INTO ADMIN

    if (Number(currentUser.role_id) !== 1 && finalRoleId === 1) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "A non-ADMIN user cannot be changed to ADMIN",
      });
    }

    // DUPLICATE EMAIL CHECK

    const duplicateEmail = await client.query(
      `
        SELECT user_id

        FROM user_table

        WHERE LOWER(email_id) = $1
          AND user_id <> $2

        LIMIT 1
      `,
      [finalEmail, userId],
    );

    if (duplicateEmail.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    // EMPLOYEE CODE

    let employeeCode = currentUser.employee_code;

    if (Number(currentUser.role_id) !== finalRoleId) {
      employeeCode = await generateEmployeeCode(
        client,
        finalRoleId,
      );
    }

    // APPROVAL POSITION

    let approvalPositionId = null;

    let approvalPosition = null;

    if (finalRoleId === 3) {
      const reviewerPosition =
        await getReviewerApprovalPosition(client);

      if (!reviewerPosition) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "REVIEWER approval position is not configured in the approval hierarchy",
        });
      }

      approvalPositionId = reviewerPosition.id;

      approvalPosition = "REVIEWER";
    }

    // UPDATE USER

    const result = await client.query(
      `
        UPDATE user_table

        SET
          role_id = $1,
          user_name = $2,
          phone_number = $3,
          email_id = $4,
          employee_code = $5,
          approval_position_id = $6,
          approval_position = $7

        WHERE user_id = $8

        RETURNING
          user_id,
          role_id,
          user_name,
          phone_number,
          email_id,
          employee_code,
          is_active,
          approval_position_id,
          approval_position
      `,
      [
        finalRoleId,
        finalUserName,
        finalPhone,
        finalEmail,
        employeeCode,
        approvalPositionId,
        approvalPosition,
        userId,
      ],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "User successfully updated",

      user: formatUser(result.rows[0]),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Admin update user rollback error:",
        rollbackError,
      );
    }

    console.error(
      "Admin update user error:",
      error,
    );

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Email or employee code already exists",
      });
    }

    return res.status(500).json({
      message: "Unable to update user",

      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  } finally {
    client.release();
  }
};
// DEACTIVATE USER

const deactivateUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // PREVENT SELF DEACTIVATION

    if (req.user && Number(req.user.id) === userId) {
      return res.status(403).json({
        message: "You cannot deactivate your own account",
      });
    }

    // ADMIN CANNOT BE DEACTIVATED

    const result = await pool.query(
      `
                UPDATE user_table

                SET
                    is_active = FALSE

                WHERE user_id = $1
                  AND role_id <> 1

                RETURNING
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active,
                    approval_position_id,
                    approval_position
                `,
      [userId],
    );

    if (result.rows.length === 0) {
      const check = await pool.query(
        `
                    SELECT
                        user_id,
                        role_id

                    FROM user_table

                    WHERE user_id = $1
                    `,
        [userId],
      );

      if (check.rows.length === 0) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      return res.status(403).json({
        message: "The ADMIN account cannot be deactivated",
      });
    }

    return res.status(200).json({
      message: "User deactivated successfully",

      user: formatUser(result.rows[0]),
    });
  } catch (error) {
    console.error("Admin deactivate user error:", error);

    return res.status(500).json({
      message: "Unable to deactivate user",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// REACTIVATE USER

const reactivateUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const result = await pool.query(
      `
                UPDATE user_table

                SET
                    is_active = TRUE

                WHERE user_id = $1

                RETURNING
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active,
                    approval_position_id,
                    approval_position
                `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User reactivated successfully",

      user: formatUser(result.rows[0]),
    });
  } catch (error) {
    console.error("Admin reactivate user error:", error);

    return res.status(500).json({
      message: "Unable to reactivate user",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// DELETE USER

const deleteUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = Number(req.params.id);

    // VALIDATE USER ID

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // GET USER

    const userResult = await client.query(
      `
                SELECT
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active,
                    approval_position_id,
                    approval_position

                FROM user_table

                WHERE user_id = $1
                `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // PREVENT SELF DELETE

    if (req.user && Number(req.user.id) === userId) {
      return res.status(403).json({
        message: "You cannot permanently delete your own account",
      });
    }

    // ADMIN CANNOT BE DELETED

    if (Number(user.role_id) === 1) {
      return res.status(403).json({
        message: "The ADMIN account cannot be permanently deleted",
      });
    }

    // CHECK APPROVAL REQUEST REFERENCES

    const requestReference = await client.query(
      `
                SELECT id

                FROM approval_requests

                WHERE employee_id = $1

                LIMIT 1
                `,
      [userId],
    );

    if (requestReference.rows.length > 0) {
      return res.status(409).json({
        message:
          "This user cannot be permanently deleted because they are associated with existing approval requests. Remove or deactivate the user instead.",
      });
    }

    // CHECK APPROVAL HISTORY REFERENCES

    const historyReference = await client.query(
      `
                SELECT id

                FROM approval_history

                WHERE approver_id = $1

                LIMIT 1
                `,
      [userId],
    );

    if (historyReference.rows.length > 0) {
      return res.status(409).json({
        message:
          "This user cannot be permanently deleted because they are associated with approval history. Remove or deactivate the user instead.",
      });
    }

    // CHECK REQUEST ATTACHMENT REFERENCES

    const attachmentReference = await client.query(
      `
                SELECT id

                FROM request_attachments

                WHERE uploaded_by = $1

                LIMIT 1
                `,
      [userId],
    );

    if (attachmentReference.rows.length > 0) {
      return res.status(409).json({
        message:
          "This user cannot be permanently deleted because they are associated with request attachments. Remove or deactivate the user instead.",
      });
    }

    // DELETE USER SESSIONS FIRST

    await client
      .query(
        `
            DELETE FROM user_sessions

            WHERE user_id = $1
            `,
        [userId],
      )
      .catch(() => {
        // Some database versions may not have user_id
        // in user_sessions. Do not fail the user delete
        // solely because this optional cleanup is unavailable.
      });

    // DELETE USER

    await client.query(
      `
            DELETE FROM user_table

            WHERE user_id = $1
            `,
      [userId],
    );

    return res.status(200).json({
      message: "User deleted successfully",

      deleted_user: formatUser(user),
    });
  } catch (error) {
    console.error("Admin delete user error:", error);

    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "This user cannot be deleted because other records still reference the account. Deactivate the user instead.",
      });
    }

    return res.status(500).json({
      message: "Unable to delete user",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

// GET APPROVAL WORKFLOW HIERARCHY

const getHierarchy = async (req, res) => {
  try {
    const result = await pool.query(
      `
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC
                `,
    );

    return res.status(200).json({
      hierarchy: result.rows,
    });
  } catch (error) {
    console.error("Admin get hierarchy error:", error);

    return res.status(500).json({
      message: "Unable to retrieve approval hierarchy",
    });
  }
};

// ADD APPROVAL WORKFLOW LEVEL

const addHierarchyLevel = async (req, res) => {
  const client = await pool.connect();

  try {
    const { approval_level, role } = req.body;

    const newLevel = Number(approval_level);

    // VALIDATE LEVEL

    if (!Number.isInteger(newLevel) || newLevel <= 0) {
      return res.status(400).json({
        message: "Approval level must be a positive integer",
      });
    }

    // VALIDATE ROLE

    if (typeof role !== "string" || !role.trim()) {
      return res.status(400).json({
        message: "Role is required",
      });
    }

    const normalizedRole = role.trim().toUpperCase();

    // EMPLOYEE IS NOT AN APPROVAL POSITION

    if (normalizedRole === "EMPLOYEE") {
      return res.status(400).json({
        message: "EMPLOYEE cannot be an approval position",
      });
    }

    // ADMIN IS NOT AN APPROVAL POSITION

    if (normalizedRole === "ADMIN") {
      return res.status(400).json({
        message: "ADMIN cannot be an approval position",
      });
    }

    await client.query("BEGIN");

    // GET CURRENT HIERARCHY

    const hierarchyResult = await client.query(
      `
                SELECT
                    id,
                    approval_level,
                    role

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC

                FOR UPDATE
                `,
    );

    const hierarchy = hierarchyResult.rows;

    const hierarchyCount = hierarchy.length;

    // DUPLICATE ROLE

    const duplicateRole = hierarchy.find(
      (item) => String(item.role).trim().toUpperCase() === normalizedRole,
    );

    if (duplicateRole) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "This role already exists in the approval hierarchy",
      });
    }

    // NEW LEVEL CANNOT SKIP MORE THAN ONE LEVEL

    if (newLevel > hierarchyCount + 1) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: `Approval level cannot be greater than ${hierarchyCount + 1}`,
      });
    }

    // SHIFT EXISTING LEVELS

    for (let index = hierarchy.length - 1; index >= 0; index--) {
      const item = hierarchy[index];

      const currentLevel = Number(item.approval_level);

      if (currentLevel >= newLevel) {
        await client.query(
          `
                    UPDATE approval_workflow_hierarchy

                    SET
                        approval_level = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
          [currentLevel + 1, item.id],
        );
      }
    }

    // INSERT NEW LEVEL

    const inserted = await client.query(
      `
                INSERT INTO approval_workflow_hierarchy
                (
                    approval_level,
                    role,
                    created_at,
                    updated_at
                )

                VALUES
                (
                    $1,
                    $2,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )

                RETURNING
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                `,
      [newLevel, normalizedRole],
    );

    await client.query("COMMIT");

    // FINAL HIERARCHY

    const finalHierarchy = await pool.query(
      `
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC
                `,
    );

    return res.status(201).json({
      message: "Approval hierarchy level added successfully",

      hierarchy: finalHierarchy.rows,

      added: inserted.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Admin add hierarchy rollback error:", rollbackError);
    }

    console.error("Admin add hierarchy level error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Approval level or role already exists",
      });
    }

    if (error.code === "23514") {
      return res.status(400).json({
        message: "Approval level must always be a positive integer",
      });
    }

    return res.status(500).json({
      message: "Unable to add approval hierarchy level",
    });
  } finally {
    client.release();
  }
};

// UPDATE APPROVAL WORKFLOW LEVEL

const updateHierarchyLevel = async (req, res) => {
  const client = await pool.connect();

  try {
    const hierarchyId = Number(req.params.id);

    // VALIDATE ID

    if (!Number.isInteger(hierarchyId) || hierarchyId <= 0) {
      return res.status(400).json({
        message: "Invalid hierarchy ID",
      });
    }

    const { approval_level, role } = req.body;

    const newLevel = Number(approval_level);

    // VALIDATE LEVEL

    if (!Number.isInteger(newLevel) || newLevel <= 0) {
      return res.status(400).json({
        message: "Approval level must be a positive integer",
      });
    }

    // VALIDATE ROLE

    if (typeof role !== "string" || !role.trim()) {
      return res.status(400).json({
        message: "Role is required",
      });
    }

    const normalizedRole = role.trim().toUpperCase();

    // EMPLOYEE CANNOT APPROVE

    if (normalizedRole === "EMPLOYEE") {
      return res.status(400).json({
        message: "EMPLOYEE cannot be an approval position",
      });
    }

    // ADMIN CANNOT APPROVE

    if (normalizedRole === "ADMIN") {
      return res.status(400).json({
        message: "ADMIN cannot be an approval position",
      });
    }

    await client.query("BEGIN");

    // LOCK HIERARCHY

    const hierarchyResult = await client.query(
      `
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC

                FOR UPDATE
                `,
    );

    const hierarchy = hierarchyResult.rows;

    // FIND CURRENT RECORD

    const currentIndex = hierarchy.findIndex(
      (item) => Number(item.id) === hierarchyId,
    );

    if (currentIndex === -1) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Approval hierarchy level not found",
      });
    }

    const current = hierarchy[currentIndex];

    const currentLevel = Number(current.approval_level);

    const hierarchyCount = hierarchy.length;

    // LEVEL CANNOT EXCEED HIERARCHY SIZE

    if (newLevel > hierarchyCount) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: `Approval level cannot be greater than ${hierarchyCount}`,
      });
    }

    // DUPLICATE ROLE

    const duplicateRole = hierarchy.find(
      (item) =>
        Number(item.id) !== hierarchyId &&
        String(item.role).trim().toUpperCase() === normalizedRole,
    );

    if (duplicateRole) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "This role already exists in the approval hierarchy",
      });
    }

    // SAME LEVEL

    if (currentLevel === newLevel) {
      const updated = await client.query(
        `
                    UPDATE approval_workflow_hierarchy

                    SET
                        role = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2

                    RETURNING
                        id,
                        approval_level,
                        role,
                        created_at,
                        updated_at
                    `,
        [normalizedRole, hierarchyId],
      );

      await client.query("COMMIT");

      const finalHierarchy = await pool.query(
        `
                    SELECT
                        id,
                        approval_level,
                        role,
                        created_at,
                        updated_at

                    FROM approval_workflow_hierarchy

                    ORDER BY approval_level ASC
                    `,
      );

      return res.status(200).json({
        message: "Approval hierarchy level updated successfully",

        hierarchy: finalHierarchy.rows,

        updated: updated.rows[0],
      });
    }

    // TEMPORARILY MOVE SELECTED RECORD

    const temporaryLevel = hierarchyCount + 1;

    await client.query(
      `
            UPDATE approval_workflow_hierarchy

            SET
                approval_level = $1,
                updated_at = CURRENT_TIMESTAMP

            WHERE id = $2
            `,
      [temporaryLevel, hierarchyId],
    );

    // MOVING DOWN
    //
    // Example:
    //
    // 1 Reviewer
    // 2 Manager
    // 3 GM
    //
    // Move Reviewer from 1 -> 3
    //
    // Manager becomes 1
    // GM becomes 2
    // Reviewer becomes 3

    if (newLevel > currentLevel) {
      for (let level = currentLevel + 1; level <= newLevel; level++) {
        const item = hierarchy.find(
          (row) => Number(row.approval_level) === level,
        );

        if (!item || Number(item.id) === hierarchyId) {
          continue;
        }

        await client.query(
          `
                    UPDATE approval_workflow_hierarchy

                    SET
                        approval_level = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
          [level - 1, item.id],
        );
      }
    }

    // MOVING UP
    //
    // Example:
    //
    // 1 Manager
    // 2 Reviewer
    // 3 GM
    //
    // Move GM from 3 -> 1
    //
    // Manager becomes 2
    // Reviewer becomes 3
    // GM becomes 1
    else {
      for (let level = currentLevel - 1; level >= newLevel; level--) {
        const item = hierarchy.find(
          (row) => Number(row.approval_level) === level,
        );

        if (!item || Number(item.id) === hierarchyId) {
          continue;
        }

        await client.query(
          `
                    UPDATE approval_workflow_hierarchy

                    SET
                        approval_level = $1,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
          [level + 1, item.id],
        );
      }
    }

    // FINAL UPDATE

    const updated = await client.query(
      `
                UPDATE approval_workflow_hierarchy

                SET
                    approval_level = $1,
                    role = $2,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $3

                RETURNING
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                `,
      [newLevel, normalizedRole, hierarchyId],
    );

    await client.query("COMMIT");

    // FINAL HIERARCHY

    const finalHierarchy = await pool.query(
      `
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC
                `,
    );

    return res.status(200).json({
      message: "Approval hierarchy level updated successfully",

      hierarchy: finalHierarchy.rows,

      updated: updated.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Admin update hierarchy rollback error:", rollbackError);
    }

    console.error("Admin update hierarchy level error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Approval level or role already exists",
      });
    }

    if (error.code === "23514") {
      return res.status(400).json({
        message: "Approval level must always be a positive integer",
      });
    }

    return res.status(500).json({
      message: "Unable to update approval hierarchy level",
    });
  } finally {
    client.release();
  }
};

// DELETE APPROVAL WORKFLOW LEVEL

const deleteHierarchyLevel = async (req, res) => {
  const client = await pool.connect();

  try {
    const hierarchyId = Number(req.params.id);

    // VALIDATE ID

    if (!Number.isInteger(hierarchyId) || hierarchyId <= 0) {
      return res.status(400).json({
        message: "Invalid hierarchy ID",
      });
    }

    await client.query("BEGIN");

    // LOCK HIERARCHY

    const hierarchyResult = await client.query(
      `
                SELECT
                    id,
                    approval_level,
                    role

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC

                FOR UPDATE
                `,
    );

    const hierarchy = hierarchyResult.rows;

    // FIND SELECTED LEVEL

    const currentIndex = hierarchy.findIndex(
      (item) => Number(item.id) === hierarchyId,
    );

    if (currentIndex === -1) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Approval hierarchy level not found",
      });
    }

    const deletedLevel = Number(hierarchy[currentIndex].approval_level);

    const deletedRole = String(hierarchy[currentIndex].role)
      .trim()
      .toUpperCase();

    // PROTECT REVIEWER IF REVIEWER USERS EXIST
    //
    // Since Reviewer is now the approval role, do not allow
    // its hierarchy record to be removed while Reviewer
    // accounts still depend on it.

    if (deletedRole === "REVIEWER") {
      const reviewerUsers = await client.query(
        `
                    SELECT user_id

                    FROM user_table

                    WHERE role_id = 3

                    LIMIT 1
                    `,
      );

      if (reviewerUsers.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "REVIEWER approval position cannot be deleted while Reviewer users exist",
        });
      }
    }

    // DELETE LEVEL

    await client.query(
      `
            DELETE FROM approval_workflow_hierarchy

            WHERE id = $1
            `,
      [hierarchyId],
    );

    // SHIFT LEVELS ABOVE DOWN

    for (let index = currentIndex + 1; index < hierarchy.length; index++) {
      const item = hierarchy[index];

      await client.query(
        `
                UPDATE approval_workflow_hierarchy

                SET
                    approval_level = $1,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $2
                `,
        [Number(item.approval_level) - 1, item.id],
      );
    }

    await client.query("COMMIT");

    // FINAL HIERARCHY

    const finalHierarchy = await pool.query(
      `
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at

                FROM approval_workflow_hierarchy

                ORDER BY approval_level ASC
                `,
    );

    return res.status(200).json({
      message: "Approval hierarchy level deleted successfully",

      deleted_id: hierarchyId,

      deleted_level: deletedLevel,

      hierarchy: finalHierarchy.rows,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Admin delete hierarchy rollback error:", rollbackError);
    }

    console.error("Admin delete hierarchy level error:", error);

    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "This approval position cannot be deleted because it is referenced by existing users or records",
      });
    }

    if (error.code === "23514") {
      return res.status(400).json({
        message: "Approval level must always be a positive integer",
      });
    }

    return res.status(500).json({
      message: "Unable to delete approval hierarchy level",
    });
  } finally {
    client.release();
  }
};

// EXPORTS

module.exports = {
  // User management
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,

  // Approval workflow hierarchy
  getHierarchy,
  addHierarchyLevel,
  updateHierarchyLevel,
  deleteHierarchyLevel,
};