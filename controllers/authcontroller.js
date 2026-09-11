const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const { getNumericSetting } = require("./settingscontroller");

// LOGIN

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // VALIDATION

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // LOAD LOCKOUT SETTINGS

    const [maxAttempts, lockoutHours] = await Promise.all([
      getNumericSetting("login_max_attempts", 3),
      getNumericSetting("login_lockout_hours", 1),
    ]);

    const windowMs = lockoutHours * 60 * 60 * 1000;

    // CHECK IF ACCOUNT IS CURRENTLY LOCKED
    // Count failed attempts within the lockout window

    const attemptsResult = await pool.query(
      `
            SELECT COUNT(*) AS cnt
            FROM   login_attempts
            WHERE  email        = $1
              AND  success      = FALSE
              AND  attempted_at > NOW() - ($2 || ' hours')::INTERVAL
            `,
      [normalizedEmail, lockoutHours],
    );

    const recentFailed = parseInt(attemptsResult.rows[0].cnt, 10);

    if (recentFailed >= maxAttempts) {
      // Find when the lockout window started
      // (the oldest failed attempt within the window)
      const oldestResult = await pool.query(
        `
                SELECT attempted_at
                FROM   login_attempts
                WHERE  email        = $1
                  AND  success      = FALSE
                  AND  attempted_at > NOW() - ($2 || ' hours')::INTERVAL
                ORDER BY attempted_at ASC
                LIMIT 1
                `,
        [normalizedEmail, lockoutHours],
      );

      const lockedSince = oldestResult.rows[0]?.attempted_at
        ? new Date(oldestResult.rows[0].attempted_at)
        : new Date();

      const unlocksAt = new Date(lockedSince.getTime() + windowMs);

      const minutesLeft = Math.max(
        1,
        Math.ceil((unlocksAt.getTime() - Date.now()) / 60000),
      );

      return res.status(429).json({
        message: "account_locked",
        lockedUntil: unlocksAt.toISOString(),
        minutesLeft,
        lockoutHours,
      });
    }

    // FIND USER

    const result = await pool.query(
      `
            SELECT
                id,
                employee_code,
                name,
                email,
                role,
                password_hash,
                is_active
            FROM users
            WHERE LOWER(email) = LOWER($1)
            `,
      [normalizedEmail],
    );

    // USER NOT FOUND — record failed attempt

    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO login_attempts (email, success, ip_address)
                 VALUES ($1, FALSE, $2)`,
        [normalizedEmail, req.ip ?? null],
      );

      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    // CHECK ACCOUNT STATUS

    if (user.is_active === false) {
      return res.status(403).json({
        message:
          "Your account has been deactivated. Please contact the administrator.",
      });
    }

    // CHECK PASSWORD

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Record failed attempt
      await pool.query(
        `INSERT INTO login_attempts (email, success, ip_address)
                 VALUES ($1, FALSE, $2)`,
        [normalizedEmail, req.ip ?? null],
      );

      // Count again after recording to give accurate "attempts left"
      const afterResult = await pool.query(
        `
                SELECT COUNT(*) AS cnt
                FROM   login_attempts
                WHERE  email        = $1
                  AND  success      = FALSE
                  AND  attempted_at > NOW() - ($2 || ' hours')::INTERVAL
                `,
        [normalizedEmail, lockoutHours],
      );

      const totalFailed = parseInt(afterResult.rows[0].cnt, 10);
      const attemptsLeft = Math.max(0, maxAttempts - totalFailed);

      if (attemptsLeft === 0) {
        // Just got locked — find the lockout start time
        const oldestResult2 = await pool.query(
          `
                    SELECT attempted_at
                    FROM   login_attempts
                    WHERE  email        = $1
                      AND  success      = FALSE
                      AND  attempted_at > NOW() - ($2 || ' hours')::INTERVAL
                    ORDER BY attempted_at ASC
                    LIMIT 1
                    `,
          [normalizedEmail, lockoutHours],
        );

        const lockedSince2 = oldestResult2.rows[0]?.attempted_at
          ? new Date(oldestResult2.rows[0].attempted_at)
          : new Date();

        const unlocksAt2 = new Date(lockedSince2.getTime() + windowMs);

        return res.status(429).json({
          message: "account_locked",
          lockedUntil: unlocksAt2.toISOString(),
          minutesLeft: Math.ceil(lockoutHours * 60),
          lockoutHours,
        });
      }

      return res.status(401).json({
        message: "Invalid email or password",
        attemptsLeft,
      });
    }

    // CHECK FOR EXISTING ACTIVE SESSION

    const existingSession = await pool.query(
      `SELECT id, session_id
             FROM user_sessions
             WHERE user_id = $1
               AND is_active = true
             ORDER BY created_at DESC
             LIMIT 1`,
      [user.id],
    );

    if (existingSession.rows.length > 0) {
      return res.status(409).json({
        message: "active_session_exists",

        existing_session_id: existingSession.rows[0].session_id,
      });
    }

    // RECORD SUCCESSFUL ATTEMPT — clear lockout window

    await pool.query(
      `INSERT INTO login_attempts (email, success, ip_address)
             VALUES ($1, TRUE, $2)`,
      [normalizedEmail, req.ip ?? null],
    );

    // CREATE JWT

    const sessionId = uuidv4();

    const expiresAt = new Date(
      Date.now() + 60 * 60 * 1000, // 1 hour
    );

    const token = jwt.sign(
      {
        id: user.id,

        email: user.email,

        role: user.role,

        session_id: sessionId,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: "1h",
      },
    );

    // RECORD SESSION IN user_sessions TABLE

    await pool.query(
      `INSERT INTO user_sessions
                 (user_id, session_id, is_active, created_at, last_activity, expires_at)
             VALUES
                 ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
      [user.id, sessionId, expiresAt],
    );

    // LOGIN RESPONSE

    return res.status(200).json({
      message: "Login successful",

      token,

      user: {
        id: user.id,

        employee_code: user.employee_code,

        name: user.name,

        email: user.email,

        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Login failed",

      error: error.message,
    });
  }
};

