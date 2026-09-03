const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");


// ============================================================
// GET ALL USERS
// ADMIN ONLY
// ============================================================

const getUsers = async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT
                id,
                employee_code,
                name,
                email,
                role,
                approval_position,
                created_at,
                is_active
            FROM users
            ORDER BY name
            `
        );

        return res.status(200).json({
            users: result.rows
        });

    } catch (error) {

        console.error(
            "Admin get users error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to retrieve users"
        });

    }

};


// ============================================================
// CREATE USER
// ADMIN ONLY
// ============================================================

const createUser = async (req, res) => {

    try {

        const {
            employee_code,
            name,
            email,
            role
        } = req.body;


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !employee_code ||
            !name ||
            !email ||
            !role
        ) {

            return res.status(400).json({
                message:
                    "Employee code, name, email and role are required"
            });

        }


        // ----------------------------------------------------
        // NORMALIZE VALUES
        // ----------------------------------------------------

        const normalizedEmployeeCode =
            employee_code.trim();

        const normalizedName =
            name.trim();

        const normalizedEmail =
            email
                .trim()
                .toLowerCase();

        const normalizedRole =
            role
                .trim()
                .toUpperCase();


        if (!normalizedRole) {

            return res.status(400).json({
                message:
                    "Role cannot be empty"
            });

        }


        // ----------------------------------------------------
        // APPROVAL POSITION
        //
        // EMPLOYEE cannot approve anything.
        //
        // EMPLOYEE -> NULL
        //
        // Any other role -> same role
        // ----------------------------------------------------

        const approvalPosition =
            normalizedRole === "EMPLOYEE"
                ? null
                : normalizedRole;


        // ----------------------------------------------------
        // CHECK EXISTING EMAIL
        // ----------------------------------------------------

        const existingEmail =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE LOWER(email) = $1
                `,
                [
                    normalizedEmail
                ]
            );


        if (
            existingEmail.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "A user with this email already exists"
            });

        }


        // ----------------------------------------------------
        // CHECK EXISTING EMPLOYEE CODE
        // ----------------------------------------------------

        const existingEmployeeCode =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE employee_code = $1
                `,
                [
                    normalizedEmployeeCode
                ]
            );


        if (
            existingEmployeeCode.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "A user with this employee code already exists"
            });

        }


        // ----------------------------------------------------
        // GENERATE TEMPORARY PASSWORD
        // ----------------------------------------------------

        const temporaryPassword =
            crypto
                .randomBytes(9)
                .toString("base64url");


        // ----------------------------------------------------
        // HASH PASSWORD
        // ----------------------------------------------------

        const passwordHash =
            await bcrypt.hash(
                temporaryPassword,
                10
            );


        // ----------------------------------------------------
        // INSERT USER
        // ----------------------------------------------------

        const result =
            await pool.query(
                `
                INSERT INTO users (
                    employee_code,
                    name,
                    email,
                    role,
                    approval_position,
                    password_hash,
                    is_active
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    TRUE
                )
                RETURNING
                    id,
                    employee_code,
                    name,
                    email,
                    role,
                    approval_position,
                    created_at,
                    is_active
                `,
                [
                    normalizedEmployeeCode,
                    normalizedName,
                    normalizedEmail,
                    normalizedRole,
                    approvalPosition,
                    passwordHash
                ]
            );


        return res.status(201).json({

            message:
                "User created successfully",

            user:
                result.rows[0],

            temporaryPassword

        });

    } catch (error) {

        console.error(
            "Admin create user error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to create user"
        });

    }

};


// ============================================================
// UPDATE USER
// ADMIN ONLY
// ============================================================

const updateUser = async (req, res) => {

    try {

        const userId =
            Number(req.params.id);


        // ----------------------------------------------------
        // VALIDATE ID
        // ----------------------------------------------------

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });

        }


        const {
            employee_code,
            name,
            email,
            role
        } = req.body;


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !employee_code ||
            !name ||
            !email ||
            !role
        ) {

            return res.status(400).json({
                message:
                    "Employee code, name, email and role are required"
            });

        }


        // ----------------------------------------------------
        // NORMALIZE VALUES
        // ----------------------------------------------------

        const normalizedEmployeeCode =
            employee_code.trim();

        const normalizedName =
            name.trim();

        const normalizedEmail =
            email
                .trim()
                .toLowerCase();

        const normalizedRole =
            role
                .trim()
                .toUpperCase();


        if (!normalizedRole) {

            return res.status(400).json({
                message:
                    "Role cannot be empty"
            });

        }


        // ----------------------------------------------------
        // APPROVAL POSITION
        // ----------------------------------------------------

        const approvalPosition =
            normalizedRole === "EMPLOYEE"
                ? null
                : normalizedRole;


        // ----------------------------------------------------
        // CHECK USER EXISTS
        // ----------------------------------------------------

        const existingUser =
            await pool.query(
                `
                SELECT
                    id,
                    role
                FROM users
                WHERE id = $1
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


        // ----------------------------------------------------
        // CHECK EMAIL
        // ----------------------------------------------------

        const existingEmail =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE LOWER(email) = $1
                AND id <> $2
                `,
                [
                    normalizedEmail,
                    userId
                ]
            );


        if (
            existingEmail.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "A user with this email already exists"
            });

        }


        // ----------------------------------------------------
        // CHECK EMPLOYEE CODE
        // ----------------------------------------------------

        const existingEmployeeCode =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE employee_code = $1
                AND id <> $2
                `,
                [
                    normalizedEmployeeCode,
                    userId
                ]
            );


        if (
            existingEmployeeCode.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "A user with this employee code already exists"
            });

        }


        // ----------------------------------------------------
        // PREVENT CHANGING ADMIN ROLE
        // ----------------------------------------------------

        const currentRole =
            existingUser.rows[0].role;


        if (
            String(currentRole).toUpperCase() === "ADMIN" &&
            normalizedRole !== "ADMIN"
        ) {

            return res.status(403).json({
                message:
                    "The ADMIN role cannot be changed"
            });

        }


        // ----------------------------------------------------
        // UPDATE USER
        // ----------------------------------------------------

        const result =
            await pool.query(
                `
                UPDATE users
                SET
                    employee_code = $1,
                    name = $2,
                    email = $3,
                    role = $4,
                    approval_position = $5
                WHERE id = $6
                RETURNING
                    id,
                    employee_code,
                    name,
                    email,
                    role,
                    approval_position,
                    created_at,
                    is_active
                `,
                [
                    normalizedEmployeeCode,
                    normalizedName,
                    normalizedEmail,
                    normalizedRole,
                    approvalPosition,
                    userId
                ]
            );


        return res.status(200).json({

            message:
                "User successfully updated",

            user:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "Admin update user error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to update user"
        });

    }

};


