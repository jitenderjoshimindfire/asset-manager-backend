const { Worker, Queue } = require("bullmq");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const { minioClient } = require("../config/aws/minio");
const connectWorkerMongoDB = require("./workerMongoDB");
const redisClient = require("../config/redis/redis");

// Create queue
const assetQueue = new Queue("asset processing", {
  connection: redisClient,
});

// Initialize worker connection
let WorkerAssetModel = null;

const initializeWorker = async () => {
  try {
    const workerConnection = await connectWorkerMongoDB();

    // Create a model using the worker connection
    WorkerAssetModel = workerConnection.model(
      "Asset",
      require("../model/assetModel").schema
    );

    console.log("Worker models initialized successfully");
  } catch (error) {
    console.error("Worker initialization failed:", error);
    throw error;
  }
};

// Initialize worker before processing jobs
initializeWorker().catch(console.error);

// Worker for processing assets
const assetWorker = new Worker(
  "asset processing",
  async (job) => {
    const { assetId, fileKey, mimeType } = job.data;

    try {
      console.log(`Processing asset: ${assetId}`);

      // Ensure models are initialized
      if (!WorkerAssetModel) {
        await initializeWorker();
      }

      // Update asset status
      await WorkerAssetModel.findByIdAndUpdate(
        assetId,
        {
          processingStatus: "processing",
        },
        { useFindAndModify: false }
      );

      // Get file from MinIO
      const fileStream = await minioClient.getObject(
        process.env.MINIO_BUCKET,
        fileKey
      );

      const chunks = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      let metadata = {};
      let thumbnailKey = null;
      const resolutions = [];

      if (mimeType.startsWith("image/")) {
        // Process image
        const result = await processImage(fileBuffer, fileKey);
        metadata = result.metadata;
        thumbnailKey = result.thumbnailKey;
      } else if (mimeType.startsWith("video/")) {
        // Process video
        const result = await processVideo(fileBuffer, fileKey);
        metadata = result.metadata;
        thumbnailKey = result.thumbnailKey;
        resolutions.push(...result.resolutions);
      } else {
        // For documents, just extract basic metadata
        metadata = {
          size: fileBuffer.length,
          format: mimeType.split("/")[1],
        };
      }

      // Update asset with processed data
      await WorkerAssetModel.findByIdAndUpdate(
        assetId,
        {
          metadata,
          thumbnailKey,
          resolutions,
          isProcessed: true,
          processingStatus: "completed",
          processedAt: new Date(),
        },
        { useFindAndModify: false }
      );

      console.log(`Asset processing completed: ${assetId}`);
      return { success: true, assetId };
    } catch (error) {
      console.error(`Asset processing failed: ${assetId}`, error);

      // Update asset status to failed
      if (WorkerAssetModel) {
        await WorkerAssetModel.findByIdAndUpdate(
          assetId,
          {
            processingStatus: "failed",
            error: error.message,
          },
          { useFindAndModify: false }
        ).catch((err) => {
          console.error("Failed to update asset status to failed:", err);
        });
      }

      throw error;
    }
  },
  {
    connection: redisClient,
    concurrency: 2, // Process 2 assets at a time
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      count: 100, // Keep last 100 failed jobs
    },
  }
);

// Process image files
async function processImage(fileBuffer, fileKey) {
  try {
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    // Generate thumbnail (300px width)
    const thumbnailBuffer = await image
      .clone()
      .resize(300, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailKey = `thumbnails/${fileKey.split(".")[0]}.jpg`;

    await minioClient.putObject(
      process.env.MINIO_BUCKET,
      thumbnailKey,
      thumbnailBuffer,
      thumbnailBuffer.length,
      { "Content-Type": "image/jpeg" }
    );

    return {
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: fileBuffer.length,
        channels: metadata.channels,
        space: metadata.space,
      },
      thumbnailKey,
    };
  } catch (error) {
    console.error("Image processing error:", error);
    throw error;
  }
}

// Process video files (simplified - just extract metadata)
async function processVideo(fileBuffer, fileKey) {
  return new Promise((resolve, reject) => {
    const metadata = {};

    ffmpeg.ffprobe(fileBuffer, (err, probeData) => {
      if (err) {
        console.warn("Could not extract video metadata:", err);
        // Set basic metadata
        resolve({
          metadata: {
            format: "video",
            size: fileBuffer.length,
          },
          thumbnailKey: null,
          resolutions: [],
        });
        return;
      }

      const videoStream = probeData.streams.find(
        (stream) => stream.codec_type === "video"
      );
      const audioStream = probeData.streams.find(
        (stream) => stream.codec_type === "audio"
      );

      if (videoStream) {
        metadata.width = videoStream.width;
        metadata.height = videoStream.height;
        metadata.duration = Math.round(
          parseFloat(videoStream.duration || probeData.format.duration || 0)
        );
        metadata.format = videoStream.codec_name;
        metadata.bitRate = videoStream.bit_rate;
        metadata.frameRate = videoStream.r_frame_rate;
      }

      if (audioStream) {
        metadata.audioCodec = audioStream.codec_name;
        metadata.audioChannels = audioStream.channels;
        metadata.audioSampleRate = audioStream.sample_rate;
      }

      metadata.container = probeData.format.format_name;

      // For now, we won't generate thumbnails for videos to keep it simple
      // In production, you'd want to implement proper video thumbnail generation

      resolve({
        metadata,
        thumbnailKey: null,
        resolutions: [],
      });
    });
  });
}

// Worker event listeners
assetWorker.on("completed", (job) => {
  console.log(
    `✅ Job ${job.id} completed successfully for asset: ${job.data.assetId}`
  );
});

assetWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed for asset: ${job.data.assetId}`, err);
});

assetWorker.on("error", (err) => {
  console.error("❌ Worker error:", err);
});

assetWorker.on("stalled", (job) => {
  console.warn(`⚠️ Job ${job.id} stalled:`, job.data);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down worker gracefully...");
  await assetWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down worker gracefully...");
  await assetWorker.close();
  process.exit(0);
});

module.exports = { assetQueue, assetWorker };
