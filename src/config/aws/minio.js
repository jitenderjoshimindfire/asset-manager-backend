require('dotenv').config(); // ← ADD THIS LINE

const Minio = require('minio');

// Add validation for environment variables
if (!process.env.MINIO_ENDPOINT) {
  throw new Error('MINIO_ENDPOINT environment variable is required');
}

if (!process.env.MINIO_ACCESS_KEY) {
  throw new Error('MINIO_ACCESS_KEY environment variable is required');
}

if (!process.env.MINIO_SECRET_KEY) {
  throw new Error('MINIO_SECRET_KEY environment variable is required');
}

console.log('MinIO Config:', {
  endpoint: process.env.MINIO_ENDPOINT,
  port: process.env.MINIO_PORT,
  accessKey: process.env.MINIO_ACCESS_KEY ? '***' : 'missing',
  secretKey: process.env.MINIO_SECRET_KEY ? '***' : 'missing',
  bucket: process.env.MINIO_BUCKET
});

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const ensureBucketExists = async () => {
  try {
    const bucketExists = await minioClient.bucketExists(process.env.MINIO_BUCKET);
    if (!bucketExists) {
      await minioClient.makeBucket(process.env.MINIO_BUCKET, 'us-east-1');
      console.log('Bucket created successfully');
    }
    console.log('Bucket verification completed');
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
  }
};

// Test connection on startup
const testConnection = async () => {
  try {
    await ensureBucketExists();
    console.log('MinIO connection test passed');
  } catch (error) {
    console.error('MinIO connection test failed:', error);
  }
};

// Run connection test
testConnection();

module.exports = { minioClient, ensureBucketExists };