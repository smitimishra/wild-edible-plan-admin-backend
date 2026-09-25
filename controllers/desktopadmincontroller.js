const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const pool = require("../config/db");


// ============================================================
// ROLE MAPPING
// ============================================================

const ROLE_IDS = {
    ADMIN: 1,
    FIELD_STAFF: 2,
    REVIEWER: 3
};


// ============================================================
// EMPLOYEE ID PREFIXES
// ============================================================

const ROLE_PREFIXES = {
    ADMIN: "AD",
    REVIEWER: "RE",
    FIELD_STAFF: "FDS"
};


// ============================================================
// HELPER FUNCTIONS
// ============================================================

const normalizeRole = (role) => {

    if (!role) {
        return null;
    }

    const value =
        String(role)
            .trim()
            .toUpperCase();


    // FIELD STAFF compatibility

    if (
        value === "EMPLOYEE" ||
        value === "FIELD STAFF" ||
        value === "FIELD_STAFF" ||
        value === "FIELD-STAFF" ||
        value === "FDS"
    ) {
        return "FIELD_STAFF";
    }


    // REVIEWER

    if (
        value === "REVIEWER" ||
        value === "RE"
    ) {
        return "REVIEWER";
    }


    // ADMIN

    if (
        value === "ADMIN" ||
        value === "AD"
    ) {
        return "ADMIN";
    }


    return value;
};


const getRoleId = (role) => {

    const normalizedRole =
        normalizeRole(role);

    return ROLE_IDS[normalizedRole] || null;
};


const getRoleName = (roleId) => {

    switch (Number(roleId)) {

        case ROLE_IDS.ADMIN:
            return "ADMIN";

        case ROLE_IDS.FIELD_STAFF:
            return "FIELD_STAFF";

        case ROLE_IDS.REVIEWER:
            return "REVIEWER";

        default:
            return "UNKNOWN";
    }
};


const getEmployeeCodePrefix = (role) => {

    const normalizedRole =
        normalizeRole(role);

    return ROLE_PREFIXES[normalizedRole] || null;
};


// ============================================================
// GENERATE ROLE-BASED EMPLOYEE ID
// ============================================================

const generateEmployeeCode = async (
    client,
    role
) => {

    const normalizedRole =
        normalizeRole(role);

    const prefix =
        getEmployeeCodePrefix(
            normalizedRole
        );


    if (!prefix) {

        throw new Error(
            `Unable to generate employee ID for role: ${normalizedRole}`
        );
    }


    /*
     * Get existing employee codes for this role.
     *
     * The create-user operation runs inside a transaction,
     * so the rows are locked while the next number is generated.
     */

    const result =
        await client.query(
            `
                SELECT employee_code
                FROM user_table
                WHERE employee_code LIKE $1
                FOR UPDATE
            `,
            [
                `${prefix}%`
            ]
        );


    let highestNumber = 0;


    for (const row of result.rows) {

        const employeeCode =
            String(
                row.employee_code || ""
            )
                .trim()
                .toUpperCase();


        if (
            !employeeCode.startsWith(prefix)
        ) {
            continue;
        }


        const numberPart =
            employeeCode.substring(
                prefix.length
            );


        const number =
            Number(numberPart);


        if (
            Number.isInteger(number) &&
            number > highestNumber
        ) {
            highestNumber = number;
        }
    }


    const nextNumber =
        highestNumber + 1;


    return (
        `${prefix}${String(nextNumber).padStart(3, "0")}`
    );
};


// ============================================================
// GENERATE TEMPORARY PASSWORD
// ============================================================

const generateTemporaryPassword = () => {

    return crypto
        .randomBytes(12)
        .toString("base64")
        .replace(
            /[^a-zA-Z0-9]/g,
            ""
        )
        .slice(0, 12);
};


// ============================================================
// FORMAT USER RESPONSE
// ============================================================

/*
 * IMPORTANT:
 *
 * user_table does NOT contain created_at.
 *
 * Therefore created_at is intentionally NOT returned.
 */

const formatUser = (row) => {

    return {

        id:
            row.user_id,

        employee_code:
            row.employee_code,

        name:
            row.user_name,

        email:
            row.email_id,

        phone_number:
            row.phone_number,

        role:
            row.role ||
            getRoleName(row.role_id),

        role_id:
            row.role_id,

        approval_position:
            row.approval_position,

        approval_position_id:
            row.approval_position_id,

        is_active:
            row.is_active
    };
};