// ============================================================
// DEACTIVATE USER
// ADMIN ONLY
// ============================================================

const deactivateUser = async (req, res) => {

    try {

        const userId =
            Number(req.params.id);


        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });

        }


        const userResult =
            await pool.query(
                `
                SELECT
                    id,
                    role,
                    is_active
                FROM users
                WHERE id = $1
                `,
                [
                    userId
                ]
            );


        if (
            userResult.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    "User not found"
            });

        }


        const user =
            userResult.rows[0];


        if (
            String(user.role).toUpperCase() === "ADMIN"
        ) {

            return res.status(403).json({
                message:
                    "The ADMIN account cannot be deactivated"
            });

        }


        if (!user.is_active) {

            return res.status(400).json({
                message:
                    "User is already inactive"
            });

        }


        const result =
            await pool.query(
                `
                UPDATE users
                SET is_active = FALSE
                WHERE id = $1
                RETURNING
                    id,
                    employee_code,
                    name,
                    email,
                    role,
                    approval_position,
                    created_at,
                    is_active
                `,
                [
                    userId
                ]
            );


        return res.status(200).json({

            message:
                "User deactivated successfully",

            user:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "Admin deactivate user error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to deactivate user"
        });

    }

};


// ============================================================
// REACTIVATE USER
// ADMIN ONLY
// ============================================================

