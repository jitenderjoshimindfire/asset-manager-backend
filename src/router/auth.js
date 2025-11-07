const express = require("express");
const loginController = require("../controller/loginController");
const registerController = require("../controller/registerController");
const refreshController = require("../controller/refreshController");
const logoutController = require("../controller/logoutController");
const { getMe, updateDetails, updatePassword } = require('../controller/profileController');
const { protect } = require('../middleware/auth');
const router = express.Router();

//Login
router.post("/login", loginController);
router.post("/register", registerController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);

module.exports = router;
