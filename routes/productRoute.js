import express from 'express';
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductCategories,
  updateProductStock,
  getLowStockProducts
} from '../controllres/productController.js';
import { requireAuth, authorizeRoles } from '../middleware/authMiddleware.js';

const productRoute = express.Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product management endpoints
 */

/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productCode
 *               - productName
 *               - category
 *               - price
 *             properties:
 *               productCode:
 *                 type: string
 *               productName:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               subCategory:
 *                 type: string
 *               brand:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: number
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.post('/', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), createProduct);

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.get('/', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), getProducts);

/**
 * @swagger
 * /api/v1/products/categories:
 *   get:
 *     summary: Get product categories
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.get('/categories', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), getProductCategories);

/**
 * @swagger
 * /api/v1/products/low-stock:
 *   get:
 *     summary: Get low stock products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Low stock products retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.get('/low-stock', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm']), getLowStockProducts);

/**
 * @swagger
 * /api/v1/products/{productId}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.get('/:productId', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), getProductById);

/**
 * @swagger
 * /api/v1/products/{productId}:
 *   put:
 *     summary: Update product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productName:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: object
 *               isAvailable:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.put('/:productId', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), updateProduct);

/**
 * @swagger
 * /api/v1/products/{productId}/stock:
 *   patch:
 *     summary: Update product stock
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *               - operation
 *             properties:
 *               quantity:
 *                 type: number
 *               operation:
 *                 type: string
 *                 enum: [add, subtract]
 *     responses:
 *       200:
 *         description: Product stock updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.patch('/:productId/stock', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), updateProductStock);

/**
 * @swagger
 * /api/v1/products/{productId}:
 *   delete:
 *     summary: Delete product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
productRoute.delete('/:productId', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer']), deleteProduct);

export default productRoute;
