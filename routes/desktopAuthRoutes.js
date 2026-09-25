const express = require("express");

const {
    login,
    verifyOtp,
    resendOtp,
    logout,
    forceLogoutSession
} = require("../controllers/desktopAuthController");

const {
    authenticateDesktopToken
} = require("../middleware/desktopAuthMiddleware");


const router = express.Router();


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post(
    "/login",
    login
);


/*
|--------------------------------------------------------------------------
| VERIFY OTP
|--------------------------------------------------------------------------
*/

router.post(
    "/verify-otp",
    verifyOtp
);


/*
|--------------------------------------------------------------------------
| RESEND OTP
|--------------------------------------------------------------------------
*/

router.post(
    "/resend-otp",
    resendOtp
);


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

router.post(
    "/logout",
    authenticateDesktopToken,
    logout
);


/*
|--------------------------------------------------------------------------
| FORCE LOGOUT SESSION
|--------------------------------------------------------------------------
*/

router.post(
    "/force-logout-session",
    forceLogoutSession
);


module.exports = router;