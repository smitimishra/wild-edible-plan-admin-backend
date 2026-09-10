const pool = require("../config/db");
const fs = require("fs");
const createPlant = async (req, res) => {

    try {

        const {
            scientific_name,
            common_name,
            family,
            habitat,
            distribution,
            edible_parts,
            nutritional_value,
            flowering_season,
            conservation_status,
            latitude,
            longitude
        } = req.body;


        // =====================================================
        // CHECK IMAGE
        // =====================================================

        if (!req.file) {

            return res.status(400).json({
                success: false,
                message: "Plant image is required"
            });

        }


        // =====================================================
        // VALIDATE REQUIRED FIELDS
        // =====================================================

        if (!scientific_name || !common_name) {

            return res.status(400).json({
                success: false,
                message:
                    "Scientific name and common name are required"
            });

        }


        // =====================================================
        // GET USER FROM JWT
        // =====================================================
        console.log("JWT USER:", req.user);
        const uploadedBy = req.user.id;

        console.log("UPLOADED BY:", uploadedBy);
        // =====================================================
        // IMAGE PATH
        // =====================================================

        const imageUrl =
            `/uploads/plants/${req.file.filename}`;


        // =====================================================
        // INSERT PLANT
        // =====================================================

       const result = await pool.query(
    `
    INSERT INTO plant_table
    (
        scientific_name,
        common_name,
        family,
        habitat,
        distribution,
        edible_parts,
        nutritional_value,
        flowering_season,
        conservation_status,
        image_url,
        latitude,
        longitude,
        uploaded_by,
        verified_status,
        created_date
    )
    VALUES
    (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, NOW()
    )
    RETURNING *
    `,
    [
        scientific_name,
        common_name,
        family,
        habitat,
        distribution,
        edible_parts,
        nutritional_value,
        flowering_season,
        conservation_status,
        imageUrl,
        latitude,
        longitude,
        uploadedBy,
        false
    ]
);


        // =====================================================
        // RESPONSE
        // =====================================================

        return res.status(201).json({

            success: true,

            message:
                "Plant submitted successfully",

            plant:
                result.rows[0]

        });

    } catch (error) {

    console.error(
        "CREATE PLANT ERROR:",
        error
    );

    if (req.file) {
        fs.unlink(req.file.path, (unlinkError) => {
            if (unlinkError) {
                console.error(
                    "Failed to delete uploaded image:",
                    unlinkError
                );
            }
        });
    }

    return res.status(500).json({

        success: false,

        message:
            "Failed to submit plant"

    });
}
    
};


module.exports = {
    createPlant
};