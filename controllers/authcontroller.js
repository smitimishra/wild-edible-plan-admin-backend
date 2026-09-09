const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");


// ============================================================
// LOGIN
// ============================================================

const login = async (req, res) => {
    try {

        const {
            email,
            password
        } = req.body;


        // --------------------------------------------------------
        // VALIDATION
        // --------------------------------------------------------

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }


        const normalizedEmail =
            String(email).trim().toLowerCase();


        // ========================================================
        // GET USER FROM NEW USER TABLE
        // ========================================================

        const result = await pool.query(
            `
            SELECT
                u.user_id,
                u.employee_code,
                u.user_name,
                u.phone_number,
                u.email_id,
                u.password_hash,
                u.is_active,
                u.role_id,
                u.approval_position_id,
                u.approval_position,

                r.role_name

            FROM public.user_table u

            LEFT JOIN public.role_table r
                ON r.role_id = u.role_id

            WHERE LOWER(u.email_id) = LOWER($1)

            LIMIT 1
            `,
            [normalizedEmail]
        );


        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }


        const user = result.rows[0];


        // ========================================================
        // CHECK ACTIVE USER
        // ========================================================

        if (user.is_active === false) {
            return res.status(403).json({
                message: "Your account is inactive. Please contact the administrator."
            });
        }


        // ========================================================
        // CHECK PASSWORD
        // ========================================================

        if (!user.password_hash) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }


        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }


        // ========================================================
        // NORMALIZE ROLE
        // ========================================================

        const role =
            user.role_name
                ? String(user.role_name).trim().toUpperCase()
                : "";


        console.log("================================================");
        console.log("LOGIN USER");
        console.log("User ID:", user.user_id);
        console.log("Email:", user.email_id);
        console.log("Role ID:", user.role_id);
        console.log("Role:", role);
        console.log("================================================");


        if (!role) {
            return res.status(403).json({
                message: "User role is not configured. Please contact the administrator."
            });
        }


        // ========================================================
        // CHECK EXISTING ACTIVE SESSION
        // ========================================================

        const existingSession =
            await pool.query(
                `
                SELECT
                    session_id,
                    user_id,
                    is_active,
                    created_at
                FROM public.user_sessions
                WHERE user_id = $1
                  AND is_active = true
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [user.user_id]
            );


        if (existingSession.rows.length > 0) {

            return res.status(409).json({
                message: "active_session_exists",
                existing_session_id:
                    existingSession.rows[0].session_id
            });

        }


        // ========================================================
        // CREATE NEW SESSION
        // ========================================================

        const sessionId =
            uuidv4();


        const expiresAt =
            new Date(
                Date.now() +
                60 * 60 * 1000
            );


        // ========================================================
        // CREATE JWT
        // ========================================================

        const token =
            jwt.sign(
                {
                    id: user.user_id,

                    user_id: user.user_id,

                    employee_id: user.user_id,

                    employee_code:
                        user.employee_code,

                    email:
                        user.email_id,

                    role: role,

                    role_id:
                        user.role_id,

                    session_id:
                        sessionId
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: "1h"
                }
            );


        // ========================================================
        // SAVE SESSION
        // ========================================================

        await pool.query(
            `
            INSERT INTO public.user_sessions (
                user_id,
                session_id,
                is_active,
                expires_at
            )
            VALUES (
                $1,
                $2,
                true,
                $3
            )
            `,
            [
                user.user_id,
                sessionId,
                expiresAt
            ]
        );


        // ========================================================
        // RESPONSE
        // ========================================================

        return res.status(200).json({

            message: "Login successful",

            token: token,

            user: {

                id:
                    user.user_id,

                user_id:
                    user.user_id,

                employee_id:
                    user.user_id,

                employee_code:
                    user.employee_code,

                name:
                    user.user_name,

                user_name:
                    user.user_name,

                phone_number:
                    user.phone_number,

                email:
                    user.email_id,

                email_id:
                    user.email_id,

                role:
                    role,

                role_id:
                    user.role_id,

                approval_position_id:
                    user.approval_position_id,

                approval_position:
                    user.approval_position,

                is_active:
                    user.is_active

            }

        });

    }

    catch (error) {

        console.error(
            "Login error:",
            error
        );

        return res.status(500).json({
            message: "Unable to process login request"
        });

    }
};



// ============================================================
// REGISTER
// ============================================================

const register = async (req, res) => {

    try {

        const {
            name,
            user_name,
            phone_number,
            email,
            email_id,
            password,
            employee_code
        } = req.body;


        // --------------------------------------------------------
        // NORMALIZE
        // --------------------------------------------------------

        const finalUserName =
            String(
                user_name ||
                name ||
                ""
            ).trim();


        const finalEmail =
            String(
                email_id ||
                email ||
                ""
            ).trim().toLowerCase();


        const finalPhone =
            phone_number
                ? String(phone_number).trim()
                : null;


        // --------------------------------------------------------
        // VALIDATION
        // --------------------------------------------------------

        if (
            !finalUserName ||
            !finalEmail ||
            !password
        ) {

            return res.status(400).json({
                message:
                    "Name, email and password are required"
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                message:
                    "Password must be at least 6 characters long"
            });

        }


        // ========================================================
        // CHECK EXISTING EMAIL
        // ========================================================

        const existingEmail =
            await pool.query(
                `
                SELECT
                    user_id
                FROM public.user_table
                WHERE LOWER(email_id) = LOWER($1)
                LIMIT 1
                `,
                [finalEmail]
            );


        if (existingEmail.rows.length > 0) {

            return res.status(409).json({
                message:
                    "A user with this email already exists"
            });

        }


        // ========================================================
        // HASH PASSWORD
        // ========================================================

        const passwordHash =
            await bcrypt.hash(
                password,
                10
            );


        // ========================================================
        // GET EMPLOYEE ROLE
        // ========================================================

        const roleResult =
            await pool.query(
                `
                SELECT
                    role_id,
                    role_name
                FROM public.role_table
                WHERE UPPER(role_name) = 'EMPLOYEE'
                LIMIT 1
                `
            );


        if (roleResult.rows.length === 0) {

            return res.status(500).json({
                message:
                    "Employee role is not configured"
            });

        }


        const employeeRole =
            roleResult.rows[0];


        // ========================================================
        // GENERATE USER ID IF NEEDED
        // ========================================================

        let finalUserId;


        if (
            employee_code !== undefined &&
            employee_code !== null &&
            String(employee_code).trim() !== ""
        ) {

            // Employee code is kept as supplied.
            // User ID is still generated by the database sequence
            // when not explicitly provided.

            finalUserId = null;

        }


        // ========================================================
        // INSERT USER
        // ========================================================

        let insertQuery;
        let insertValues;


        if (finalUserId !== null) {

            insertQuery =
                `
                INSERT INTO public.user_table (
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    password_hash,
                    employee_code,
                    is_active
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    true
                )
                RETURNING
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active
                `;

            insertValues = [
                finalUserId,
                employeeRole.role_id,
                finalUserName,
                finalPhone,
                finalEmail,
                passwordHash,
                String(employee_code).trim()
            ];

        }

        else {

            insertQuery =
                `
                INSERT INTO public.user_table (
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    password_hash,
                    is_active
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    true
                )
                RETURNING
                    user_id,
                    role_id,
                    user_name,
                    phone_number,
                    email_id,
                    employee_code,
                    is_active
                `;

            insertValues = [
                employeeRole.role_id,
                finalUserName,
                finalPhone,
                finalEmail,
                passwordHash
            ];

        }


        const result =
            await pool.query(
                insertQuery,
                insertValues
            );


        const createdUser =
            result.rows[0];


        // ========================================================
        // RESPONSE
        // ========================================================

        return res.status(201).json({

            message:
                "Registration successful",

            user: {

                id:
                    createdUser.user_id,

                user_id:
                    createdUser.user_id,

                employee_code:
                    createdUser.employee_code,

                role_id:
                    createdUser.role_id,

                role:
                    "EMPLOYEE",

                name:
                    createdUser.user_name,

                user_name:
                    createdUser.user_name,

                phone_number:
                    createdUser.phone_number,

                email:
                    createdUser.email_id,

                email_id:
                    createdUser.email_id,

                is_active:
                    createdUser.is_active

            }

        });

    }

    catch (error) {

        console.error(
            "Register error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to process registration"
        });

    }

};



// ============================================================
// FORGOT PASSWORD
// ============================================================

const forgotPassword = async (req, res) => {

    try {

        const {
            email
        } = req.body;


        if (!email) {

            return res.status(400).json({
                message:
                    "Email is required"
            });

        }


        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        // ========================================================
        // FIND USER
        // ========================================================

        const result =
            await pool.query(
                `
                SELECT
                    user_id,
                    email_id,
                    user_name
                FROM public.user_table
                WHERE LOWER(email_id) = LOWER($1)
                LIMIT 1
                `,
                [normalizedEmail]
            );


        /*
         * Do not reveal whether an email exists.
         */

        if (result.rows.length === 0) {

            return res.status(200).json({
                message:
                    "If an account exists with this email, a password reset link has been sent."
            });

        }


        const user =
            result.rows[0];


        // ========================================================
        // CREATE RESET TOKEN
        // ========================================================

        const resetToken =
            crypto.randomBytes(32).toString("hex");


        const tokenHash =
            crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");


        const expiresAt =
            new Date(
                Date.now() +
                15 * 60 * 1000
            );


        // ========================================================
        // STORE RESET TOKEN
        // ========================================================

        await pool.query(
            `
            UPDATE public.user_table
            SET
                password_reset_token_hash = $1,
                password_reset_expires_at = $2
            WHERE user_id = $3
            `,
            [
                tokenHash,
                expiresAt,
                user.user_id
            ]
        );


        // ========================================================
        // RESET URL
        // ========================================================

        const frontendUrl =
            process.env.FRONTEND_URL ||
            "http://localhost:4200";


        const resetUrl =
            `${frontendUrl}/reset-password?token=${resetToken}`;


        // ========================================================
        // MAILER
        // ========================================================

        const transporter =
            nodemailer.createTransport({

                host:
                    process.env.EMAIL_HOST,

                port:
                    Number(
                        process.env.EMAIL_PORT ||
                        587
                    ),

                secure:
                    String(
                        process.env.EMAIL_SECURE
                    ) === "true",

                auth: {

                    user:
                        process.env.EMAIL_USER,

                    pass:
                        process.env.EMAIL_APP_PASSWORD

                }

            });


        // ========================================================
        // SEND EMAIL
        // ========================================================

        await transporter.sendMail({

            from:
                process.env.EMAIL_USER,

            to:
                normalizedEmail,

            subject:
                "Password Reset - Plant Approval Workflow",

            html: `

                <div
                    style="
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                    "
                >

                    <h2>
                        Password Reset
                    </h2>

                    <p>
                        We received a request to reset your password.
                    </p>

                    <p>
                        Click the button below to reset your password.
                    </p>

                    <p>

                        <a
                            href="${resetUrl}"
                            style="
                                display:inline-block;
                                padding:12px 20px;
                                background:#059669;
                                color:white;
                                text-decoration:none;
                                border-radius:6px;
                            "
                        >
                            Reset Password
                        </a>

                    </p>

                    <p>
                        This link will expire in 15 minutes.
                    </p>

                    <p>
                        If you did not request a password reset,
                        you can safely ignore this email.
                    </p>

                </div>

            `

        });


        return res.status(200).json({

            message:
                "If an account exists with this email, a password reset link has been sent."

        });

    }

    catch (error) {

        console.error(
            "Forgot password error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to process password reset request"
        });

    }

};



// ============================================================
// RESET PASSWORD
// ============================================================

const resetPassword = async (req, res) => {

    try {

        const {
            token,
            newPassword
        } = req.body;


        // --------------------------------------------------------
        // VALIDATION
        // --------------------------------------------------------

        if (!token || !newPassword) {

            return res.status(400).json({
                message:
                    "Token and new password are required"
            });

        }


        if (newPassword.length < 6) {

            return res.status(400).json({
                message:
                    "Password must be at least 6 characters long"
            });

        }


        // ========================================================
        // HASH TOKEN
        // ========================================================

        const tokenHash =
            crypto
                .createHash("sha256")
                .update(token)
                .digest("hex");


        // ========================================================
        // FIND VALID TOKEN
        // ========================================================

        const result =
            await pool.query(
                `
                SELECT
                    user_id
                FROM public.user_table
                WHERE
                    password_reset_token_hash = $1
                    AND password_reset_expires_at > NOW()
                LIMIT 1
                `,
                [tokenHash]
            );


        if (result.rows.length === 0) {

            return res.status(400).json({
                message:
                    "Invalid or expired password reset token"
            });

        }


        const userId =
            result.rows[0].user_id;


        // ========================================================
        // HASH NEW PASSWORD
        // ========================================================

        const passwordHash =
            await bcrypt.hash(
                newPassword,
                10
            );


        // ========================================================
        // UPDATE PASSWORD
        // ========================================================

        await pool.query(
            `
            UPDATE public.user_table
            SET
                password_hash = $1,
                password_reset_token_hash = NULL,
                password_reset_expires_at = NULL
            WHERE user_id = $2
            `,
            [
                passwordHash,
                userId
            ]
        );


        // ========================================================
        // INVALIDATE EXISTING SESSIONS
        // ========================================================

        await pool.query(
            `
            UPDATE public.user_sessions
            SET
                is_active = false,
                invalidated_at = CURRENT_TIMESTAMP,
                invalidation_reason = 'password_reset'
            WHERE user_id = $1
              AND is_active = true
            `,
            [userId]
        );


        return res.status(200).json({

            message:
                "Password reset successfully"

        });

    }

    catch (error) {

        console.error(
            "Reset password error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to reset password"
        });

    }

};



// ============================================================
// FORCE LOGOUT SESSION
// ============================================================

const forceLogoutSession = async (req, res) => {

    try {

        const {
            session_id
        } = req.body;


        if (!session_id) {

            return res.status(400).json({
                message:
                    "session_id is required"
            });

        }


        await pool.query(
            `
            UPDATE public.user_sessions
            SET
                is_active = false,
                invalidated_at = CURRENT_TIMESTAMP,
                invalidation_reason =
                    'forced_logout_by_new_login'
            WHERE session_id = $1
            `,
            [session_id]
        );


        return res.status(200).json({

            message:
                "Session invalidated successfully"

        });

    }

    catch (error) {

        console.error(
            "forceLogoutSession error:",
            error
        );

        return res.status(500).json({

            message:
                "Failed to invalidate session",

            error:
                error.message

        });

    }

};



// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    login,

    register,

    forgotPassword,

    resetPassword,

    forceLogoutSession

};