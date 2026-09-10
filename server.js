const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({
    path: path.join(__dirname, ".env")
});
const pool = require("./config/db");
const fieldUserPlantRoutes = require("./routes/fielduserplantroutes");
const plantRoutes = require("./routes/plantRoutes");
const requestRoutes = require("./routes/requestroutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminroutes");



const app = express();


app.use(cors());

app.use(express.json());







// ============================================================
// SERVE UPLOADED FILES
// ============================================================

app.use(
    "/uploads",
    express.static(
        path.join(__dirname, "uploads")
    )
);


// ============================================================
// API ROUTES
// ============================================================

app.use(
    "/api/requests",
    requestRoutes
);

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/plants",
    plantRoutes
);

app.use("/api/admin", (req, res, next) => {
    console.log("ADMIN REQUEST:", req.method, req.originalUrl);
    next();
});

app.use("/api/admin", adminRoutes);

app.use(
    "/api/field-user",
    fieldUserPlantRoutes
);

console.log("=== ADMIN ROUTES REGISTERED ===");

console.log(
    adminRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
            path: layer.route.path,
            methods: Object.keys(layer.route.methods)
        }))
);

// ============================================================
// ROOT TEST ROUTE
// ============================================================

app.get("/", (req, res) => {

    res.json({

        message:
            "Approval workflow API is running"

    });

});


// ============================================================
// DATABASE TEST ROUTE
// ============================================================

app.get(
    "/api/test-db",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    "SELECT NOW()"
                );


            res.json({

                message:
                    "Database connection successful",

                databaseTime:
                    result.rows[0].now

            });

        } catch (error) {

            console.error(error);


            res.status(500).json({

                message:
                    "Database connection failed",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// START SERVER
// ============================================================

const PORT =
    process.env.PORT || 3001;


const server =
    app.listen(
        PORT,
        () => {

            console.log(
                `Server running on http://192.168.29.216:${PORT}`
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
