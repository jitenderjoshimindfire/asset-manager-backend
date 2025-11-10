const User = require("../model/userModel");

const registerController = async (req, res) => {
  try {
    const { name, email, password, roles } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Name, email and password are required",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User already exists with this email",
      });
    }

    const newUser = await User.create({
      name,
      email,
      password,
      roles: roles && roles.length > 0 ? roles : ["user"],
    });

    // Remove password from response
    const userResponse = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      roles: newUser.roles,
      createdAt: newUser.createdAt,
    };

    res.status(201).json({
      status: "success",
      message: "User registered successfully",
      user: userResponse,
    });
  } catch (err) {
    console.error("Registration error:", err);

    // Handle duplicate email error (if unique index violation)
    if (err.code === 11000) {
      return res.status(400).json({
        status: "error",
        message: "User already exists with this email",
      });
    }

    // Handle validation errors
    if (err.name === "ValidationError") {
      const errors = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        status: "error",
        message: errors.join(", "),
      });
    }

    res.status(500).json({
      status: "error",
      message: "Registration failed",
    });
  }
};

module.exports = registerController;
