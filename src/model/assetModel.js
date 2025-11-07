const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  storageKey: {
    type: String,
    required: true,
    unique: true,
  },
  thumbnailKey: {
    type: String,
  },
  resolutions: [{
    quality: String,
    key: String,
    size: Number,
  }],
  metadata: {
    width: Number,
    height: Number,
    duration: Number,
    format: String,
  },
  tags: [String],
  category: {
    type: String,
    default: 'uncategorized',
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  isProcessed: {
    type: Boolean,
    default: false,
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

// Index for search functionality
assetSchema.index({ 
  originalName: 'text', 
  tags: 'text', 
  category: 'text' 
});

assetSchema.index({ uploadedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Asset', assetSchema);