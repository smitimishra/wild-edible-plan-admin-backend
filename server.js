const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env"),
});

const pool = require("./config/db");

// WEB APPLICATION ROUTES

const requestRoutes = require("./routes/requestRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminroutes");
const sessionRoutes = require("./routes/sessionroutes");
const profileRoutes = require("./routes/profileroutes");

// DESKTOP ADMIN ROUTES

const desktopAdminRoutes =
    require("./routes/desktopadminRoutes");

const desktopAuthRoutes =
    require("./routes/desktopAuthRoutes");

const adminAuthMiddleware =
    require("./middleware/desktopAdminMiddleware");

const dataManagementRoutes =
    require("./routes/PlantdataManagementRoutes");

const userActivityRoutes =
    require("./routes/userActivityRoutes");

const applicationUsageRoutes =
    require("./routes/applicationUsageRoutes");

const feedbackRoutes =
    require("./routes/feedbackRoutes");

const reviewerFeedbackRoutes =
    require("./routes/reviewerFeedbackRoutes");

// APP

const app = express();

// TRUST PROXY

app.set("trust proxy", 1);

// MIDDLEWARE

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

// SERVE UPLOADED FILES

app.use(
    "/uploads",
    express.static(
        path.join(__dirname, "uploads")
    )
);

// WEB APPLICATION API ROUTES

// Request / approval workflow

app.use(
    "/api/requests",
    requestRoutes
);

// Web application authentication

app.use(
    "/api/auth",
    authRoutes
);

// Existing Web Admin APIs

app.use(
    "/api/admin",
    adminRoutes
);

// Sessions

app.use(
    "/api/sessions",
    sessionRoutes
);

// User profile

app.use(
    "/api/profile",
    profileRoutes
);

// DESKTOP ADMIN AUTHENTICATION

app.use(
    "/api/desktop-auth",
    desktopAuthRoutes
);

// DESKTOP ADMIN USER ACTIVITY
//
// Existing user activity APIs.
// Keep this temporarily while the new
// standalone Activity Logs module is being tested.
//

app.use(
    "/api/admin",
    adminAuthMiddleware,
    userActivityRoutes
);

// DESKTOP ADMIN APPLICATION USAGE / ACTIVITY LOGS
//
// GET /api/admin/activity-logs
// GET /api/admin/activity-logs/summary
//

app.use(
    "/api/admin/activity-logs",
    adminAuthMiddleware,
    applicationUsageRoutes
);

// DESKTOP ADMIN USER MANAGEMENT
//
// GET    /api/admin/users
// POST   /api/admin/users
// PUT    /api/admin/users/:id
// PATCH  /api/admin/users/:id/deactivate
// PATCH  /api/admin/users/:id/reactivate
// DELETE /api/admin/users/:id
// PATCH  /api/admin/users/:id/reset-password
//

app.use(
    "/api/admin",
    adminAuthMiddleware,
    desktopAdminRoutes
);

// DESKTOP ADMIN PLANT DATA MANAGEMENT

app.use(
    "/api/admin/data-management",
    adminAuthMiddleware,
    dataManagementRoutes
);

// FEEDBACK
//
// Field Staff / Reviewer feedback
//

app.use(
    "/api/admin/feedback",
    feedbackRoutes
);

app.use(
    "/api/feedback",
    reviewerFeedbackRoutes
);

// ROOT TEST ROUTE

app.get(
    "/",
    (req, res) => {

        res.status(200).json({
            message:
                "Wild Plant Unified Backend is running"
        });

    }
);

// DATABASE TEST ROUTE

app.get(
    "/api/test-db",
    async (req, res) => {

        try {

            const result =
                await pool.query("SELECT NOW()");

            res.status(200).json({
                message:
                    "Database connection successful",

                databaseTime:
                    result.rows[0].now
            });

        } catch (error) {

            console.error(
                "Database connection failed:",
                error
            );

            res.status(500).json({
                message:
                    "Database connection failed",

                error:
                    error.message
            });

        }

    }
);

// HEALTH CHECK

app.get(
    "/health",
    async (req, res) => {

        try {

            await pool.query("SELECT 1");

            res.status(200).json({
                status: "OK",
                database: "connected"
            });

        } catch (error) {

            console.error(
                "Database health check failed:",
                error
            );

            res.status(500).json({
                status: "ERROR",
                database: "disconnected"
            });

        }

    }
);

// 404 - ROUTE NOT FOUND

app.use(
    (req, res) => {

        console.warn(
            `404 - Route not found: ${req.method} ${req.originalUrl}`
        );

        res.status(404).json({
            message: "Route not found",
            method: req.method,
            path: req.originalUrl
        });

    }
);

// GLOBAL ERROR HANDLER

app.use(
    (error, req, res, next) => {

        console.error(
            "Unhandled server error:",
            error
        );

        res.status(500).json({
            message:
                "Internal server error"
        });

    }
);

// START SERVER

const PORT =
    Number(process.env.PORT || 3001);

const startServer = async () => {

    try {

        await pool.query("SELECT 1");

        console.log(
            "PostgreSQL connection verified"
        );

        const server = app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `Wild Plant Unified Backend running on port ${PORT}`
                );

                console.log(
                    `http://localhost:${PORT}`
                );

                console.log(
                    `http://192.168.29.51:${PORT}`
                );

                console.log(
                    "Web APIs:"
                );

                console.log(
                    `http://localhost:${PORT}/api`
                );

                console.log(
                    "Desktop Admin APIs:"
                );

                console.log(
                    `http://localhost:${PORT}/api/admin`
                );

                console.log(
                    "Activity Logs API:"
                );

                console.log(
                    `http://localhost:${PORT}/api/admin/activity-logs`
                );

            }
        );

        server.on(
            "error",
            (error) => {

                console.error(
                    "SERVER ERROR:",
                    error
                );

            }
        );

    } catch (error) {

        console.error(
            "Unable to start unified backend:",
            error
        );

        process.exit(1);

    }

};

startServer();