// ============================================================
// GET ALL USERS
// GET /api/admin/users
// ============================================================

const getUsers = async (
    req,
    res
) => {

    try {

        const result =
            await pool.query(
                `
                    SELECT
                        u.user_id,
                        u.employee_code,
                        u.user_name,
                        u.email_id,
                        u.phone_number,
                        u.role_id,
                        u.approval_position,
                        u.approval_position_id,
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

                    ORDER BY
                        u.user_id ASC
                `
            );


        const users =
            result.rows.map(
                formatUser
            );


        return res.status(200).json({
            users
        });

    } catch (error) {

        console.error(
            "Get users error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to fetch users"
        });
    }
};


// ============================================================
// CREATE USER
// POST /api/admin/users
// ============================================================

const createUser = async (
    req,
    res
) => {

    const client =
        await pool.connect();


    try {

        const {
            name,
            email,
            phone_number,
            role
        } = req.body;


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !name ||
            !email ||
            !role
        ) {

            return res.status(400).json({
                message:
                    "Name, email and role are required"
            });
        }


        const normalizedRole =
            normalizeRole(role);


        const roleId =
            getRoleId(
                normalizedRole
            );


        if (!roleId) {

            return res.status(400).json({
                message:
                    "Invalid role. Allowed roles are ADMIN, REVIEWER and FIELD_STAFF."
            });
        }


        /*
         * Admin accounts cannot be created from
         * normal User Management.
         */

        if (
            normalizedRole === "ADMIN"
        ) {

            return res.status(403).json({
                message:
                    "Admin users cannot be created from User Management."
            });
        }


        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        // ----------------------------------------------------
        // CHECK DUPLICATE EMAIL
        // ----------------------------------------------------

        const existingUser =
            await client.query(
                `
                    SELECT
                        user_id
                    FROM user_table
                    WHERE LOWER(email_id) = LOWER($1)
                    LIMIT 1
                `,
                [
                    normalizedEmail
                ]
            );


        if (
            existingUser.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "A user with this email already exists"
            });
        }


        // ----------------------------------------------------
        // GENERATE TEMPORARY PASSWORD
        // ----------------------------------------------------

        const temporaryPassword =
            generateTemporaryPassword();


        const passwordHash =
            await bcrypt.hash(
                temporaryPassword,
                10
            );


        // ----------------------------------------------------
        // START TRANSACTION
        // ----------------------------------------------------

        await client.query(
            "BEGIN"
        );


        // ----------------------------------------------------
        // GENERATE EMPLOYEE CODE
        // ----------------------------------------------------

        const employeeCode =
            await generateEmployeeCode(
                client,
                normalizedRole
            );


        // ----------------------------------------------------
        // INSERT USER
        // ----------------------------------------------------

        const insertResult =
            await client.query(
                `
                    INSERT INTO user_table
                    (
                        role_id,
                        user_name,
                        phone_number,
                        email_id,
                        password_hash,
                        employee_code,
                        is_active
                    )

                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        TRUE
                    )

                    RETURNING
                        user_id,
                        employee_code,
                        user_name,
                        phone_number,
                        email_id,
                        role_id,
                        approval_position,
                        approval_position_id,
                        is_active
                `,
                [
                    roleId,

                    String(name)
                        .trim(),

                    phone_number
                        ? String(
                            phone_number
                        ).trim()
                        : null,

                    normalizedEmail,

                    passwordHash,

                    employeeCode
                ]
            );


        // ----------------------------------------------------
        // COMMIT
        // ----------------------------------------------------

        await client.query(
            "COMMIT"
        );


        const row =
            insertResult.rows[0];


        const user =
            formatUser({
                ...row,
                role:
                    normalizedRole
            });


        return res.status(201).json({

            message:
                "User created successfully",

            user,

            temporaryPassword
        });


    } catch (error) {

        await client.query(
            "ROLLBACK"
        );


        console.error(
            "Create user error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to create user"
        });


    } finally {

        client.release();
    }
};


// ============================================================
// UPDATE USER
// PUT /api/admin/users/:id
// ============================================================

