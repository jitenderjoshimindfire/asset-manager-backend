const Asset = require('../model/assetModel');
const User = require('../model/userModel');
const { minioClient } = require('../../config/aws/minio');
const { assetQueue } = require('../workers/assetProcessor');
const crypto = require('crypto');

// Generate unique file key
const generateFileKey = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = originalName.split('.').pop();
  return `${timestamp}-${randomString}.${extension}`;
};

// Upload asset
exports.uploadAsset = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const uploadResults = [];

    for (const file of req.files) {
      const fileKey = generateFileKey(file.originalname);
      
      // Upload to MinIO
      await minioClient.putObject(
        process.env.MINIO_BUCKET,
        fileKey,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype }
      );

      // Create asset record
      const asset = await Asset.create({
        filename: fileKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageKey: fileKey,
        uploadedBy: req.user._id,
        tags: extractTagsFromFilename(file.originalname),
      });

      // Add to processing queue
      await assetQueue.add('process-asset', {
        assetId: asset._id,
        fileKey: fileKey,
        mimeType: file.mimetype,
      });

      uploadResults.push({
        id: asset._id,
        originalName: asset.originalName,
        filename: asset.filename,
        size: asset.size,
        mimeType: asset.mimeType,
        status: 'uploaded'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Files uploaded successfully',
      data: uploadResults
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading files'
    });
  }
};

// Extract tags from filename
const extractTagsFromFilename = (filename) => {
  const nameWithoutExt = filename.split('.').slice(0, -1).join('.');
  const tags = nameWithoutExt.toLowerCase().split(/[\s_-]+/);
  return tags.filter(tag => tag.length > 2);
};

// Get all assets with pagination and filtering
exports.getAssets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const type = req.query.type || '';

    let query = { uploadedBy: req.user._id };

    // Search filter
    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Type filter
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
      .limit(limit)
      .populate('uploadedBy', 'name email');

    const total = await Asset.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        assets,
        pagination: {
          current: page,
          total: totalPages,
          count: assets.length,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assets'
    });
  }
};

// Get asset by ID
exports.getAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('uploadedBy', 'name email');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check ownership
    if (asset.uploadedBy._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this asset'
      });
    }

    res.status(200).json({
      success: true,
      data: asset
    });

  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching asset'
    });
  }
};

// Download asset
exports.downloadAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check ownership
    if (asset.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this asset'
      });
    }

    // Increment download count
    asset.downloadCount += 1;
    await asset.save();

    // Get file from MinIO
    const fileStream = await minioClient.getObject(
      process.env.MINIO_BUCKET,
      asset.storageKey
    );

    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${asset.originalName}"`);

    fileStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
};

// Get preview URL
exports.getPreviewUrl = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check ownership
    if (asset.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this asset'
      });
    }

    // Generate presigned URL for preview (valid for 1 hour)
    const previewUrl = await minioClient.presignedGetObject(
      process.env.MINIO_BUCKET,
      asset.storageKey,
      60 * 60 // 1 hour
    );

    res.status(200).json({
      success: true,
      data: { previewUrl }
    });

  } catch (error) {
    console.error('Preview URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating preview URL'
    });
  }
};

// Update asset
exports.updateAsset = async (req, res) => {
  try {
    const { tags, category } = req.body;
    
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check ownership
    if (asset.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this asset'
      });
    }

    const updateData = {};
    if (tags) updateData.tags = Array.isArray(tags) ? tags : [tags];
    if (category) updateData.category = category;

    const updatedAsset = await Asset.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name email');

    res.status(200).json({
      success: true,
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

// Delete asset
exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check ownership
    if (asset.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this asset'
      });
    }

    // Delete from MinIO
    await minioClient.removeObject(process.env.MINIO_BUCKET, asset.storageKey);
    
    if (asset.thumbnailKey) {
      await minioClient.removeObject(process.env.MINIO_BUCKET, asset.thumbnailKey);
    }

    // Delete resolution files
    for (const resolution of asset.resolutions) {
      await minioClient.removeObject(process.env.MINIO_BUCKET, resolution.key);
    }

    // Delete from database
    await Asset.findByIdAndDelete(req.params.id);

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

// Get dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    const totalAssets = await Asset.countDocuments({ uploadedBy: req.user._id });
    const totalSize = await Asset.aggregate([
      { $match: { uploadedBy: req.user._id } },
      { $group: { _id: null, totalSize: { $sum: '$size' } } }
    ]);
    
    const recentAssets = await Asset.find({ uploadedBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('originalName mimeType size createdAt');

    const assetsByType = await Asset.aggregate([
      { $match: { uploadedBy: req.user._id } },
      { 
        $group: { 
          _id: { 
            $cond: [
              { $regexMatch: { input: '$mimeType', regex: /^image\// } },
              'image',
              { $cond: [
                { $regexMatch: { input: '$mimeType', regex: /^video\// } },
                'video',
                'document'
              ]}
            ]
          },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalAssets,
        totalSize: totalAssets > 0 ? totalSize[0].totalSize : 0,
        recentAssets,
        assetsByType
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats'
    });
  }
};