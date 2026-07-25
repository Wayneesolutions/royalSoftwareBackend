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
  listUnapprovedOrdersByCompanyGuid,
  handleTallyOrderResponse,
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
import {
  getVoucherWithEntries,
  syncVoucherComplete,
} from '../../controllres/voucherController.js';
import {
  syncOutstandingFromTally,
  getOutstandingForGroupUser,
  getOutstandingWithDetails,
} from '../../controllres/tallyOutstandingController.js';
import {
  syncSalesFromTally,
  getSalesSummaryForGroupUser,
} from '../../controllres/tallySalesController.js';
import {
  syncStockFromTally,
  getStockSummaryForGroupUser,
} from '../../controllres/tallyStockController.js';
import {
  syncDispatchFromTally,
  getDispatchForGroupUser,
  getDispatchForAdmin,
} from '../../controllres/tallyDispatchController.js';
import {
  upsertPriceListFromTally,
} from '../../controllres/tallyPriceListController.js';

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
 *   - name: Tally Vouchers
 *     description: Combined voucher API endpoints - Get voucher with entries and sync complete voucher with entries
 *   - name: Tally Outstanding
 *     description: Outstanding management endpoints for Tally ERP - Sync and fetch outstanding entries
 *   - name: Tally Sales
 *     description: Sales management endpoints for Tally ERP - Sync sales and fetch sales summary for group users
 *   - name: Tally Stock
 *     description: Stock synchronization and summary endpoints for Tally ERP - Sync stock levels and fetch stock summary for group users
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 company:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *                     guid:
 *                       type: string
 *                 totalOrders:
 *                   type: integer
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
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
 * /api/v1/tally/companies/{guid}/orders/unapproved:
 *   get:
 *     summary: Fetch unapproved/draft orders for a company by GUID
 *     description: Returns all draft and pending approval orders associated with the specified company.
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
 *         description: Unapproved orders returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 company:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *                     guid:
 *                       type: string
 *                 totalOrders:
 *                   type: integer
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderNumber:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [draft, pending_approval]
 *                       customerName:
 *                         type: string
 *                       customerEmail:
 *                         type: string
 *                       customerMobile:
 *                         type: string
 *                       dealerName:
 *                         type: string
 *                       subDealerName:
 *                         type: string
 *                       totalAmount:
 *                         type: number
 *                       finalAmount:
 *                         type: number
 *                       taxAmount:
 *                         type: number
 *                       taxableValueTotal:
 *                         type: number
 *                       cgstTotal:
 *                         type: number
 *                       sgstTotal:
 *                         type: number
 *                       igstTotal:
 *                         type: number
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           userName:
 *                             type: string
 *                           role:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Missing or invalid GUID
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error while fetching orders
 */
tallyRoute.get('/companies/:guid/orders/unapproved', listUnapprovedOrdersByCompanyGuid);

/**
 * @swagger
 * /api/v1/tally/orders/response:
 *   post:
 *     summary: Receive Tally acceptance or rejection for a sent order
 *     description: >
 *       Called by Tally client after processing an order fetched from the approved orders endpoint.
 *       - If accepted: marks the order as synced and stores Tally GUID and voucher number.
 *       - If rejected: marks the order as failed, stores the error reason, and reverts the order
 *         back to approved so it will be included in the next fetch automatically.
 *     tags: [Tally Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - status
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: "68f8cd55d473fa8d4af0b817"
 *               status:
 *                 type: string
 *                 enum: [accepted, rejected]
 *                 example: "accepted"
 *               tallyGUID:
 *                 type: string
 *                 example: "TALLY-GUID-12345"
 *                 description: Required when status is accepted
 *               tallyVoucherNumber:
 *                 type: string
 *                 example: "VCH-2024-001"
 *                 description: Required when status is accepted
 *               remarks:
 *                 type: string
 *                 example: "Ledger not found in Tally. Please create it first."
 *                 description: Optional human-readable reason when status is rejected. Stored and shown in the app.
 *     responses:
 *       200:
 *         description: Response handled successfully
 *       400:
 *         description: Missing or invalid fields
 *       404:
 *         description: Order not found or not in sent_to_tally status
 *       500:
 *         description: Server error
 */
tallyRoute.post('/orders/response', handleTallyOrderResponse);

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
 *     summary: Update one or multiple users - Dedicated Update API (supports companyGuid in query, path, or body)
 *     description: >
 *       **DEDICATED UPDATE API** - This endpoint is specifically for updating existing users only.
 *       It will NOT create new users. If a user is not found, the update will fail.
 *       
 *       Accepts single or multiple user payloads. Company GUID can be provided in:
 *       - Query parameter: ?companyGuid=XXX (applies to all users in the request)
 *       - Path parameter: /api/v1/tally/companies/{guid}/users/update (applies to all users)
 *       - Request body: Each user object can have its own companyGuid
 *       
 *       **Simplified API - Only required fields:**
 *       - companyGuid (required): Company GUID (required if not in query/path) - company will be added/updated automatically
 *       - User identifier: email (preferred/primary), mobile, or userName (required to identify user)
 *       - Fields to update: name, email, userName, password, mobile, address, isActive
 *       
 *       **Note:** Email is the primary identifier. If email is provided, it will be used for user lookup.
 *       If email is not provided, the system will fall back to mobile, then userName.
 *       
 *       **Role is automatically set to "groupuser" - cannot be changed via Tally API.**
 *       **Company is automatically added/updated based on companyGuid.**
 *       
 *       **Supports both single user object and array of multiple users for batch processing.**
 *       **Email is the primary identifier for user lookup.**
 *       - Single user: Send a single JSON object
 *       - Multiple users: Send an array of user objects
 *       
 *       User identification: Provide email (preferred), mobile, or userName to identify the user.
 *       Only provided fields are updated; other fields remain unchanged.
 *   put:
 *     summary: Update one or multiple users - Dedicated Update API (supports companyGuid in query, path, or body)
 *     description: >
 *       **DEDICATED UPDATE API** - This endpoint is specifically for updating existing users only.
 *       It will NOT create new users. If a user is not found, the update will fail.
 *       
 *       Accepts single or multiple user payloads. Company GUID can be provided in:
 *       - Query parameter: ?companyGuid=XXX (applies to all users in the request)
 *       - Path parameter: /api/v1/tally/companies/{guid}/users/update (applies to all users)
 *       - Request body: Each user object can have its own companyGuid
 *       
 *       **Simplified API - Only required fields:**
 *       - companyGuid (required): Company GUID (required if not in query/path) - company will be added/updated automatically
 *       - User identifier: email (preferred/primary), mobile, or userName (required to identify user)
 *       - Fields to update: name, email, userName, password, mobile, address, isActive
 *       
 *       **Note:** Email is the primary identifier. If email is provided, it will be used for user lookup.
 *       If email is not provided, the system will fall back to mobile, then userName.
 *       
 *       **Role is automatically set to "groupuser" - cannot be changed via Tally API.**
 *       **Company is automatically added/updated based on companyGuid.**
 *       
 *       **Supports both single user object and array of multiple users for batch processing.**
 *       **Email is the primary identifier for user lookup.**
 *       - Single user: Send a single JSON object
 *       - Multiple users: Send an array of user objects
 *       
 *       User identification: Provide email (preferred), mobile, or userName to identify the user.
 *       Only provided fields are updated; other fields remain unchanged.
 *     tags: [Tally Users]
 *     parameters:
 *       - in: query
 *         name: companyGuid
 *         required: false
 *         schema:
 *           type: string
 *         description: Company GUID (optional if provided in path or body) - Priority: query > path > body
 *         example: "COM-001"
 *       - in: path
 *         name: guid
 *         required: false
 *         schema:
 *           type: string
 *         description: Company GUID (optional if provided in query or body)
 *         example: "COM-001"
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
 *                     description: User email (primary identifier - required to identify user for update)
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
// Separate update endpoint (dedicated for updates only)
// Dedicated Update API endpoints (separate from create/upsert)
// These endpoints ONLY update existing users - they do NOT create new users
tallyRoute.patch('/users/update', updateUsersFromTally);
tallyRoute.put('/users/update', updateUsersFromTally);
tallyRoute.patch('/companies/:guid/users/update', updateUsersFromTally);
tallyRoute.put('/companies/:guid/users/update', updateUsersFromTally);

