const pool = require("../config/db");

// FEEDBACK MANAGEMENT


// GET ALL FEEDBACK

const getAllFeedback = async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          f.feedback_id,
          f.user_id,

          u.user_name,
          u.employee_code,
          u.email_id,

          f.feedback_type,
          f.subject,
          f.message,
          f.status,
          f.admin_response,

          f.created_at,
          f.updated_at,
          f.resolved_at

        FROM feedback_table f

        LEFT JOIN user_table u
          ON u.user_id = f.user_id

        ORDER BY
          f.created_at DESC
      `
    );

    return res.status(200).json({
      feedback: result.rows,
    });

  } catch (error) {
    console.error("Feedback Management - Get all feedback error:", error);

    return res.status(500).json({
      message: "Failed to fetch feedback",
    });
  }
};


// GET FEEDBACK BY ID

const getFeedbackById = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);

    if (!Number.isInteger(feedbackId)) {
      return res.status(400).json({
        message: "Invalid feedback ID",
      });
    }

    const result = await pool.query(
      `
        SELECT
          f.feedback_id,
          f.user_id,

          u.user_name,
          u.employee_code,
          u.email_id,

          f.feedback_type,
          f.subject,
          f.message,
          f.status,
          f.admin_response,

          f.created_at,
          f.updated_at,
          f.resolved_at

        FROM feedback_table f

        LEFT JOIN user_table u
          ON u.user_id = f.user_id

        WHERE f.feedback_id = $1
      `,
      [feedbackId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Feedback not found",
      });
    }

    return res.status(200).json({
      feedback: result.rows[0],
    });

  } catch (error) {
    console.error("Feedback Management - Get feedback by ID error:", error);

    return res.status(500).json({
      message: "Failed to fetch feedback",
    });
  }
};


// UPDATE FEEDBACK STATUS

const updateFeedbackStatus = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(feedbackId)) {
      return res.status(400).json({
        message: "Invalid feedback ID",
      });
    }

    if (!status) {
      return res.status(400).json({
        message: "Feedback status is required",
      });
    }

    const allowedStatuses = [
      "NEW",
      "REVIEWED",
      "RESOLVED",
    ];

    const normalizedStatus = String(status).toUpperCase();

    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        message: "Invalid feedback status",
        allowedStatuses,
      });
    }

    let resolvedAt = null;

    if (normalizedStatus === "RESOLVED") {
      resolvedAt = new Date();
    }

    const result = await pool.query(
      `
        UPDATE feedback_table

        SET
          status = $1,
          updated_at = CURRENT_TIMESTAMP,
          resolved_at = $2

        WHERE feedback_id = $3

        RETURNING
          feedback_id,
          user_id,
          feedback_type,
          subject,
          message,
          status,
          admin_response,
          created_at,
          updated_at,
          resolved_at
      `,
      [
        normalizedStatus,
        resolvedAt,
        feedbackId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Feedback not found",
      });
    }

    return res.status(200).json({
      message: "Feedback status updated successfully",
      feedback: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Feedback Management - Update status error:",
      error
    );

    return res.status(500).json({
      message: "Failed to update feedback status",
    });
  }
};


// UPDATE ADMIN RESPONSE

const updateFeedbackResponse = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    const { admin_response } = req.body;

    if (!Number.isInteger(feedbackId)) {
      return res.status(400).json({
        message: "Invalid feedback ID",
      });
    }

    if (
      admin_response === undefined ||
      admin_response === null
    ) {
      return res.status(400).json({
        message: "Admin response is required",
      });
    }

    const responseText = String(admin_response).trim();

    if (!responseText) {
      return res.status(400).json({
        message: "Admin response cannot be empty",
      });
    }

    const result = await pool.query(
      `
        UPDATE feedback_table

        SET
          admin_response = $1,
          updated_at = CURRENT_TIMESTAMP

        WHERE feedback_id = $2

        RETURNING
          feedback_id,
          user_id,
          feedback_type,
          subject,
          message,
          status,
          admin_response,
          created_at,
          updated_at,
          resolved_at
      `,
      [
        responseText,
        feedbackId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Feedback not found",
      });
    }

    return res.status(200).json({
      message: "Admin response updated successfully",
      feedback: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Feedback Management - Update response error:",
      error
    );

    return res.status(500).json({
      message: "Failed to update admin response",
    });
  }
};


// DELETE FEEDBACK

const deleteFeedback = async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);

    if (!Number.isInteger(feedbackId)) {
      return res.status(400).json({
        message: "Invalid feedback ID",
      });
    }

    const result = await pool.query(
      `
        DELETE FROM feedback_table

        WHERE feedback_id = $1

        RETURNING
          feedback_id,
          user_id,
          feedback_type,
          subject
      `,
      [feedbackId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Feedback not found",
      });
    }

    return res.status(200).json({
      message: "Feedback deleted successfully",
      feedback: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Feedback Management - Delete feedback error:",
      error
    );

    return res.status(500).json({
      message: "Failed to delete feedback",
    });
  }
};

// ============================================================
// SUBMIT FEEDBACK - REVIEWER
// ============================================================
const submitFeedback = async (req, res) => {
    try {

        // --------------------------------------------------------
        // GET AUTHENTICATED USER
        // --------------------------------------------------------

        if (!req.authenticatedUser) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const userId = req.authenticatedUser.user_id;


        // --------------------------------------------------------
        // GET REQUEST BODY
        // --------------------------------------------------------

        const {
            feedback_type,
            subject,
            message,
            priority
        } = req.body;


        // --------------------------------------------------------
        // VALIDATE REQUIRED FIELDS
        // --------------------------------------------------------

        if (!feedback_type || !message) {
            return res.status(400).json({
                message: "Feedback type and message are required"
            });
        }


        // --------------------------------------------------------
        // VALIDATE PRIORITY
        // --------------------------------------------------------

        const allowedPriorities = [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
        ];

        const feedbackPriority =
            String(priority || "MEDIUM")
                .trim()
                .toUpperCase();


        if (!allowedPriorities.includes(feedbackPriority)) {
            return res.status(400).json({
                message: "Invalid feedback priority"
            });
        }


        // --------------------------------------------------------
        // INSERT FEEDBACK
        // --------------------------------------------------------

        const result = await pool.query(
            `
            INSERT INTO feedback_table (
                user_id,
                feedback_type,
                subject,
                message,
                priority,
                status,
                created_at,
                updated_at
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                'NEW',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            RETURNING
                feedback_id,
                user_id,
                feedback_type,
                subject,
                message,
                priority,
                status,
                created_at,
                updated_at
            `,
            [
                userId,
                feedback_type.trim(),
                subject ? subject.trim() : null,
                message.trim(),
                feedbackPriority
            ]
        );


        // --------------------------------------------------------
        // SUCCESS
        // --------------------------------------------------------

        return res.status(201).json({
            message: "Feedback submitted successfully",
            feedback: result.rows[0]
        });

    } catch (error) {

        console.error(
            "Submit feedback error:",
            error
        );

        return res.status(500).json({
            message: "Failed to submit feedback"
        });
    }
};


// EXPORTS

module.exports = {
    getAllFeedback,
    getFeedbackById,
    updateFeedbackStatus,
    updateFeedbackResponse,
    deleteFeedback,
    submitFeedback,
};