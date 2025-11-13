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
                  type: 'string',
                  description: 'Parent user ID in hierarchy'
                }
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
              type: 'number',
              description: 'Tally GUID for synchronization'
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
            },
            createdBy: {
              type: 'string',
              description: 'ID of the user who created the company'
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
          required: ['companyGuid', 'productCode', 'productName', 'price'],
          properties: {
            companyGuid: {
              type: 'string',
              description: 'GUID of the company in Tally'
            },
            productCode: {
              type: 'string',
              description: 'Unique product code'
            },
            productName: {
              type: 'string',
              description: 'Product name'
            },
            description: {
              type: 'string',
              description: 'Product description'
            },
            category: {
              type: 'string',
              description: 'Product category'
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
              description: 'Unit price of the product'
            },
            stock: {
              type: 'number',
              description: 'Current stock quantity'
            },
            gstRate: {
              type: 'number',
              description: 'GST rate for the product'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the product is active'
            },
            createdBy: {
              type: 'string',
              description: 'User ID to attribute creation to'
            }
          }
        },
        TallyUserPayload: {
          type: 'object',
          required: ['companyGuid', 'name', 'mobile', 'role', 'password'],
          properties: {
            companyGuid: {
              type: 'string',
              description: 'GUID of the company in Tally'
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
            },
            assignedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Assignment timestamp',
              example: null
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
          properties: {
            _id: { type: 'string' },
            productCode: { type: 'string' },
            productName: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            subCategory: { type: 'string' },
            brand: { type: 'string' },
            price: { type: 'number' },
            stock: { type: 'number' },
            gstRate: { type: 'number' },
            isActive: { type: 'boolean' },
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
