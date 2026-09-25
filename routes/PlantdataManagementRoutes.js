const express = require("express");

const {
    getPlants,
    permanentlyDeletePlant,
    getOldUsers,
    getOldUserById,
    permanentlyDeleteOldUser
} = require("../../../Admin-Desktop-Console/Desktop-Admin-App/backend/controllers/PlantdataManagementController");

const router = express.Router();

// Plant Data
router.get("/plants", getPlants);

router.delete(
    "/plants/:id",
    permanentlyDeletePlant
);

// Old User Data
router.get("/old-users", getOldUsers);

router.get(
    "/old-users/:id",
    getOldUserById
);

router.delete(
    "/old-users/:id",
    permanentlyDeleteOldUser
);

module.exports = router;