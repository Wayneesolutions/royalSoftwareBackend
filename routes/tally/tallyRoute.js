import express from 'express';
import {
  createCompanyFromTally,
  updateCompanyFromTally,
  deleteCompanyFromTally,
  searchCompaniesForTally,
} from '../../controllres/tallySyncController.js';
import {
  upsertCompanyProductFromTally,
  updateProductFromTally,
  deleteProductFromTally,
  searchProductsForTally,
} from '../../controllres/tallyProductController.js';
import {
  upsertUserFromTally,
  updateUsersFromTally,
  deleteUsersFromTally,
} from '../../controllres/tallyUserController.js';
import {
  listCompaniesForTally,
  listProductsByCompanyGuid,
  listUsersByCompanyGuid,
  listApprovedOrdersByCompanyGuid,
} from '../../controllres/tallyQueryController.js';
import {
  upsertGroupFromTally,
  updateGroupFromTally,
  deleteGroupFromTally,
  searchGroupsForTally,
  listGroupsByCompanyGuid,
  listUsersByGroupGuid,
} from '../../controllres/tallyGroupController.js';
import {
  upsertDealerFromTally,
  upsertSubDealerFromTally,
  listDealersByCompanyGuid,
  listSubDealersByCompanyGuid,
  updateDealerFromTally,
  deleteDealerFromTally,
  updateSubDealerFromTally,
  deleteSubDealerFromTally,
} from '../../controllres/tallyDealerController.js';

const tallyRoute = express.Router();

// ===================== COMPANY APIS =====================

/**
 * @swagger
 * tags:
 *   - name: Tally Companies
 *     description: Company synchronization endpoints for Tally ERP
 *   - name: Tally Products
 *     description: Product synchronization endpoints for Tally ERP
 *   - name: Tally Users
 *     description: User synchronization endpoints for Tally ERP
 *   - name: Tally Orders
 *     description: Order retrieval endpoints for Tally ERP
 *   - name: Tally Groups
 *     description: Group synchronization endpoints for Tally ERP
 *   - name: Tally Dealers
 *     description: Dealer (Ledger) synchronization endpoints for Tally ERP
 *   - name: Tally SubDealers
 *     description: SubDealer synchronization endpoints for Tally ERP
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
 *     tags: [Tally Companies]
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
 *   patch:
 *     summary: Update existing companies from Tally
 *     description: >
 *       Accepts a single company payload or an array of payloads. Each payload must include the company GUID and
 *       will update only the provided fields. Fields not included in the payload remain unchanged.
 *     tags: [Tally Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - guid
 *                 properties:
 *                   guid:
 *                     type: string
 *                     description: Company GUID used to locate the record
 *                   companyName:
 *                     type: string
 *                   companyCode:
 *                     type: string
 *                   companyEmail:
 *                     type: string
 *                     format: email
 *                   companyMobile:
 *                     type: string
 *                   companyState:
 *                     type: string
 *                   companyCountry:
 *                     type: string
 *                   maxUser:
 *                     type: integer
 *                   tallySerialId:
 *                     type: string
 *                   contactDetails:
 *                     type: object
 *                     properties:
 *                       email:
 *                         type: string
 *                         format: email
 *                       phone:
 *                         type: string
 *                       website:
 *                         type: string
 *                       address:
 *                         type: object
 *                         properties:
 *                           street:
 *                             type: string
 *                           city:
 *                             type: string
 *                           state:
 *                             type: string
 *                           country:
 *                             type: string
 *                           pincode:
 *                             type: string
 *                   settings:
 *                     type: object
 *                     properties:
 *                       allowSelfApproval:
 *                         type: boolean
 *                       requireOrderApproval:
 *                         type: boolean
 *                       maxOrderAmount:
 *                         type: number
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - guid
 *                   properties:
 *                     guid:
 *                       type: string
 *                     companyName:
 *                       type: string
 *                     companyCode:
 *                       type: string
 *                     companyEmail:
 *                       type: string
 *                       format: email
 *                     companyMobile:
 *                       type: string
 *                     companyState:
 *                       type: string
 *                     companyCountry:
 *                       type: string
 *                     maxUser:
 *                       type: integer
 *                     tallySerialId:
 *                       type: string
 *                     contactDetails:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: string
 *                           format: email
 *                         phone:
 *                           type: string
 *                         website:
 *                           type: string
 *                         address:
 *                           type: object
 *                           properties:
 *                             street:
 *                               type: string
 *                             city:
 *                               type: string
 *                             state:
 *                               type: string
 *                             country:
 *                               type: string
 *                             pincode:
 *                               type: string
 *                     settings:
 *                       type: object
 *                       properties:
 *                         allowSelfApproval:
 *                           type: boolean
 *                         requireOrderApproval:
 *                           type: boolean
 *                         maxOrderAmount:
 *                           type: number
 *     responses:
 *       200:
 *         description: All companies updated successfully
 *       207:
 *         description: Partial success (some updates failed)
 *       400:
 *         description: Missing guid or invalid payload
 *       500:
 *         description: Server error while updating companies
 */
tallyRoute.patch('/companies', updateCompanyFromTally);

/**
 * @swagger
 * /api/v1/tally/companies:
 *   get:
 *     summary: Fetch all companies
 *     description: Returns the list of all companies configured in Royal Software.
 *     tags: [Tally Companies]
 *     responses:
 *       200:
 *         description: Companies returned successfully
 *       500:
 *         description: Server error while fetching companies
 */
