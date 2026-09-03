const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// HELPER - PARSE REQUEST DATA

const parseRequestData = (requestData) => {
  if (!requestData) {
    return {};
  }

  if (typeof requestData === "object") {
    return requestData;
  }

  try {
    return JSON.parse(requestData);
  } catch (error) {
    throw new Error("request_data must contain valid JSON");
  }
};

// HELPER - NORMALIZE REQUEST DATA

const normalizeRequest = (request) => {
  const requestData = parseRequestData(request.request_data);

  return {
    ...request,

    request_data: requestData,

    plant_name: requestData.plant_name || "",

    common_name: requestData.common_name || "",

    scientific_name: requestData.scientific_name || "",

    description: requestData.description || "",

    comments: requestData.comments || "",
  };
};

// CREATE REQUEST - EMPLOYEE

const createRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const employeeId = req.user.id;

    if (!employeeId) {
      return res.status(401).json({
        message: "Authenticated employee not found",
      });
    }

    const { request_type } = req.body;

    // Parse request_data

    let parsedRequestData = {};

    try {
      parsedRequestData = parseRequestData(req.body.request_data);
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    // Plant information

    const plantName = req.body.plant_name || parsedRequestData.plant_name;

    const commonName =
      req.body.common_name || parsedRequestData.common_name || null;

    if (!request_type) {
      return res.status(400).json({
        message: "request_type is required",
      });
    }

    if (!plantName) {
      return res.status(400).json({
        message: "plant_name is required",
      });
    }

    parsedRequestData = {
      ...parsedRequestData,

      plant_name: plantName,

      common_name: commonName,
    };

    // Uploaded files

    const files = req.files || [];

    if (files.length > 10) {
      return res.status(400).json({
        message: "Maximum 10 images are allowed",
      });
    }

    if (files.length === 0) {
      return res.status(400).json({
        message: "At least one plant image is required",
      });
    }

    // Generate request number

    const requestNumber = "REQ-" + Date.now();

    // Start transaction

    await client.query("BEGIN");

    transactionStarted = true;

    // CREATE APPROVAL REQUEST

    const requestResult = await client.query(
      `
                INSERT INTO approval_requests (
                    request_number,
                    employee_id,
                    request_type,
                    request_data,
                    status,
                    current_approval_level,
                    submitted_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    'PENDING_MANAGER',
                    1,
                    CURRENT_TIMESTAMP
                )
                RETURNING *;
                `,
      [requestNumber, employeeId, request_type, parsedRequestData],
    );

    const request = requestResult.rows[0];

    // SAVE ATTACHMENTS

    for (const file of files) {
      const filePath = `/uploads/requests/${file.filename}`;

      await client.query(
        `
                INSERT INTO request_attachments (
                    request_id,
                    file_name,
                    file_path,
                    mime_type,
                    file_size
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                );
                `,
        [request.id, file.originalname, filePath, file.mimetype, file.size],
      );
    }

    // COMMIT

    await client.query("COMMIT");

    transactionStarted = false;

    // RESPONSE

    return res.status(201).json({
      message: "Plant request submitted successfully",

      request: normalizeRequest(request),

      plant: {
        plant_name: plantName,

        common_name: commonName,
      },

      attachments: files.map((file) => ({
        file_name: file.originalname,

        file_path: `/uploads/requests/${file.filename}`,

        mime_type: file.mimetype,

        file_size: file.size,
      })),
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("Create request error:", error);

    const files = req.files || [];

    for (const file of files) {
      try {
        await fs.promises.unlink(file.path);
      } catch (deleteError) {
        console.error("Failed to delete uploaded file:", deleteError.message);
      }
    }

    return res.status(500).json({
      message: "Failed to create plant request",

      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// MANAGER APPROVE REQUEST
// ============================================================

const managerApproveRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const requestId = req.params.id;

    const managerId = req.user.id;

    if (!managerId) {
      return res.status(401).json({
        message: "Authenticated manager not found",
      });
    }

    const scientificName = req.body.scientific_name || null;

    const description = req.body.description || null;

    const comments = req.body.comments || null;

    if (!scientificName) {
      return res.status(400).json({
        message: "scientific_name is required when approving a plant",
      });
    }

    await client.query("BEGIN");

    transactionStarted = true;

    // ========================================================
    // FIND REQUEST
    // ========================================================

    const requestResult = await client.query(
      `
                SELECT *
                FROM approval_requests
                WHERE id = $1
                FOR UPDATE;
                `,
      [requestId],
    );

    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(404).json({
        message: "Request not found",
      });
    }

    const request = requestResult.rows[0];

    // ========================================================
    // CHECK STATUS
    // ========================================================

    if (request.status !== "PENDING_MANAGER") {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Request is not pending manager approval",
      });
    }

    // ========================================================
    // EXISTING REQUEST DATA
    // ========================================================

    let existingRequestData = {};

    try {
      existingRequestData = parseRequestData(request.request_data);
    } catch (error) {
      existingRequestData = {};
    }

    // ========================================================
    // UPDATE REQUEST DATA
    // ========================================================

    const updatedRequestData = {
      ...existingRequestData,

      scientific_name: scientificName,

      description: description,
    };

    // ========================================================
    // APPROVAL HISTORY
    // ========================================================

    await client.query(
      `
            INSERT INTO approval_history (
                request_id,
                approver_id,
                approval_level,
                action,
                comments
            )
            VALUES (
                $1,
                $2,
                1,
                'APPROVED',
                $3
            );
            `,
      [requestId, managerId, comments],
    );

    // ========================================================
    // UPDATE REQUEST
    // ========================================================

    const updateResult = await client.query(
      `
                UPDATE approval_requests
                SET
                    request_data = $1,
                    status = 'PENDING_HR',
                    current_approval_level = 2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *;
                `,
      [updatedRequestData, requestId],
    );

    await client.query("COMMIT");

    transactionStarted = false;

    return res.status(200).json({
      message: "Plant approved by manager and sent to HR",

      request: normalizeRequest(updateResult.rows[0]),

      plant_details: {
        plant_name: updatedRequestData.plant_name,

        common_name: updatedRequestData.common_name,

        scientific_name: updatedRequestData.scientific_name,

        description: updatedRequestData.description,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("Manager approval error:", error);

    return res.status(500).json({
      message: "Failed to approve plant",

      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// HR APPROVE REQUEST
// ============================================================

const hrApproveRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const requestId = req.params.id;

    const hrId = req.user.id;

    const comments = req.body.comments || null;

    if (!hrId) {
      return res.status(401).json({
        message: "Authenticated HR user not found",
      });
    }

    await client.query("BEGIN");

    transactionStarted = true;

    // ========================================================
    // FIND REQUEST
    // ========================================================

    const requestResult = await client.query(
      `
                SELECT *
                FROM approval_requests
                WHERE id = $1
                FOR UPDATE;
                `,
      [requestId],
    );

    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(404).json({
        message: "Request not found",
      });
    }

    const request = requestResult.rows[0];

    // ========================================================
    // CHECK STATUS
    // ========================================================

    if (request.status !== "PENDING_HR") {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Request is not pending HR approval",
      });
    }

    // ========================================================
    // GET REQUEST DATA
    // ========================================================

    let requestData = {};

    try {
      requestData = parseRequestData(request.request_data);
    } catch (error) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Plant request contains invalid request data",
      });
    }

    const plantName = requestData.plant_name;

    const commonName = requestData.common_name || null;

    const scientificName = requestData.scientific_name || null;

    const description = requestData.description || null;

    // ========================================================
    // VALIDATION
    // ========================================================

    if (!plantName) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "plant_name is missing from the request",
      });
    }

    if (!scientificName) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message:
          "scientific_name must be provided by the manager before HR approval",
      });
    }

    // ========================================================
    // HR APPROVAL HISTORY
    // ========================================================

    await client.query(
      `
            INSERT INTO approval_history (
                request_id,
                approver_id,
                approval_level,
                action,
                comments
            )
            VALUES (
                $1,
                $2,
                2,
                'APPROVED',
                $3
            );
            `,
      [requestId, hrId, comments],
    );

    // ========================================================
    // INSERT PERMANENT PLANT
    // ========================================================

    const plantResult = await client.query(
      `
                INSERT INTO plant_details (
                    request_id,
                    plant_name,
                    common_name,
                    scientific_name,
                    description
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )
                RETURNING *;
                `,
      [requestId, plantName, commonName, scientificName, description],
    );

    // ========================================================
    // MARK REQUEST APPROVED
    // ========================================================

    const updateResult = await client.query(
      `
                UPDATE approval_requests
                SET
                    status = 'APPROVED',
                    current_approval_level = 3,
                    completed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *;
                `,
      [requestId],
    );

    await client.query("COMMIT");

    transactionStarted = false;

    // ========================================================
    // GET ATTACHMENTS
    //
    // IMPORTANT:
    // request_attachments does NOT use created_at.
    // Use id for ordering.
    // ========================================================

    const attachmentsResult = await pool.query(
      `
                SELECT
                    id,
                    request_id,
                    file_name,
                    file_path,
                    mime_type,
                    file_size
                FROM request_attachments
                WHERE request_id = $1
                ORDER BY id ASC;
                `,
      [requestId],
    );

    return res.status(200).json({
      message: "Plant approved by HR and permanently stored",

      request: normalizeRequest(updateResult.rows[0]),

      plant: plantResult.rows[0],

      attachments: attachmentsResult.rows,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("HR approval error:", error);

    return res.status(500).json({
      message: "Failed to approve plant by HR",

      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// REJECT REQUEST
// ============================================================

const rejectRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const requestId = req.params.id;

    const approverId = req.user.id;

    const comments = req.body.comments;

    if (!approverId) {
      return res.status(401).json({
        message: "Authenticated approver not found",
      });
    }

    if (!comments) {
      return res.status(400).json({
        message: "comments are required when rejecting a request",
      });
    }

    await client.query("BEGIN");

    transactionStarted = true;

    // ========================================================
    // FIND REQUEST
    // ========================================================

    const requestResult = await client.query(
      `
                SELECT *
                FROM approval_requests
                WHERE id = $1
                FOR UPDATE;
                `,
      [requestId],
    );

    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(404).json({
        message: "Request not found",
      });
    }

    const request = requestResult.rows[0];

    // ========================================================
    // DETERMINE APPROVAL LEVEL
    // ========================================================

    let approvalLevel;

    if (request.status === "PENDING_MANAGER") {
      approvalLevel = 1;
    } else if (request.status === "PENDING_HR") {
      approvalLevel = 2;
    } else {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Request cannot be rejected in its current status",
      });
    }

    // ========================================================
    // RECORD REJECTION
    // ========================================================

    await client.query(
      `
            INSERT INTO approval_history (
                request_id,
                approver_id,
                approval_level,
                action,
                comments
            )
            VALUES (
                $1,
                $2,
                $3,
                'REJECTED',
                $4
            );
            `,
      [requestId, approverId, approvalLevel, comments],
    );

    // ========================================================
    // UPDATE REQUEST
    // ========================================================

    const updateResult = await client.query(
      `
                UPDATE approval_requests
                SET
                    status = 'REJECTED',
                    completed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *;
                `,
      [requestId],
    );

    await client.query("COMMIT");

    transactionStarted = false;

    return res.status(200).json({
      message: "Plant request rejected successfully",

      request: normalizeRequest(updateResult.rows[0]),
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
    }

    console.error("Reject request error:", error);

    return res.status(500).json({
      message: "Failed to reject request",

      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// GET ALL REQUESTS
// ============================================================

const getAllRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
                SELECT
                    ar.id,
                    ar.request_number,
                    ar.employee_id,
                    u.name AS employee_name,
                    u.email AS employee_email,
                    ar.request_type,
                    ar.request_data,
                    ar.status,
                    ar.current_approval_level,
                    ar.submitted_at,
                    ar.completed_at,
                    ar.updated_at
                FROM approval_requests ar
                JOIN users u
                    ON u.id = ar.employee_id
                ORDER BY
                    ar.submitted_at DESC NULLS LAST,
                    ar.id DESC;
                `,
    );

    const requests = result.rows.map(normalizeRequest);

    return res.status(200).json({
      message: "Requests retrieved successfully",

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.error("Get all requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve requests",

      error: error.message,
    });
  }
};

// GET PENDING MANAGER REQUESTS

const getPendingManagerRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
                SELECT
                    ar.id,
                    ar.request_number,
                    ar.employee_id,
                    u.name AS employee_name,
                    u.email AS employee_email,
                    ar.request_type,
                    ar.request_data,
                    ar.status,
                    ar.current_approval_level,
                    ar.submitted_at,
                    ar.updated_at
                FROM approval_requests ar
                JOIN users u
                    ON u.id = ar.employee_id
                WHERE ar.status = 'PENDING_MANAGER'
                ORDER BY
                    ar.submitted_at ASC NULLS LAST,
                    ar.id ASC;
                `,
    );

    const requests = result.rows.map(normalizeRequest);

    return res.status(200).json({
      message: "Pending manager requests retrieved successfully",

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.error("Get pending manager requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve manager requests",

      error: error.message,
    });
  }
};

// GET PENDING HR REQUESTS

const getPendingHRRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
                SELECT
                    ar.id,
                    ar.request_number,
                    ar.employee_id,
                    u.name AS employee_name,
                    u.email AS employee_email,
                    ar.request_type,
                    ar.request_data,
                    ar.status,
                    ar.current_approval_level,
                    ar.submitted_at,
                    ar.updated_at
                FROM approval_requests ar
                JOIN users u
                    ON u.id = ar.employee_id
                WHERE ar.status = 'PENDING_HR'
                ORDER BY
                    ar.submitted_at ASC NULLS LAST,
                    ar.id ASC;
                `,
    );

    const requests = result.rows.map(normalizeRequest);

    return res.status(200).json({
      message: "Pending HR requests retrieved successfully",

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.error("Get pending HR requests error:", error);

    return res.status(500).json({
      message: "Failed to load pending HR requests",

      error: error.message,
    });
  }
};

// GET REQUEST BY ID

const getRequestById = async (req, res) => {
  try {
    const requestId = req.params.id;

    // 1. REQUEST

    const requestResult = await pool.query(
      `
                SELECT
                    ar.id,
                    ar.request_number,
                    ar.employee_id,
                    u.name AS employee_name,
                    u.email AS employee_email,
                    ar.request_type,
                    ar.request_data,
                    ar.status,
                    ar.current_approval_level,
                    ar.submitted_at,
                    ar.completed_at,
                    ar.updated_at
                FROM approval_requests ar
                LEFT JOIN users u
                    ON u.id = ar.employee_id
                WHERE ar.id = $1;
                `,
      [requestId],
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        message: "Request not found",
      });
    }

    const request = normalizeRequest(requestResult.rows[0]);

    // 2. ATTACHMENTS
    //
    // IMPORTANT:
    // There is no created_at here.
    // We use id for ordering.

    const attachmentsResult = await pool.query(
      `
                SELECT
                    id,
                    request_id,
                    file_name,
                    file_path,
                    mime_type,
                    file_size
                FROM request_attachments
                WHERE request_id = $1
                ORDER BY id ASC;
                `,
      [requestId],
    );

    // ========================================================
    // 3. APPROVAL HISTORY
    // ========================================================

    const historyResult = await pool.query(
      `
                SELECT
                    ah.id,
                    ah.request_id,
                    ah.approval_level,
                    ah.action,
                    ah.comments,
                    ah.action_at,
                    u.id AS approver_id,
                    u.name AS approver_name,
                    u.role AS approver_role
                FROM approval_history ah
                LEFT JOIN users u
                    ON u.id = ah.approver_id
                WHERE ah.request_id = $1
                ORDER BY
                    ah.approval_level ASC,
                    ah.action_at ASC;
                `,
      [requestId],
    );

    // ========================================================
    // 4. PERMANENT PLANT DETAILS
    //
    // Do NOT select created_at / updated_at because those
    // columns are not part of the schema currently being used.
    // ========================================================

    const plantResult = await pool.query(
      `
                SELECT
                    id,
                    request_id,
                    plant_name,
                    common_name,
                    scientific_name,
                    description
                FROM plant_details
                WHERE request_id = $1
                ORDER BY id DESC
                LIMIT 1;
                `,
      [requestId],
    );

    // ========================================================
    // 5. RESPONSE
    // ========================================================

    return res.status(200).json({
      message: "Request details retrieved successfully",

      request,

      attachments: attachmentsResult.rows,

      approval_history: historyResult.rows,

      plant_details: plantResult.rows.length > 0 ? plantResult.rows[0] : null,

      // These are also provided at the top level so that
      // either frontend response style can work.
      id: request.id,

      request_number: request.request_number,

      employee_id: request.employee_id,

      employee_name: request.employee_name,

      employee_email: request.employee_email,

      request_type: request.request_type,

      request_data: request.request_data,

      status: request.status,

      current_approval_level: request.current_approval_level,

      submitted_at: request.submitted_at,

      completed_at: request.completed_at,

      plant_name: request.plant_name,

      common_name: request.common_name,

      scientific_name: request.scientific_name,

      description: request.description,

      comments: request.comments,
    });
  } catch (error) {
    console.error("Get request details error:", error);

    return res.status(500).json({
      message: "Failed to retrieve request details",

      error: error.message,
    });
  }
};

// ============================================================
// DOWNLOAD ATTACHMENT
// ============================================================

const downloadAttachment = async (req, res) => {
  try {
    const attachmentId = req.params.id;

    const result = await pool.query(
      `
                SELECT
                    id,
                    request_id,
                    file_name,
                    file_path,
                    mime_type
                FROM request_attachments
                WHERE id = $1;
                `,
      [attachmentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Attachment not found",
      });
    }

    const attachment = result.rows[0];

    const relativeFilePath = attachment.file_path.replace(/^[/\\]+/, "");

    const filePath = path.join(__dirname, "..", relativeFilePath);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      return res.status(404).json({
        message: "Image file not found on server",
      });
    }

    return res.download(filePath, attachment.file_name, {
      headers: {
        "Content-Type": attachment.mime_type || "application/octet-stream",
      },
    });
  } catch (error) {
    console.error("Download attachment error:", error);

    return res.status(500).json({
      message: "Failed to download attachment",

      error: error.message,
    });
  }
};

// ============================================================
// GET MY REQUESTS - EMPLOYEE
// ============================================================

const getMyRequests = async (req, res) => {
  try {
    const employeeId = req.user.id;

    if (!employeeId) {
      return res.status(401).json({
        message: "Authenticated employee not found",
      });
    }

    const result = await pool.query(
      `
                SELECT
                    ar.id,
                    ar.request_number,
                    ar.employee_id,
                    u.name AS employee_name,
                    u.email AS employee_email,
                    ar.request_type,
                    ar.request_data,
                    ar.status,
                    ar.current_approval_level,
                    ar.submitted_at,
                    ar.completed_at,
                    ar.updated_at
                FROM approval_requests ar
                INNER JOIN users u
                    ON ar.employee_id = u.id
                WHERE ar.employee_id = $1
                ORDER BY
                    ar.submitted_at DESC NULLS LAST,
                    ar.id DESC;
                `,
      [employeeId],
    );

    const requests = result.rows.map(normalizeRequest);

    return res.status(200).json({
      message: "My requests retrieved successfully",

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.error("Get my requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve your requests",

      error: error.message,
    });
  }
};

// ============================================================
// ADD ATTACHMENT
// MANAGER / HR
// ============================================================

const addAttachment = async (req, res) => {
  try {
    const requestId = req.params.id;

    // --------------------------------------------------------
    // Validate request ID
    // --------------------------------------------------------

    if (!requestId) {
      return res.status(400).json({
        message: "Request ID is required",
      });
    }

    // --------------------------------------------------------
    // Validate file
    // --------------------------------------------------------

    if (!req.file) {
      return res.status(400).json({
        message: "Image file is required",
      });
    }

    // --------------------------------------------------------
    // Check request
    // --------------------------------------------------------

    const requestResult = await pool.query(
      `
                SELECT
                    id,
                    status
                FROM approval_requests
                WHERE id = $1;
                `,
      [requestId],
    );

    if (requestResult.rows.length === 0) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (deleteError) {
        console.error("Failed to delete uploaded file:", deleteError.message);
      }

      return res.status(404).json({
        message: "Request not found",
      });
    }

    // Count existing images

    const countResult = await pool.query(
      `
                SELECT
                    COUNT(*) AS image_count
                FROM request_attachments
                WHERE request_id = $1;
                `,
      [requestId],
    );

    const imageCount = Number(countResult.rows[0].image_count);

    if (imageCount >= 10) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (deleteError) {
        console.error("Failed to delete uploaded file:", deleteError.message);
      }

      return res.status(400).json({
        message: "Maximum 10 images are allowed for this request",
      });
    }

    // Build database path

    const filePath = `/uploads/requests/${req.file.filename}`;

    // Save attachment

    const attachmentsResult = await pool.query(
      `
                INSERT INTO request_attachments (
                    request_id,
                    file_name,
                    file_path,
                    mime_type,
                    file_size
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )
                RETURNING
                    id,
                    request_id,
                    file_name,
                    file_path,
                    mime_type,
                    file_size;
                `,
      [
        requestId,
        req.file.originalname,
        filePath,
        req.file.mimetype,
        req.file.size,
      ],
    );

    return res.status(201).json({
      message: "Image added successfully",

      attachment: attachmentsResult.rows[0],
    });
  } catch (error) {
    // Delete uploaded file if DB insert failed

    if (req.file) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (deleteError) {
        console.error("Failed to delete uploaded file:", deleteError.message);
      }
    }

    console.error("Add attachment error:", error);

    return res.status(500).json({
      message: "Failed to add image",

      error: error.message,
    });
  }
};

// DELETE ATTACHMENT
// MANAGER / HR

const deleteAttachment = async (req, res) => {
  try {
    const attachmentId = req.params.id;

    if (!attachmentId) {
      return res.status(400).json({
        message: "Attachment ID is required",
      });
    }

    // FIND ATTACHMENT

    const result = await pool.query(
      `
                SELECT
                    id,
                    request_id,
                    file_name,
                    file_path,
                    mime_type
                FROM request_attachments
                WHERE id = $1;
                `,
      [attachmentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Attachment not found",
      });
    }

    const attachment = result.rows[0];

    // BUILD PHYSICAL FILE PATH

    const relativeFilePath = attachment.file_path.replace(/^[/\\]+/, "");

    const filePath = path.join(__dirname, "..", relativeFilePath);

    // DELETE PHYSICAL FILE

    try {
      await fs.promises.unlink(filePath);
    } catch (fileError) {
      // If the physical file is already gone,
      // still delete the database record.

      if (fileError.code !== "ENOENT") {
        console.error("Failed to delete attachment file:", fileError.message);

        return res.status(500).json({
          message: "Failed to delete image file",

          error: fileError.message,
        });
      }
    }

    // DELETE DATABASE RECORD

    await pool.query(
      `
            DELETE FROM request_attachments
            WHERE id = $1;
            `,
      [attachmentId],
    );

    return res.status(200).json({
      message: "Image deleted successfully",

      attachment_id: attachmentId,
    });
  } catch (error) {
    console.error("Delete attachment error:", error);

    return res.status(500).json({
      message: "Failed to delete image",

      error: error.message,
    });
  }
};

// EXPORT CONTROLLERS

module.exports = {
  createRequest,

  managerApproveRequest,

  hrApproveRequest,

  rejectRequest,

  getAllRequests,

  getMyRequests,

  getPendingManagerRequests,

  getPendingHRRequests,

  getRequestById,

  downloadAttachment,

  addAttachment,

  deleteAttachment,
};