const updateUser = async (
    req,
    res
) => {

    try {

        const userId =
            Number(req.params.id);


        const {
            name,
            email,
            phone_number,
            role
        } = req.body;


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !Number.isInteger(userId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });
        }


        if (
            !name ||
            !email ||
            !role
        ) {

            return res.status(400).json({
                message:
                    "Name, email and role are required"
            });
        }


        const normalizedRole =
            normalizeRole(role);


        const roleId =
            getRoleId(
                normalizedRole
            );


        if (!roleId) {

            return res.status(400).json({
                message:
                    "Invalid role"
            });
        }


        // ----------------------------------------------------
        // GET EXISTING USER
        // ----------------------------------------------------

        const existingResult =
            await pool.query(
                `
                    SELECT
                        user_id,
                        role_id,
                        employee_code,
                        email_id
                    FROM user_table
                    WHERE user_id = $1
                `,
                [
                    userId
                ]
            );


        if (
            existingResult.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    "User not found"
            });
        }


        const existingUser =
            existingResult.rows[0];


        // ----------------------------------------------------
        // PROTECT ADMIN ROLE
        // ----------------------------------------------------

        if (
            existingUser.role_id ===
            ROLE_IDS.ADMIN
        ) {

            if (
                normalizedRole !== "ADMIN"
            ) {

                return res.status(403).json({
                    message:
                        "Admin role cannot be changed"
                });
            }
        }


        /*
         * Prevent normal users from being
         * converted into Admin.
         */

        if (
            existingUser.role_id !==
                ROLE_IDS.ADMIN &&
            normalizedRole === "ADMIN"
        ) {

            return res.status(403).json({
                message:
                    "Admin role cannot be assigned through User Management"
            });
        }


        // ----------------------------------------------------
        // CHECK DUPLICATE EMAIL
        // ----------------------------------------------------

        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        const duplicateEmail =
            await pool.query(
                `
                    SELECT
                        user_id
                    FROM user_table
                    WHERE LOWER(email_id) = LOWER($1)
                    AND user_id <> $2
                    LIMIT 1
                `,
                [
                    normalizedEmail,
                    userId
                ]
            );


        if (
            duplicateEmail.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "Another user already uses this email"
            });
        }


        // ----------------------------------------------------
        // UPDATE USER
        // ----------------------------------------------------

        const result =
            await pool.query(
                `
                    UPDATE user_table

                    SET
                        user_name = $1,
                        email_id = $2,
                        phone_number = $3,
                        role_id = $4

                    WHERE user_id = $5

                    RETURNING
                        user_id,
                        employee_code,
                        user_name,
                        phone_number,
                        email_id,
                        role_id,
                        approval_position,
                        approval_position_id,
                        is_active
                `,
                [
                    String(name)
                        .trim(),

                    normalizedEmail,

                    phone_number
                        ? String(
                            phone_number
                        ).trim()
                        : null,

                    roleId,

                    userId
                ]
            );


        const row =
            result.rows[0];


        const user =
            formatUser({
                ...row,
                role:
                    normalizedRole
            });


        return res.status(200).json({

            message:
                "User updated successfully",

            user
        });


    } catch (error) {

        console.error(
            "Update user error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to update user"
        });
    }
};


// ============================================================
// UPDATE USER ROLE
// PUT /api/admin/users/:id
// ============================================================