const reactivateUser = async (req, res) => {

    try {

        const userId =
            Number(req.params.id);


        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });

        }


        const userResult =
            await pool.query(
                `
                SELECT
                    id,
                    is_active
                FROM users
                WHERE id = $1
                `,
                [
                    userId
                ]
            );


        if (
            userResult.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    "User not found"
            });

        }


        if (
            userResult.rows[0].is_active
        ) {

            return res.status(400).json({
                message:
                    "User is already active"
            });

        }


        const result =
            await pool.query(
                `
                UPDATE users
                SET is_active = TRUE
                WHERE id = $1
                RETURNING
                    id,
                    employee_code,
                    name,
                    email,
                    role,
                    approval_position,
                    created_at,
                    is_active
                `,
                [
                    userId
                ]
            );


        return res.status(200).json({

            message:
                "User reactivated successfully",

            user:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "Admin reactivate user error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to reactivate user"
        });

    }

};


// ============================================================
// PERMANENTLY DELETE USER
// ADMIN ONLY
// ============================================================

const deleteUser = async (req, res) => {

    try {

        const userId =
            Number(req.params.id);


        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(400).json({
                message:
                    "Invalid user ID"
            });

        }


        const userResult =
            await pool.query(
                `
                SELECT
                    id,
                    employee_code,
                    name,
                    email,
                    role
                FROM users
                WHERE id = $1
                `,
                [
                    userId
                ]
            );


        if (
            userResult.rows.length === 0
        ) {

            return res.status(404).json({
                message:
                    "User not found"
            });

        }


        const user =
            userResult.rows[0];


        // ----------------------------------------------------
        // NEVER DELETE ADMIN
        // ----------------------------------------------------

        if (
            String(user.role).toUpperCase() === "ADMIN"
        ) {

            return res.status(403).json({
                message:
                    "The ADMIN account cannot be permanently deleted"
            });

        }


        // ----------------------------------------------------
        // PREVENT SELF DELETE
        // ----------------------------------------------------

        if (
            req.user &&
            Number(req.user.id) === userId
        ) {

            return res.status(403).json({
                message:
                    "You cannot permanently delete your own account"
            });

        }


        // ----------------------------------------------------
        // CHECK APPROVAL REQUEST REFERENCES
        // ----------------------------------------------------

        const requestReference =
            await pool.query(
                `
                SELECT id
                FROM approval_requests
                WHERE employee_id = $1
                LIMIT 1
                `,
                [
                    userId
                ]
            );


        if (
            requestReference.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "This user cannot be permanently deleted because they are associated with existing approval requests. Deactivate the user instead."
            });

        }


        // ----------------------------------------------------
        // CHECK APPROVAL HISTORY REFERENCES
        // ----------------------------------------------------

        const historyReference =
            await pool.query(
                `
                SELECT id
                FROM approval_history
                WHERE approver_id = $1
                LIMIT 1
                `,
                [
                    userId
                ]
            );


        if (
            historyReference.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "This user cannot be permanently deleted because they are associated with approval history. Deactivate the user instead."
            });

        }


        // ----------------------------------------------------
        // CHECK REQUEST ATTACHMENTS
        // ----------------------------------------------------

        const attachmentReference =
            await pool.query(
                `
                SELECT id
                FROM request_attachments
                WHERE request_id IN (
                    SELECT id
                    FROM approval_requests
                    WHERE employee_id = $1
                )
                LIMIT 1
                `,
                [
                    userId
                ]
            );


        if (
            attachmentReference.rows.length > 0
        ) {

            return res.status(409).json({
                message:
                    "This user cannot be permanently deleted because their requests contain attachments. Deactivate the user instead."
            });

        }


        // ----------------------------------------------------
        // DELETE USER
        // ----------------------------------------------------

        await pool.query(
            `
            DELETE FROM users
            WHERE id = $1
            `,
            [
                userId
            ]
        );


        return res.status(200).json({

            message:
                "User permanently deleted",

            user: {

                id:
                    user.id,

                employee_code:
                    user.employee_code,

                name:
                    user.name,

                email:
                    user.email

            }

        });

    } catch (error) {

        console.error(
            "Admin delete user error:",
            error
        );


        if (
            error.code === "23503"
        ) {

            return res.status(409).json({
                message:
                    "This user cannot be permanently deleted because other records depend on this user. Deactivate the user instead."
            });

        }


        return res.status(500).json({
            message:
                "Unable to permanently delete user"
        });

    }

};