/**
 * @swagger
 * /api/v1/tally/companies/{guid}/users/update:
 *   patch:
 *     summary: Update users for a specific company - Dedicated Update API
 *     description: >
 *       **DEDICATED UPDATE API** - This endpoint is specifically for updating existing users only.
 *       It will NOT create new users. If a user is not found, the update will fail.
 *       
 *       Company GUID is provided in the path parameter. Users are identified by email (preferred), mobile, or userName.
 *       
 *       **Simplified API - Only required fields:**
 *       - User identifier: email (preferred/primary), mobile, or userName (required to identify user)
 *       - Fields to update: name, email, userName, password, mobile, address, isActive
 *       
 *       **Note:** Email is the primary identifier. If email is provided, it will be used for user lookup.
 *       If email is not provided, the system will fall back to mobile, then userName.
 *       
 *       **Role is automatically set to "groupuser" - cannot be changed via Tally API.**
 *       **Supports both single user object and array of multiple users for batch processing.**
 *     tags: [Tally Users]
 *     parameters:
 *       - in: path
 *         name: guid
 *         required: true
 *         schema:
 *           type: string
 *         description: Company GUID
 *         example: "COM-001"
 *       - in: query
 *         name: companyGuid
 *         required: false
 *         schema:
 *           type: string
 *         description: Company GUID (optional, path parameter takes precedence)
 *         example: "COM-001"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User email (primary identifier - required to identify user for update)
 *                   mobile:
 *                     type: string
 *                     description: User mobile (alternative identifier)
 *                   userName:
 *                     type: string
 *                     description: User username (alternative identifier)
 *                   name:
 *                     type: string
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
 *               - type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                     mobile:
 *                       type: string
 *                     userName:
 *                       type: string
 *                     name:
 *                       type: string
 *                     password:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     address:
 *                       type: object
 *     responses:
 *       200:
 *         description: All users updated successfully
 *       207:
 *         description: Partial success (some updates failed)
 *       400:
 *         description: Validation error or missing fields
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error while updating users
 */
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
 *     summary: Sync groups from Tally with hierarchy support
 *     description: >
 *       Accepts group information pushed from Tally ERP (JSON or XML payload). Can accept a single group object or an array
 *       of multiple groups for batch processing. All groups are upserted (created or updated) into Royal Software.
 *       Groups are identified by GroupGUID and cmpcode combination.
 *       
 *       **Important:** 
 *       - `companyGuid` is required. The `cmpcode` will be automatically assigned from the company based on the `companyGuid`.
 *       - You do not need to provide `cmpcode` - it will be derived from the company's `companyCode`.
 *       - **First Group for a Company:** When creating the first group for a company, do not provide `GroupParent` or `parentGroupGUID`.
 *         The first group will be created as a root group with `GroupParent = null`. This is the base group for the company.
 *       - **Group Hierarchy:** For subsequent groups, you can create group hierarchy by providing `GroupParent` or `parentGroupGUID` field.
 *         The system will:
 *         1. Validate that the company GUID exists
 *         2. Validate that the parent group GUID exists in the same company (if parentGroupGUID is provided)
 *         3. Create the group with the parent relationship established, creating a group hierarchy
 *       - A group cannot be its own parent (circular reference prevention)
 *       - Parent group must exist in the same company (same cmpcode)
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
 *                   - companyGuid
 *                 properties:
 *                   GroupGUID:
 *                     type: string
 *                     description: Group GUID from Tally (alphanumeric string)
 *                     example: "GRP001"
 *                   GroupName:
 *                     type: string
 *                     description: Name of the group
 *                     example: "Sales Group"
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID (required) - cmpcode will be auto-assigned from company
 *                     example: "COM-001"
 *                   GroupParent:
 *                     type: string
 *                     nullable: true
 *                     description: Parent Group GUID (optional) - Creates group hierarchy. Must be an existing group GUID in the same company. If provided, the system will validate that the parent group exists before creating this group. For the first group in a company, omit this field or set to null to create a root group.
 *                     example: "GRP-PARENT-001"
 *                   parentGroupGUID:
 *                     type: string
 *                     nullable: true
 *                     description: Alternative field name for parent Group GUID (optional) - Same as GroupParent. For the first group in a company, omit this field or set to null to create a root group.
 *                     example: "GRP-PARENT-001"
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
 *                     - companyGuid
 *                   properties:
 *                     GroupGUID:
 *                       type: string
 *                     GroupName:
 *                       type: string
 *                     companyGuid:
 *                       type: string
 *                       description: Company GUID (required) - cmpcode will be auto-assigned from company
 *                     GroupParent:
 *                       type: string
 *                       nullable: true
 *                       description: Parent Group GUID (optional) - Creates group hierarchy. Must be an existing group GUID in the same company. For the first group in a company, omit this field or set to null to create a root group.
 *                       example: "GRP-PARENT-001"
 *                     parentGroupGUID:
 *                       type: string
 *                       nullable: true
 *                       description: Alternative field name for parent Group GUID (optional) - Same as GroupParent. For the first group in a company, omit this field or set to null to create a root group.
 *                       example: "GRP-PARENT-001"
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
 *     summary: Update groups from Tally (supports hierarchy updates)
 *     description: >
 *       Accepts one or more group payloads. Each payload must include the GroupGUID and companyGuid.
 *       Only provided fields are updated; other fields remain unchanged.
 *       
 *       **Important:** 
 *       - `companyGuid` is required to identify the group. The `cmpcode` will be automatically 
 *         assigned from the company based on the `companyGuid`. You do not need to provide `cmpcode`.
 *       - **Group Hierarchy:** You can update group hierarchy by providing `GroupParent` or `parentGroupGUID` field.
 *         The system will validate that the parent group GUID exists in the same company before updating.
 *       - A group cannot be its own parent (circular reference prevention)
 *       - Set `GroupParent` to `null` or empty string to remove parent relationship
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
 *                   - companyGuid
 *                 properties:
 *                   GroupGUID:
 *                     type: string
 *                     description: Group GUID used to locate the record
 *                     example: "GRP001"
 *                   companyGuid:
 *                     type: string
 *                     description: Company GUID (required) - cmpcode will be auto-assigned from company
 *                     example: "COM-001"
 *                   GroupName:
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
 *                     - companyGuid
 *                   properties:
 *                     GroupGUID:
 *                       type: string
 *                     companyGuid:
 *                       type: string
 *                       description: Company GUID (required) - cmpcode will be auto-assigned from company
 *                     GroupParent:
 *                       type: string
 *                       nullable: true
 *                       description: Parent Group GUID (optional) - Updates group hierarchy. Must be an existing group GUID in the same company.
 *                       example: "GRP-PARENT-001"
 *                     parentGroupGUID:
 *                       type: string
 *                       nullable: true
 *                       description: Alternative field name for parent Group GUID (optional) - Same as GroupParent
 *                       example: "GRP-PARENT-001"
 *                     GroupName:
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
 *       **Simplified API - Only required fields:**
 *       - companyGuid (required): Company GUID - company details (cmpcode, Cmpguid, companyId) will be auto-assigned
 *       - LedgerGUID (required): Unique GUID for the dealer
 *       - LedgerName (required): Name of the dealer
 *       
 *       **Optional fields:**
 *       - LedgerMobile, Email, password, LedgerGSTIN
 *       - LedgerAddress1, LedgerAddress2, LedgerState
 *       - LedgerOpening, LedgerOpeningDate, LedgerJoinDate
 *       - groupGUID (optional): Group GUID to assign dealer to
 *       - Remarks, Other1-Other8: Additional fields
 *       - isActive: Active status (default: true)
 *       
 *       **Note:** Company details (cmpcode, Cmpguid, companyId) are automatically assigned from companyGuid.
 *       You do not need to provide these fields - they will be derived from the company.
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
 *                     description: Company GUID (required) - company details will be auto-assigned from this
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
 *                     description: Mobile number of the dealer
 *                     example: "+919876543210"
 *                   Email:
 *                     type: string
 *                     format: email
 *                     description: Email address of the dealer
 *                     example: "dealer@example.com"
 *                   password:
 *                     type: string
 *                     description: Password for dealer login (will be hashed)
 *                   LedgerGSTIN:
 *                     type: string
 *                     description: GSTIN number
 *                     example: "29ABCDE1234F1Z5"
 *                   LedgerAddress1:
 *                     type: string
 *                     description: Address line 1
 *                   LedgerAddress2:
 *                     type: string
 *                     description: Address line 2
 *                   LedgerState:
 *                     type: string
 *                     description: State
 *                   LedgerOpening:
 *                     type: number
 *                     description: Opening balance
 *                     default: 0
 *                   LedgerOpeningDate:
 *                     type: string
 *                     format: date
 *                     description: Opening date (YYYY-MM-DD)
 *                     example: "2025-12-09"
 *                   LedgerJoinDate:
 *                     type: string
 *                     format: date
 *                     description: Join date (YYYY-MM-DD)
 *                     example: "2025-12-09"
 *                   groupGUID:
 *                     type: string
 *                     description: Group GUID to assign the dealer to (optional)
 *                   Remarks:
 *                     type: string
 *                     description: Additional remarks
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
 *                   Other5:
 *                     type: string
 *                     description: Additional field 5
 *                   other6:
 *                     type: string
 *                     description: Additional field 6
 *                   other7:
 *                     type: string
 *                     description: Additional field 7
 *                   other8:
 *                     type: string
 *                     description: Additional field 8
 *                   isActive:
 *                     type: boolean
 *                     description: Active status
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
 *                       description: Company GUID (required) - company details will be auto-assigned from this
 *                     LedgerGUID:
 *                       type: string
 *                     LedgerName:
 *                       type: string
 *                     LedgerMobile:
 *                       type: string
 *                     Email:
 *                       type: string
 *                       format: email
 *                     password:
 *                       type: string
 *                     LedgerGSTIN:
 *                       type: string
 *                     LedgerAddress1:
 *                       type: string
 *                     LedgerAddress2:
 *                       type: string
 *                     LedgerState:
 *                       type: string
 *                     LedgerOpening:
 *                       type: number
 *                     LedgerOpeningDate:
 *                       type: string
 *                       format: date
 *                     LedgerJoinDate:
 *                       type: string
 *                       format: date
 *                     groupGUID:
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
 *                     Other5:
 *                       type: string
 *                     other6:
 *                       type: string
 *                     other7:
 *                       type: string
 *                     other8:
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
 *     summary: Sync subdealers from Tally ERP with dealer connection support
 *     description: >
 *       Accepts subdealer information pushed from Tally ERP (JSON or XML payload) and creates or updates
 *       the corresponding subdealers inside Royal Software.
 *       
 *       **Supports both single subdealer object and array of multiple subdealers for batch processing.**
 *       - Single subdealer: Send a single JSON object
 *       - Multiple subdealers: Send an array of subdealer objects
 *       
 *       **Important:** 
 *       - `companyGuid` is required. The system will validate that the company exists.
 *       - **Dealer Connection:** You can connect a subdealer to a dealer/ledger by providing `ledgerGUID` or `LedgerGUID`.
 *         The system will:
 *         1. Validate that the company GUID exists
 *         2. Validate that the ledger GUID exists in the same company (if ledgerGUID is provided)
 *         3. Connect the subdealer to the dealer by setting `createdBy` to the ledger's ID
 *         4. Automatically assign the subdealer to the dealer's group (if dealer has a group and no groupGUID is explicitly provided)
 *       - If `ledgerGUID` is not provided, the subdealer will be created without a dealer connection (createdBy will be set to first admin user)
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
 *                   ledgerGUID:
 *                     type: string
 *                     description: Optional - Ledger GUID of the dealer to connect this subdealer with. If provided, the system will validate that the ledger exists in the same company and connect the subdealer to the dealer. The subdealer will be assigned to the dealer's group automatically if no groupGUID is provided.
 *                     example: "LEDGER-001"
 *                   LedgerGUID:
 *                     type: string
 *                     description: Alternative field name for ledger GUID (optional) - Same as ledgerGUID
 *                     example: "LEDGER-001"
 *                   groupGUID:
 *                     type: string
 *                     description: Optional - Group GUID to assign the subdealer to. If not provided and ledgerGUID is provided, the subdealer will be assigned to the dealer's group automatically.
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
 *                     ledgerGUID:
 *                       type: string
 *                       description: Optional - Ledger GUID of the dealer to connect this subdealer with
 *                       example: "LEDGER-001"
 *                     LedgerGUID:
 *                       type: string
 *                       description: Alternative field name for ledger GUID (optional) - Same as ledgerGUID
 *                       example: "LEDGER-001"
 *                     groupGUID:
 *                       type: string
 *                       description: Optional - Group GUID to assign the subdealer to
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