const updateUserRole = async (
    req,
    res
) => {

    try {

        const userId =
            Number(req.params.id);


        const {
            role
        } = req.body;


        if (
            !Number.isInteger(userId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });
        }


        if (!role) {

            return res.status(400).json({
                message:
                    "Role is required"
            });
        }


        const normalizedRole =
            normalizeRole(role);


        const roleId =
            getRoleId(
                normalizedRole
            );


        if (!roleId) {

            return res.status(400).json({
                message:
                    "Invalid role"
            });
        }


        // ----------------------------------------------------
        // GET EXISTING USER
        // ----------------------------------------------------

        const existingResult =
            await pool.query(
                `
                    SELECT
                        user_id,
                        role_id,
                        employee_code
                    FROM user_table
                    WHERE user_id = $1
                `,
                [
                    userId
                ]
            );


        if (
            existingResult.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    "User not found"
            });
        }


        const existingUser =
            existingResult.rows[0];


        // ----------------------------------------------------
        // ADMIN PROTECTION
        // ----------------------------------------------------

        if (
            existingUser.role_id ===
            ROLE_IDS.ADMIN
        ) {

            return res.status(403).json({
                message:
                    "Admin role cannot be changed"
            });
        }


        if (
            normalizedRole === "ADMIN"
        ) {

            return res.status(403).json({
                message:
                    "Admin role cannot be assigned through Role Management"
            });
        }


        // ----------------------------------------------------
        // UPDATE ROLE
        // ----------------------------------------------------

        /*
         * Employee code is intentionally preserved.
         *
         * Example:
         *
         * FDS001 -> REVIEWER
         *
         * remains FDS001.
         */

        const result =
            await pool.query(
                `
                    UPDATE user_table

                    SET
                        role_id = $1

                    WHERE user_id = $2

                    RETURNING
                        user_id,
                        employee_code,
                        user_name,
                        phone_number,
                        email_id,
                        role_id,
                        approval_position,
                        approval_position_id,
                        is_active
                `,
                [
                    roleId,
                    userId
                ]
            );


        const row =
            result.rows[0];


        const user =
            formatUser({
                ...row,
                role:
                    normalizedRole
            });


        return res.status(200).json({

            message:
                "User role updated successfully",

            user
        });


    } catch (error) {

        console.error(
            "Update user role error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to update user role"
        });
    }
};


// ============================================================
// DEACTIVATE USER
// PATCH /api/admin/users/:id/deactivate
// ============================================================

const deactivateUser = async (
    req,
    res
) => {

    try {

        const userId =
            Number(req.params.id);


        if (
            !Number.isInteger(userId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });
        }


        const result =
            await pool.query(
                `
                    UPDATE user_table

                    SET
                        is_active = FALSE,
                        session_token = NULL

                    WHERE user_id = $1
                    AND role_id <> $2

                    RETURNING
                        user_id,
                        employee_code,
                        user_name,
                        phone_number,
                        email_id,
                        role_id,
                        approval_position,
                        approval_position_id,
                        is_active
                `,
                [
                    userId,
                    ROLE_IDS.ADMIN
                ]
            );


        if (
            result.rows.length === 0
        ) {

            const checkAdmin =
                await pool.query(
                    `
                        SELECT
                            user_id,
                            role_id
                        FROM user_table
                        WHERE user_id = $1
                    `,
                    [
                        userId
                    ]
                );


            if (
                checkAdmin.rows.length > 0 &&
                checkAdmin.rows[0].role_id ===
                    ROLE_IDS.ADMIN
            ) {

                return res.status(403).json({
                    message:
                        "Admin account cannot be deactivated"
                });
            }


            return res.status(404).json({
                message:
                    "User not found"
            });
        }


        const row =
            result.rows[0];


        const user =
            formatUser(row);


        return res.status(200).json({

            message:
                "User deactivated successfully",

            user
        });


    } catch (error) {

        console.error(
            "Deactivate user error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to deactivate user"
        });
    }
};


// ============================================================
// REACTIVATE USER
// PATCH /api/admin/users/:id/reactivate
// ============================================================

const reactivateUser = async (
    req,
    res
) => {

    try {

        const userId =
            Number(req.params.id);


        if (
            !Number.isInteger(userId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });
        }


        const result =
            await pool.query(
                `
                    UPDATE user_table

                    SET
                        is_active = TRUE

                    WHERE user_id = $1
                    AND role_id <> $2

                    RETURNING
                        user_id,
                        employee_code,
                        user_name,
                        phone_number,
                        email_id,
                        role_id,
                        approval_position,
                        approval_position_id,
                        is_active
                `,
                [
                    userId,
                    ROLE_IDS.ADMIN
                ]
            );


        if (
            result.rows.length === 0
        ) {

            const checkUser =
                await pool.query(
                    `
                        SELECT
                            user_id,
                            role_id
                        FROM user_table
                        WHERE user_id = $1
                    `,
                    [
                        userId
                    ]
                );


            if (
                checkUser.rows.length > 0 &&
                checkUser.rows[0].role_id ===
                    ROLE_IDS.ADMIN
            ) {

                return res.status(403).json({
                    message:
                        "Admin account status cannot be changed here"
                });
            }


            return res.status(404).json({
                message:
                    "User not found"
            });
        }


        const row =
            result.rows[0];


        const user =
            formatUser(row);


        return res.status(200).json({

            message:
                "User reactivated successfully",

            user
        });


    } catch (error) {

        console.error(
            "Reactivate user error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to reactivate user"
        });
    }
};