// ============================================================
// GET APPROVAL WORKFLOW HIERARCHY
// ADMIN ONLY
// ============================================================

// ============================================================
// GET APPROVAL WORKFLOW HIERARCHY
// ADMIN ONLY
// ============================================================

const getHierarchy = async (req, res) => {

    try {

        const result =
            await pool.query(
                `
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
                `
            );


        return res.status(200).json({

            hierarchy:
                result.rows

        });

    } catch (error) {

        console.error(
            "Admin get hierarchy error:",
            error
        );


        return res.status(500).json({

            message:
                "Unable to retrieve approval hierarchy"

        });

    }

};


// ============================================================
// ADD APPROVAL WORKFLOW LEVEL
// ADMIN ONLY
// ============================================================

const addHierarchyLevel = async (req, res) => {

    const client = await pool.connect();

    try {

        const {
            approval_level,
            role
        } = req.body;

        const level = Number(approval_level);

        // ----------------------------------------------------
        // VALIDATE LEVEL
        // ----------------------------------------------------

        if (
            !Number.isInteger(level) ||
            level <= 0
        ) {

            return res.status(400).json({
                message: "Approval level must be a positive integer"
            });

        }

        // ----------------------------------------------------
        // VALIDATE ROLE
        // ----------------------------------------------------

        if (
            typeof role !== "string" ||
            !role.trim()
        ) {

            return res.status(400).json({
                message: "Role is required"
            });

        }

        const normalizedRole =
            role.trim().toUpperCase();

        // ----------------------------------------------------
        // EMPLOYEE IS NOT AN APPROVAL HIERARCHY LEVEL
        // ----------------------------------------------------

        if (normalizedRole === "EMPLOYEE") {

            return res.status(400).json({
                message:
                    "EMPLOYEE cannot be an approval position"
            });

        }

        await client.query("BEGIN");

        // ----------------------------------------------------
        // LOCK HIERARCHY
        // ----------------------------------------------------

        const hierarchyResult =
            await client.query(`
                SELECT
                    id,
                    approval_level,
                    role
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
                FOR UPDATE
            `);

        const hierarchy =
            hierarchyResult.rows;

        const currentCount =
            hierarchy.length;

        const nextAvailableLevel =
            currentCount + 1;

        // ----------------------------------------------------
        // NO GAPS
        // ----------------------------------------------------

        if (level > nextAvailableLevel) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message:
                    `Approval level cannot be greater than ${nextAvailableLevel}`
            });

        }

        // ----------------------------------------------------
        // CHECK DUPLICATE ROLE
        // ----------------------------------------------------

        const duplicateRole =
            hierarchy.find(
                item =>
                    String(item.role).trim().toUpperCase() ===
                    normalizedRole
            );

        if (duplicateRole) {

            await client.query("ROLLBACK");

            return res.status(409).json({
                message:
                    "This role already exists in the approval hierarchy"
            });

        }

        // ----------------------------------------------------
        // SHIFT EXISTING LEVELS
        //
        // IMPORTANT:
        // Update from highest level DOWNWARD.
        //
        // Example:
        //
        // 1 HR
        // 2 MANAGER
        // 3 EMPLOYEE
        //
        // Insert at 2:
        //
        // 3 -> 4
        // 2 -> 3
        //
        // Then insert new level 2.
        //
        // This avoids duplicate unique-key values.
        // ----------------------------------------------------

        for (
            let index = hierarchy.length - 1;
            index >= 0;
            index--
        ) {

            const item =
                hierarchy[index];

            const currentLevel =
                Number(item.approval_level);

            if (currentLevel >= level) {

                await client.query(
                    `
                    UPDATE approval_workflow_hierarchy
                    SET
                        approval_level = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    `,
                    [
                        currentLevel + 1,
                        item.id
                    ]
                );

            }

        }

        // ----------------------------------------------------
        // INSERT NEW LEVEL
        // ----------------------------------------------------

        const inserted =
            await client.query(
                `
                INSERT INTO approval_workflow_hierarchy (
                    approval_level,
                    role
                )
                VALUES (
                    $1,
                    $2
                )
                RETURNING
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                `,
                [
                    level,
                    normalizedRole
                ]
            );

        await client.query("COMMIT");

        // ----------------------------------------------------
        // RETURN COMPLETE HIERARCHY
        // ----------------------------------------------------

        const finalHierarchy =
            await pool.query(`
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
            `);

        return res.status(201).json({

            message:
                "Approval hierarchy level added successfully",

            hierarchy:
                finalHierarchy.rows,

            added:
                inserted.rows[0]

        });

    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Admin add hierarchy rollback error:",
                rollbackError
            );
        }

        console.error(
            "Admin add hierarchy level error:",
            error
        );

        if (error.code === "23505") {

            return res.status(409).json({
                message:
                    "Approval level or role already exists"
            });

        }

        if (error.code === "23514") {

            return res.status(400).json({
                message:
                    "Approval level must always be a positive integer"
            });

        }

        return res.status(500).json({
            message:
                "Unable to add approval hierarchy level"
        });

    } finally {

        client.release();

    }

};


