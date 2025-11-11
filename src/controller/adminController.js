const User = require('../model/userModel');
const Asset = require('../model/assetModel');
const { minioClient } = require('../config/aws/minio');
const mongoose = require('mongoose');

// Get admin dashboard with user statistics
exports.getAdminDashboard = async (req, res) => {
  try {
    // Get all users with their asset counts and storage usage
    const users = await User.aggregate([
      {
        $lookup: {
          from: 'assets',
          localField: '_id',
          foreignField: 'uploadedBy',
          as: 'assets'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          roles: 1,
          createdAt: 1,
          assetsCount: { $size: '$assets' },
          storageUsed: { $sum: '$assets.size' },
          lastActive: { $max: '$assets.createdAt' }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    // Get system-wide statistics
    const totalUsers = await User.countDocuments();
    const totalAssets = await Asset.countDocuments();
    const totalStorage = await Asset.aggregate([
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        users,
        statistics: {
          totalUsers,
          totalAssets,
          totalStorage: totalStorage[0]?.total || 0,
          activeUsers: users.filter(user => user.assetsCount > 0).length
        }
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin dashboard data'
    });
  }
};

// Get system statistics
exports.getSystemStats = async (req, res) => {
  try {
    const stats = await Asset.aggregate([
      {
        $group: {
          _id: null,
          totalStorage: { $sum: '$size' },
          totalAssets: { $sum: 1 },
          totalDownloads: { $sum: '$downloadCount' },
          avgFileSize: { $avg: '$size' }
        }
      }
    ]);

    const usersByType = await User.aggregate([
      {
        $group: {
          _id: { $arrayElemAt: ['$roles', 0] },
          count: { $sum: 1 }
        }
      }
    ]);

    const assetsByType = await Asset.aggregate([
      {
        $group: {
          _id: {
            $cond: [
              { $regexMatch: { input: '$mimeType', regex: /^image\// } },
              'image',
              {
                $cond: [
                  { $regexMatch: { input: '$mimeType', regex: /^video\// } },
                  'video',
                  'document'
                ]
              }
            ]
          },
          count: { $sum: 1 },
          storage: { $sum: '$size' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        storage: stats[0] || { totalStorage: 0, totalAssets: 0, totalDownloads: 0, avgFileSize: 0 },
        usersByType,
        assetsByType
      }
    });
  } catch (error) {
    console.error('System stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching system statistics'
    });
  }
};

// Get all assets for a specific user
exports.getUserAssets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 12, search = '', type = '' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const skip = (page - 1) * limit;

    // Build query
    let query = { uploadedBy: new mongoose.Types.ObjectId(userId) };

    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (type) {
      if (type === 'image') {
        query.mimeType = { $regex: /^image\// };
      } else if (type === 'video') {
        query.mimeType = { $regex: /^video\// };
      } else if (type === 'document') {
        query.mimeType = { $regex: /^(application|text)\// };
      }
    }

    const assets = await Asset.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('uploadedBy', 'name email');

    const total = await Asset.countDocuments(query);
    const user = await User.findById(userId).select('name email roles createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        assets,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          count: assets.length
        }
      }
    });
  } catch (error) {
    console.error('Get user assets error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user assets'
    });
  }
};

// Update asset (admin can update tags, category, etc.)
exports.updateAsset = async (req, res) => {
  try {
    const { assetId } = req.params;
    const { tags, category } = req.body;

    if (!mongoose.Types.ObjectId.isValid(assetId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid asset ID'
      });
    }

    const asset = await Asset.findById(assetId).populate('uploadedBy', 'name email');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    const updateData = {};
    if (tags) updateData.tags = Array.isArray(tags) ? tags : [tags];
    if (category) updateData.category = category;

    const updatedAsset = await Asset.findByIdAndUpdate(
      assetId,
      updateData,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      data: updatedAsset
    });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating asset'
    });
  }
};

// Delete asset (admin can delete any asset)
exports.deleteAsset = async (req, res) => {
  try {
    const { assetId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(assetId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid asset ID'
      });
    }

    const asset = await Asset.findById(assetId);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Delete from MinIO
    await minioClient.removeObject(process.env.MINIO_BUCKET, asset.storageKey);

    if (asset.thumbnailKey) {
      await minioClient.removeObject(process.env.MINIO_BUCKET, asset.thumbnailKey);
    }

    // Delete resolution files
    if (asset.resolutions && asset.resolutions.length > 0) {
      for (const resolution of asset.resolutions) {
        await minioClient.removeObject(process.env.MINIO_BUCKET, resolution.key);
      }
    }

    // Delete from database
    await Asset.findByIdAndDelete(assetId);

    // Update user storage stats
    await User.findByIdAndUpdate(
      asset.uploadedBy,
      {
        $inc: {
          storageUsed: -asset.size,
          assetsCount: -1
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting asset'
    });
  }
};

// Delete user and all their assets
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all user assets to delete from storage
    const userAssets = await Asset.find({ uploadedBy: userId });

    // Delete all assets from MinIO
    for (const asset of userAssets) {
      try {
        await minioClient.removeObject(process.env.MINIO_BUCKET, asset.storageKey);
        
        if (asset.thumbnailKey) {
          await minioClient.removeObject(process.env.MINIO_BUCKET, asset.thumbnailKey);
        }

        if (asset.resolutions && asset.resolutions.length > 0) {
          for (const resolution of asset.resolutions) {
            await minioClient.removeObject(process.env.MINIO_BUCKET, resolution.key);
          }
        }
      } catch (storageError) {
        console.error(`Error deleting asset ${asset._id} from storage:`, storageError);
        // Continue with other assets even if one fails
      }
    }

    // Delete all assets from database
    await Asset.deleteMany({ uploadedBy: userId });

    // Delete user from database
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: `User and ${userAssets.length} assets deleted successfully`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
};