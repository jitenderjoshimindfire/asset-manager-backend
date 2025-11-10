// server.js
const app = require("./app");
const http = require("http");
const PORT = process.env.PORT || 5000;
const connectMongoDB = require("./src/config/db/mongoDB");

const server = http.createServer(app);

connectMongoDB()
  .then(() => {
    // Remove "localhost" to bind to all network interfaces
    server.listen(PORT, "0.0.0.0", () => {
      console.log("✅ Server running on port: " + PORT);
      console.log("✅ Access via: http://localhost:" + PORT);
      console.log("✅ Network access: http://YOUR_IP:" + PORT);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed", err);
    process.exit(1);
  });
