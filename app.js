const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const authRouter = require("./src/router/auth");
const { ensureBucketExists } = require('./src/config/aws/minio');


dotenv.config();
ensureBucketExists().catch(console.error);

const app = express();

const allowedOrigins = ["http://localhost:3000"]; //allow api calls only from localhost:3000

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,  //for using cookies
  })
);

app.use(helmet()); //middleware for setting security headers
app.use(express.json()); //parse incoming JSON bodies
app.use(express.urlencoded({ extended: true })); //parse URL encoded request bodies with nesting enabled
app.use(cookieParser()); // parse cookies from incoming HTTP req

app.use("/auth", authRouter);  //auth endpoints

module.exports = app;