// ===================== VOUCHER APIS =====================

/**
 * @swagger
 * /api/v1/tally/vouchers/{vchguid}/details:
 *   get:
 *     summary: Get voucher with ledger entries and inventory entries (Combined API)
 *     description: >
 *       Fetches a complete voucher details including:
 *       - Voucher master information
 *       - All ledger entries (accounting entries) connected to this voucher
 *       - All inventory entries (items/products) connected to this voucher
 *       
 *       This is a combined API that replaces the need to make three separate API calls.
 *       When clicking on a voucher, use this endpoint to get all related data in one request.
 *     tags: [Tally Vouchers]
 *     parameters:
 *       - in: path
 *         name: vchguid
 *         required: true
 *         schema:
 *           type: string
 *         description: Voucher GUID
 *         example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *         example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *     responses:
 *       200:
 *         description: Voucher details with entries fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Voucher details with entries fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     voucher:
 *                       type: object
 *                       description: Voucher master information
 *                       properties:
 *                         _id:
 *                           type: string
 *                         vchguid:
 *                           type: string
 *                         vchnumber:
 *                           type: string
 *                         vchdate:
 *                           type: string
 *                           format: date
 *                         vchtype:
 *                           type: string
 *                         vchamount:
 *                           type: number
 *                         vchpartyname:
 *                           type: string
 *                         ledgerId:
 *                           type: object
 *                           description: Populated ledger information
 *                         companyId:
 *                           type: object
 *                           description: Populated company information
 *                     ledgerEntries:
 *                       type: object
 *                       description: Ledger entries (accounting entries) connected to this voucher
 *                       properties:
 *                         entries:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               vchguid:
 *                                 type: string
 *                               ledgerguid:
 *                                 type: string
 *                               ledgeramount:
 *                                 type: number
 *                               ledgerId:
 *                                 type: object
 *                                 description: Populated ledger information
 *                               voucherId:
 *                                 type: object
 *                                 description: Populated voucher information
 *                               companyId:
 *                                 type: object
 *                                 description: Populated company information
 *                               other1:
 *                                 type: string
 *                               other2:
 *                                 type: string
 *                               other3:
 *                                 type: string
 *                               other4:
 *                                 type: string
 *                               other5:
 *                                 type: string
 *                         summary:
 *                           type: object
 *                           properties:
 *                             totalEntries:
 *                               type: number
 *                               description: Total number of ledger entries
 *                             totalAmount:
 *                               type: number
 *                               description: Sum of all ledger amounts
 *                     inventoryEntries:
 *                       type: object
 *                       description: Inventory entries (items/products) connected to this voucher
 *                       properties:
 *                         entries:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               vchguid:
 *                                 type: string
 *                               itemguid:
 *                                 type: string
 *                               itemmainqty:
 *                                 type: number
 *                               itemaltqty:
 *                                 type: number
 *                               itemmainunit:
 *                                 type: string
 *                               itemaltunit:
 *                                 type: string
 *                               itemrate:
 *                                 type: number
 *                               itemrateunit:
 *                                 type: string
 *                               itemdisc:
 *                                 type: number
 *                               itemamount:
 *                                 type: number
 *                               itemdescription:
 *                                 type: string
 *                               voucherId:
 *                                 type: object
 *                                 description: Populated voucher information
 *                               companyId:
 *                                 type: object
 *                                 description: Populated company information
 *                               other1:
 *                                 type: string
 *                               other2:
 *                                 type: string
 *                               other3:
 *                                 type: string
 *                               other4:
 *                                 type: string
 *                               other5:
 *                                 type: string
 *                         summary:
 *                           type: object
 *                           properties:
 *                             totalEntries:
 *                               type: number
 *                               description: Total number of inventory entries
 *                             totalQuantity:
 *                               type: number
 *                               description: Sum of all item quantities
 *                             totalAmount:
 *                               type: number
 *                               description: Sum of all item amounts
 *             example:
 *               success: true
 *               message: "Voucher details with entries fetched successfully"
 *               data:
 *                 voucher:
 *                   _id: "507f1f77bcf86cd799439011"
 *                   vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                   vchnumber: "INV-2024-001"
 *                   vchdate: "2024-12-30T00:00:00.000Z"
 *                   vchtype: "Sales"
 *                   vchamount: 59000.00
 *                   vchpartyname: "ABC Traders"
 *                   ledgerId:
 *                     LedgerName: "ABC Traders"
 *                     LedgerMobile: "9876543210"
 *                     LedgerGSTIN: "03AABCU9603R1ZM"
 *                   companyId:
 *                     companyName: "Royal Software"
 *                     companyCode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 ledgerEntries:
 *                   entries:
 *                     - _id: "507f1f77bcf86cd799439012"
 *                       vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                       ledgeramount: 10000.00
 *                       ledgerId:
 *                         LedgerName: "Customer Account"
 *                         LedgerMobile: "9876543210"
 *                       other1: "Debit"
 *                       other2: "Customer Account"
 *                     - _id: "507f1f77bcf86cd799439013"
 *                       vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2"
 *                       ledgeramount: -10000.00
 *                       ledgerId:
 *                         LedgerName: "Sales Account"
 *                       other1: "Credit"
 *                       other2: "Sales Account"
 *                   summary:
 *                     totalEntries: 2
 *                     totalAmount: 0.00
 *                 inventoryEntries:
 *                   entries:
 *                     - _id: "507f1f77bcf86cd799439014"
 *                       vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       itemguid: "ITEM-001"
 *                       itemmainqty: 10.00
 *                       itemmainunit: "PCS"
 *                       itemrate: 100.00
 *                       itemamount: 1000.00
 *                       itemdescription: "Product XYZ"
 *                       other1: "Batch: B001"
 *                     - _id: "507f1f77bcf86cd799439015"
 *                       vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       itemguid: "ITEM-002"
 *                       itemmainqty: 5.00
 *                       itemmainunit: "KG"
 *                       itemrate: 200.00
 *                       itemamount: 1000.00
 *                       itemdescription: "Product ABC"
 *                       other1: "Batch: B002"
 *                   summary:
 *                     totalEntries: 2
 *                     totalQuantity: 15.00
 *                     totalAmount: 2000.00
 *       400:
 *         description: Bad request - Company code is required
 *       404:
 *         description: Voucher not found
 *       500:
 *         description: Server error
 */
