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
    ]
  },
  apis: ['./routes/*.js', './controllres/*.js']
};

const specs = swaggerJsdoc(options);

export { specs, swaggerUi };
