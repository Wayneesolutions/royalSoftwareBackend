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
 *                 type: string
 *                 description: Company GUID (alphanumeric string)
 *                 example: 'ABC12345'
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
 *                 maximum: 100
 *                 example: 100
 *               gstin:
 *                 type: string
 *                 example: "29ABCDE1234F2Z5"
 *               tallySerialId:
 *                 type: string
 *                 example: "TALLY-SERIAL-001"
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
 * tags:
 *   name: Tally
 *   description: Endpoints for integrating with Tally ERP
 */

/**
 * @swagger
 * /api/v1/tally/products:
 *   post:
 *     summary: Sync products from Tally
 *     description: >
 *       Accepts product information pushed from Tally ERP. Can accept a single product object or an array
 *       of multiple products for batch processing. All products are upserted (created or updated) into
 *       Royal Software. Products are linked to a company via the company's alphanumeric GUID.
 *       
 *       Supports all Stockitem Master fields: Name, PArtno, ItemAlias, Description, Parent, Category,
 *       Baseunits, additionalunits, Stdpurcrate, StdSalerate, Itemgstper, Itemhsn, Itemhsndesc,
 *       OPENINGBALANCE, Itemoprate, CompanyCode, IsfinishItem, Other1-Other5.
 *       
 *       When sending multiple products, each product is processed independently. The response includes
 *       a results array with the status of each product (success or failure).
 *     tags: [Tally]
 *     requestBody:
 *       required: true
 *       description: Single product object or array of product objects
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - productCode
 *                   - productName
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                     description: Company's numeric GUID
 *                     example: "12345"
 *                   productCode:
 *                     type: string
 *                     description: Unique product code
 *                     example: "PROD001"
 *                   productName:
 *                     type: string
 *                     description: Name of the product (Stock Item Name)
 *                     example: "Premium Paint 5L"
 *                   partNo:
 *                     type: string
 *                     description: Part number
 *                     example: "PN-12345"
 *                   itemAlias:
 *                     type: string
 *                     description: Item alias/alternate name
 *                     example: "PP5L"
 *                   description:
 *                     type: string
 *                     description: Product description
 *                     example: "High quality premium paint"
 *                   parent:
 *                     type: string
 *                     description: Parent category
 *                     example: "Paints"
 *                   category:
 *                     type: string
 *                     description: Product category
 *                     example: "Interior Paints"
 *                   subCategory:
 *                     type: string
 *                     description: Product sub-category
 *                     example: "Premium"
 *                   brand:
 *                     type: string
 *                     description: Brand name
 *                     example: "Royal"
 *                   baseUnits:
 *                     type: string
 *                     description: Base unit of measurement
 *                     example: "Liters"
 *                   additionalUnits:
 *                     type: string
 *                     description: Additional units
 *                     example: "Gallons"
 *                   price:
 *                     type: number
 *                     format: double
 *                     description: Product price
 *                     example: 1500.50
 *                   stdPurcRate:
 *                     type: number
 *                     format: double
 *                     description: Standard purchase rate
 *                     example: 1200.00
 *                   stdSaleRate:
 *                     type: number
 *                     format: double
 *                     description: Standard sale rate
 *                     example: 1500.50
 *                   stock:
 *                     type: number
 *                     format: double
 *                     description: Current stock quantity
 *                     example: 100
 *                   gstRate:
 *                     type: number
 *                     format: double
 *                     description: GST rate percentage
 *                     example: 18
 *                   itemGstPer:
 *                     type: number
 *                     format: double
 *                     description: Item GST percentage
 *                     example: 18
 *                   itemHsn:
 *                     type: string
 *                     description: HSN code
 *                     example: "32091010"
 *                   itemHsnDesc:
 *                     type: string
 *                     description: HSN description
 *                     example: "Paints and varnishes"
 *                   openingBalance:
 *                     type: number
 *                     format: double
 *                     description: Opening balance quantity
 *                     example: 50
 *                   itemOpRate:
 *                     type: number
 *                     format: double
 *                     description: Item opening rate
 *                     example: 1400.00
 *                   companyCode:
 *                     type: string
 *                     description: Company code
 *                     example: "ROYAL01"
 *                   isActive:
 *                     type: boolean
 *                     description: Whether the product is active
 *                     example: true
 *                   isFinishItem:
 *                     type: boolean
 *                     description: Whether it's a finished item
 *                     example: true
 *                   other1:
 *                     type: string
 *                     description: Additional field 1
 *                     example: "Custom field data 1"
 *                   other2:
 *                     type: string
 *                     description: Additional field 2
 *                     example: "Custom field data 2"
 *                   other3:
 *                     type: string
 *                     description: Additional field 3
 *                     example: "Custom field data 3"
 *                   other4:
 *                     type: string
 *                     description: Additional field 4
 *                     example: "Custom field data 4"
 *                   other5:
 *                     type: string
 *                     description: Additional field 5
 *                     example: "Custom field data 5"
 *               - type: array
 *                 description: Array of products for batch processing
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - productCode
 *                     - productName
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                     productCode:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     partNo:
 *                       type: string
 *                     itemAlias:
 *                       type: string
 *                     description:
 *                       type: string
 *                     parent:
 *                       type: string
 *                     category:
 *                       type: string
 *                     subCategory:
 *                       type: string
 *                     brand:
 *                       type: string
 *                     baseUnits:
 *                       type: string
 *                     additionalUnits:
 *                       type: string
 *                     price:
 *                       type: number
 *                       format: double
 *                     stdPurcRate:
 *                       type: number
 *                       format: double
 *                     stdSaleRate:
 *                       type: number
 *                       format: double
 *                     stock:
 *                       type: number
 *                       format: double
 *                     gstRate:
 *                       type: number
 *                       format: double
 *                     itemGstPer:
 *                       type: number
 *                       format: double
 *                     itemHsn:
 *                       type: string
 *                     itemHsnDesc:
 *                       type: string
 *                     openingBalance:
 *                       type: number
 *                       format: double
 *                     itemOpRate:
 *                       type: number
 *                       format: double
 *                     companyCode:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     isFinishItem:
 *                       type: boolean
 *                     other1:
 *                       type: string
 *                     other2:
 *                       type: string
 *                     other3:
 *                       type: string
 *                     other4:
 *                       type: string
 *                     other5:
 *                       type: string
 *     responses:
 *       200:
 *         description: All products synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 results:
 *                   type: array
 *                   description: Array of results, one for each product processed
 *                   items:
 *                     type: object
 *                     properties:
 *                       success:
 *                         type: boolean
 *                       product:
 *                         $ref: '#/components/schemas/TallyProduct'
 *             example:
 *               success: true
 *               results:
 *                 - success: true
 *                   product:
 *                     _id: "69205108354a88c52269d9c4"
 *                     name: "Product 1"
 *                     productCode: "PROD001"
 *                     category: "Electronics"
 *                     stdSaleRate: 150.75
 *       207:
 *         description: Partial success - some products processed successfully, others failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 results:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - type: object
 *                         properties:
 *                           success:
 *                             type: boolean
 *                           product:
 *                             $ref: '#/components/schemas/TallyProduct'
 *                       - type: object
 *                         properties:
 *                           success:
 *                             type: boolean
 *                           productCode:
 *                             type: string
 *                           message:
 *                             type: string
 *                           error:
 *                             type: string
 *             example:
 *               success: false
 *               results:
 *                 - success: true
 *                   product:
 *                     _id: "69205108354a88c52269d9c4"
 *                     name: "Product 1"
 *                     productCode: "PROD001"
 *                 - success: false
 *                   productCode: "PROD002"
 *                   message: "Company not found for GUID: XYZ123"
 *                   error: "COMPANY_NOT_FOUND"
 *       400:
 *         description: Validation error or missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       success:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                       error:
 *                         type: string
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
 *         description: Company GUID as provided by Tally (alphanumeric string)
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
 *         description: Company GUID as provided by Tally (alphanumeric string)
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
 *         description: Company GUID as provided by Tally (alphanumeric string)
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

