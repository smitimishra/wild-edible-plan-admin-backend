const pool = require("../config/db");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const {
    sendDesktopOtpEmail,
    sendDesktopResendOtpEmail
} = require("../services/emailService");

const {
    logApplicationUsage
} = require("../services/applicationUsageLogger");

const OTP_EXPIRY_MINUTES = Number(
    process.env.OTP_EXPIRY_MINUTES || 5
);

const OTP_MAX_ATTEMPTS = Number(
    process.env.OTP_MAX_ATTEMPTS || 5
);

const generateOtp = () => {
    return crypto
        .randomInt(100000, 1000000)
        .toString();
};

const hashOtp = (otp) => {
    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
};

const login = async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();

        const result = await pool.query(
            `
            SELECT
                user_id,
                employee_code,
                user_name,
                email_id,
                password_hash,
                role_id,
                is_active
            FROM user_table
            WHERE LOWER(email_id) = LOWER($1)
            `,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        if (user.is_active === false) {
            return res.status(403).json({
                message:
                    "Your account has been deactivated. Please contact the administrator."
            });
        }

        if (Number(user.role_id) !== 1) {
            return res.status(403).json({
                message:
                    "Access denied. This desktop application is for administrators only."
            });
        }

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordMatch) {

            await logApplicationUsage({
                userId: user.user_id,
                action: "LOGIN_FAILED",
                description: "Invalid password.",
                sessionId: null,
                ipAddress: req.ip || null,
                deviceType: "Desktop"
            });

            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        await pool.query(
            `
            UPDATE desktop_otp_verifications
            SET verified = TRUE
            WHERE user_id = $1
              AND verified = FALSE
            `,
            [user.user_id]
        );

        const otp = generateOtp();

        const otpHash = hashOtp(otp);

        const expiresAt =
            new Date(
                Date.now() +
                OTP_EXPIRY_MINUTES * 60 * 1000
            );

        await pool.query(
            `
            INSERT INTO desktop_otp_verifications
            (
                user_id,
                otp_hash,
                expires_at,
                attempts,
                verified
            )
            VALUES
            (
                $1,
                $2,
                $3,
                0,
                FALSE
            )
            `,
            [
                user.user_id,
                otpHash,
                expiresAt
            ]
        );

        await sendDesktopOtpEmail({
            email: user.email_id,
            userName: user.user_name,
            otp,
            expiryMinutes: OTP_EXPIRY_MINUTES
        });

        return res.status(200).json({
            message: "OTP sent successfully",
            otpRequired: true,
            userId: user.user_id,
            email: user.email_id,
            expiresInMinutes: OTP_EXPIRY_MINUTES
        });

    } catch (error) {

        console.error(
            "Desktop login error:",
            error
        );

        return res.status(500).json({
            message: "Desktop login failed",
            error: error.message
        });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const {
            userId,
            otpCode
        } = req.body;

        if (!userId || !otpCode) {
            return res.status(400).json({
                message:
                    "userId and otpCode are required"
            });
        }

        const normalizedOtp =
            String(otpCode).trim();

        if (!/^\d{6}$/.test(normalizedOtp)) {
            return res.status(400).json({
                message:
                    "OTP must be a 6-digit number"
            });
        }

        const otpResult = await pool.query(
            `
            SELECT
                id,
                user_id,
                otp_hash,
                expires_at,
                attempts,
                verified
            FROM desktop_otp_verifications
            WHERE user_id = $1
              AND verified = FALSE
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [userId]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({
                message:
                    "No active OTP found. Please request a new OTP."
            });
        }

        const otpRecord =
            otpResult.rows[0];

        if (
            new Date(
                otpRecord.expires_at
            ).getTime() <= Date.now()
        ) {
            return res.status(400).json({
                message:
                    "OTP has expired. Please request a new OTP."
            });
        }

        if (
            Number(otpRecord.attempts) >=
            OTP_MAX_ATTEMPTS
        ) {
            return res.status(429).json({
                message:
                    "Maximum OTP attempts exceeded. Please request a new OTP."
            });
        }

        const suppliedHash =
            hashOtp(normalizedOtp);

        if (
            suppliedHash !==
            otpRecord.otp_hash
        ) {

            const newAttempts =
                Number(otpRecord.attempts) + 1;

            await pool.query(
                `
                UPDATE desktop_otp_verifications
                SET attempts = $1
                WHERE id = $2
                `,
                [
                    newAttempts,
                    otpRecord.id
                ]
            );

            await logApplicationUsage({
                userId: Number(userId),
                action: "OTP_FAILED",
                description:
                    `Invalid OTP entered. Attempts used: ${newAttempts}.`,
                sessionId: null,
                ipAddress: req.ip || null,
                deviceType: "Desktop"
            });

            const attemptsLeft =
                Math.max(
                    0,
                    OTP_MAX_ATTEMPTS -
                    newAttempts
                );

            return res.status(401).json({
                message: "Invalid OTP",
                attemptsLeft
            });
        }

        const userResult = await pool.query(
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
            `,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const user =
            userResult.rows[0];

        if (user.is_active === false) {
            return res.status(403).json({
                message:
                    "Your account has been deactivated."
            });
        }

        if (Number(user.role_id) !== 1) {
            return res.status(403).json({
                message:
                    "Access denied. Administrators only."
            });
        }

        await pool.query(
            `
            UPDATE desktop_otp_verifications
            SET
                verified = TRUE,
                verified_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [otpRecord.id]
        );

        const sessionId =
            uuidv4();

        const expiresAt =
            new Date(
                Date.now() +
                60 * 60 * 1000
            );

        const token =
            jwt.sign(
                {
                    id:
                        user.user_id,

                    name:
                        user.user_name || "",

                    email:
                        user.email_id,

                    role:
                        "ADMIN",

                    role_id:
                        Number(user.role_id),

                    employee_code:
                        user.employee_code || "",

                    session_id:
                        sessionId
                },

                process.env.JWT_SECRET,

                {
                    expiresIn:
                        "1h"
                }
            );

        await pool.query(
            `
            INSERT INTO user_sessions
            (
                user_id,
                session_id,
                is_active,
                created_at,
                last_activity,
                expires_at,
                device_type,
                ip_address
            )
            VALUES
            (
                $1,
                $2,
                TRUE,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                $3,
                $4,
                $5
            )
            `,
            [
                user.user_id,
                sessionId,
                expiresAt,
                "Desktop",
                req.ip || null
            ]
        );

        await logApplicationUsage({
            userId: user.user_id,
            action: "LOGIN",
            description:
                "User logged in successfully after OTP verification.",
            sessionId: sessionId,
            ipAddress: req.ip || null,
            deviceType: "Desktop"
        });

        return res.status(200).json({
            message:
                "OTP verified successfully",

            token,

            user: {
                id:
                    user.user_id,

                employee_code:
                    user.employee_code,

                name:
                    user.user_name,

                email:
                    user.email_id,

                role:
                    "ADMIN",

                role_id:
                    Number(user.role_id),

                session_id:
                    sessionId
            }
        });

    } catch (error) {

        console.error(
            "Desktop OTP verification error:",
            error
        );

        return res.status(500).json({
            message:
                "OTP verification failed",

            error:
                error.message
        });
    }
};

const resendOtp = async (req, res) => {
    try {
        const {
            userId
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                message:
                    "userId is required"
            });
        }

        const result = await pool.query(
            `
            SELECT
                user_id,
                user_name,
                email_id,
                role_id,
                is_active
            FROM user_table
            WHERE user_id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message:
                    "User not found"
            });
        }

        const user =
            result.rows[0];

        if (Number(user.role_id) !== 1) {
            return res.status(403).json({
                message:
                    "Access denied. Administrators only."
            });
        }

        if (user.is_active === false) {
            return res.status(403).json({
                message:
                    "Your account has been deactivated."
            });
        }

        await pool.query(
            `
            UPDATE desktop_otp_verifications
            SET verified = TRUE
            WHERE user_id = $1
              AND verified = FALSE
            `,
            [user.user_id]
        );

        const otp =
            generateOtp();

        const otpHash =
            hashOtp(otp);

        const expiresAt =
            new Date(
                Date.now() +
                OTP_EXPIRY_MINUTES * 60 * 1000
            );

        await pool.query(
            `
            INSERT INTO desktop_otp_verifications
            (
                user_id,
                otp_hash,
                expires_at,
                attempts,
                verified
            )
            VALUES
            (
                $1,
                $2,
                $3,
                0,
                FALSE
            )
            `,
            [
                user.user_id,
                otpHash,
                expiresAt
            ]
        );

        await sendDesktopResendOtpEmail({
            email: user.email_id,
            userName: user.user_name,
            otp,
            expiryMinutes: OTP_EXPIRY_MINUTES
        });

        return res.status(200).json({
            message:
                "OTP resent successfully",

            otpRequired:
                true,

            userId:
                user.user_id,

            email:
                user.email_id,

            expiresInMinutes:
                OTP_EXPIRY_MINUTES
        });

    } catch (error) {

        console.error(
            "Desktop resend OTP error:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to resend OTP",

            error:
                error.message
        });
    }
};

