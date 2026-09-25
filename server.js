const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});
const pool = require("./config/db");
const fieldUserPlantRoutes = require("./routes/fielduserplantroutes");
const plantRoutes = require("./routes/plantRoutes");
const requestRoutes = require("./routes/requestroutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminroutes");
const sessionRoutes = require("./routes/sessionroutes");
const profileRoutes = require("./routes/profileroutes");


const app = express();

app.use(cors());

app.use(express.json());

// ============================================================
// SERVE UPLOADED FILES
// ============================================================

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============================================================
// API ROUTES
// ============================================================

app.use("/api/requests", requestRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/sessions", sessionRoutes);

app.use("/api/profile", profileRoutes);

// ============================================================
// ROOT TEST ROUTE
// ============================================================

app.get("/", (req, res) => {
  res.json({
    message: "Approval workflow API is running",
  });
});

// ============================================================
// DATABASE TEST ROUTE
// ============================================================

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "Database connection successful",

      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Database connection failed",

      error: error.message,
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3001;

const server =
    app.listen(
        PORT,
        () => {

            console.log(
                `Server running on http://192.168.29.69:${PORT}`
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