tallyRoute.get('/vouchers/:vchguid/details', getVoucherWithEntries);

/**
 * @swagger
 * /api/v1/tally/vouchers/sync-complete:
 *   post:
 *     summary: Create or update voucher with ledger entries and inventory entries (Combined API)
 *     description: >
 *       Creates or updates a complete voucher transaction including:
 *       - Voucher master information (create or update)
 *       - All ledger entries (accounting entries) connected to this voucher (create or update)
 *       - All inventory entries (items/products) connected to this voucher (create or update)
 *       
 *       This is a combined API that replaces the need to make three separate API calls.
 *       All operations are transactional - if voucher creation fails, nothing is created.
 *       Ledger and inventory entries are processed after voucher is successfully created/updated.
 *       
 *       **Update Logic:**
 *       - Voucher: Updated if vchguid already exists, otherwise created
 *       - Ledger Entries: Updated if combination of vchguid + ledgerguid exists, otherwise created
 *       - Inventory Entries: Updated if combination of vchguid + itemguid exists, otherwise created
 *     tags: [Tally Vouchers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - voucher
 *             properties:
 *               voucher:
 *                 type: object
 *                 required:
 *                   - cmpcode
 *                   - vchguid
 *                   - vchnumber
 *                   - vchdate
 *                   - vchtype
 *                   - vchpartyguid
 *                   - vchamount
 *                 properties:
 *                   cmpcode:
 *                     type: string
 *                     example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   vchguid:
 *                     type: string
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                   vchnumber:
 *                     type: string
 *                     example: "INV-2024-001"
 *                   vchdate:
 *                     type: string
 *                     format: date
 *                     example: "2024-12-30"
 *                   vchtype:
 *                     type: string
 *                     example: "Sales"
 *                   vchtypeparent:
 *                     type: string
 *                     example: "Invoice"
 *                   vchpartyguid:
 *                     type: string
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                   vchpartyname:
 *                     type: string
 *                     example: "ABC Traders"
 *                   vchamount:
 *                     type: number
 *                     example: 59000.00
 *                   vchgoodsamt:
 *                     type: number
 *                     example: 50000.00
 *                   vchpartyadd1:
 *                     type: string
 *                     example: "123 Main Street"
 *                   vchpartyadd2:
 *                     type: string
 *                     example: "Near City Mall"
 *                   vchpartyadd3:
 *                     type: string
 *                     example: "Ludhiana, Punjab"
 *                   vchpartygstin:
 *                     type: string
 *                     example: "03AABCU9603R1ZM"
 *                     description: Party GSTIN number
 *                   vchsubdealername:
 *                     type: string
 *                     example: "Sub Dealer Name"
 *                     description: Sub dealer name
 *                   vchsubdealeradd1:
 *                     type: string
 *                     example: "Sub Dealer Address Line 1"
 *                     description: Sub dealer address line 1
 *                   vchsubdealeradd2:
 *                     type: string
 *                     example: "Sub Dealer Address Line 2"
 *                     description: Sub dealer address line 2
 *                   vchsubdealeradd3:
 *                     type: string
 *                     example: "Sub Dealer Address Line 3"
 *                     description: Sub dealer address line 3
 *                   isinvoice:
 *                     type: string
 *                     enum: [Yes, No]
 *                     example: "Yes"
 *                     description: Whether this is an invoice
 *                   vchgrno:
 *                     type: string
 *                     example: "GR-12345"
 *                     description: GR (Goods Receipt) number
 *                   vchtransport:
 *                     type: string
 *                     example: "Royal Transport"
 *                     description: Transport company name
 *                   vchtruckno:
 *                     type: string
 *                     example: "PB-05-1234"
 *                     description: Truck/vehicle number
 *                   vchdrivername:
 *                     type: string
 *                     example: "Rajesh Kumar"
 *                     description: Driver name
 *                   vchdrivermobile:
 *                     type: string
 *                     example: "9876543210"
 *                     description: Driver mobile number
 *                   vchdestination:
 *                     type: string
 *                     example: "Delhi"
 *                     description: Delivery destination
 *                   vchpymtterms:
 *                     type: string
 *                     example: "Net 30 Days"
 *                     description: Payment terms
 *                   vchotherref:
 *                     type: string
 *                     example: "PO-2024-001"
 *                     description: Other reference number (e.g., PO number)
 *                   vchqtunit:
 *                     type: string
 *                     example: "PCS"
 *                     description: Quantity unit (pieces, kg, etc.)
 *                   vchqtunit2:
 *                     type: string
 *                     example: "KG"
 *                     description: Alternate quantity unit
 *                   vchnarration:
 *                     type: string
 *                     example: "Sale of goods as per order"
 *                     description: Voucher narration/description
 *                   remarks:
 *                     type: string
 *                     example: "Payment received"
 *                     description: Additional remarks or notes
 *                   other1:
 *                     type: string
 *                     example: "Custom field 1"
 *                     description: Custom field 1
 *                   other2:
 *                     type: string
 *                     example: "Custom field 2"
 *                     description: Custom field 2
 *                   other3:
 *                     type: string
 *                     example: "Custom field 3"
 *                     description: Custom field 3
 *                   other4:
 *                     type: string
 *                     example: "Custom field 4"
 *                     description: Custom field 4
 *                   other5:
 *                     type: string
 *                     example: "Custom field 5"
 *                     description: Custom field 5
 *                   other6:
 *                     type: string
 *                     example: "Custom field 6"
 *                     description: Custom field 6
 *                   other7:
 *                     type: string
 *                     example: "Custom field 7"
 *                     description: Custom field 7
 *                   other8:
 *                     type: string
 *                     example: "Custom field 8"
 *                     description: Custom field 8
 *                   other9:
 *                     type: string
 *                     example: "Custom field 9"
 *                     description: Custom field 9
 *                   other10:
 *                     type: string
 *                     example: "Custom field 10"
 *                     description: Custom field 10
 *               ledgerEntries:
 *                 type: array
 *                 description: Array of ledger entries (accounting entries) for this voucher
 *                 items:
 *                   type: object
 *                   required:
 *                     - ledgerguid
 *                     - ledgeramount
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                       example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                       description: Company code (must match voucher cmpcode)
 *                     vchguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       description: Voucher GUID (must match voucher vchguid)
 *                     ledgerguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                       description: Ledger GUID (must exist in system)
 *                     ledgeramount:
 *                       type: number
 *                       example: 10000.00
 *                       description: Amount for this ledger entry (positive for debit, negative for credit)
 *                     other1:
 *                       type: string
 *                       example: "Debit"
 *                       description: Custom field 1 (e.g., Debit/Credit type)
 *                     other2:
 *                       type: string
 *                       example: "Customer Account"
 *                       description: Custom field 2 (e.g., Account type)
 *                     other3:
 *                       type: string
 *                       example: "Invoice Payment"
 *                       description: Custom field 3 (e.g., Transaction type)
 *                     other4:
 *                       type: string
 *                       example: "Q4 2024"
 *                       description: Custom field 4 (e.g., Period)
 *                     other5:
 *                       type: string
 *                       example: "Approved"
 *                       description: Custom field 5 (e.g., Status)
 *               inventoryEntries:
 *                 type: array
 *                 description: Array of inventory entries (items/products) for this voucher
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemguid
 *                     - itemamount
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                       example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                       description: Company code (must match voucher cmpcode)
 *                     vchguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       description: Voucher GUID (must match voucher vchguid)
 *                     itemguid:
 *                       type: string
 *                       example: "ITEM-001"
 *                       description: Item/Product GUID
 *                     itemmainqty:
 *                       type: number
 *                       example: 10.00
 *                       description: Main quantity
 *                     itemaltqty:
 *                       type: number
 *                       example: 1.00
 *                       description: Alternate quantity
 *                     itemmainunit:
 *                       type: string
 *                       example: "PCS"
 *                       description: Main unit (pieces, kg, etc.)
 *                     itemaltunit:
 *                       type: string
 *                       example: "BOX"
 *                       description: Alternate unit
 *                     itemrate:
 *                       type: number
 *                       example: 100.00
 *                       description: Rate per unit
 *                     itemrateunit:
 *                       type: string
 *                       example: "PCS"
 *                       description: Unit for rate
 *                     itemdisc:
 *                       type: number
 *                       example: 50.00
 *                       description: Discount amount
 *                     itemamount:
 *                       type: number
 *                       example: 950.00
 *                       description: Total amount (required)
 *                     itemdescription:
 *                       type: string
 *                       example: "Product XYZ - Red Color"
 *                       description: Item description
 *                     other1:
 *                       type: string
 *                       example: "Batch: B001"
 *                       description: Custom field 1 (e.g., Batch number)
 *                     other2:
 *                       type: string
 *                       example: "Expiry: 2025-12-31"
 *                       description: Custom field 2 (e.g., Expiry date)
 *                     other3:
 *                       type: string
 *                       example: "Warehouse: Main"
 *                       description: Custom field 3 (e.g., Warehouse location)
 *                     other4:
 *                       type: string
 *                       example: "Quality: A+"
 *                       description: Custom field 4 (e.g., Quality grade)
 *                     other5:
 *                       type: string
 *                       example: "Custom field 5"
 *                       description: Custom field 5
 *           example:
 *             voucher:
 *               cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *               vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *               vchnumber: "INV-2024-001"
 *               vchdate: "2024-12-30"
 *               vchtype: "Sales"
 *               vchtypeparent: "Invoice"
 *               vchpartyguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *               vchpartyname: "ABC Traders"
 *               vchpartyadd1: "123 Main Street"
 *               vchpartyadd2: "Near City Mall"
 *               vchpartyadd3: "Ludhiana, Punjab"
 *               vchpartygstin: "03AABCU9603R1ZM"
 *               vchsubdealername: "Sub Dealer Name"
 *               vchsubdealeradd1: "Sub Dealer Address Line 1"
 *               vchsubdealeradd2: "Sub Dealer Address Line 2"
 *               vchsubdealeradd3: "Sub Dealer Address Line 3"
 *               isinvoice: "Yes"
 *               vchgrno: "GR-12345"
 *               vchtransport: "Royal Transport"
 *               vchtruckno: "PB-05-1234"
 *               vchdrivername: "Rajesh Kumar"
 *               vchdrivermobile: "9876543210"
 *               vchdestination: "Delhi"
 *               vchpymtterms: "Net 30 Days"
 *               vchotherref: "PO-2024-001"
 *               vchqtunit: "PCS"
 *               vchqtunit2: "KG"
 *               vchgoodsamt: 50000
 *               vchamount: 59000
 *               vchnarration: "Sale of goods as per order"
 *               remarks: "Payment received"
 *               other1: "Custom field 1"
 *               other2: "Custom field 2"
 *               other3: "Custom field 3"
 *               other4: "Custom field 4"
 *               other5: "Custom field 5"
 *               other6: "Custom field 6"
 *               other7: "Custom field 7"
 *               other8: "Custom field 8"
 *               other9: "Custom field 9"
 *               other10: "Custom field 10"
 *             ledgerEntries:
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                 ledgeramount: 10000
 *                 other1: "Debit"
 *                 other2: "Customer Account"
 *                 other3: "Invoice Payment"
 *                 other4: "Q4 2024"
 *                 other5: "Approved"
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2"
 *                 ledgeramount: -10000
 *                 other1: "Credit"
 *                 other2: "Sales Account"
 *                 other3: "Invoice Payment"
 *                 other4: "Q4 2024"
 *                 other5: "Approved"
 *             inventoryEntries:
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 itemguid: "ITEM-001"
 *                 itemmainqty: 10
 *                 itemmainunit: "PCS"
 *                 itemrate: 100
 *                 itemdisc: 0
 *                 itemamount: 1000
 *                 itemdescription: "Product XYZ"
 *                 other1: "Batch: B001"
 *                 other2: "Expiry: 2025-12-31"
 *                 other3: "Warehouse: Main"
 *                 other4: "Quality: A+"
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 itemguid: "ITEM-002"
 *                 itemmainqty: 5
 *                 itemmainunit: "KG"
 *                 itemrate: 200
 *                 itemdisc: 0
 *                 itemamount: 1000
 *                 itemdescription: "Product ABC"
 *                 other1: "Batch: B002"
 *                 other2: "Expiry: 2026-06-30"
 *                 other3: "Warehouse: Secondary"
 *                 other4: "Quality: B+"
 *     responses:
 *       200:
 *         description: Voucher and all entries synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Voucher sync completed. Voucher: Created, Ledger Entries: 2/2, Inventory Entries: 2/2"
 *                 data:
 *                   type: object
 *                   properties:
 *                     voucher:
 *                       type: object
 *                       properties:
 *                         success:
 *                           type: boolean
 *                         action:
 *                           type: string
 *                           enum: [Created, Updated]
 *                         error:
 *                           type: string
 *                           nullable: true
 *                         data:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             vchguid:
 *                               type: string
 *                             vchnumber:
 *                               type: string
 *                             vchtype:
 *                               type: string
 *                             vchdate:
 *                               type: string
 *                               format: date
 *                             vchamount:
 *                               type: number
 *                     ledgerEntries:
 *                       type: object
 *                       properties:
 *                         success:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               index:
 *                                 type: number
 *                               _id:
 *                                 type: string
 *                               ledgerguid:
 *                                 type: string
 *                               ledgerName:
 *                                 type: string
 *                               action:
 *                                 type: string
 *                                 enum: [Created, Updated]
 *                               amount:
 *                                 type: number
 *                         failed:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               index:
 *                                 type: number
 *                               ledgerguid:
 *                                 type: string
 *                               error:
 *                                 type: string
 *                         totalProcessed:
 *                           type: number
 *                         totalSuccess:
 *                           type: number
 *                         totalFailed:
 *                           type: number
 *                     inventoryEntries:
 *                       type: object
 *                       properties:
 *                         success:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               index:
 *                                 type: number
 *                               _id:
 *                                 type: string
 *                               itemguid:
 *                                 type: string
 *                               itemDescription:
 *                                 type: string
 *                               action:
 *                                 type: string
 *                                 enum: [Created, Updated]
 *                               quantity:
 *                                 type: number
 *                               amount:
 *                                 type: number
 *                         failed:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               index:
 *                                 type: number
 *                               itemguid:
 *                                 type: string
 *                               error:
 *                                 type: string
 *                         totalProcessed:
 *                           type: number
 *                         totalSuccess:
 *                           type: number
 *                         totalFailed:
 *                           type: number
 *             example:
 *               success: true
 *               message: "Voucher sync completed. Voucher: Created, Ledger Entries: 2/2, Inventory Entries: 2/2"
 *               data:
 *                 voucher:
 *                   success: true
 *                   action: "Created"
 *                   error: null
 *                   data:
 *                     _id: "507f1f77bcf86cd799439011"
 *                     vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                     vchnumber: "INV-2024-001"
 *                     vchtype: "Sales"
 *                     vchdate: "2024-12-30T00:00:00.000Z"
 *                     vchamount: 59000.00
 *                 ledgerEntries:
 *                   success:
 *                     - index: 0
 *                       _id: "507f1f77bcf86cd799439012"
 *                       ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                       ledgerName: "Customer Account"
 *                       action: "Created"
 *                       amount: 10000.00
 *                     - index: 1
 *                       _id: "507f1f77bcf86cd799439013"
 *                       ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2"
 *                       ledgerName: "Sales Account"
 *                       action: "Created"
 *                       amount: -10000.00
 *                   failed: []
 *                   totalProcessed: 2
 *                   totalSuccess: 2
 *                   totalFailed: 0
 *                 inventoryEntries:
 *                   success:
 *                     - index: 0
 *                       _id: "507f1f77bcf86cd799439014"
 *                       itemguid: "ITEM-001"
 *                       itemDescription: "Product XYZ"
 *                       action: "Created"
 *                       quantity: 10.00
 *                       amount: 1000.00
 *                     - index: 1
 *                       _id: "507f1f77bcf86cd799439015"
 *                       itemguid: "ITEM-002"
 *                       itemDescription: "Product ABC"
 *                       action: "Created"
 *                       quantity: 5.00
 *                       amount: 1000.00
 *                   failed: []
 *                   totalProcessed: 2
 *                   totalSuccess: 2
 *                   totalFailed: 0
 *       207:
 *         description: Partial success - Voucher created but some entries failed
 *       400:
 *         description: Bad request - Missing required fields or validation error
 *       404:
 *         description: Company or Ledger not found
 *       500:
 *         description: Server error
 */
