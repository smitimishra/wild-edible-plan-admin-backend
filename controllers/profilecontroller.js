const db = require("../config/db");

const getCurrentUser = async (req, res) => {
  try {
    const email = req.user?.email;

    console.log("Profile request user:", req.user);
    console.log("Profile request email:", email);

    if (!email) {
      return res.status(401).json({
        message: "Email not found in token"
      });
    }

    const result = await db.query(
      `
      SELECT user_name
      FROM user_table
      WHERE email_id = $1
      LIMIT 1
      `,
      [email]
    );

    console.log("Profile DB result:", result.rows);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.status(200).json({
      user_name: result.rows[0].user_name
    });

  } catch (error) {
    console.error("PROFILE ERROR:", error);

    return res.status(500).json({
      message: "Unable to load current user"
    });
  }
};

module.exports = {
  getCurrentUser
};