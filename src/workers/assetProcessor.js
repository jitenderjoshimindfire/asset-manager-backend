const { Worker, Queue } = require('bullmq');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { minioClient } = require('../config/aws/minio');
const Asset = require('../model/assetModel');
const redisClient = require('../config/redis/redis');

// Create queue
const assetQueue = new Queue('asset processing', {
  connection: redisClient,
});

// Worker for processing assets
const assetWorker = new Worker(
  'asset processing',
  async (job) => {
    const { assetId, fileKey, mimeType } = job.data;
    
    try {
      console.log(`Processing asset: ${assetId}`);
      
      // Update asset status
      await Asset.findByIdAndUpdate(assetId, {
        processingStatus: 'processing'
      });

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

      if (mimeType.startsWith('image/')) {
        // Process image
        const result = await processImage(fileBuffer, fileKey);
        metadata = result.metadata;
        thumbnailKey = result.thumbnailKey;
        
      } else if (mimeType.startsWith('video/')) {
        // Process video
        const result = await processVideo(fileBuffer, fileKey);
        metadata = result.metadata;
        thumbnailKey = result.thumbnailKey;
        resolutions.push(...result.resolutions);
      } else {
        // For documents, just extract basic metadata
        metadata = {
          size: fileBuffer.length,
          format: mimeType.split('/')[1]
        };
      }

      // Update asset with processed data
      await Asset.findByIdAndUpdate(assetId, {
        metadata,
        thumbnailKey,
        resolutions,
        isProcessed: true,
        processingStatus: 'completed'
      });

      console.log(`Asset processing completed: ${assetId}`);
      return { success: true, assetId };

    } catch (error) {
      console.error(`Asset processing failed: ${assetId}`, error);
      
      await Asset.findByIdAndUpdate(assetId, {
        processingStatus: 'failed'
      });

      throw error;
    }
  },
  {
    connection: redisClient,
    concurrency: 2 // Process 2 assets at a time
  }
);

// Process image files
async function processImage(fileBuffer, fileKey) {
  const image = sharp(fileBuffer);
  const metadata = await image.metadata();

  // Generate thumbnail (300px width)
  const thumbnailBuffer = await image
    .resize(300, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const thumbnailKey = `thumbnails/${fileKey.split('.')[0]}.jpg`;
  
  await minioClient.putObject(
    process.env.MINIO_BUCKET,
    thumbnailKey,
    thumbnailBuffer,
    thumbnailBuffer.length,
    { 'Content-Type': 'image/jpeg' }
  );

  return {
    metadata: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: fileBuffer.length
    },
    thumbnailKey
  };
}

// Process video files
async function processVideo(fileBuffer, fileKey) {
  return new Promise((resolve, reject) => {
    const metadata = {};
    const resolutions = [
      { quality: '1080p', width: 1920, height: 1080 },
      { quality: '720p', width: 1280, height: 720 }
    ];

    // For now, we'll just extract metadata and generate a thumbnail
    // In production, you'd want to actually transcode the video
    
    ffmpeg.ffprobe(fileBuffer, (err, probeData) => {
      if (err) {
        console.warn('Could not extract video metadata:', err);
        // Set basic metadata
        resolve({
          metadata: {
            format: 'video',
            size: fileBuffer.length
          },
          thumbnailKey: null,
          resolutions: []
        });
        return;
      }

      const videoStream = probeData.streams.find(stream => stream.codec_type === 'video');
      
      if (videoStream) {
        metadata.width = videoStream.width;
        metadata.height = videoStream.height;
        metadata.duration = Math.round(parseFloat(videoStream.duration));
        metadata.format = videoStream.codec_name;
      }

      // Generate thumbnail from first frame
      ffmpeg(fileBuffer)
        .screenshots({
          count: 1,
          folder: '/tmp',
          filename: `${fileKey}-thumbnail.jpg`,
          size: '300x?'
        })
        .on('end', async () => {
          try {
            // Upload thumbnail
            const thumbnailKey = `thumbnails/${fileKey.split('.')[0]}.jpg`;
            // You would read the generated thumbnail file and upload it to MinIO
            // This is simplified for the example
            
            resolve({
              metadata,
              thumbnailKey,
              resolutions: [] // In production, you'd add actual transcoded files
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  });
}

// Worker event listeners
assetWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

assetWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err);
});

module.exports = { assetQueue, assetWorker };