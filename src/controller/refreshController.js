const jwt = require("jsonwebtoken");

const refreshController = (req, res) => {
  const refreshToken = req.cookies.jwt;
  if (!refreshToken) return res.sendStatus(401);

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);

    accessToken = jwt.sign(
      {
        id: decoded.id,
        email: decoded.email,
        roles: decoded.roles,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({
      status: "success",
      message: "access token refreshed successfully",
      accessToken: accessToken,
    });
  });
};

module.exports = refreshController;
