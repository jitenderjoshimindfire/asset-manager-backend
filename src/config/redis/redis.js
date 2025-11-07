require('dotenv').config();

const Redis = require('ioredis');

console.log('🔧 Initializing Redis connection for BullMQ...');

// BullMQ requires maxRetriesPerRequest to be null
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6370,
  
  // BullMQ specific requirements
  maxRetriesPerRequest: null, // ← MUST be null for BullMQ
  
  // Connection settings
  connectTimeout: 30000, // Increased timeout
  commandTimeout: 30000, // Increased timeout
  lazyConnect: false,
  
  // Retry settings
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  
  // Memory management
  enableOfflineQueue: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  
  // Keep alive
  keepAlive: 60000,
};

let redisClient;

try {
  redisClient = new Redis(redisConfig);
  console.log('✅ Redis client created with BullMQ configuration');
} catch (error) {
  console.error('❌ Failed to create Redis client:', error.message);
  process.exit(1);
}

// Event handlers
redisClient.on('connect', () => {
  console.log('✅ Redis: Connecting to server...');
});

redisClient.on('ready', () => {
  console.log('✅ Redis: Client ready and connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis Error:', err.message);
});

redisClient.on('close', () => {
  console.log('🔌 Redis: Connection closed');
});

redisClient.on('reconnecting', (delay) => {
  console.log(`🔄 Redis: Reconnecting in ${delay}ms...`);
});

redisClient.on('end', () => {
  console.log('🔚 Redis: Connection ended permanently');
});

// Test connection
const testConnection = async () => {
  try {
    console.log('Testing Redis connection for BullMQ...');
    const pong = await redisClient.ping();
    console.log('✅ Redis connection test passed:', pong);
    return true;
  } catch (error) {
    console.error('❌ Redis connection test failed:', error.message);
    return false;
  }
};

// Test connection on startup
setTimeout(async () => {
  await testConnection();
}, 1000);

module.exports = redisClient;