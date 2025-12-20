// backend/routes/uploadRoute.js
import express from 'express';
import { 
  uploadImageToS3, 
  getSignedUrlForImage, 
  deleteImageFromS3,
  uploadMiddleware
} from '../controllres/uploadController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const uploadRoute = express.Router();

// Apply authentication middleware to all routes
uploadRoute.use(requireAuth);

/**
 * @swagger
 * /api/v1/upload/s3:
 *   post:
 *     summary: Upload image to AWS S3 and get signed URL
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (multipart/form-data)
 *               folder:
 *                 type: string
 *                 description: Folder path in S3 bucket (e.g., 'profiles', 'uploads')
 *                 default: 'profiles'
 *               fileName:
 *                 type: string
 *                 description: Optional custom file name
 *     responses:
 *       200:
 *         description: Image uploaded successfully, returns signed URL
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
uploadRoute.post('/s3', uploadMiddleware, uploadImageToS3);

/**
 * @swagger
 * /api/v1/upload/signed-url/{key}:
 *   get:
 *     summary: Get signed URL for existing S3 image
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: S3 object key
 *       - in: query
 *         name: expiresIn
 *         schema:
 *           type: integer
 *           default: 3600
 *         description: Expiration time in seconds (default: 3600 = 1 hour)
 *     responses:
 *       200:
 *         description: Signed URL generated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
uploadRoute.get('/signed-url/:key', getSignedUrlForImage);

/**
 * @swagger
 * /api/v1/upload/s3/{key}:
 *   delete:
 *     summary: Delete image from S3
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: S3 object key
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
uploadRoute.delete('/s3/:key', deleteImageFromS3);

export default uploadRoute;

