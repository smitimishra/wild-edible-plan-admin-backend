const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// HELPERS

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

// GET AUTHENTICATED USER ID

const getAuthenticatedUserId = (req) => {
  return req?.user?.user_id ?? req?.user?.id ?? req?.user?.employee_id ?? null;
};

// GET USER FROM NEW user_table

const getUserById = async (client, userId) => {
  if (!userId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT
        u.user_id,
        u.role_id,
        u.user_name,
        u.phone_number,
        u.email_id,
        u.employee_code,
        u.is_active,
        u.approval_position_id,
        u.approval_position,
        r.role_name
      FROM public.user_table u
      LEFT JOIN public.role_table r
        ON r.role_id = u.role_id
      WHERE u.user_id = $1
      LIMIT 1;
    `,
    [userId],
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

// NORMALIZE REQUEST

const normalizeRequest = (request) => {
  const requestData = parseRequestData(request.request_data);

  const employeeId =
    requestData.employee_id ??
    requestData.user_id ??
    requestData.employeeId ??
    request.employee_id ??
    request.user_id ??
    null;

  const employeeName =
    requestData.employee_name ??
    requestData.user_name ??
    requestData.employeeName ??
    request.employee_name ??
    request.user_name ??
    "";

  const employeeEmail =
    requestData.employee_email ??
    requestData.email_id ??
    requestData.email ??
    request.employee_email ??
    request.email_id ??
    "";

  const requestType =
    requestData.request_type ??
    requestData.requestType ??
    request.request_type ??
    "PLANT";

  const submittedAt =
    requestData.submitted_at ??
    requestData.created_at ??
    request.submitted_at ??
    request.created_at ??
    null;

  const updatedAt = requestData.updated_at ?? request.updated_at ?? null;

  const completedAt = requestData.completed_at ?? request.completed_at ?? null;

  return {
    ...request,

    request_data: requestData,

    employee_id: employeeId,
    employee_name: employeeName,
    employee_email: employeeEmail,

    request_type: requestType,

    submitted_at: submittedAt,
    updated_at: updatedAt,
    completed_at: completedAt,

    plant_name: requestData.plant_name ?? requestData.plantName ?? "",

    common_name: requestData.common_name ?? requestData.commonName ?? "",

    scientific_name:
      requestData.scientific_name ?? requestData.scientificName ?? "",

    description: requestData.description ?? "",

    family: requestData.family ?? "",

    habitat: requestData.habitat ?? "",

    distribution: requestData.distribution ?? "",

    edible_parts: requestData.edible_parts ?? "",

    nutritional_value: requestData.nutritional_value ?? "",

    flowering_season: requestData.flowering_season ?? "",

    conservation_status: requestData.conservation_status ?? "",

    latitude: requestData.latitude ?? null,

    longitude: requestData.longitude ?? null,

    comments: requestData.comments ?? "",
  };
};

// CREATE REQUEST - EMPLOYEE

const createRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const employeeId = getAuthenticatedUserId(req);

    if (!employeeId) {
      return res.status(401).json({
        message: "Authenticated employee not found",
      });
    }

    // GET EMPLOYEE FROM NEW DATABASE

    const employee = await getUserById(client, employeeId);

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found in user_table",
      });
    }

    if (employee.is_active === false) {
      return res.status(403).json({
        message: "Employee account is inactive",
      });
    }

    // REQUEST DATA

    let parsedRequestData = {};

    try {
      parsedRequestData = parseRequestData(req.body.request_data);
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    const requestType =
      req.body.request_type || parsedRequestData.request_type || "PLANT";

    const plantName =
      req.body.plant_name ||
      parsedRequestData.plant_name ||
      parsedRequestData.plantName;

    const commonName =
      req.body.common_name ||
      parsedRequestData.common_name ||
      parsedRequestData.commonName ||
      null;

    if (!plantName) {
      return res.status(400).json({
        message: "plant_name is required",
      });
    }

    // ADD EMPLOYEE INFORMATION INTO request_data

    parsedRequestData = {
      ...parsedRequestData,

      request_type: requestType,

      employee_id: employee.user_id,
      employee_name: employee.user_name,
      employee_email: employee.email_id,
      employee_code: employee.employee_code,

      plant_name: plantName,
      common_name: commonName,

      submitted_at: new Date().toISOString(),
    };

    // FILES

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

    // REQUEST NUMBER

    const requestNumber = "REQ-" + Date.now();

    // START TRANSACTION

    await client.query("BEGIN");

    transactionStarted = true;

    // INSERT INTO approval_requests
    //
    // Current schema:
    // id
    // request_number
    // status
    // current_approval_level
    // request_data

    const requestResult = await client.query(
      `
        INSERT INTO public.approval_requests (
          request_number,
          status,
          current_approval_level,
          request_data
        )
        VALUES (
          $1,
          'PENDING_REVIEWER',
          1,
          $2::jsonb
        )
        RETURNING *;
      `,
      [requestNumber, JSON.stringify(parsedRequestData)],
    );

    const request = requestResult.rows[0];

    // SAVE ATTACHMENTS

    for (const file of files) {
      const filePath = `/uploads/requests/${file.filename}`;

      await client.query(
        `
          INSERT INTO public.request_attachments (
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

// REVIEWER APPROVE REQUEST
// EMPLOYEE -> REVIEWER -> HR

const reviewerApproveRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const requestId = req.params.id;

    const reviewerId = getAuthenticatedUserId(req);

    if (!reviewerId) {
      return res.status(401).json({
        message: "Authenticated reviewer not found",
      });
    }

    const scientificName = req.body.scientific_name || null;

    const description = req.body.description ?? null;

    const comments = req.body.comments || null;

    if (!scientificName) {
      return res.status(400).json({
        message: "scientific_name is required when approving a plant",
      });
    }

    // VERIFY REVIEWER

    const reviewer = await getUserById(client, reviewerId);

    if (!reviewer) {
      return res.status(404).json({
        message: "Reviewer not found in user_table",
      });
    }

    if (reviewer.is_active === false) {
      return res.status(403).json({
        message: "Reviewer account is inactive",
      });
    }

    await client.query("BEGIN");

    transactionStarted = true;

    // GET REQUEST

    const requestResult = await client.query(
      `
        SELECT *
        FROM public.approval_requests
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

    // CHECK STATUS

    if (request.status !== "PENDING_REVIEWER") {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Request is not pending reviewer approval",
      });
    }

    // REQUEST DATA

    let existingRequestData = {};

    try {
      existingRequestData = parseRequestData(request.request_data);
    } catch (error) {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Request contains invalid request data",
      });
    }

    const updatedRequestData = {
      ...existingRequestData,

      scientific_name: scientificName,

      description: description,

      reviewer_id: reviewer.user_id,

      reviewer_name: reviewer.user_name,

      reviewer_email: reviewer.email_id,

      reviewer_approved_at: new Date().toISOString(),
    };

    // APPROVAL HISTORY

    await client.query(
      `
        INSERT INTO public.approval_history (
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
          'APPROVED',
          $4
        );
      `,
      [requestId, reviewerId, 1, comments],
    );

    // UPDATE REQUEST

    const updateResult = await client.query(
      `
          UPDATE public.approval_requests
          SET
            request_data = $1::jsonb,
            status = 'PENDING_HR',
            current_approval_level = 2
          WHERE id = $2
          RETURNING *;
        `,
      [JSON.stringify(updatedRequestData), requestId],
    );

    // COMMIT

    await client.query("COMMIT");

    transactionStarted = false;

    return res.status(200).json({
      message: "Plant approved by reviewer and sent to HR",

      request: normalizeRequest(updateResult.rows[0]),

      plant_details: {
        plant_name: updatedRequestData.plant_name || "",

        common_name: updatedRequestData.common_name || "",

        scientific_name: updatedRequestData.scientific_name || "",

        description: updatedRequestData.description || "",
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

    console.error("Reviewer approval error:", error);

    return res.status(500).json({
      message: "Failed to approve plant by reviewer",

      error: error.message,
    });
  } finally {
    client.release();
  }
};

// HR APPROVE REQUEST
// REVIEWER -> HR -> APPROVED

const hrApproveRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const requestId = req.params.id;

    const hrId = getAuthenticatedUserId(req);

    const comments = req.body.comments || null;

    if (!hrId) {
      return res.status(401).json({
        message: "Authenticated HR user not found",
      });
    }

    // VERIFY HR USER

    const hrUser = await getUserById(client, hrId);

    if (!hrUser) {
      return res.status(404).json({
        message: "HR user not found in user_table",
      });
    }

    if (hrUser.is_active === false) {
      return res.status(403).json({
        message: "HR account is inactive",
      });
    }

    await client.query("BEGIN");

    transactionStarted = true;

    // GET REQUEST

    const requestResult = await client.query(
      `
          SELECT *
          FROM public.approval_requests
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

    // CHECK STATUS

    if (request.status !== "PENDING_HR") {
      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        message: "Request is not pending HR approval",
      });
    }

    // REQUEST DATA

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

    const plantName = requestData.plant_name || requestData.plantName || null;

    const commonName =
      requestData.common_name || requestData.commonName || null;

    const scientificName =
      requestData.scientific_name || requestData.scientificName || null;

    const description = requestData.description || null;

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
          "scientific_name must be provided by the reviewer before HR approval",
      });
    }

    // GET ATTACHMENTS

    const attachmentsResult = await client.query(
      `
          SELECT
            id,
            request_id,
            file_name,
            file_path,
            mime_type,
            file_size,
            image_type
          FROM public.request_attachments
          WHERE request_id = $1
          ORDER BY id ASC;
        `,
      [requestId],
    );

    const firstAttachment =
      attachmentsResult.rows.length > 0 ? attachmentsResult.rows[0] : null;

    // APPROVAL HISTORY

    await client.query(
      `
        INSERT INTO public.approval_history (
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
          'APPROVED',
          $4
        );
      `,
      [requestId, hrId, 2, comments],
    );

    // INSERT INTO plant_table
    //
    // New main plant table

    const plantResult = await client.query(
      `
          INSERT INTO public.plant_table (
            image_id,
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
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            TRUE,
            CURRENT_TIMESTAMP
          )
          RETURNING *;
        `,
      [
        firstAttachment ? Number(firstAttachment.id) : null,

        scientificName,

        commonName,

        requestData.family || null,

        requestData.habitat || null,

        requestData.distribution || null,

        requestData.edible_parts || null,

        requestData.nutritional_value || null,

        requestData.flowering_season || null,

        requestData.conservation_status || null,

        firstAttachment
          ? firstAttachment.file_path
          : requestData.image_url || null,

        requestData.latitude ?? null,

        requestData.longitude ?? null,

        requestData.employee_id || requestData.user_id || null,
      ],
    );

    // UPDATE REQUEST TO APPROVED

    const updatedRequestData = {
      ...requestData,

      hr_id: hrUser.user_id,

      hr_name: hrUser.user_name,

      hr_email: hrUser.email_id,

      hr_approved_at: new Date().toISOString(),
    };

    const updateResult = await client.query(
      `
          UPDATE public.approval_requests
          SET
            request_data = $1::jsonb,
            status = 'APPROVED',
            current_approval_level = 3
          WHERE id = $2
          RETURNING *;
        `,
      [JSON.stringify(updatedRequestData), requestId],
    );

    // COMMIT

    await client.query("COMMIT");

    transactionStarted = false;

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

