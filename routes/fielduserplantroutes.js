const express = require("express");

const router = express.Router();

const authenticateToken =
    require("../middleware/authMiddleware");

const upload =
    require("../middleware/plantRequestUploadMiddleware");

const {
    createFieldUserPlant,
    getFieldUserPlantById,
    searchFieldUserPlantsByScientificName
} = require("../controllers/fielduserplantcontroller");


// ============================================================
// FIELD USER - SUBMIT PLANT
// ============================================================

router.post(
    "/plants",
    authenticateToken,
    upload.single("photo"),
    createFieldUserPlant
);


// ============================================================
// FIELD USER - GET PLANT BY ID
// ============================================================

router.get(
    "/plants/:id",
    authenticateToken,
    getFieldUserPlantById
);


// ============================================================
// FIELD USER - SEARCH BY SCIENTIFIC NAME
// ============================================================

router.get(
    "/plants",
    authenticateToken,
    searchFieldUserPlantsByScientificName
);


module.exports = router;