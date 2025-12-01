import express from 'express';
import { universalLogin } from '../controllres/authController.js';

const authRoute = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Universal authentication endpoints
 */

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Universal login for all user types (email or mobile)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emailOrMobile
 *               - password
 *             properties:
 *               emailOrMobile:
 *                 type: string
 *                 description: User email address or mobile number
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful with role-specific data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     roleSpecificData:
 *                       type: object
 *                       description: Data specific to user role
 *                     token:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Bad request
 */
authRoute.post('/login', universalLogin);

export default authRoute;