// REJECT REQUEST
//
// Reviewer:
// PENDING_REVIEWER -> REJECTED
//
// HR:
// PENDING_HR -> REJECTED

const rejectRequest = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const requestId = req.params.id;

    const approverId = getAuthenticatedUserId(req);

    const comments = req.body.comments;

    if (!approverId) {
      return res.status(401).json({
        message: "Authenticated approver not found",
      });
    }

    if (!comments || !String(comments).trim()) {
      return res.status(400).json({
        message: "comments are required when rejecting a request",
      });
    }

    // VERIFY USER

    const approver = await getUserById(client, approverId);

    if (!approver) {
      return res.status(404).json({
        message: "Approver not found in user_table",
      });
    }

    await client.query("BEGIN");

    transactionStarted = true;

    // GET REQUEST

    const requestResult = await client.query(
      `
          SELECT *
          FROM public.approval_requests
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

    // DETERMINE APPROVAL LEVEL

    let approvalLevel;

    if (request.status === "PENDING_REVIEWER") {
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

    // REQUEST DATA

    let requestData = {};

    try {
      requestData = parseRequestData(request.request_data);
    } catch (error) {
      requestData = {};
    }

    const updatedRequestData = {
      ...requestData,

      rejected_by: approver.user_id,

      rejected_by_name: approver.user_name,

      rejected_by_email: approver.email_id,

      rejection_comments: comments,

      rejected_at: new Date().toISOString(),
    };

    // APPROVAL HISTORY

    await client.query(
      `
        INSERT INTO public.approval_history (
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

    // UPDATE REQUEST

    const updateResult = await client.query(
      `
          UPDATE public.approval_requests
          SET
            request_data = $1::jsonb,
            status = 'REJECTED'
          WHERE id = $2
          RETURNING *;
        `,
      [JSON.stringify(updatedRequestData), requestId],
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

// GET ALL REQUESTS

const getAllRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
          SELECT
            ar.id,
            ar.request_number,
            ar.request_data,
            ar.status,
            ar.current_approval_level
          FROM public.approval_requests ar
          ORDER BY ar.id DESC;
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

// GET PENDING REVIEWER REQUESTS

const getPendingReviewerRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
          SELECT
            ar.id,
            ar.request_number,
            ar.request_data,
            ar.status,
            ar.current_approval_level
          FROM public.approval_requests ar
          WHERE ar.status = 'PENDING_REVIEWER'
          ORDER BY ar.id ASC;
        `,
    );

    const requests = result.rows.map(normalizeRequest);

    return res.status(200).json({
      message: "Pending reviewer requests retrieved successfully",

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.error("Get pending reviewer requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve reviewer requests",

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
            ar.request_data,
            ar.status,
            ar.current_approval_level
          FROM public.approval_requests ar
          WHERE ar.status = 'PENDING_HR'
          ORDER BY ar.id ASC;
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

// GET APPROVED REQUESTS

const getApprovedRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
          SELECT
            ar.id,
            ar.request_number,
            ar.request_data,
            ar.status,
            ar.current_approval_level
          FROM public.approval_requests ar
          WHERE ar.status = 'APPROVED'
          ORDER BY ar.id DESC;
        `,
    );

    const requests = result.rows.map(normalizeRequest);

    return res.status(200).json({
      message: "Approved requests retrieved successfully",

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.error("Get approved requests error:", error);

    return res.status(500).json({
      message: "Failed to retrieve approved requests",

      error: error.message,
    });
  }
};

// GET REQUEST BY ID

const getRequestById = async (req, res) => {
  try {
    const requestId = req.params.id;

    // REQUEST

    const requestResult = await pool.query(
      `
          SELECT
            ar.id,
            ar.request_number,
            ar.request_data,
            ar.status,
            ar.current_approval_level
          FROM public.approval_requests ar
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

    // ATTACHMENTS

    const attachmentsResult = await pool.query(
      `
          SELECT
            id,
            request_id,
            file_name,
            file_path,
            mime_type,
            file_size,
            image_type
          FROM public.request_attachments
          WHERE request_id = $1
          ORDER BY id ASC;
        `,
      [requestId],
    );

    // APPROVAL HISTORY

    const historyResult = await pool.query(
      `
          SELECT
            ah.id,
            ah.request_id,
            ah.approver_id,
            ah.approval_level,
            ah.action,
            ah.comments,
            ah.action_at,

            u.user_id,
            u.user_name AS approver_name,
            u.email_id AS approver_email,
            u.employee_code,
            u.role_id,

            r.role_name AS approver_role

          FROM public.approval_history ah

          LEFT JOIN public.user_table u
            ON u.user_id = ah.approver_id

          LEFT JOIN public.role_table r
            ON r.role_id = u.role_id

          WHERE ah.request_id = $1

          ORDER BY
            ah.approval_level ASC,
            ah.action_at ASC;
        `,
      [requestId],
    );

    // PLANT DETAILS
    //
    // There is no plant_details table anymore.
    //
    // For an approved request, request_data contains
    // the plant information.

    const plantDetails =
      request.status === "APPROVED"
        ? {
            plant_name: request.plant_name,

            common_name: request.common_name,

            scientific_name: request.scientific_name,

            description: request.description,

            family: request.family,

            habitat: request.habitat,

            distribution: request.distribution,

            edible_parts: request.edible_parts,

            nutritional_value: request.nutritional_value,

            flowering_season: request.flowering_season,

            conservation_status: request.conservation_status,

            latitude: request.latitude,

            longitude: request.longitude,
          }
        : null;

    return res.status(200).json({
      message: "Request details retrieved successfully",

      request,

      attachments: attachmentsResult.rows,

      approval_history: historyResult.rows,

      plant_details: plantDetails,

      // ------------------------------------------------------
      // TOP LEVEL COMPATIBILITY FIELDS
      // ------------------------------------------------------

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

// DOWNLOAD ATTACHMENT

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
          FROM public.request_attachments
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

    if (!attachment.file_path) {
      return res.status(404).json({
        message: "Attachment file path not found",
      });
    }

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

// GET MY REQUESTS - EMPLOYEE

const getMyRequests = async (req, res) => {
  try {
    const employeeId = getAuthenticatedUserId(req);

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
            ar.request_data,
            ar.status,
            ar.current_approval_level
          FROM public.approval_requests ar
          WHERE
            COALESCE(
              ar.request_data ->> 'employee_id',
              ar.request_data ->> 'user_id'
            ) = $1::text
          ORDER BY ar.id DESC;
        `,
      [String(employeeId)],
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

// ADD ATTACHMENT
// REVIEWER / HR

const addAttachment = async (req, res) => {
  try {
    const requestId = req.params.id;

    if (!requestId) {
      return res.status(400).json({
        message: "Request ID is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Image file is required",
      });
    }

    // CHECK REQUEST

    const requestResult = await pool.query(
      `
          SELECT
            id,
            status
          FROM public.approval_requests
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

    // COUNT IMAGES

    const countResult = await pool.query(
      `
          SELECT
            COUNT(*) AS image_count
          FROM public.request_attachments
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

    // FILE PATH

    const filePath = `/uploads/requests/${req.file.filename}`;

    // INSERT

    const attachmentsResult = await pool.query(
      `
          INSERT INTO public.request_attachments (
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
// REVIEWER / HR

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
          FROM public.request_attachments
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

    // PHYSICAL FILE

    if (attachment.file_path) {
      const relativeFilePath = attachment.file_path.replace(/^[/\\]+/, "");

      const filePath = path.join(__dirname, "..", relativeFilePath);

      try {
        await fs.promises.unlink(filePath);
      } catch (fileError) {
        if (fileError.code !== "ENOENT") {
          console.error("Failed to delete attachment file:", fileError.message);

          return res.status(500).json({
            message: "Failed to delete image file",

            error: fileError.message,
          });
        }
      }
    }

    // DELETE DATABASE RECORD

    await pool.query(
      `
        DELETE FROM public.request_attachments
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
  // Employee
  createRequest,
  getMyRequests,

  // Reviewer
  reviewerApproveRequest,
  getPendingReviewerRequests,

  // HR
  hrApproveRequest,
  getPendingHRRequests,

  // Rejection
  rejectRequest,

  // General
  getAllRequests,
  getApprovedRequests,
  getRequestById,

  // Attachments
  downloadAttachment,
  addAttachment,
  deleteAttachment,

  // ----------------------------------------------------------
  // BACKWARD-COMPATIBILITY ALIASES
  //
  // If your existing requestRoutes.js still calls the old
  // controller names, these prevent the application from
  // immediately breaking. We can clean the route names next.
  // ----------------------------------------------------------

  managerApproveRequest: reviewerApproveRequest,

  getPendingManagerRequests: getPendingReviewerRequests,
};