tallyRoute.post('/vouchers/sync-complete', syncVoucherComplete);

// ===================== OUTSTANDING APIS =====================

/**
 * @swagger
 * /api/v1/tally/outstanding/sync:
 *   post:
 *     summary: Create or update outstanding entries from Tally (Combined API)
 *     description: >
 *       Syncs outstanding entries from Tally ERP. Supports both single outstanding entry and batch processing.
 *       
 *       **Required Fields:**
 *       - cmpcode: Company code
 *       - ledgerguid: Ledger GUID (dealer GUID)
 *       - vchguid: Voucher GUID
 *       - outstandingAmount: Outstanding amount
 *       
 *       **Optional Fields:**
 *       - totalAmount: Total invoice amount
 *       - paidAmount: Amount already paid
 *       - dueDate: Due date for payment
 *       - paymentTerms: Payment terms (immediate, 7_days, 15_days, 30_days, etc.)
 *       - vchnumber: Voucher number
 *       - vchdate: Voucher date
 *       - status: Status (pending, overdue, partially_paid, paid)
 *       - riskLevel: Risk level (low, medium, high, critical)
 *       
 *       The system will automatically:
 *       - Calculate days overdue based on due date
 *       - Determine status based on outstanding amount and days overdue
 *       - Determine risk level based on days overdue
 *       - Link to voucher if vchguid is provided
 *       - Link to ledger/dealer if ledgerguid is provided
 *     tags: [Tally Outstanding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - cmpcode
 *                   - ledgerguid
 *                   - vchguid
 *                   - outstandingAmount
 *                 properties:
 *                   cmpcode:
 *                     type: string
 *                     example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   ledgerguid:
 *                     type: string
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                     description: Ledger GUID (dealer GUID)
 *                   vchguid:
 *                     type: string
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                     description: Voucher GUID
 *                   vchnumber:
 *                     type: string
 *                     example: "INV-2024-001"
 *                   vchdate:
 *                     type: string
 *                     format: date
 *                     example: "2024-12-30"
 *                   totalAmount:
 *                     type: number
 *                     example: 59000
 *                     description: Total invoice amount
 *                   paidAmount:
 *                     type: number
 *                     example: 10000
 *                     description: Amount already paid
 *                   outstandingAmount:
 *                     type: number
 *                     example: 49000
 *                     description: Outstanding amount (required)
 *                   dueDate:
 *                     type: string
 *                     format: date
 *                     example: "2025-01-30"
 *                   paymentTerms:
 *                     type: string
 *                     enum: [immediate, 7_days, 15_days, 30_days, 45_days, 60_days, 90_days, custom]
 *                     example: "30_days"
 *                   paymentDays:
 *                     type: number
 *                     example: 30
 *                     description: Number of days for payment (if dueDate not provided)
 *                   status:
 *                     type: string
 *                     enum: [pending, overdue, partially_paid, paid, written_off, disputed]
 *                     example: "pending"
 *                   riskLevel:
 *                     type: string
 *                     enum: [low, medium, high, critical]
 *                     example: "low"
 *                   currency:
 *                     type: string
 *                     example: "INR"
 *                     default: "INR"
 *                   outstandingId:
 *                     type: string
 *                     example: "OUT-2024-001"
 *                     description: Custom outstanding ID (auto-generated if not provided)
 *                   tallyGUID:
 *                     type: string
 *                     example: "TALLY-OUT-001"
 *               - type: array
 *                 description: Array of outstanding entries for batch processing
 *                 items:
 *                   type: object
 *                   required:
 *                     - cmpcode
 *                     - ledgerguid
 *                     - vchguid
 *                     - outstandingAmount
 *     responses:
 *       200:
 *         description: All outstanding entries synced successfully
 *       207:
 *         description: Partial success - some entries synced, some failed
 *       400:
 *         description: All entries failed or validation error
 *       500:
 *         description: Server error
 */
