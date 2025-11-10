const jwt = require("jsonwebtoken");
const User = require("../model/userModel"); // Add this import

const refreshController = async (req, res) => {
  try {
    const refreshToken = req.cookies.jwt;

    if (!refreshToken) {
      return res.status(401).json({
        status: "error",
        message: "Refresh token required",
      });
    }

    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      async (err, decoded) => {
        if (err) {
          return res.status(403).json({
            status: "error",
            message: "Invalid refresh token",
          });
        }

        // Verify user still exists
        const user = await User.findById(decoded.id);
        if (!user) {
          return res.status(403).json({
            status: "error",
            message: "User no longer exists",
          });
        }

        // Generate new access token
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

        res.status(200).json({
          status: "success",
          message: "Access token refreshed successfully",
          accessToken: accessToken,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            roles: user.roles,
            storageUsed: user.storageUsed,
            assetsCount: user.assetsCount,
          },
        });
      }
    );
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({
      status: "error",
      message: "Token refresh failed",
    });
  }
};

module.exports = refreshController;