// REGISTER
// NOTE:
// Registration creates normal EMPLOYEE accounts.
// ADMIN creates MANAGER / HR accounts through the Admin panel.

const register = async (req, res) => {
  try {
    const { employee_code, name, email, password } = req.body;

    // VALIDATION

    if (!employee_code || !name || !email || !password) {
      return res.status(400).json({
        message: "Employee code, name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    // NORMALIZE VALUES

    const normalizedEmployeeCode = employee_code.trim();

    const normalizedName = name.trim();

    const normalizedEmail = email.trim().toLowerCase();

    // CHECK EXISTING EMAIL

    const existingEmail = await pool.query(
      `
                SELECT id
                FROM users
                WHERE LOWER(email) = $1
                `,
      [normalizedEmail],
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    // CHECK EXISTING EMPLOYEE CODE

    const existingEmployeeCode = await pool.query(
      `
                SELECT id
                FROM users
                WHERE employee_code = $1
                `,
      [normalizedEmployeeCode],
    );

    if (existingEmployeeCode.rows.length > 0) {
      return res.status(409).json({
        message: "A user with this employee code already exists",
      });
    }

    // HASH PASSWORD

    const passwordHash = await bcrypt.hash(password, 10);

    // CREATE EMPLOYEE

    const result = await pool.query(
      `
                INSERT INTO users (
                    employee_code,
                    name,
                    email,
                    role,
                    password_hash,
                    is_active,
                    manager_id
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    'EMPLOYEE',
                    $4,
                    TRUE,
                    NULL
                )
                RETURNING
                    id,
                    employee_code,
                    name,
                    email,
                    role,
                    is_active,
                    manager_id,
                    created_at
                `,
      [normalizedEmployeeCode, normalizedName, normalizedEmail, passwordHash],
    );

    // RESPONSE

    return res.status(201).json({
      message: "Employee registered successfully",

      user: result.rows[0],
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      message: "Unable to register user",
    });
  }
};

// FORGOT PASSWORD

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // VALIDATION

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // FIND USER

    const result = await pool.query(
      `
                SELECT
                    id,
                    email
                FROM users
                WHERE LOWER(email) = $1
                `,
      [normalizedEmail],
    );

    // SAME RESPONSE WHETHER USER EXISTS OR NOT

    if (result.rows.length === 0) {
      return res.status(200).json({
        message:
          "If an account exists with this email, a password reset link has been sent.",
      });
    }

    const user = result.rows[0];

    // GENERATE RESET TOKEN

    const resetToken = crypto.randomBytes(32).toString("hex");

    // HASH RESET TOKEN

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // TOKEN EXPIRATION
    // 15 MINUTES

    const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // SAVE TOKEN

    await pool.query(
      `
            UPDATE users
            SET
                password_reset_token_hash = $1,
                password_reset_expires_at = $2
            WHERE id = $3
            `,
      [resetTokenHash, resetExpiresAt, user.id],
    );

    // RESET URL

    const resetUrl = `http://192.168.29.218:4200/reset-password?token=${resetToken}`;

    // EMAIL TRANSPORTER

    const transporter = nodemailer.createTransport({
      service: "gmail",

      auth: {
        user: process.env.EMAIL_USER,

        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    // SEND EMAIL

    await transporter.sendMail({
      from: process.env.EMAIL_USER,

      to: normalizedEmail,

      subject: "Password Reset - Plant Approval Workflow",

      html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">

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
            `,
    });

    // RESPONSE

    return res.status(200).json({
      message:
        "If an account exists with this email, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      message: "Unable to process password reset request",
    });
  }
};

// RESET PASSWORD

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // VALIDATION

    if (!token || !newPassword) {
      return res.status(400).json({
        message: "Token and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    // HASH TOKEN

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // FIND VALID TOKEN

    const result = await pool.query(
      `
                SELECT
                    id
                FROM users
                WHERE
                    password_reset_token_hash = $1
                    AND password_reset_expires_at > NOW()
                `,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or expired password reset token",
      });
    }

    const userId = result.rows[0].id;

    // HASH NEW PASSWORD

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // UPDATE PASSWORD
    // CLEAR RESET TOKEN

    await pool.query(
      `
            UPDATE users
            SET
                password_hash = $1,
                password_reset_token_hash = NULL,
                password_reset_expires_at = NULL
            WHERE id = $2
            `,
      [passwordHash, userId],
    );

    // RESPONSE

    return res.status(200).json({
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      message: "Unable to reset password",
    });
  }
};

// FORCE LOGOUT SESSION
// Called when the user clicks OK on the "already logged in on
// another device" popup.  Marks the existing session inactive
// so the next login attempt can proceed.

const forceLogoutSession = async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "session_id is required",
      });
    }

    await pool.query(
      `UPDATE user_sessions
             SET    is_active          = false,
                    invalidated_at     = CURRENT_TIMESTAMP,
                    invalidation_reason = 'forced_logout_by_new_login'
             WHERE  session_id = $1`,
      [session_id],
    );

    return res.status(200).json({
      message: "Session invalidated successfully",
    });
  } catch (error) {
    console.error("forceLogoutSession error:", error);

    return res.status(500).json({
      message: "Failed to invalidate session",
      error: error.message,
    });
  }
};

// EXPORTS

module.exports = {
  login,
  register,
  forgotPassword,
  resetPassword,
  forceLogoutSession,
};