tallyRoute.post('/outstanding/sync', syncOutstandingFromTally);

/**
 * @swagger
 * /api/v1/tally/outstanding/group-user:
 *   get:
 *     summary: Get outstanding entries for group user (own ledgers + child group dealers)
 *     description: >
 *       Fetches outstanding entries for a group user, including:
 *       - Outstanding from own ledgers (ledgers in user's groups)
 *       - Outstanding from child group dealers (ledgers in child users' groups)
 *       
 *       Returns grouped data by ledger with:
 *       - Ledger information
 *       - List of outstanding invoices/bills
 *       - Summary statistics (total outstanding, invoice count, overdue days)
 *       
 *       This API is specifically designed for group users to see all outstanding
 *       amounts from their own ledgers and their child group's dealers.
 *     tags: [Tally Outstanding]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *         example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group user ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Outstanding data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Outstanding data fetched successfully for group user"
 *                 data:
 *                   type: object
 *                   properties:
 *                     LEDGER_GROUPS:
 *                       type: array
 *                       description: Array of ledgers with outstanding summary (exact structure matching frontend)
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "1"
 *                           name:
 *                             type: string
 *                             example: "ABC Traders"
 *                           outstanding:
 *                             type: number
 *                             example: 330400
 *                           invoiceCount:
 *                             type: number
 *                             example: 2
 *                           overdueDays:
 *                             type: number
 *                             example: 214
 *                           lastActivity:
 *                             type: string
 *                             example: "30 May 25"
 *                     BILLS_DATA:
 *                       type: object
 *                       description: Object keyed by ledger id, containing array of bills (exact structure matching frontend)
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               example: "1"
 *                             date:
 *                               type: string
 *                               example: "26 May 25"
 *                             voucherNo:
 *                               type: string
 *                               example: "INV-001"
 *                             amount:
 *                               type: number
 *                               example: 118000
 *                             dueDate:
 *                               type: string
 *                               example: "05 Jun 25"
 *                             overdueDays:
 *                               type: number
 *                               example: 214
 *                             items:
 *                               type: string
 *                               example: "Samsung 12 laptop (10 PC)"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalLedgers:
 *                           type: number
 *                         totalOutstanding:
 *                           type: number
 *                         totalInvoices:
 *                           type: number
 *             example:
 *               success: true
 *               message: "Outstanding data fetched successfully for group user"
 *               data:
 *                 LEDGER_GROUPS:
 *                   - id: "1"
 *                     name: "ABC Traders"
 *                     outstanding: 330400
 *                     invoiceCount: 2
 *                     overdueDays: 214
 *                     lastActivity: "30 May 25"
 *                 BILLS_DATA:
 *                   "1":
 *                     - id: "1"
 *                       date: "26 May 25"
 *                       voucherNo: "INV-001"
 *                       amount: 118000
 *                       dueDate: "05 Jun 25"
 *                       overdueDays: 214
 *                       items: "Samsung 12 laptop (10 PC)"
 *                     - id: "2"
 *                       date: "30 May 25"
 *                       voucherNo: "INV-003"
 *                       amount: 212400
 *                       dueDate: "09 Jun 25"
 *                       overdueDays: 210
 *                       items: "Lenovo Tab M10 FHD Plus (4 PC)"
 *                 summary:
 *                   totalLedgers: 1
 *                   totalOutstanding: 330400
 *                   totalInvoices: 2
 *       400:
 *         description: Bad request - Missing required parameters
 *       404:
 *         description: Company or User not found
 *       500:
 *         description: Server error
 */
tallyRoute.get('/outstanding/group-user', getOutstandingForGroupUser);

/**
 * @swagger
 * /api/v1/tally/outstanding/{outstandingId}/details:
 *   get:
 *     summary: Get outstanding details with complete invoice/voucher information (Combined API)
 *     description: >
 *       Fetches outstanding entry details along with complete invoice/voucher information including:
 *       - Outstanding entry details (amount, due date, status, etc.)
 *       - Complete voucher information
 *       - All ledger entries for the voucher
 *       - All inventory entries for the voucher
 *       
 *       This API is designed to show full details when a user clicks on an outstanding entry.
 *       Can be called with either outstandingId or vchguid (voucher GUID) as query parameter.
 *     tags: [Tally Outstanding]
 *     parameters:
 *       - in: path
 *         name: outstandingId
 *         required: false
 *         schema:
 *           type: string
 *         description: Outstanding entry ID (optional if vchguid is provided)
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *         example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *       - in: query
 *         name: vchguid
 *         required: false
 *         schema:
 *           type: string
 *         description: Voucher GUID (alternative to outstandingId)
 *         example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *     responses:
 *       200:
 *         description: Outstanding details with invoice information fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Outstanding details with invoice information fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     outstanding:
 *                       type: object
 *                       description: Outstanding entry details
 *                       properties:
 *                         _id:
 *                           type: string
 *                         outstandingId:
 *                           type: string
 *                         partyName:
 *                           type: string
 *                         partyType:
 *                           type: string
 *                         totalAmount:
 *                           type: number
 *                         paidAmount:
 *                           type: number
 *                         outstandingAmount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         paymentTerms:
 *                           type: string
 *                         dueDate:
 *                           type: string
 *                           format: date
 *                         status:
 *                           type: string
 *                         daysOverdue:
 *                           type: number
 *                         riskLevel:
 *                           type: string
 *                         vchguid:
 *                           type: string
 *                         vchnumber:
 *                           type: string
 *                         vchdate:
 *                           type: string
 *                           format: date
 *                     voucher:
 *                       type: object
 *                       description: Complete voucher information
 *                     ledgerEntries:
 *                       type: object
 *                       description: Ledger entries for the voucher
 *                       properties:
 *                         entries:
 *                           type: array
 *                         summary:
 *                           type: object
 *                     inventoryEntries:
 *                       type: object
 *                       description: Inventory entries for the voucher
 *                       properties:
 *                         entries:
 *                           type: array
 *                         summary:
 *                           type: object
 *             example:
 *               success: true
 *               message: "Outstanding details with invoice information fetched successfully"
 *               data:
 *                 outstanding:
 *                   _id: "507f1f77bcf86cd799439011"
 *                   outstandingId: "OUT-2024-001"
 *                   partyName: "ABC Traders"
 *                   totalAmount: 59000
 *                   paidAmount: 10000
 *                   outstandingAmount: 49000
 *                   dueDate: "2025-01-30"
 *                   status: "overdue"
 *                   daysOverdue: 214
 *                   vchnumber: "INV-2024-001"
 *                 voucher:
 *                   vchnumber: "INV-2024-001"
 *                   vchamount: 59000
 *                 ledgerEntries:
 *                   entries: []
 *                   summary:
 *                     totalEntries: 0
 *                 inventoryEntries:
 *                   entries: []
 *                   summary:
 *                     totalEntries: 0
 *       400:
 *         description: Bad request - Missing required parameters
 *       404:
 *         description: Outstanding entry or voucher not found
 *       500:
 *         description: Server error
 */
