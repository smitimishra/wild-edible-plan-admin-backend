const express = require("express");

const {
    getApplicationUsageLogs,
    getApplicationUsageSummary
} = require("../controllers/applicationUsageController");

const router = express.Router();

router.get(
    "/",
    getApplicationUsageLogs
);

router.get(
    "/summary",
    getApplicationUsageSummary
);

module.exports = router;