import express from 'express';
import { createCompanyFromTally } from '../../controllres/tallySyncController.js';
import { upsertCompanyProductFromTally } from '../../controllres/tallyProductController.js';
import { upsertUserFromTally } from '../../controllres/tallyUserController.js';
import {
  listCompaniesForTally,
  listProductsByCompanyGuid,
  listUsersByCompanyGuid,
  listApprovedOrdersByCompanyGuid,
} from '../../controllres/tallyQueryController.js';

const tallyRoute = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tally
 *   description: Endpoints for integrating with Tally ERP
 */

/**
 * @swagger
 * /api/v1/tally/companies:
 *   post:
 *     summary: Sync company details from Tally
 *     description: >
 *       Accepts company information pushed from Tally ERP (JSON or XML payload) and creates the
 *       corresponding company inside Royal Software if it does not already exist. Duplicate
 *       submissions are treated as idempotent and will return the existing record.
 *     tags: [Tally]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - guid
 *               - companyCode
 *               - companyName
 *               - companyEmail
 *               - companyMobile
 *               - companyState
 *               - companyCountry
 *               - maxUser
 *             properties:
 *               guid:
 *                 type: integer
 *                 example: 12345
 *               companyCode:
 *                 type: string
 *                 example: ROYAL01
 *               companyName:
 *                 type: string
 *                 example: Royal Paints Pvt Ltd
 *               companyEmail:
 *                 type: string
 *                 format: email
 *                 example: info@royalpaints.com
 *               companyMobile:
 *                 type: string
 *                 example: "+919876543210"
 *               companyState:
 *                 type: string
 *                 example: "Karnataka"
 *               companyCountry:
 *                 type: string
 *                 example: "India"
 *               maxUser:
 *                 type: integer
 *                 minimum: 1
 *                 example: 100
 *               gstin:
 *                 type: string
 *                 example: "29ABCDE1234F2Z5"
 *               contactDetails:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                     example: support@royalpaints.com
 *                   phone:
 *                     type: string
 *                     example: "+919999888877"
 *                   website:
 *                     type: string
 *                     example: "https://royalpaints.com"
 *                   address:
 *                     type: object
 *                     properties:
 *                       street:
 *                         type: string
 *                       city:
 *                         type: string
 *                       state:
 *                         type: string
 *                       country:
 *                         type: string
 *                       pincode:
 *                         type: string
 *     responses:
 *       201:
 *         description: Company created successfully
 *       200:
 *         description: Company already exists; returning existing data
 *       400:
 *         description: Validation error or missing fields
 *       500:
 *         description: Server error while syncing the company
 */
tallyRoute.post('/companies', createCompanyFromTally);

/**
 * @swagger
 * /api/v1/tally/companies:
 *   get:
 *     summary: Fetch all companies
 *     description: Returns the list of all companies configured in Royal Software.
 *     tags: [Tally]
 *     responses:
 *       200:
 *         description: Companies returned successfully
 *       500:
 *         description: Server error while fetching companies
 */
tallyRoute.get('/companies', listCompaniesForTally);

/**
 * @swagger
 * /api/v1/tally/products:
 *   post:
 *     summary: Sync products from Tally
 *     description: >
 *       Accepts product information pushed from Tally ERP (single product or array) and upserts
 *       them into Royal Software. Products are linked to a company via the company's numeric GUID.
 *     tags: [Tally]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/TallyProductPayload'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/TallyProductPayload'
 *     responses:
 *       200:
 *         description: Products synced successfully
 *       207:
 *         description: Partial success (some products processed, others failed)
 *       400:
 *         description: Validation error or missing fields
 *       500:
 *         description: Server error while syncing products
 */
tallyRoute.post('/products', upsertCompanyProductFromTally);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/products:
 *   get:
 *     summary: Fetch products for a company by GUID
 *     description: Returns all products belonging to the company identified by the given GUID.
 *     tags: [Tally]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID as provided by Tally
 *     responses:
 *       200:
 *         description: Products returned successfully
 *       400:
 *         description: Missing or invalid GUID
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error while fetching products
 */
tallyRoute.get('/companies/:guid/products', listProductsByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/users:
 *   get:
 *     summary: Fetch users for a company by GUID
 *     description: Returns all users associated with the company identified by the given GUID.
 *     tags: [Tally]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID as provided by Tally
 *     responses:
 *       200:
 *         description: Users returned successfully
 *       400:
 *         description: Missing or invalid GUID
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error while fetching users
 */
tallyRoute.get('/companies/:guid/users', listUsersByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/orders/approved:
 *   get:
 *     summary: Fetch approved orders for a company by GUID
 *     description: Returns all approved/pushed orders associated with the specified company.
 *     tags: [Tally]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID as provided by Tally
 *     responses:
 *       200:
 *         description: Orders returned successfully
 *       400:
 *         description: Missing or invalid GUID
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error while fetching orders
 */
tallyRoute.get('/companies/:guid/orders/approved', listApprovedOrdersByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/users:
 *   post:
 *     summary: Sync users from Tally
 *     description: >
 *       Accepts user records (single object or array) pushed from Tally ERP and upserts them into
 *       Royal Software. Roles and company assignments are derived from the payload.
 *     tags: [Tally]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/TallyUserPayload'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/TallyUserPayload'
 *     responses:
 *       200:
 *         description: Users synced successfully
 *       207:
 *         description: Partial success (some users processed, others failed)
 *       400:
 *         description: Validation error or missing fields
 *       500:
 *         description: Server error while syncing users
 */
tallyRoute.post('/users', upsertUserFromTally);

export default tallyRoute;

