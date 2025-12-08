import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Royal App API',
      version: '1.0.0',
      description: 'Hierarchy-based sales management system with Tally integration',
      contact: {
        name: 'Royal Software',
        email: 'support@royalsoftware.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://royalapp.wayneesolutions.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'User ID'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            name: {
              type: 'string',
              description: 'User full name'
            },
            mobile: {
              type: 'string',
              description: 'User mobile number'
            },
            role: {
              type: 'string',
              enum: ['superadmin', 'admin', 'dealers', 'subdealer', 'asm', 'rsm', 'distibutors', 'suppliers', 'salesman', 'zonal'],
              description: 'User role in the hierarchy'
            },
            companies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  companyId: {
                    type: 'string',
                    description: 'Company ID'
                  },
                  role: {
                    type: 'string',
                    description: 'Role within the company'
                  },
                  isActive: {
                    type: 'boolean',
                    description: 'Whether the user is active in this company'
                  }
                }
              }
            },
            hierarchy: {
              type: 'object',
              properties: {
                parentUser: {
                  oneOf: [
                    { type: 'string', description: 'Parent user ID' },
                    { 
                      type: 'object',
                      description: 'Populated parent user object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' },
                        role: { type: 'string' },
                        mobile: { type: 'string' }
                      }
                    }
                  ],
                  nullable: true,
                  description: 'Parent user in hierarchy'
                },
                level: {
                  type: 'number',
                  nullable: true,
                  description: 'Hierarchy level'
                }
              }
            },
            groups: {
              type: 'array',
              description: 'Array of groups assigned to the user. Empty array if no group assigned.',
              items: {
                type: 'object',
                properties: {
                  groupId: {
                    oneOf: [
                      { type: 'string' },
                      {
                        type: 'object',
                        properties: {
                          _id: { type: 'string' },
                          GroupGUID: { type: 'string' },
                          GroupName: { type: 'string' },
                          GroupParent: { type: 'string', nullable: true },
                          cmpcode: { type: 'string' },
                          Remarks: { type: 'string' },
                          other1: { type: 'string' },
                          other2: { type: 'string' },
                          other3: { type: 'string' },
                          other4: { type: 'string' }
                        }
                      }
                    ]
                  },
                  groupGUID: { type: 'string' },
                  GroupGUID: { type: 'string' },
                  GroupName: { type: 'string' },
                  GroupParent: { type: 'string', nullable: true },
                  cmpcode: { type: 'string' },
                  Remarks: { type: 'string' },
                  Other1: { type: 'string' },
                  Other2: { type: 'string' },
                  Other3: { type: 'string' },
                  Other4: { type: 'string' },
                  isActive: { type: 'boolean' },
                  assignedBy: { type: 'string' },
                  assignedAt: { type: 'string', format: 'date-time' }
                }
              }
            },
            primaryGroup: {
              type: 'object',
              nullable: true,
              description: 'Primary/default group for quick access. null if no group assigned.',
              properties: {
                _id: { type: 'string' },
                GroupGUID: { type: 'string' },
                GroupName: { type: 'string' },
                GroupParent: { type: 'string', nullable: true },
                cmpcode: { type: 'string' },
                Remarks: { type: 'string' },
                Other1: { type: 'string' },
                Other2: { type: 'string' },
                Other3: { type: 'string' },
                Other4: { type: 'string' }
              }
            }
          }
        },
        Company: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Company ID'
            },
            companyName: {
              type: 'string',
              description: 'Company name'
            },
            companyState: {
              type: 'string',
              description: 'Company state'
            },
            companyCountry: {
              type: 'string',
              description: 'Company country'
            },
            companyMobile: {
              type: 'string',
              description: 'Company mobile number'
            },
            companyEmail: {
              type: 'string',
              format: 'email',
              description: 'Company email address'
            },
            companyCode: {
              type: 'string',
              description: 'Unique company code'
            },
            maxUser: {
              type: 'number',
              description: 'Maximum number of users allowed'
            },
            guid: {
              type: 'string',
              description: 'Tally GUID for synchronization (alphanumeric string)',
              example: 'ABC12345'
            },
            contactDetails: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  format: 'email'
                },
                phone: {
                  type: 'string'
                },
                website: {
                  type: 'string'
                }
              }
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the company is active'
            }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the request was successful'
            },
            message: {
              type: 'string',
              description: 'Response message'
            },
            data: {
              type: 'object',
              description: 'Response data'
            }
          }
        },
        Group: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Group ID'
            },
            GroupGUID: {
              type: 'string',
              description: 'Unique group GUID (e.g., GRP001)',
              example: 'GRP001'
            },
            GroupName: {
              type: 'string',
              description: 'Name of the group',
              example: 'Sales Team A'
            },
            GroupParent: {
              type: 'string',
              nullable: true,
              description: 'Parent group GUID (optional)',
              example: 'GRP000'
            },
            cmpcode: {
              type: 'string',
              description: 'Company code',
              example: 'COM--001'
            },
            Remarks: {
              type: 'string',
              description: 'Remarks or notes about the group'
            },
            other1: {
              type: 'string',
              description: 'Additional field 1'
            },
            other2: {
              type: 'string',
              description: 'Additional field 2'
            },
            other3: {
              type: 'string',
              description: 'Additional field 3'
            },
            other4: {
              type: 'string',
              description: 'Additional field 4'
            },
            companyId: {
              type: 'string',
              description: 'Reference to Company model'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the group is active',
              default: true
            },
            tallySyncStatus: {
              type: 'string',
              enum: ['pending', 'synced', 'failed'],
              description: 'Tally synchronization status',
              default: 'pending'
            },
            tallySyncAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last Tally synchronization timestamp'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Group creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Group last update timestamp'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Auth',
        description: 'Authentication and session management endpoints'
      },
      {
        name: 'Users',
        description: 'User management endpoints'
      },
      {
        name: 'Orders',
        description: 'Order lifecycle and reporting'
      },
      {
        name: 'Products',
        description: 'Product catalogue management'
      },
      {
        name: 'Admin',
        description: 'Admin-specific actions and dashboards'
      },
      {
        name: 'Tally',
        description: 'Endpoints for integrating with Tally ERP'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        TallyProductPayload: {
          type: 'object',
          required: ['companyGuid', 'productCode', 'productName'],
          description: 'Product payload from Tally ERP. Supports all Stockitem Master fields. Can be sent as a single object or as part of an array for batch processing.',
          example: {
            companyGuid: 'ABC12345',
            productCode: 'PROD001',
            productName: 'Sample Product',
            Name: 'Sample Product',
            PArtno: 'PART001',
            ItemAlias: 'Sample Alias',
            Description: 'Product description',
            Category: 'Electronics',
            Baseunits: 'PCS',
            additionalunits: 'BOX',
            Stdpurcrate: 100.50,
            StdSalerate: 150.75,
            Itemgstper: 18,
            Itemhsn: '12345678',
            Itemhsndesc: 'HSN Description',
            OPENINGBALANCE: 100,
            Itemoprate: 120.00,
            CompanyCode: 'COMP001',
            IsfinishItem: true,
            Other1: 'Custom Field 1',
            Other2: 'Custom Field 2'
          },
          properties: {
            companyGuid: {
              type: 'string',
              description: 'GUID of the company in Tally (alphanumeric string)',
              example: 'ABC12345'
            },
            // Stockitem Master Fields
            Name: {
              type: 'string',
              description: 'Product name (Stockitem Master field)',
              example: 'Product Name'
            },
            PArtno: {
              type: 'string',
              description: 'Part number (Stockitem Master field)',
              example: 'PART001'
            },
            ItemAlias: {
              type: 'string',
              description: 'Item alias (Stockitem Master field)',
              example: 'Alias Name'
            },
            Description: {
              type: 'string',
              description: 'Product description (Stockitem Master field)'
            },
            Parent: {
              type: 'string',
              description: 'Parent item (Stockitem Master field)'
            },
            Category: {
              type: 'string',
              description: 'Product category (Stockitem Master field)',
              example: 'Electronics'
            },
            Baseunits: {
              type: 'string',
              description: 'Base units (Stockitem Master field)',
              example: 'PCS'
            },
            additionalunits: {
              type: 'string',
              description: 'Additional units (Stockitem Master field)',
              example: 'BOX'
            },
            Stdpurcrate: {
              type: 'number',
              description: 'Standard purchase rate (Stockitem Master field)',
              example: 100.50
            },
            StdSalerate: {
              type: 'number',
              description: 'Standard sale rate (Stockitem Master field)',
              example: 150.75
            },
            Itemgstper: {
              type: 'number',
              description: 'Item GST percentage (Stockitem Master field)',
              example: 18
            },
            Itemhsn: {
              type: 'string',
              description: 'Item HSN code (Stockitem Master field)',
              example: '12345678'
            },
            Itemhsndesc: {
              type: 'string',
              description: 'Item HSN description (Stockitem Master field)'
            },
            OPENINGBALANCE: {
              type: 'number',
              description: 'Opening balance (Stockitem Master field)',
              example: 100
            },
            Itemoprate: {
              type: 'number',
              description: 'Item opening rate (Stockitem Master field)',
              example: 120.00
            },
            CompanyCode: {
              type: 'string',
              description: 'Company code (Stockitem Master field)'
            },
            IsfinishItem: {
              type: 'boolean',
              description: 'Is finish item (Stockitem Master field)',
              example: true
            },
            Other1: {
              type: 'string',
              description: 'Other field 1 (Stockitem Master field)'
            },
            Other2: {
              type: 'string',
              description: 'Other field 2 (Stockitem Master field)'
            },
            Other3: {
              type: 'string',
              description: 'Other field 3 (Stockitem Master field)'
            },
            Other4: {
              type: 'string',
              description: 'Other field 4 (Stockitem Master field)'
            },
            Other5: {
              type: 'string',
              description: 'Other field 5 (Stockitem Master field)'
            },
            // Legacy/Alternative field names (for backward compatibility)
            productCode: {
              type: 'string',
              description: 'Unique product code (required)',
              example: 'PROD001'
            },
            productName: {
              type: 'string',
              description: 'Product name (alternative to Name field)'
            },
            description: {
              type: 'string',
              description: 'Product description (alternative to Description field)'
            },
            category: {
              type: 'string',
              description: 'Product category (alternative to Category field)'
            },
            subCategory: {
              type: 'string',
              description: 'Product sub category'
            },
            brand: {
              type: 'string',
              description: 'Product brand'
            },
            price: {
              type: 'number',
              description: 'Unit price of the product (alternative to StdSalerate)',
              example: 150.75
            },
            stock: {
              type: 'number',
              description: 'Current stock quantity (alternative to OPENINGBALANCE)',
              example: 100
            },
            gstRate: {
              type: 'number',
              description: 'GST rate for the product (alternative to Itemgstper)',
              example: 18
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the product is active',
              default: true
            }
          }
        },
        TallyUserPayload: {
          type: 'object',
          required: ['companyGuid', 'name', 'mobile', 'role', 'password'],
          properties: {
            companyGuid: {
              type: 'string',
              description: 'GUID of the company in Tally (alphanumeric string)',
              example: 'ABC12345'
            },
            name: {
              type: 'string'
            },
            userName: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            password: {
              type: 'string',
              description: 'Initial password to assign to the user'
            },
            mobile: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: [
                'superadmin',
                'admin',
                'dealers',
                'subdealer',
                'asm',
                'rsm',
                'distibutors',
                'suppliers',
                'salesman',
                'zonal'
              ],
              description: 'User role in Royal hierarchy. Allowed values: superadmin, admin, dealers, subdealer, asm, rsm, distibutors, suppliers, salesman, zonal.',
              example: 'superadmin | admin | dealers | subdealer | asm | rsm | distibutors | suppliers | salesman | zonal'
            },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                pincode: { type: 'string' },
                country: { type: 'string' }
              }
            },
            isActive: {
              type: 'boolean'
            }
          }
        },
        TallyDealer: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Dealer identifier'
            },
            name: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            mobile: {
              type: 'string'
            },
            userName: {
              type: 'string'
            },
            isActive: {
              type: 'boolean'
            },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                pincode: { type: 'string' },
                country: { type: 'string' }
              }
            },
            assignedAt: {
              type: 'string',
              format: 'date-time'
            },
            assignmentRole: {
              type: 'string'
            },
            assignedBy: {
              type: 'string',
              description: 'User who assigned the dealer to the company'
            },
            defaultCompany: {
              type: 'boolean',
              description: 'Whether this company is the dealer’s default company'
            },
            lastUpdated: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        TallyCompany: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            companyName: { type: 'string' },
            companyCode: { type: 'string' },
            companyEmail: { type: 'string', format: 'email' },
            companyMobile: { type: 'string' },
            companyState: { type: 'string' },
            companyCountry: { type: 'string' },
            guid: { type: 'string' },
            maxUser: { type: 'number' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        TallyProduct: {
          type: 'object',
          description: 'Product response with all Stockitem Master fields',
          properties: {
            _id: { type: 'string' },
            // Stockitem Master Fields
            name: { type: 'string', description: 'Product name' },
            partNo: { type: 'string', description: 'Part number' },
            itemAlias: { type: 'string', description: 'Item alias' },
            description: { type: 'string', description: 'Product description' },
            parent: { type: 'string', description: 'Parent item' },
            category: { type: 'string', description: 'Product category' },
            baseUnits: { type: 'string', description: 'Base units' },
            additionalUnits: { type: 'string', description: 'Additional units' },
            stdPurcRate: { type: 'number', description: 'Standard purchase rate' },
            stdSaleRate: { type: 'number', description: 'Standard sale rate' },
            itemGstPer: { type: 'number', description: 'Item GST percentage' },
            itemHsn: { type: 'string', description: 'Item HSN code' },
            itemHsnDesc: { type: 'string', description: 'Item HSN description' },
            openingBalance: { type: 'number', description: 'Opening balance' },
            itemOpRate: { type: 'number', description: 'Item opening rate' },
            companyCode: { type: 'string', description: 'Company code' },
            isFinishItem: { type: 'boolean', description: 'Is finish item' },
            other1: { type: 'string', description: 'Other field 1' },
            other2: { type: 'string', description: 'Other field 2' },
            other3: { type: 'string', description: 'Other field 3' },
            other4: { type: 'string', description: 'Other field 4' },
            other5: { type: 'string', description: 'Other field 5' },
            // Legacy fields
            productCode: { type: 'string', description: 'Product code' },
            productName: { type: 'string', description: 'Product name' },
            subCategory: { type: 'string', description: 'Sub category' },
            brand: { type: 'string', description: 'Brand' },
            price: { type: 'number', description: 'Price' },
            stock: { type: 'number', description: 'Stock quantity' },
            gstRate: { type: 'number', description: 'GST rate' },
            companyId: { type: 'string', description: 'Company ID' },
            isActive: { type: 'boolean', description: 'Is active' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        TallyOrder: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            orderNumber: { type: 'string' },
            status: { type: 'string' },
            customerName: { type: 'string' },
            customerEmail: { type: 'string' },
            customerMobile: { type: 'string' },
            totalAmount: { type: 'number' },
            finalAmount: { type: 'number' },
            taxAmount: { type: 'number' },
            taxableValueTotal: { type: 'number' },
            cgstTotal: { type: 'number' },
            sgstTotal: { type: 'number' },
            igstTotal: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
  },
  apis: ['./routes/*.js', './routes/**/*.js', './controllres/*.js']
};

const specs = swaggerJsdoc(options);

export { specs, swaggerUi };