tallyRoute.get('/outstanding/:outstandingId/details', getOutstandingWithDetails);

// ===================== SALES APIS =====================

/**
 * @swagger
 * /api/v1/tally/sales/sync:
 *   post:
 *     summary: Sync sales data from Tally ERP
 *     description: >
 *       Creates or updates sales entries from Tally ERP.
 *       Sales are linked to vouchers, ledgers (dealers), and inventory entries.
 *       
 *       Accepts single or bulk sales data. Each sale entry must include:
 *       - Voucher information (vchguid, vchnumber, vchdate)
 *       - Ledger information (ledgerguid)
 *       - Item information (itemguid, quantity, rate, amount)
 *       
 *       The API will automatically link to existing vouchers, ledgers, and inventory entries.
 *     tags: [Tally Sales]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   cmpcode:
 *                     type: string
 *                     description: Company code
 *                     example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   vchguid:
 *                     type: string
 *                     description: Voucher GUID from Tally
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                   vchnumber:
 *                     type: string
 *                     description: Voucher number
 *                     example: "INV-2024-001"
 *                   vchdate:
 *                     type: string
 *                     format: date
 *                     description: Voucher date
 *                     example: "2024-12-30"
 *                   vchtype:
 *                     type: string
 *                     description: Voucher type
 *                     example: "Sales"
 *                   ledgerguid:
 *                     type: string
 *                     description: Ledger GUID (dealer/party)
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                   ledgername:
 *                     type: string
 *                     description: Ledger name
 *                     example: "ABC Traders"
 *                   ledgeraddress:
 *                     type: string
 *                     description: Ledger address
 *                     example: "123 Main Street"
 *                   ledgermobile:
 *                     type: string
 *                     description: Ledger mobile
 *                     example: "9876543210"
 *                   ledgeremail:
 *                     type: string
 *                     description: Ledger email
 *                     example: "abc@traders.com"
 *                   itemguid:
 *                     type: string
 *                     description: Item GUID from Tally
 *                     example: "ITEM-001"
 *                   itemname:
 *                     type: string
 *                     description: Item name
 *                     example: "Samsung 12 Laptop"
 *                   itemsku:
 *                     type: string
 *                     description: Item SKU
 *                     example: "SAM-LP-12"
 *                   itemcategory:
 *                     type: string
 *                     description: Item category
 *                     example: "Laptops"
 *                   quantity:
 *                     type: number
 *                     description: Quantity sold
 *                     example: 10
 *                   unit:
 *                     type: string
 *                     description: Unit of measurement
 *                     example: "PCS"
 *                   rate:
 *                     type: number
 *                     description: Rate per unit
 *                     example: 55000
 *                   discount:
 *                     type: number
 *                     description: Discount amount
 *                     example: 0
 *                   amount:
 *                     type: number
 *                     description: Total amount
 *                     example: 550000
 *                   paymentMode:
 *                     type: string
 *                     enum: [Cash, Credit, UPI, "Bank Transfer", Cheque, Other]
 *                     description: Payment mode
 *                     example: "Credit"
 *                   paymentTerms:
 *                     type: string
 *                     description: Payment terms
 *                     example: "Net 30 Days"
 *                   status:
 *                     type: string
 *                     enum: [Completed, Pending, Cancelled, Returned]
 *                     description: Sale status
 *                     example: "Completed"
 *                   description:
 *                     type: string
 *                     description: Additional description
 *                   remarks:
 *                     type: string
 *                     description: Remarks
 *               - type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                     vchguid:
 *                       type: string
 *                     ledgerguid:
 *                       type: string
 *                     itemguid:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     rate:
 *                       type: number
 *                     amount:
 *                       type: number
 *           examples:
 *             single:
 *               summary: Single sale entry
 *               value:
 *                 cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 vchnumber: "INV-2024-001"
 *                 vchdate: "2024-12-30"
 *                 vchtype: "Sales"
 *                 ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                 ledgername: "ABC Traders"
 *                 ledgeraddress: "123 Main Street"
 *                 itemguid: "ITEM-001"
 *                 itemname: "Samsung 12 Laptop"
 *                 itemsku: "SAM-LP-12"
 *                 itemcategory: "Laptops"
 *                 quantity: 10
 *                 unit: "PCS"
 *                 rate: 55000
 *                 discount: 0
 *                 amount: 550000
 *                 paymentMode: "Credit"
 *                 status: "Completed"
 *             bulk:
 *               summary: Bulk sales entries
 *               value:
 *                 - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                   ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                   itemguid: "ITEM-001"
 *                   quantity: 10
 *                   rate: 55000
 *                   amount: 550000
 *                 - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                   ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                   itemguid: "ITEM-002"
 *                   quantity: 5
 *                   rate: 20000
 *                   amount: 100000
 *     responses:
 *       200:
 *         description: Sales synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Sales sync completed: 2 succeeded, 0 failed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                       example: 2
 *                     success:
 *                       type: number
 *                       example: 2
 *                     failed:
 *                       type: number
 *                       example: 0
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request - Missing required fields
 *       500:
 *         description: Server error
 */
tallyRoute.post('/sales/sync', syncSalesFromTally);

/**
 * @swagger
 * /api/v1/tally/sales/group-user:
 *   get:
 *     summary: Get sales summary for group user (own dealers + child group dealers)
 *     description: >
 *       Fetches sales summary for a group user, including:
 *       - Sales from own ledgers (ledgers in user's groups)
 *       - Sales from child group dealers (ledgers in child users' groups)
 *       - Sales from directly assigned dealers (admin assigned)
 *       - Sales from user-created dealers
 *       
 *       Returns sales data grouped by item/product with:
 *       - Sales summary (total quantity, amount, average rate, transaction count)
 *       - Transaction register (detailed transaction list for each item)
 *       - Summary statistics (total sales, revenue, transactions)
 *       
 *       This API is specifically designed for group users to see all sales
 *       from their own ledgers and their child group's dealers.
 *     tags: [Tally Sales]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *         example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group user ID
 *         example: "6953690d639894a69a953327"
 *     responses:
 *       200:
 *         description: Sales summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     SALES_SUMMARY:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "ITEM-001"
 *                           stockName:
 *                             type: string
 *                             example: "Samsung 12 Laptop"
 *                           sku:
 *                             type: string
 *                             example: "SAM-LP-12"
 *                           category:
 *                             type: string
 *                             example: "Laptops"
 *                           totalQuantitySold:
 *                             type: number
 *                             example: 40
 *                           totalAmount:
 *                             type: number
 *                             example: 2200000
 *                           averageRate:
 *                             type: number
 *                             example: 55000
 *                           transactionCount:
 *                             type: number
 *                             example: 2
 *                           lastSaleDate:
 *                             type: string
 *                             example: "02 Jan 26"
 *                           trend:
 *                             type: string
 *                             example: "up"
 *                           status:
 *                             type: string
 *                             enum: [Top Seller, Good, Slow Mover]
 *                             example: "Top Seller"
 *                     TRANSACTION_REGISTER:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               example: "TXN-001"
 *                             date:
 *                               type: string
 *                               example: "02 Jan 26"
 *                             subDealer:
 *                               type: string
 *                               example: "Sharma Electronics"
 *                             location:
 *                               type: string
 *                               example: "Delhi NCR"
 *                             quantity:
 *                               type: number
 *                               example: 15
 *                             rate:
 *                               type: number
 *                               example: 55000
 *                             amount:
 *                               type: number
 *                               example: 825000
 *                             status:
 *                               type: string
 *                               example: "Completed"
 *                             invoiceNo:
 *                               type: string
 *                               example: "INV-2026-001"
 *                             paymentMode:
 *                               type: string
 *                               example: "Credit"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalSales:
 *                           type: number
 *                           example: 400
 *                         totalRevenue:
 *                           type: number
 *                           example: 22000000
 *                         totalTransactions:
 *                           type: number
 *                           example: 10
 *       400:
 *         description: Bad request - Missing required parameters
 *       404:
 *         description: Company or user not found
 *       500:
 *         description: Server error
 */
tallyRoute.get('/sales/group-user', getSalesSummaryForGroupUser);

// ===================== STOCK APIS =====================