// ============================================================
// UPDATE APPROVAL WORKFLOW LEVEL
// ADMIN ONLY
// ============================================================

const updateHierarchyLevel = async (req, res) => {

    const client = await pool.connect();

    try {

        const hierarchyId =
            Number(req.params.id);

        // ----------------------------------------------------
        // VALIDATE ID
        // ----------------------------------------------------

        if (
            !Number.isInteger(hierarchyId) ||
            hierarchyId <= 0
        ) {

            return res.status(400).json({
                message: "Invalid hierarchy ID"
            });

        }

        const {
            approval_level,
            role
        } = req.body;

        const newLevel =
            Number(approval_level);

        // ----------------------------------------------------
        // VALIDATE LEVEL
        // ----------------------------------------------------

        if (
            !Number.isInteger(newLevel) ||
            newLevel <= 0
        ) {

            return res.status(400).json({
                message:
                    "Approval level must be a positive integer"
            });

        }

        // ----------------------------------------------------
        // VALIDATE ROLE
        // ----------------------------------------------------

        if (
            typeof role !== "string" ||
            !role.trim()
        ) {

            return res.status(400).json({
                message: "Role is required"
            });

        }

        const normalizedRole =
            role.trim().toUpperCase();

        // ----------------------------------------------------
        // EMPLOYEE CANNOT BE AN APPROVAL LEVEL
        // ----------------------------------------------------

        if (
            normalizedRole === "EMPLOYEE"
        ) {

            return res.status(400).json({
                message:
                    "EMPLOYEE cannot be an approval position"
            });

        }

        await client.query("BEGIN");

        // ----------------------------------------------------
        // LOCK COMPLETE HIERARCHY
        // ----------------------------------------------------

        const hierarchyResult =
            await client.query(`
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
                FOR UPDATE
            `);

        const hierarchy =
            hierarchyResult.rows;

        // ----------------------------------------------------
        // FIND CURRENT LEVEL
        // ----------------------------------------------------

        const currentIndex =
            hierarchy.findIndex(
                item =>
                    Number(item.id) === hierarchyId
            );

        if (
            currentIndex === -1
        ) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                message:
                    "Approval hierarchy level not found"
            });

        }

        const current =
            hierarchy[currentIndex];

        const currentLevel =
            Number(current.approval_level);

        const hierarchyCount =
            hierarchy.length;

        // ----------------------------------------------------
        // EDIT CANNOT CREATE A NEW LEVEL
        // ----------------------------------------------------

        if (
            newLevel > hierarchyCount
        ) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message:
                    `Approval level cannot be greater than ${hierarchyCount}`
            });

        }

        // ----------------------------------------------------
        // CHECK DUPLICATE ROLE
        // ----------------------------------------------------

        const duplicateRole =
            hierarchy.find(
                item =>
                    Number(item.id) !== hierarchyId &&
                    String(item.role).trim().toUpperCase() ===
                        normalizedRole
            );

        if (
            duplicateRole
        ) {

            await client.query("ROLLBACK");

            return res.status(409).json({
                message:
                    "This role already exists in the approval hierarchy"
            });

        }

        // ====================================================
        // SAME LEVEL
        // ====================================================

        if (
            currentLevel === newLevel
        ) {

            const updated =
                await client.query(
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
                    [
                        normalizedRole,
                        hierarchyId
                    ]
                );

            await client.query("COMMIT");

            const finalHierarchy =
                await pool.query(`
                    SELECT
                        id,
                        approval_level,
                        role,
                        created_at,
                        updated_at
                    FROM approval_workflow_hierarchy
                    ORDER BY approval_level ASC
                `);

            return res.status(200).json({

                message:
                    "Approval hierarchy level updated successfully",

                hierarchy:
                    finalHierarchy.rows,

                updated:
                    updated.rows[0]

            });

        }

        // ====================================================
        // IMPORTANT:
        //
        // Temporarily move the edited row to a POSITIVE level
        // outside the normal hierarchy.
        //
        // Example with 3 levels:
        //
        // 1 MANAGER
        // 2 ASSISTANT MANAGER
        // 3 HR
        //
        // MANAGER temporarily becomes level 4.
        //
        // We NEVER use -1 or 0.
        // ====================================================

        const temporaryLevel =
            hierarchyCount + 1;

        await client.query(
            `
            UPDATE approval_workflow_hierarchy
            SET
                approval_level = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            `,
            [
                temporaryLevel,
                hierarchyId
            ]
        );

        // ====================================================
        // MOVE DOWN
        //
        // Example:
        //
        // 1 MANAGER
        // 2 ASSISTANT MANAGER
        // 3 HR
        //
        // MANAGER 1 → 2
        //
        // MANAGER is temporarily at 4.
        //
        // Then:
        //
        // ASSISTANT MANAGER 2 → 1
        //
        // Finally:
        //
        // MANAGER 4 → 2
        // ====================================================

        if (
            newLevel > currentLevel
        ) {

            for (
                let level = currentLevel + 1;
                level <= newLevel;
                level++
            ) {

                const item =
                    hierarchy.find(
                        row =>
                            Number(row.approval_level) === level
                    );

                if (
                    !item ||
                    Number(item.id) === hierarchyId
                ) {

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
                    [
                        level - 1,
                        item.id
                    ]
                );

            }

        }

        // ====================================================
        // MOVE UP
        //
        // Example:
        //
        // 1 HR
        // 2 MANAGER
        // 3 ASSISTANT MANAGER
        //
        // ASSISTANT MANAGER 3 → 1
        //
        // ASSISTANT MANAGER is temporarily at 4.
        //
        // Then:
        //
        // MANAGER 2 → 3
        // HR 1 → 2
        //
        // Finally:
        //
        // ASSISTANT MANAGER 4 → 1
        // ====================================================

        else {

            for (
                let level = currentLevel - 1;
                level >= newLevel;
                level--
            ) {

                const item =
                    hierarchy.find(
                        row =>
                            Number(row.approval_level) === level
                    );

                if (
                    !item ||
                    Number(item.id) === hierarchyId
                ) {

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
                    [
                        level + 1,
                        item.id
                    ]
                );

            }

        }

        // ====================================================
        // PUT EDITED ROW INTO ITS FINAL POSITION
        // ====================================================

        const updated =
            await client.query(
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
                [
                    newLevel,
                    normalizedRole,
                    hierarchyId
                ]
            );

        // ====================================================
        // COMMIT TRANSACTION
        // ====================================================

        await client.query("COMMIT");

        // ====================================================
        // RETURN COMPLETE HIERARCHY
        // ====================================================

        const finalHierarchy =
            await pool.query(`
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
            `);

        return res.status(200).json({

            message:
                "Approval hierarchy level updated successfully",

            hierarchy:
                finalHierarchy.rows,

            updated:
                updated.rows[0]

        });

    } catch (error) {

        try {

            await client.query("ROLLBACK");

        } catch (rollbackError) {

            console.error(
                "Admin update hierarchy rollback error:",
                rollbackError
            );

        }

        console.error(
            "Admin update hierarchy level error:",
            error
        );

        if (
            error.code === "23505"
        ) {

            return res.status(409).json({
                message:
                    "Approval level or role already exists"
            });

        }

        if (
            error.code === "23514"
        ) {

            return res.status(400).json({
                message:
                    "Approval level must always be a positive integer"
            });

        }

        return res.status(500).json({
            message:
                "Unable to update approval hierarchy level"
        });

    } finally {

        client.release();

    }

};
// ============================================================
// DELETE APPROVAL WORKFLOW LEVEL
// ADMIN ONLY
// ============================================================