// ============================================================
// DELETE USER
// DELETE /api/admin/users/:id
// ============================================================

const deleteUser = async (
    req,
    res
) => {

    try {

        const userId =
            Number(req.params.id);


        if (
            !Number.isInteger(userId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });
        }


        const result =
            await pool.query(
                `
                    DELETE FROM user_table

                    WHERE user_id = $1
                    AND role_id <> $2

                    RETURNING
                        user_id,
                        employee_code,
                        user_name,
                        email_id
                `,
                [
                    userId,
                    ROLE_IDS.ADMIN
                ]
            );


        if (
            result.rows.length === 0
        ) {

            const checkUser =
                await pool.query(
                    `
                        SELECT
                            user_id,
                            role_id
                        FROM user_table
                        WHERE user_id = $1
                    `,
                    [
                        userId
                    ]
                );


            if (
                checkUser.rows.length > 0 &&
                checkUser.rows[0].role_id ===
                    ROLE_IDS.ADMIN
            ) {

                return res.status(403).json({
                    message:
                        "Admin account cannot be deleted"
                });
            }


            return res.status(404).json({
                message:
                    "User not found"
            });
        }


        return res.status(200).json({

            message:
                "User deleted successfully",

            user: {

                id:
                    result.rows[0].user_id,

                employee_code:
                    result.rows[0].employee_code,

                name:
                    result.rows[0].user_name,

                email:
                    result.rows[0].email_id
            }
        });


    } catch (error) {

        console.error(
            "Delete user error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to delete user"
        });
    }
};


// ============================================================
// RESET USER PASSWORD
// PATCH /api/admin/users/:id/reset-password
// ============================================================

const resetUserPassword = async (
    req,
    res
) => {

    try {

        const userId =
            Number(req.params.id);


        const {
            newPassword
        } = req.body;


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !Number.isInteger(userId)
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });
        }


        if (
            !newPassword ||
            typeof newPassword !== "string"
        ) {

            return res.status(400).json({
                message:
                    "New password is required"
            });
        }


        if (
            newPassword.length < 8
        ) {

            return res.status(400).json({
                message:
                    "Password must contain at least 8 characters"
            });
        }


        // ----------------------------------------------------
        // GET USER
        // ----------------------------------------------------

        const existingUser =
            await pool.query(
                `
                    SELECT
                        user_id,
                        role_id,
                        user_name,
                        email_id
                    FROM user_table
                    WHERE user_id = $1
                `,
                [
                    userId
                ]
            );


        if (
            existingUser.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    "User not found"
            });
        }


        const user =
            existingUser.rows[0];


        /*
         * Admin password cannot be reset through
         * another user's User Management action.
         */

        if (
            user.role_id ===
            ROLE_IDS.ADMIN
        ) {

            return res.status(403).json({
                message:
                    "Admin password cannot be reset from User Management"
            });
        }


        // ----------------------------------------------------
        // HASH PASSWORD
        // ----------------------------------------------------

        const passwordHash =
            await bcrypt.hash(
                newPassword,
                10
            );


        // ----------------------------------------------------
        // UPDATE PASSWORD
        // ----------------------------------------------------

        const result =
            await pool.query(
                `
                    UPDATE user_table

                    SET
                        password_hash = $1,
                        session_token = NULL

                    WHERE user_id = $2

                    RETURNING
                        user_id,
                        user_name,
                        email_id
                `,
                [
                    passwordHash,
                    userId
                ]
            );


        return res.status(200).json({

            message:
                "User password reset successfully",

            user: {

                id:
                    result.rows[0].user_id,

                name:
                    result.rows[0].user_name,

                email:
                    result.rows[0].email_id
            }
        });


    } catch (error) {

        console.error(
            "Reset user password error:",
            error
        );


        return res.status(500).json({
            message:
                "Failed to reset user password"
        });
    }
};


// ============================================================
// EXPORT CONTROLLERS
// ============================================================

module.exports = {

    getUsers,

    createUser,

    updateUser,

    updateUserRole,

    deactivateUser,

    reactivateUser,

    deleteUser,

    resetUserPassword
};