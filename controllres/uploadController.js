// backend/controllres/uploadController.js
import AWS from 'aws-sdk';
import multer from 'multer';

// Configure multer for memory storage (we'll upload directly to S3)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Initialize AWS S3
const initializeS3 = () => {
  const config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('AWS S3 credentials not configured');
  }

  return new AWS.S3({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    signatureVersion: 'v4',
  });
};

/**
 * Get signed URL for S3 object
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {string} Signed URL
 */
const getSignedUrl = (key, expiresIn = 3600) => {
  const s3 = initializeS3();
  const bucket = process.env.AWS_S3_BUCKET;

  if (!bucket) {
    throw new Error('S3 bucket not configured');
  }

  return s3.getSignedUrl('getObject', {
    Bucket: bucket,
    Key: key,
    Expires: expiresIn, // URL expires in 1 hour by default
  });
};

/**
 * Multer middleware for file upload
 */
export const uploadMiddleware = upload.single('image');

/**
 * Upload image to S3 and return signed URL
 * POST /api/v1/upload/s3
 * Expects multipart/form-data with 'image' field
 */
export const uploadImageToS3 = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required. Please upload a file using multipart/form-data with field name "image".'
      });
    }

    const file = req.file;
    const folder = req.body.folder || 'profiles';
    const fileName = req.body.fileName;

    const s3 = initializeS3();
    const bucket = process.env.AWS_S3_BUCKET;

    if (!bucket) {
      return res.status(500).json({
        success: false,
        message: 'S3 bucket not configured'
      });
    }

    // Generate unique file name if not provided
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = fileName 
      ? fileName.split('.').pop() 
      : file.originalname.split('.').pop() || 'jpg';
    const finalFileName = fileName || `image-${timestamp}-${randomString}.${extension}`;
    const key = folder ? `${folder}/${finalFileName}` : finalFileName;

    // Upload to S3 (without public-read ACL for security)
    const uploadParams = {
      Bucket: bucket,
      Key: key,
      Body: file.buffer, // Use file buffer directly from multer
      ContentType: file.mimetype || 'image/jpeg',
      // No ACL - files are private, accessed via signed URLs
    };

    const result = await s3.upload(uploadParams).promise();

    // Generate signed URL (expires in 1 year for profile images)
    const signedUrl = getSignedUrl(result.Key, 31536000); // 1 year expiration

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: signedUrl, // Signed URL for immediate use
        key: result.Key, // S3 key - store this in database for future signed URL generation
        bucket: bucket
      }
    });
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image to S3',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get signed URL for existing S3 object
 * GET /api/v1/upload/signed-url/:key
 */
export const getSignedUrlForImage = async (req, res) => {
  try {
    const { key } = req.params;
    const { expiresIn } = req.query; // Optional expiration time in seconds

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Image key is required'
      });
    }

    const expirationTime = expiresIn ? parseInt(expiresIn, 10) : 3600; // Default 1 hour
    const signedUrl = getSignedUrl(key, expirationTime);

    res.json({
      success: true,
      message: 'Signed URL generated successfully',
      data: {
        url: signedUrl,
        key: key,
        expiresIn: expirationTime
      }
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate signed URL',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete image from S3
 * DELETE /api/v1/upload/s3/:key
 */
export const deleteImageFromS3 = async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Image key is required'
      });
    }

    const s3 = initializeS3();
    const bucket = process.env.AWS_S3_BUCKET;

    if (!bucket) {
      return res.status(500).json({
        success: false,
        message: 'S3 bucket not configured'
      });
    }

    const deleteParams = {
      Bucket: bucket,
      Key: key,
    };

    await s3.deleteObject(deleteParams).promise();

    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: {
        key: key
      }
    });
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image from S3',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

