// config/db/workerMongoDB.js
const mongoose = require("mongoose");

let workerConnection = null;

const connectWorkerMongoDB = async () => {
  try {
    if (workerConnection && workerConnection.readyState === 1) {
      console.log("Worker MongoDB connection already established");
      return workerConnection;
    }

    const mongoUri = process.env.MONGO_URI;

    workerConnection = await mongoose.createConnection(mongoUri, {
      bufferCommands: false, // Disable buffering
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
    });

    console.log("Worker MongoDB connected successfully");
    return workerConnection;
  } catch (error) {
    console.error("Worker MongoDB connection failed:", error);
    throw error;
  }
};

module.exports = connectWorkerMongoDB;