const logout = async (req, res) => {
    try {
        const sessionId =
            req.user?.session_id;

        if (!sessionId) {
            return res.status(400).json({
                message:
                    "Session ID is required"
            });
        }

        await pool.query(
            `
            UPDATE user_sessions
            SET
                is_active = FALSE,
                invalidated_at = CURRENT_TIMESTAMP,
                invalidation_reason = 'desktop_logout'
            WHERE session_id = $1
            `,
            [sessionId]
        );

        await logApplicationUsage({
            userId:
                req.user?.id ||
                req.user?.user_id,
            action: "LOGOUT",
            description:
                "User logged out successfully.",
            sessionId: sessionId,
            ipAddress: req.ip || null,
            deviceType: "Desktop"
        });

        return res.status(200).json({
            message:
                "Logged out successfully"
        });

    } catch (error) {

        console.error(
            "Desktop logout error:",
            error
        );

        return res.status(500).json({
            message:
                "Logout failed",

            error:
                error.message
        });
    }
};

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
            UPDATE user_sessions
            SET
                is_active = FALSE,
                invalidated_at = CURRENT_TIMESTAMP,
                invalidation_reason =
                    'forced_logout_by_desktop_login'
            WHERE session_id = $1
            `,
            [session_id]
        );

        return res.status(200).json({
            message:
                "Existing session invalidated successfully"
        });

    } catch (error) {

        console.error(
            "Desktop force logout error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to invalidate existing session"
        });
    }
};

module.exports = {
    login,
    verifyOtp,
    resendOtp,
    logout,
    forceLogoutSession
};