const deleteHierarchyLevel = async (req, res) => {

    const client = await pool.connect();

    try {

        const hierarchyId =
            Number(req.params.id);

        if (
            !Number.isInteger(hierarchyId) ||
            hierarchyId <= 0
        ) {

            return res.status(400).json({
                message:
                    "Invalid hierarchy ID"
            });

        }

        await client.query("BEGIN");

        // ----------------------------------------------------
        // LOCK HIERARCHY
        // ----------------------------------------------------

        const hierarchyResult =
            await client.query(`
                SELECT
                    id,
                    approval_level,
                    role
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
                FOR UPDATE
            `);

        const hierarchy =
            hierarchyResult.rows;

        const currentIndex =
            hierarchy.findIndex(
                item =>
                    Number(item.id) === hierarchyId
            );

        if (currentIndex === -1) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                message:
                    "Approval hierarchy level not found"
            });

        }

        const deletedLevel =
            Number(
                hierarchy[currentIndex].approval_level
            );

        // ----------------------------------------------------
        // DELETE SELECTED LEVEL FIRST
        // ----------------------------------------------------

        await client.query(
            `
            DELETE FROM approval_workflow_hierarchy
            WHERE id = $1
            `,
            [
                hierarchyId
            ]
        );

        // ----------------------------------------------------
        // SHIFT LEVELS ABOVE DELETED LEVEL DOWN
        //
        // Example:
        //
        // 1 HR
        // 2 MANAGER
        // 3 ASSISTANT MANAGER
        // 4 EMPLOYEE
        //
        // Delete level 2.
        //
        // 3 -> 2
        // 4 -> 3
        //
        // Updating from low to high avoids conflicts.
        // ----------------------------------------------------

        for (
            let index = currentIndex + 1;
            index < hierarchy.length;
            index++
        ) {

            const item =
                hierarchy[index];

            await client.query(
                `
                UPDATE approval_workflow_hierarchy
                SET
                    approval_level = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                `,
                [
                    Number(item.approval_level) - 1,
                    item.id
                ]
            );

        }

        await client.query("COMMIT");

        // ----------------------------------------------------
        // RETURN COMPLETE HIERARCHY
        // ----------------------------------------------------

        const finalHierarchy =
            await pool.query(`
                SELECT
                    id,
                    approval_level,
                    role,
                    created_at,
                    updated_at
                FROM approval_workflow_hierarchy
                ORDER BY approval_level ASC
            `);

        return res.status(200).json({

            message:
                "Approval hierarchy level deleted successfully",

            deleted_id:
                hierarchyId,

            deleted_level:
                deletedLevel,

            hierarchy:
                finalHierarchy.rows

        });

    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Admin delete hierarchy rollback error:",
                rollbackError
            );
        }

        console.error(
            "Admin delete hierarchy level error:",
            error
        );

        if (error.code === "23514") {

            return res.status(400).json({
                message:
                    "Approval level must always be a positive integer"
            });

        }

        return res.status(500).json({
            message:
                "Unable to delete approval hierarchy level"
        });

    } finally {

        client.release();

    }

};

// ============================================================
// EXPORTS
// ============================================================

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
    deleteHierarchyLevel

};