tallyRoute.get('/companies', listCompaniesForTally);

// ===================== PRODUCT APIS =====================

/**
 * @swagger
 * /api/v1/tally/companies/search:
 *   get:
 *     summary: Search companies by GUID, code, serial or name
 *     tags: [Tally Companies]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Free text search on name, code, email, GUID, or Tally serial
 *       - in: query
 *         name: companyCode
 *         schema:
 *           type: string
 *       - in: query
 *         name: guid
 *         schema:
 *           type: string
 *       - in: query
 *         name: tallySerialId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Companies returned successfully
 *       500:
 *         description: Server error
 */
tallyRoute.get('/companies/search', searchCompaniesForTally);

/**
 * @swagger
 * /api/v1/tally/companies/delete:
 *   delete:
 *     summary: Delete one or multiple companies by GUID
 *     tags: [Tally Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - guid
 *                 properties:
 *                   guid:
 *                     type: string
 *                     description: Company GUID to delete
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - guid
 *                   properties:
 *                     guid:
 *                       type: string
 *                       description: Company GUID to delete
 *     responses:
 *       200:
 *         description: All companies deleted successfully
 *       207:
 *         description: Partial success (some deletes failed)
 *       404:
 *         description: Companies not found
 *       500:
 *         description: Server error
 */
tallyRoute.delete('/companies/delete', deleteCompanyFromTally);

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
 *     tags: [Tally Products]
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
 * /api/v1/tally/products:
 *   patch:
 *     summary: Update products from Tally
 *     description: >
 *       Accepts one or more product payloads. Each payload must include the company GUID and either productId (Mongo _id)
 *       or productCode. Only provided fields are updated; other fields remain unchanged.
 *     tags: [Tally Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                   productCode:
 *                     type: string
 *                     description: Unique product code (acts as identifier for updates too)
 *                   productId:
 *                     type: string
 *                     description: Optional Mongo ObjectId of the product (if available)
 *                   productName:
 *                     type: string
 *                   name:
 *                     type: string
 *                   partNo:
 *                     type: string
 *                   itemAlias:
 *                     type: string
 *                   description:
 *                     type: string
 *                   parent:
 *                     type: string
 *                   category:
 *                     type: string
 *                   subCategory:
 *                     type: string
 *                   brand:
 *                     type: string
 *                   baseUnits:
 *                     type: string
 *                   additionalUnits:
 *                     type: string
 *                   price:
 *                     type: number
 *                     format: double
 *                   stdPurcRate:
 *                     type: number
 *                     format: double
 *                   stdSaleRate:
 *                     type: number
 *                     format: double
 *                   stock:
 *                     type: number
 *                     format: double
 *                   gstRate:
 *                     type: number
 *                     format: double
 *                   itemGstPer:
 *                     type: number
 *                     format: double
 *                   itemHsn:
 *                     type: string
 *                   itemHsnDesc:
 *                     type: string
 *                   openingBalance:
 *                     type: number
 *                     format: double
 *                   itemOpRate:
 *                     type: number
 *                     format: double
 *                   companyCode:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *                   isFinishItem:
 *                     type: boolean
 *                   other1:
 *                     type: string
 *                   other2:
 *                     type: string
 *                   other3:
 *                     type: string
 *                   other4:
 *                     type: string
 *                   other5:
 *                     type: string
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                     productCode:
 *                       type: string
 *                     productId:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     name:
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
 *         description: All products updated
 *       207:
 *         description: Partial success
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
tallyRoute.patch('/products', updateProductFromTally);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/products:
 *   delete:
 *     summary: Delete one or multiple products for a company by product code
 *     tags: [Tally Products]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID that owns the products
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - productCode
 *                 properties:
 *                   productCode:
 *                     type: string
 *                     description: Product code to delete
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - productCode
 *                   properties:
 *                     productCode:
 *                       type: string
 *                       description: Product code to delete
 *     responses:
 *       200:
 *         description: All products deleted successfully
 *       207:
 *         description: Partial success (some codes failed)
 *       404:
 *         description: Company not found or no matching products
 *       500:
 *         description: Server error
 */
tallyRoute.delete('/companies/:guid/products', deleteProductFromTally);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/products/search:
 *   get:
 *     summary: Search products for a company by GUID
 *     tags: [Tally Products]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID used to scope the search
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Free text search across name, code, alias, description
 *       - in: query
 *         name: productCode
 *         schema:
 *           type: string
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *       - in: query
 *         name: partNo
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Products returned successfully
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
tallyRoute.get('/companies/:guid/products/search', searchProductsForTally);

// ===================== USER APIS =====================

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/products:
 *   get:
 *     summary: Fetch products for a company by GUID
 *     description: Returns all products belonging to the company identified by the given GUID.
 *     tags: [Tally Products]
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
 *     tags: [Tally Users]
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
 *     tags: [Tally Orders]
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
 *     summary: Create or update users from Tally (supports single or multiple users)
 *     description: >
 *       Accepts user records (single object or array) pushed from Tally ERP and creates/updates them in
 *       Royal Software. Each user must include companyGuid to associate with a company.
 *       
 *       **Simplified API - Only required fields:**
 *       - companyGuid (required): Company GUID to associate the user with
 *       - name (required): User's full name
 *       - email (required): User's email address
 *       - userName (required): Unique username
 *       - password (required): User's password (will be hashed)
 *       - mobile (required): User's mobile number
 *       - address (optional): User's address information
 *       - isActive (optional): Whether the user is active (default: true)
 *       
 *       **Role is automatically set to "groupuser" - no need to pass role field.**
 *       **Company is automatically added to user based on companyGuid.**
 *       
 *       **Supports both single user object and array of multiple users for batch processing.**
 *       - Single user: Send a single JSON object with companyGuid
 *       - Multiple users: Send an array of user objects, each with companyGuid
 *       
 *       Each user is processed independently - success/failure of one doesn't affect others.
 *       Returns a results array with status for each user processed.
 *     tags: [Tally Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - name
 *                   - email
 *                   - userName
 *                   - password
 *                   - mobile
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID to associate the user with (company will be automatically added)
 *                     example: "COM-001"
 *                   name:
 *                     type: string
 *                     description: User's full name
 *                     example: "John Doe"
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User's email address (unique, required)
 *                     example: "john.doe@example.com"
 *                   userName:
 *                     type: string
 *                     description: Unique username (required)
 *                     example: "johndoe"
 *                   password:
 *                     type: string
 *                     description: User's password (will be hashed)
 *                     example: "SecurePassword123"
 *                   mobile:
 *                     type: string
 *                     description: User's mobile number (unique, required)
 *                     example: "+919876543210"
 *                   isActive:
 *                     type: boolean
 *                     default: true
 *                     description: Whether the user is active
 *                   address:
 *                     type: object
 *                     description: User's address information (optional)
 *                     properties:
 *                       street:
 *                         type: string
 *                         example: "123 Main Street"
 *                       city:
 *                         type: string
 *                         example: "Mumbai"
 *                       state:
 *                         type: string
 *                         example: "Maharashtra"
 *                       pincode:
 *                         type: string
 *                         example: "400001"
 *                       country:
 *                         type: string
 *                         default: "India"
 *                         example: "India"
 *               - type: array
 *                 description: Array of users for batch processing
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - name
 *                     - email
 *                     - userName
 *                     - password
 *                     - mobile
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                       example: "COM-001"
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     userName:
 *                       type: string
 *                     password:
 *                       type: string
 *                     mobile:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     address:
 *                       type: object
 *                       properties:
 *                         street:
 *                           type: string
 *                         city:
 *                           type: string
 *                         state:
 *                           type: string
 *                         pincode:
 *                           type: string
 *                         country:
 *                           type: string
 *     responses:
 *       200:
 *         description: All users synced successfully
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
 *                   description: Array of results, one for each user processed
 *                   items:
 *                     type: object
 *                     properties:
 *                       success:
 *                         type: boolean
 *                       user:
 *                         type: object
 *                         description: Created/updated user object (without password)
 *       207:
 *         description: Partial success - some users processed successfully, others failed
 *       400:
 *         description: Validation error or missing required fields
 *       500:
 *         description: Server error while syncing users
 */
tallyRoute.post('/users', upsertUserFromTally);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/users:
 *   get:
 *     summary: Fetch users for a company by GUID
 *     description: Returns all users associated with the company identified by the given GUID.
 *     tags: [Tally Users]
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
 * /api/v1/tally/users/update:
 *   patch:
 *     summary: Update one or multiple users (supports companyGuid in body or path)
 *     description: >
 *       Accepts single or multiple user payloads. Company GUID can be provided in:
 *       - Path parameter: /api/v1/tally/companies/{guid}/users (applies to all users)
 *       - Request body: Each user object can have its own companyGuid
 *       
 *       **Simplified API - Only required fields:**
 *       - companyGuid (required): Company GUID (required if not in path) - company will be added/updated automatically
 *       - User identifier: One of email, mobile, or userName (required to identify user)
 *       - Fields to update: name, email, userName, password, mobile, address, isActive
 *       
 *       **Role is automatically set to "groupuser" - cannot be changed via Tally API.**
 *       **Company is automatically added/updated based on companyGuid.**
 *       
 *       **Supports both single user object and array of multiple users for batch processing.**
 *       - Single user: Send a single JSON object
 *       - Multiple users: Send an array of user objects
 *       
 *       User identification: Provide email, mobile, or userName to identify the user.
 *       Only provided fields are updated; other fields remain unchanged.
 *     tags: [Tally Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID (required if not in path)
 *                     example: "COM-001"
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User email used as identifier (one of email, mobile, or userName required)
 *                   mobile:
 *                     type: string
 *                     description: User mobile used as identifier (one of email, mobile, or userName required)
 *                   userName:
 *                     type: string
 *                     description: User username used as identifier (one of email, mobile, or userName required)
 *                   name:
 *                     type: string
 *                   mobile:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [superadmin, admin, groupuser, dealers, subdealer, asm, rsm, distibutors, suppliers, salesman, zonal]
 *                     description: Must match one of the supported roles
 *                   password:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *                   address:
 *                     type: object
 *                     properties:
 *                       street:
 *                         type: string
 *                       city:
 *                         type: string
 *                       state:
 *                         type: string
 *                       pincode:
 *                         type: string
 *                       country:
 *                         type: string
 *                   userName:
 *                     type: string
 *                   groupGUID:
 *                     type: string
 *                     description: Single Group GUID to assign/add
 *                   groups:
 *                     type: array
 *                     description: Array of groups to assign (replaces existing groups if provided)
 *                     items:
 *                       type: object
 *                       properties:
 *                         groupGUID:
 *                           type: string
 *                         groupName:
 *                           type: string
 *                         isActive:
 *                           type: boolean
 *                   hierarchy:
 *                     type: object
 *                     description: User hierarchy information
 *                     properties:
 *                       parentUserId:
 *                         type: string
 *                       parentUserEmail:
 *                         type: string
 *                         format: email
 *                       parentUserMobile:
 *                         type: string
 *                       parentGroupGUID:
 *                         type: string
 *                       level:
 *                         type: number
 *                   subdealerDetails:
 *                     type: object
 *                     description: Subdealer-specific details (only used when role is 'subdealer')
 *                     properties:
 *                       SDName:
 *                         type: string
 *                       SDType:
 *                         type: string
 *                         enum: [Sub Dealer, TSO]
 *                       SDAddress1:
 *                         type: string
 *                       SDAddress2:
 *                         type: string
 *                       SDAddress3:
 *                         type: string
 *                       SDState:
 *                         type: string
 *                       SDCountry:
 *                         type: string
 *                       SDPincode:
 *                         type: string
 *                       SDContactPerson:
 *                         type: string
 *                       SDMobileNo:
 *                         type: string
 *                       SDEmail:
 *                         type: string
 *                         format: email
 *                       SDGSTNType:
 *                         type: string
 *                       SDGSTNNumber:
 *                         type: string
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     mobile:
 *                       type: string
 *                     userName:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [superadmin, admin, groupuser, dealers, subdealer, asm, rsm, distibutors, suppliers, salesman, zonal]
 *                     password:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     address:
 *                       type: object
 *                       properties:
 *                         street:
 *                           type: string
 *                         city:
 *                           type: string
 *                         state:
 *                           type: string
 *                         pincode:
 *                           type: string
 *                         country:
 *                           type: string
 *                     userName:
 *                       type: string
 *                     groupGUID:
 *                       type: string
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           groupGUID:
 *                             type: string
 *                           groupName:
 *                             type: string
 *                           isActive:
 *                             type: boolean
 *                     hierarchy:
 *                       type: object
 *                       properties:
 *                         parentUserId:
 *                           type: string
 *                         parentUserEmail:
 *                           type: string
 *                           format: email
 *                         parentUserMobile:
 *                           type: string
 *                         parentGroupGUID:
 *                           type: string
 *                         level:
 *                           type: number
 *                     subdealerDetails:
 *                       type: object
 *                       properties:
 *                         SDName:
 *                           type: string
 *                         SDType:
 *                           type: string
 *                           enum: [Sub Dealer, TSO]
 *                         SDAddress1:
 *                           type: string
 *                         SDAddress2:
 *                           type: string
 *                         SDAddress3:
 *                           type: string
 *                         SDState:
 *                           type: string
 *                         SDCountry:
 *                           type: string
 *                         SDPincode:
 *                           type: string
 *                         SDContactPerson:
 *                           type: string
 *                         SDMobileNo:
 *                           type: string
 *                         SDEmail:
 *                           type: string
 *                           format: email
 *                         SDGSTNType:
 *                           type: string
 *                         SDGSTNNumber:
 *                           type: string
 *     responses:
 *       200:
 *         description: All users updated successfully
 *       207:
 *         description: Partial success (some updates failed)
 *       400:
 *         description: Validation error or missing fields
 *       500:
 *         description: Server error while updating users
 */
tallyRoute.patch('/users/update', updateUsersFromTally);
tallyRoute.patch('/companies/:guid/users', updateUsersFromTally);

/**
 * @swagger
 * /api/v1/tally/users/delete:
 *   delete:
 *     summary: Delete one or multiple users (supports companyGuid in body or path)
 *     description: >
 *       Accepts single or multiple user payloads. Company GUID can be provided in:
 *       - Path parameter: /api/v1/tally/companies/{guid}/users (applies to all users)
 *       - Request body: Each user object can have its own companyGuid
 *       
 *       **Supports both single user object and array of multiple users for batch deletion.**
 *       - Single user: Send a single JSON object
 *       - Multiple users: Send an array of user objects
 *       
 *       User identification: Provide email, mobile, or userName to identify the user.
 *     tags: [Tally Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID (required if not in path)
 *                     example: "COM-001"
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User email to delete (one of email, mobile, or userName required)
 *                   mobile:
 *                     type: string
 *                     description: User mobile to delete (one of email, mobile, or userName required)
 *                   userName:
 *                     type: string
 *                     description: User username to delete (one of email, mobile, or userName required)
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                       example: "COM-001"
 *                     email:
 *                       type: string
 *                       format: email
 *                     mobile:
 *                       type: string
 *                     userName:
 *                       type: string
 *     responses:
 *       200:
 *         description: All users deleted successfully
 *       207:
 *         description: Partial success (some deletes failed)
 *       404:
 *         description: Company or user not found
 *       500:
 *         description: Server error while deleting users
 */
tallyRoute.delete('/users/delete', deleteUsersFromTally);
tallyRoute.delete('/companies/:guid/users', deleteUsersFromTally);

// ===================== GROUP APIS =====================

/**
 * @swagger
 * /api/v1/tally/groups:
 *   post:
 *     summary: Sync groups from Tally
 *     description: >
 *       Accepts group information pushed from Tally ERP (JSON or XML payload). Can accept a single group object or an array
 *       of multiple groups for batch processing. All groups are upserted (created or updated) into Royal Software.
 *       Groups are identified by GroupGUID and cmpcode combination.
 *     tags: [Tally Groups]
 *     requestBody:
 *       required: true
 *       description: Single group object or array of group objects
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - GroupGUID
 *                   - GroupName
 *                   - cmpcode
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Optional internal ID (not used for identification)
 *                   GroupGUID:
 *                     type: string
 *                     description: Group GUID from Tally (alphanumeric string)
 *                     example: "GRP001"
 *                   GroupName:
 *                     type: string
 *                     description: Name of the group
 *                     example: "Sales Group"
 *                   GroupParent:
 *                     type: string
 *                     description: Parent group GUID (optional, for hierarchical groups)
 *                     example: "GRP000"
 *                   cmpcode:
 *                     type: string
 *                     description: Company code
 *                     example: "ROYAL01"
 *                   Remarks:
 *                     type: string
 *                     description: Additional remarks or notes
 *                     example: "Main sales group"
 *                   Other1:
 *                     type: string
 *                     description: Additional field 1
 *                   Other2:
 *                     type: string
 *                     description: Additional field 2
 *                   Other3:
 *                     type: string
 *                     description: Additional field 3
 *                   Other4:
 *                     type: string
 *                     description: Additional field 4
 *               - type: array
 *                 description: Array of groups for batch processing
 *                 items:
 *                   type: object
 *                   required:
 *                     - GroupGUID
 *                     - GroupName
 *                     - cmpcode
 *                   properties:
 *                     id:
 *                       type: string
 *                     GroupGUID:
 *                       type: string
 *                     GroupName:
 *                       type: string
 *                     GroupParent:
 *                       type: string
 *                     cmpcode:
 *                       type: string
 *                     Remarks:
 *                       type: string
 *                     Other1:
 *                       type: string
 *                     Other2:
 *                       type: string
 *                     Other3:
 *                       type: string
 *                     Other4:
 *                       type: string
 *     responses:
 *       200:
 *         description: All groups synced successfully
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
 *                   description: Array of results, one for each group processed
 *                   items:
 *                     type: object
 *                     properties:
 *                       success:
 *                         type: boolean
 *                       group:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           GroupGUID:
 *                             type: string
 *                           GroupName:
 *                             type: string
 *                           GroupParent:
 *                             type: string
 *                           cmpcode:
 *                             type: string
 *                           Remarks:
 *                             type: string
 *                           other1:
 *                             type: string
 *                           other2:
 *                             type: string
 *                           other3:
 *                             type: string
 *                           other4:
 *                             type: string
 *                       message:
 *                         type: string
 *       207:
 *         description: Partial success - some groups processed successfully, others failed
 *       400:
 *         description: Validation error or missing required fields
 *       500:
 *         description: Server error while syncing groups
 */
tallyRoute.post('/groups', upsertGroupFromTally);

/**
 * @swagger
 * /api/v1/tally/groups:
 *   patch:
 *     summary: Update groups from Tally
 *     description: >
 *       Accepts one or more group payloads. Each payload must include the GroupGUID and optionally cmpcode.
 *       Only provided fields are updated; other fields remain unchanged.
 *     tags: [Tally Groups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - GroupGUID
 *                 properties:
 *                   GroupGUID:
 *                     type: string
 *                     description: Group GUID used to locate the record
 *                   GroupName:
 *                     type: string
 *                   GroupParent:
 *                     type: string
 *                   cmpcode:
 *                     type: string
 *                   Remarks:
 *                     type: string
 *                   Other1:
 *                     type: string
 *                   Other2:
 *                     type: string
 *                   Other3:
 *                     type: string
 *                   Other4:
 *                     type: string
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - GroupGUID
 *                   properties:
 *                     GroupGUID:
 *                       type: string
 *                     GroupName:
 *                       type: string
 *                     GroupParent:
 *                       type: string
 *                     cmpcode:
 *                       type: string
 *                     Remarks:
 *                       type: string
 *                     Other1:
 *                       type: string
 *                     Other2:
 *                       type: string
 *                     Other3:
 *                       type: string
 *                     Other4:
 *                       type: string
 *     responses:
 *       200:
 *         description: All groups updated successfully
 *       207:
 *         description: Partial success (some updates failed)
 *       400:
 *         description: Missing GroupGUID or invalid payload
 *       500:
 *         description: Server error while updating groups
 */
tallyRoute.patch('/groups', updateGroupFromTally);

/**
 * @swagger
 * /api/v1/tally/groups/delete:
 *   delete:
 *     summary: Delete one or multiple groups by GroupGUID
 *     tags: [Tally Groups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - GroupGUID
 *                 properties:
 *                   GroupGUID:
 *                     type: string
 *                     description: Group GUID to delete
 *                   cmpcode:
 *                     type: string
 *                     description: Optional company code for precise matching
 *               - type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - GroupGUID
 *                   properties:
 *                     GroupGUID:
 *                       type: string
 *                       description: Group GUID to delete
 *                     cmpcode:
 *                       type: string
 *                       description: Optional company code for precise matching
 *     responses:
 *       200:
 *         description: All groups deleted successfully
 *       207:
 *         description: Partial success (some deletes failed)
 *       404:
 *         description: Groups not found
 *       500:
 *         description: Server error
 */
tallyRoute.delete('/groups/delete', deleteGroupFromTally);

/**
 * @swagger
 * /api/v1/tally/groups/search:
 *   get:
 *     summary: Search groups by GUID, name, cmpcode, or parent
 *     tags: [Tally Groups]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Free text search on GroupGUID, GroupName, Remarks, or cmpcode
 *       - in: query
 *         name: GroupGUID
 *         schema:
 *           type: string
 *         description: Group GUID to search for
 *       - in: query
 *         name: GroupName
 *         schema:
 *           type: string
 *         description: Group name to search for
 *       - in: query
 *         name: cmpcode
 *         schema:
 *           type: string
 *         description: Company code to filter by
 *       - in: query
 *         name: GroupParent
 *         schema:
 *           type: string
 *         description: Parent group GUID to filter by
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Groups returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Server error
 */
tallyRoute.get('/groups/search', searchGroupsForTally);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/groups:
 *   get:
 *     summary: Fetch groups for a company by GUID
 *     description: Returns all groups belonging to the company identified by the given GUID.
 *     tags: [Tally Groups]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID as provided by Tally (alphanumeric string)
 *     responses:
 *       200:
 *         description: Groups returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       GroupGUID:
 *                         type: string
 *                       GroupName:
 *                         type: string
 *                       GroupParent:
 *                         type: string
 *                       cmpcode:
 *                         type: string
 *                       Remarks:
 *                         type: string
 *                       other1:
 *                         type: string
 *                       other2:
 *                         type: string
 *                       other3:
 *                         type: string
 *                       other4:
 *                         type: string
 *       400:
 *         description: Missing or invalid GUID
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error while fetching groups
 */
tallyRoute.get('/companies/:guid/groups', listGroupsByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/groups/{groupGuid}/users:
 *   get:
 *     summary: Fetch users for a group by GroupGUID
 *     description: Returns all users assigned to the group identified by the given GroupGUID.
 *     tags: [Tally Groups]
 *     parameters:
 *       - in: path
 *         name: groupGuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Group GUID (GroupGUID) as provided by Tally
 *         example: "GRP001"
 *     responses:
 *       200:
 *         description: Users returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Group MongoDB ID
 *                     guid:
 *                       type: string
 *                       description: Group GUID (GroupGUID)
 *                       example: "GRP001"
 *                     name:
 *                       type: string
 *                       description: Group name
 *                       example: "John Doe - Dealers"
 *                     parent:
 *                       type: string
 *                       nullable: true
 *                       description: Parent group/user ID
 *                     cmpcode:
 *                       type: string
 *                       description: Company code
 *                       example: "001"
 *                     remarks:
 *                       type: string
 *                       description: Group remarks
 *                 totalUsers:
 *                   type: integer
 *                   description: Total number of users in the group
 *                   example: 5
 *                 users:
 *                   type: array
 *                   description: List of users assigned to this group
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: User MongoDB ID
 *                       name:
 *                         type: string
 *                         example: "John Doe"
 *                       email:
 *                         type: string
 *                         format: email
 *                         example: "john.doe@example.com"
 *                       mobile:
 *                         type: string
 *                         example: "9876543210"
 *                       userName:
 *                         type: string
 *                         example: "johndoe"
 *                       role:
 *                         type: string
 *                         example: "dealers"
 *                       isActive:
 *                         type: boolean
 *                         example: true
 *                       address:
 *                         type: object
 *                         properties:
 *                           street:
 *                             type: string
 *                           city:
 *                             type: string
 *                           state:
 *                             type: string
 *                           pincode:
 *                             type: string
 *                           country:
 *                             type: string
 *                       group:
 *                         type: object
 *                         description: Group information
 *                         properties:
 *                           id:
 *                             type: string
 *                           guid:
 *                             type: string
 *                           name:
 *                             type: string
 *                           parent:
 *                             type: string
 *                             nullable: true
 *                           cmpcode:
 *                             type: string
 *                           remarks:
 *                             type: string
 *                       groupAssignment:
 *                         type: object
 *                         nullable: true
 *                         description: Group assignment details
 *                         properties:
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                           assignedBy:
 *                             type: string
 *                             nullable: true
 *                           isActive:
 *                             type: boolean
 *                       company:
 *                         type: object
 *                         nullable: true
 *                         description: Company assignment details
 *                         properties:
 *                           id:
 *                             type: string
 *                           role:
 *                             type: string
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                       lastUpdated:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Missing or invalid GroupGUID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Group GUID is required"
 *       404:
 *         description: Group not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Group not found for provided GroupGUID"
 *                 error:
 *                   type: string
 *                   example: "GROUP_NOT_FOUND"
 *       500:
 *         description: Server error while fetching users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to fetch users for group"
 */
tallyRoute.get('/groups/:groupGuid/users', listUsersByGroupGuid);

// ===================== DEALER (LEDGER) APIS =====================

/**
 * @swagger
 * /api/v1/tally/dealers:
 *   post:
 *     summary: Sync dealers (Ledgers) from Tally ERP
 *     description: >
 *       Accepts dealer information pushed from Tally ERP (JSON or XML payload) and creates or updates
 *       the corresponding dealers inside Royal Software. 
 *       
 *       **Supports both single dealer object and array of multiple dealers for batch processing.**
 *       - Single dealer: Send a single JSON object
 *       - Multiple dealers: Send an array of dealer objects
 *       
 *       Each dealer is processed independently - success/failure of one doesn't affect others.
 *       Returns a results array with status for each dealer processed.
 *     tags: [Tally Dealers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - LedgerGUID
 *                   - LedgerName
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID to associate the dealer with
 *                     example: "COM-001"
 *                   LedgerGUID:
 *                     type: string
 *                     description: Unique GUID for the dealer/ledger
 *                     example: "LED-001"
 *                   LedgerName:
 *                     type: string
 *                     description: Name of the dealer
 *                     example: "ABC Traders"
 *                   LedgerMobile:
 *                     type: string
 *                     example: "+919876543210"
 *                   Email:
 *                     type: string
 *                     format: email
 *                     example: "dealer@example.com"
 *                   LedgerGSTIN:
 *                     type: string
 *                     example: "29ABCDE1234F1Z5"
 *                   LedgerAddress1:
 *                     type: string
 *                   LedgerAddress2:
 *                     type: string
 *                   LedgerState:
 *                     type: string
 *                   LedgerOpening:
 *                     type: number
 *                   LedgerOpeningDate:
 *                     type: string
 *                     format: date
 *                   LedgerJoinDate:
 *                     type: string
 *                     format: date
 *                   groupGUID:
 *                     type: string
 *                     description: Group GUID to assign the dealer to
 *                   SalesMan:
 *                     type: object
 *                     properties:
 *                       mobile:
 *                         type: string
 *                       email:
 *                         type: string
 *                   ASM:
 *                     type: object
 *                     properties:
 *                       mobile:
 *                         type: string
 *                       email:
 *                         type: string
 *                   RSM:
 *                     type: object
 *                     properties:
 *                       mobile:
 *                         type: string
 *                       email:
 *                         type: string
 *                   ZSM:
 *                     type: object
 *                     properties:
 *                       mobile:
 *                         type: string
 *                       email:
 *                         type: string
 *                   Remarks:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *                     default: true
 *               - type: array
 *                 description: Array of dealers for batch processing
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - LedgerGUID
 *                     - LedgerName
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                       example: "COM-001"
 *                     LedgerGUID:
 *                       type: string
 *                       example: "LED-002"
 *                     LedgerName:
 *                       type: string
 *                       example: "XYZ Traders"
 *                     LedgerMobile:
 *                       type: string
 *                     Email:
 *                       type: string
 *                     LedgerGSTIN:
 *                       type: string
 *                     groupGUID:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: All dealers processed successfully
 *       207:
 *         description: Partial success - some dealers processed, some failed
 *       400:
 *         description: All dealers failed to process
 */
tallyRoute.post('/dealers', upsertDealerFromTally);

/**
 * @swagger
 * /api/v1/tally/dealers/{guid}:
 *   get:
 *     summary: List all dealers for a company by company GUID
 *     description: Retrieves all active dealers (Ledgers) associated with the specified company GUID
 *     tags: [Tally Dealers]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID
 *         example: "COM-001"
 *     responses:
 *       200:
 *         description: Dealers retrieved successfully
 *       404:
 *         description: Company not found
 */
tallyRoute.get('/dealers/:guid', listDealersByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/dealers/update:
 *   put:
 *     summary: Update dealers from Tally ERP
 *     description: >
 *       Updates existing dealers based on LedgerGUID and company GUID.
 *       
 *       **Supports both single dealer object and array of multiple dealers for batch processing.**
 *       - Single dealer: Send a single JSON object with companyGuid and LedgerGUID
 *       - Multiple dealers: Send an array of dealer objects
 *       
 *       Each dealer is processed independently. Only provided fields are updated.
 *     tags: [Tally Dealers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - LedgerGUID
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                   LedgerGUID:
 *                     type: string
 *                   LedgerName:
 *                     type: string
 *                   LedgerMobile:
 *                     type: string
 *                   Email:
 *                     type: string
 *                   LedgerGSTIN:
 *                     type: string
 *                   groupGUID:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *               - type: array
 *                 description: Array of dealers for batch update
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - LedgerGUID
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                     LedgerGUID:
 *                       type: string
 *                     LedgerName:
 *                       type: string
 *                     LedgerMobile:
 *                       type: string
 *                     Email:
 *                       type: string
 *                     LedgerGSTIN:
 *                       type: string
 *                     groupGUID:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: All dealers updated successfully
 *       207:
 *         description: Partial success
 *       404:
 *         description: Dealer not found
 */
tallyRoute.put('/dealers/update', updateDealerFromTally);

/**
 * @swagger
 * /api/v1/tally/dealers/delete:
 *   delete:
 *     summary: Delete dealers from Tally ERP
 *     description: >
 *       Permanently deletes dealers based on LedgerGUID and company GUID.
 *       
 *       **Supports both single dealer object and array of multiple dealers for batch deletion.**
 *       - Single dealer: Send a single JSON object with companyGuid and LedgerGUID
 *       - Multiple dealers: Send an array of dealer objects
 *       
 *       Each dealer deletion is processed independently.
 *     tags: [Tally Dealers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - LedgerGUID
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                   LedgerGUID:
 *                     type: string
 *               - type: array
 *                 description: Array of dealers for batch deletion
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - LedgerGUID
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                       example: "COM-001"
 *                     LedgerGUID:
 *                       type: string
 *                       example: "LED-001"
 *     responses:
 *       200:
 *         description: All dealers deleted successfully
 *       207:
 *         description: Partial success
 *       404:
 *         description: Dealer not found
 */
tallyRoute.delete('/dealers/delete', deleteDealerFromTally);

// ===================== SUBDEALER APIS =====================

/**
 * @swagger
 * /api/v1/tally/subdealers:
 *   post:
 *     summary: Sync subdealers from Tally ERP
 *     description: >
 *       Accepts subdealer information pushed from Tally ERP (JSON or XML payload) and creates or updates
 *       the corresponding subdealers inside Royal Software.
 *       
 *       **Supports both single subdealer object and array of multiple subdealers for batch processing.**
 *       - Single subdealer: Send a single JSON object
 *       - Multiple subdealers: Send an array of subdealer objects
 *       
 *       Each subdealer is processed independently - success/failure of one doesn't affect others.
 *       Returns a results array with status for each subdealer processed.
 *     tags: [Tally SubDealers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - SDName
 *                   - SDType
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID to associate the subdealer with
 *                     example: "COM-001"
 *                   SDName:
 *                     type: string
 *                     description: Name of the subdealer
 *                     example: "XYZ Distributors"
 *                   SDType:
 *                     type: string
 *                     enum: [Sub Dealer, TSO]
 *                     description: Type of subdealer
 *                     example: "Sub Dealer"
 *                   SDAddress1:
 *                     type: string
 *                   SDAddress2:
 *                     type: string
 *                   SDAddress3:
 *                     type: string
 *                   SDState:
 *                     type: string
 *                   SDCountry:
 *                     type: string
 *                     default: "India"
 *                   SDPincode:
 *                     type: string
 *                   SDContactPerson:
 *                     type: string
 *                   SDMobileNo:
 *                     type: string
 *                   SDEmail:
 *                     type: string
 *                     format: email
 *                   SDGSTNType:
 *                     type: string
 *                   SDGSTNNumber:
 *                     type: string
 *                   groupGUID:
 *                     type: string
 *                     description: Group GUID to assign the subdealer to
 *                   isActive:
 *                     type: boolean
 *                     default: true
 *               - type: array
 *                 description: Array of subdealers for batch processing
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - SDName
 *                     - SDType
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                       example: "COM-001"
 *                     SDName:
 *                       type: string
 *                       example: "ABC Distributors"
 *                     SDType:
 *                       type: string
 *                       enum: [Sub Dealer, TSO]
 *                     SDAddress1:
 *                       type: string
 *                     SDMobileNo:
 *                       type: string
 *                     SDEmail:
 *                       type: string
 *                     groupGUID:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: All subdealers processed successfully
 *       207:
 *         description: Partial success - some subdealers processed, some failed
 *       400:
 *         description: All subdealers failed to process
 */
tallyRoute.post('/subdealers', upsertSubDealerFromTally);

/**
 * @swagger
 * /api/v1/tally/subdealers/{guid}:
 *   get:
 *     summary: List all subdealers for a company by company GUID
 *     description: Retrieves all active subdealers associated with the specified company GUID
 *     tags: [Tally SubDealers]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID
 *         example: "COM-001"
 *     responses:
 *       200:
 *         description: Subdealers retrieved successfully
 *       404:
 *         description: Company not found
 */
tallyRoute.get('/subdealers/:guid', listSubDealersByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/subdealers/update:
 *   put:
 *     summary: Update subdealers from Tally ERP
 *     description: >
 *       Updates existing subdealers based on SDName and company GUID.
 *       
 *       **Supports both single subdealer object and array of multiple subdealers for batch processing.**
 *       - Single subdealer: Send a single JSON object with companyGuid and SDName
 *       - Multiple subdealers: Send an array of subdealer objects
 *       
 *       Each subdealer is processed independently. Only provided fields are updated.
 *     tags: [Tally SubDealers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - SDName
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                   SDName:
 *                     type: string
 *                   SDType:
 *                     type: string
 *                     enum: [Sub Dealer, TSO]
 *                   SDMobileNo:
 *                     type: string
 *                   SDEmail:
 *                     type: string
 *                   SDState:
 *                     type: string
 *                   SDGSTNNumber:
 *                     type: string
 *                   groupGUID:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *               - type: array
 *                 description: Array of subdealers for batch update
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - SDName
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                     SDName:
 *                       type: string
 *                     SDType:
 *                       type: string
 *                       enum: [Sub Dealer, TSO]
 *                     SDMobileNo:
 *                       type: string
 *                     SDEmail:
 *                       type: string
 *                     SDState:
 *                       type: string
 *                     SDGSTNNumber:
 *                       type: string
 *                     groupGUID:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: All subdealers updated successfully
 *       207:
 *         description: Partial success
 *       404:
 *         description: Subdealer not found
 */
tallyRoute.put('/subdealers/update', updateSubDealerFromTally);

/**
 * @swagger
 * /api/v1/tally/subdealers/delete:
 *   delete:
 *     summary: Delete subdealers from Tally ERP
 *     description: >
 *       Permanently deletes subdealers based on SDName and company GUID.
 *       
 *       **Supports both single subdealer object and array of multiple subdealers for batch deletion.**
 *       - Single subdealer: Send a single JSON object with companyGuid and SDName
 *       - Multiple subdealers: Send an array of subdealer objects
 *       
 *       Each subdealer deletion is processed independently.
 *     tags: [Tally SubDealers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - companyGuid
 *                   - SDName
 *                 properties:
 *                   companyGuid:
 *                     type: string
 *                   SDName:
 *                     type: string
 *               - type: array
 *                 description: Array of subdealers for batch deletion
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyGuid
 *                     - SDName
 *                   properties:
 *                     companyGuid:
 *                       type: string
 *                       example: "COM-001"
 *                     SDName:
 *                       type: string
 *                       example: "XYZ Distributors"
 *     responses:
 *       200:
 *         description: All subdealers deleted successfully
 *       207:
 *         description: Partial success
 *       404:
 *         description: Subdealer not found
 */
tallyRoute.delete('/subdealers/delete', deleteSubDealerFromTally);

export default tallyRoute;

