const express = require("express");
const loginController = require("../controller/loginController");
const registerController = require("../controller/registerController");
const refreshController = require("../controller/refreshController");
const logoutController = require("../controller/logoutController");
const router = express.Router();

//Login
router.post("/login", loginController);
router.post("/register", registerController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);

module.exports = router;
