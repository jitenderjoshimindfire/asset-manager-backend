const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const authRouter = require("./src/router/auth");
const assetRouter = require("./src/router/asset");
const adminRouter = require("./src/router/admin");
const { ensureBucketExists } = require("./src/config/aws/minio");

dotenv.config();
ensureBucketExists().catch(console.error);

const app = express();

const allowedOrigins = ["http://localhost:3000"];

// Enhanced CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
  })
);

// Handle preflight requests
app.options("*", cors());

app.use(helmet()); //middleware for setting security headers
app.use(express.json()); //parse incoming JSON bodies
app.use(express.urlencoded({ extended: true })); //parse URL encoded request bodies with nesting enabled
app.use(cookieParser()); // parse cookies from incoming HTTP req

app.use("/auth", authRouter); //auth endpoints
app.use("/assets", assetRouter);
app.use("/admin", adminRouter);

module.exports = app;
