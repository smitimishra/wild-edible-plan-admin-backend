const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Send Desktop Admin OTP
 */
const sendDesktopOtpEmail = async ({
    email,
    userName,
    otp,
    expiryMinutes
}) => {

    await transporter.sendMail({
        from:
            process.env.SMTP_FROM ||
            process.env.SMTP_USER,

        to: email,

        subject:
            "Wild Plant Admin Desktop - OTP Verification",

        html: `
            <div style="
                font-family: Arial, sans-serif;
                line-height: 1.6;
                max-width: 600px;
                margin: auto;
            ">

                <h2>
                    Wild Plant Admin Desktop
                </h2>

                <p>
                    Hello ${userName || "Administrator"},
                </p>

                <p>
                    Your OTP for the Wild Plant Admin Desktop
                    Application is:
                </p>

                <div style="
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    margin: 25px 0;
                ">
                    ${otp}
                </div>

                <p>
                    This OTP will expire in
                    <strong>
                        ${expiryMinutes} minutes
                    </strong>.
                </p>

                <p>
                    If you did not attempt to log in,
                    please ignore this email.
                </p>

            </div>
        `
    });
};


/**
 * Send Desktop Admin Resend OTP
 */
const sendDesktopResendOtpEmail = async ({
    email,
    userName,
    otp,
    expiryMinutes
}) => {

    await transporter.sendMail({
        from:
            process.env.SMTP_FROM ||
            process.env.SMTP_USER,

        to: email,

        subject:
            "Wild Plant Admin Desktop - New OTP",

        html: `
            <div style="
                font-family: Arial, sans-serif;
                line-height: 1.6;
                max-width: 600px;
                margin: auto;
            ">

                <h2>
                    Wild Plant Admin Desktop
                </h2>

                <p>
                    Hello ${userName || "Administrator"},
                </p>

                <p>
                    Your new OTP is:
                </p>

                <div style="
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    margin: 20px 0;
                ">
                    ${otp}
                </div>

                <p>
                    This OTP expires in
                    ${expiryMinutes} minutes.
                </p>

            </div>
        `
    });
};


module.exports = {
    sendDesktopOtpEmail,
    sendDesktopResendOtpEmail
};