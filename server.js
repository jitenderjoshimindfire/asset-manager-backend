const app = require("./app");
const http = require("http");
const PORT = process.env.PORT || 5000;
const connectMongoDB = require("./src/config/db/mongoDB");

const server = http.createServer(app);

connectMongoDB()
  .then(() => {
    server.listen(PORT, "localhost", () => {
      console.log("✅ Server running on port: " + PORT);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed", err);
    process.exit(1);
  });
