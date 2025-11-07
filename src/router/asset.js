const express = require('express');
const {
  uploadAsset,
  getAssets,
  getAsset,
  downloadAsset,
  getPreviewUrl,
  updateAsset,
  deleteAsset,
  getDashboardStats
} = require('../controller/assets/assetController');
const { protect, authorize } = require('../middleware/auth');
const { upload, handleUploadErrors } = require('../middleware/upload');

const router = express.Router();

// All routes are protected
router.use(protect);

// Upload asset
router.post(
  '/upload',
  upload.array('assets', parseInt(process.env.UPLOAD_LIMIT) || 5),
  handleUploadErrors,
  uploadAsset
);

// Get all assets with filtering and pagination
router.get('/', getAssets);

// Get dashboard stats
router.get('/dashboard/stats', getDashboardStats);

// Get single asset
router.get('/:id', getAsset);

// Download asset
router.get('/:id/download', downloadAsset);

// Get preview URL
router.get('/:id/preview', getPreviewUrl);

// Update asset
router.put('/:id', updateAsset);

// Delete asset
router.delete('/:id', deleteAsset);

// Admin only routes
router.get('/admin/all', authorize('admin'), getAssets);

module.exports = router;