/**
 * @swagger
 * /api/v1/tally/stock/sync:
 *   post:
 *     summary: Sync stock data from Tally ERP
 *     description: >
 *       Creates or updates product stock levels from Tally ERP.
 *       Stock is linked to products (Product model) using itemguid.
 *       
 *       Accepts single or bulk stock data. Each stock entry must include:
 *       - Company information (cmpcode, companyguid)
 *       - Item information (itemguid, itemname, itemsku, itemcategory)
 *       - Stock levels (currentStock, openingBalance)
 *       - Pricing (stdSaleRate, stdPurcRate)
 *       
 *       The API will automatically create or update products based on itemguid.
 *     tags: [Tally Stock]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   companyguid:
 *                     type: string
 *                     description: Company GUID from Tally
 *                     example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc"
 *                   cmpcode:
 *                     type: string
 *                     description: Company code
 *                     example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   itemguid:
 *                     type: string
 *                     required: true
 *                     description: Item GUID from Tally
 *                     example: "ITEM-001"
 *                   itemname:
 *                     type: string
 *                     description: Item name
 *                     example: "Samsung 12 Laptop"
 *                   itemsku:
 *                     type: string
 *                     description: Item SKU
 *                     example: "SAM-LP-12"
 *                   itemcategory:
 *                     type: string
 *                     description: Item category
 *                     example: "Laptops"
 *                   currentStock:
 *                     type: number
 *                     description: Current stock quantity
 *                     example: 45
 *                   openingBalance:
 *                     type: number
 *                     description: Opening balance
 *                     example: 50
 *                   stdSaleRate:
 *                     type: number
 *                     description: Standard sale rate
 *                     example: 55000
 *                   stdPurcRate:
 *                     type: number
 *                     description: Standard purchase rate
 *                     example: 50000
 *                   itemHsn:
 *                     type: string
 *                     description: HSN code
 *                     example: "8471"
 *                   itemHsnDesc:
 *                     type: string
 *                     description: HSN description
 *                     example: "Portable automatic data processing machines"
 *               - type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                     itemguid:
 *                       type: string
 *                     currentStock:
 *                       type: number
 *           examples:
 *             single:
 *               summary: Single stock entry
 *               value:
 *                 companyguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc"
 *                 cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 itemguid: "ITEM-001"
 *                 itemname: "Samsung 12 Laptop"
 *                 itemsku: "SAM-LP-12"
 *                 itemcategory: "Laptops"
 *                 currentStock: 45
 *                 openingBalance: 50
 *                 stdSaleRate: 55000
 *                 stdPurcRate: 50000
 *             bulk:
 *               summary: Bulk stock entries
 *               value:
 *                 - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   itemguid: "ITEM-001"
 *                   itemname: "Samsung 12 Laptop"
 *                   currentStock: 45
 *                 - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                   itemguid: "ITEM-002"
 *                   itemname: "Lenovo Tab M10"
 *                   currentStock: 5
 *     responses:
 *       200:
 *         description: Stock synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Stock synchronization complete"
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       success:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                       productId:
 *                         type: string
 *                       itemguid:
 *                         type: string
 *       400:
 *         description: Bad request - Missing required fields
 *       500:
 *         description: Server error
 */
tallyRoute.post('/stock/sync', syncStockFromTally);

/**
 * @swagger
 * /api/v1/tally/stock/group-user:
 *   get:
 *     summary: Get stock summary for group user (all products in company)
 *     description: >
 *       Fetches stock summary for a group user, including:
 *       - All products in the company (not filtered by ledgers - all products)
 *       - Current stock levels (inHand)
 *       - Total quantity sold to sub-dealers (subDealerSold)
 *       - Last sale date
 *       - Stock status (Healthy, Low Stock, Out of Stock, Overstocked, Fast Mover)
 *       - Sales register (detailed transaction list for each product)
 *       - Summary statistics (total sales, total stock, low stock count)
 *       
 *       This API shows all products in the company, regardless of which ledger
 *       they are associated with. It's designed for group users to see overall
 *       stock levels and sales performance across all products.
 *     tags: [Tally Stock]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *         example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *     responses:
 *       200:
 *         description: Stock summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     STOCK_SUMMARY:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "ITEM-001"
 *                           productName:
 *                             type: string
 *                             example: "Samsung 12 Laptop"
 *                           sku:
 *                             type: string
 *                             example: "SAM-LP-12"
 *                           category:
 *                             type: string
 *                             example: "Laptops"
 *                           inHand:
 *                             type: number
 *                             description: Current stock available
 *                             example: 45
 *                           subDealerSold:
 *                             type: number
 *                             description: Total quantity sold to sub-dealers
 *                             example: 120
 *                           lastSaleDate:
 *                             type: string
 *                             example: "02 Jan 26"
 *                           trend:
 *                             type: string
 *                             enum: [up, down]
 *                             example: "up"
 *                           status:
 *                             type: string
 *                             enum: [Healthy, "Low Stock", "Out of Stock", Overstocked, "Fast Mover"]
 *                             example: "Healthy"
 *                     SALES_REGISTER:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               example: "SR-001"
 *                             date:
 *                               type: string
 *                               example: "02 Jan 26"
 *                             subDealer:
 *                               type: string
 *                               example: "Sharma Electronics"
 *                             location:
 *                               type: string
 *                               example: "Delhi NCR"
 *                             quantity:
 *                               type: number
 *                               example: 15
 *                             amount:
 *                               type: string
 *                               example: "₹ 8,25,000"
 *                             status:
 *                               type: string
 *                               example: "Delivered"
 *                             invoiceNo:
 *                               type: string
 *                               example: "INV-2026-001"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalSales:
 *                           type: number
 *                           example: 500
 *                         totalStock:
 *                           type: number
 *                           example: 282
 *                         lowStockCount:
 *                           type: number
 *                           example: 2
 *       400:
 *         description: Bad request - Missing required parameters
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
tallyRoute.get('/stock/group-user', getStockSummaryForGroupUser);

// ===================== DISPATCH APIS =====================

/**
 * @swagger
 * /api/v1/tally/dispatch/sync:
 *   post:
 *     summary: Sync order dispatch status from Tally
 *     description: Creates or updates dispatch records sent from Tally. Supports single object or batch array.
 *     tags: [Tally Dispatch]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [cmpcode, orderguid, dispatchStatus]
 *                 properties:
 *                   cmpcode:
 *                     type: string
 *                     example: ROYAL01
 *                   orderguid:
 *                     type: string
 *                     example: ORDER-GUID-001
 *                   orderNumber:
 *                     type: string
 *                     example: SO-2026-001
 *                   orderDate:
 *                     type: string
 *                     format: date
 *                     example: "2026-01-02"
 *                   ledgerguid:
 *                     type: string
 *                     example: LEDGER-GUID-001
 *                   partyName:
 *                     type: string
 *                     example: Raj Traders
 *                   totalAmount:
 *                     type: number
 *                     example: 59000
 *                   dispatchStatus:
 *                     type: string
 *                     enum: [pending, fully_dispatched]
 *                   items:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         itemName:
 *                           type: string
 *                         hsnCode:
 *                           type: string
 *                         unit:
 *                           type: string
 *                         orderedQty:
 *                           type: number
 *                         dispatchedQty:
 *                           type: number
 *                         pendingQty:
 *                           type: number
 *                         rate:
 *                           type: number
 *                         amount:
 *                           type: number
 *               - type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: All dispatch records synced successfully
 *       207:
 *         description: Partial success
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
tallyRoute.post('/dispatch/sync', syncDispatchFromTally);

/**
 * @swagger
 * /api/v1/tally/dispatch/group-user:
 *   get:
 *     summary: Get dispatch records for a group user
 *     tags: [Tally Dispatch]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: dispatchStatus
 *         schema:
 *           type: string
 *           enum: [pending, fully_dispatched]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Dispatch records fetched successfully
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Server error
 */
tallyRoute.get('/dispatch/group-user', getDispatchForGroupUser);

/**
 * @swagger
 * /api/v1/tally/dispatch/admin:
 *   get:
 *     summary: Get all dispatch records for admin
 *     tags: [Tally Dispatch]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: ledgerguid
 *         schema:
 *           type: string
 *       - in: query
 *         name: dispatchStatus
 *         schema:
 *           type: string
 *           enum: [pending, fully_dispatched]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Dispatch records fetched successfully
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Server error
 */
tallyRoute.get('/dispatch/admin', getDispatchForAdmin);

// ===================== PRICE LIST APIS =====================

/**
 * @swagger
 * /api/v1/tally/pricelists:
 *   post:
 *     summary: Sync price list entries from Tally
 *     description: >
 *       Accepts price list data pushed from Tally ERP (JSON or XML).
 *       Upserts each entry keyed on cmpcode + itemguid + plname.
 *       Accepts a single entry or an array.
 *     tags: [Tally Price Lists]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *               - type: array
 *                 items:
 *                   type: object
 *             properties:
 *               companyGuid:
 *                 type: string
 *                 description: Company GUID
 *               cmpcode:
 *                 type: string
 *               itemguid:
 *                 type: string
 *               itemname:
 *                 type: string
 *               plname:
 *                 type: string
 *                 description: Price list name (e.g. "Dealer Rate")
 *               pldate:
 *                 type: string
 *                 format: date
 *               plrate:
 *                 type: number
 *               other1:
 *                 type: string
 *               other2:
 *                 type: string
 *     responses:
 *       200:
 *         description: All entries synced successfully
 *       207:
 *         description: Partial success
 *       400:
 *         description: Validation error or bad payload
 *       500:
 *         description: Server error
 */
tallyRoute.post('/pricelists', upsertPriceListFromTally);

export default tallyRoute;

