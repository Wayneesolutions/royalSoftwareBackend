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
 *                 description: Unique product identifier per company
 *               productName:
 *                 type: string
 *                 description: Display name shown to users
 *               name:
 *                 type: string
 *                 description: Optional internal name (defaults to productName)
 *               partNo:
 *                 type: string
 *               itemAlias:
 *                 type: string
 *               description:
 *                 type: string
 *               parent:
 *                 type: string
 *               category:
 *                 type: string
 *               subCategory:
 *                 type: string
 *               brand:
 *                 type: string
 *               baseUnits:
 *                 type: string
 *               additionalUnits:
 *                 type: string
 *               stdPurcRate:
 *                 type: number
 *               stdSaleRate:
 *                 type: number
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               itemGstPer:
 *                 type: number
 *               gstRate:
 *                 type: number
 *               itemHsn:
 *                 type: string
 *               itemHsnDesc:
 *                 type: string
 *               openingBalance:
 *                 type: number
 *               itemOpRate:
 *                 type: number
 *               companyCode:
 *                 type: string
 *                 description: Optional override; defaults to the auth user's company code
 *               isFinishItem:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *               other1:
 *                 type: string
 *               other2:
 *                 type: string
 *               other3:
 *                 type: string
 *               other4:
 *                 type: string
 *               other5:
 *                 type: string
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
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *       - in: query
 *         name: parent
 *         schema:
 *           type: string
 *       - in: query
 *         name: isFinishItem
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
productRoute.get('/', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer', 'groupuser']), getProducts);

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
productRoute.get('/categories', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer', 'groupuser']), getProductCategories);

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
productRoute.get('/:productId', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer', 'groupuser']), getProductById);

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
 *               productCode:
 *                 type: string
 *               productName:
 *                 type: string
 *               name:
 *                 type: string
 *               partNo:
 *                 type: string
 *               itemAlias:
 *                 type: string
 *               description:
 *                 type: string
 *               parent:
 *                 type: string
 *               category:
 *                 type: string
 *               subCategory:
 *                 type: string
 *               brand:
 *                 type: string
 *               baseUnits:
 *                 type: string
 *               additionalUnits:
 *                 type: string
 *               stdPurcRate:
 *                 type: number
 *               stdSaleRate:
 *                 type: number
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               itemGstPer:
 *                 type: number
 *               gstRate:
 *                 type: number
 *               itemHsn:
 *                 type: string
 *               itemHsnDesc:
 *                 type: string
 *               openingBalance:
 *                 type: number
 *               itemOpRate:
 *                 type: number
 *               companyCode:
 *                 type: string
 *               isFinishItem:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *               other1:
 *                 type: string
 *               other2:
 *                 type: string
 *               other3:
 *                 type: string
 *               other4:
 *                 type: string
 *               other5:
 *                 type: string
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
