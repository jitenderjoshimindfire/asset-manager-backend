const User = require('../model/userModel')

const registerController = async (req, res) => {
  try {
    const { email, password, roles } = req.body;

    const newUser = await User.create({
      email,
      password,
      roles: roles && roles.length > 0 ? roles : undefined
    });

    res.status(201).json({
      status: "success",
      data: newUser
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: err.message
    });
  }
};

module.exports = registerController;
