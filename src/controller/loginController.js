const User = require("../model/userModel");
const jwt = require("jsonwebtoken");

const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        roles: user.roles,
        name: user.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        roles: user.roles,
        name: user.name,
      },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Set refresh token as HTTP-only cookie
    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Prepare user response (without password)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      storageUsed: user.storageUsed,
      assetsCount: user.assetsCount,
      createdAt: user.createdAt,
    };

    // Send response
    res.status(200).json({
      status: "success",
      message: "Login successful",
      user: userResponse,
      accessToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      status: "error",
      message: "Login failed",
    });
  }
};

module.exports = loginController;
