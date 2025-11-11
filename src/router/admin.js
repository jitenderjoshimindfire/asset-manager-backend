const express = require('express');
const {
  getAdminDashboard,
  getUserAssets,
  updateAsset,
  deleteAsset,
  deleteUser,
  getSystemStats
} = require('../controller/adminController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin'));

// Dashboard and stats
router.get('/dashboard', getAdminDashboard);
router.get('/stats', getSystemStats);

// User management
router.get('/users/:userId/assets', getUserAssets);
router.delete('/users/:userId', deleteUser);

// Asset management
router.put('/assets/:assetId', updateAsset);
router.delete('/assets/:assetId', deleteAsset);

module.exports = router;