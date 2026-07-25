import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import adminRoute from './routes/adminRoute.js'
import authRoute from './routes/authRoute.js'
import userRoute from './routes/userRoute.js'
import orderRoute from './routes/orderRoute.js'
import approvalRoute from './routes/approvalRoute.js'
import productRoute from './routes/productRoute.js'
import targetRoute from './routes/targetRoute.js'
import outstandingRoute from './routes/outstandingRoute.js'
import ledgerRoute from './routes/ledgerRoute.js'
import stockRoute from './routes/stockRoute.js'
import zonalRoute from './routes/zonalRoute.js'
import rsmRoute from './routes/rsmRoute.js'
import asmRoute from './routes/asmRoute.js'
import dealerTeamRoute from './routes/dealerTeamRoute.js'
import uploadRoute from './routes/uploadRoute.js'
import path from 'path'
import { fileURLToPath } from 'url';
import { superAdminRoute } from './routes/superAdminRoute.js'
import { specs, swaggerUi } from './config/swagger.js'
import tallyRoute from './routes/tally/tallyRoute.js'
import maintenanceRoute from './routes/maintenanceRoute.js'
import priceListRoute from './routes/priceListRoute.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express()
app.use(
    morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      skip: function (req, res) {
        return res.statusCode === 304 || req.path === '/health'; // Skip logging for 304 responses and health checks
      },
    })
  );

const jsonBodyParser = express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf
  },
  type: (req) => !req.originalUrl.startsWith('/api/v1/tally')
})

const tallyBodyParser = express.text({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf
  },
  type: (req) => req.originalUrl.startsWith('/api/v1/tally')
})

app.use(jsonBodyParser)
app.use(tallyBodyParser)

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
    crossOriginOpenerPolicy: process.env.NODE_ENV === 'production'
  }));


 
  app.use(cors());  

   // Health check endpoint
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Swagger documentation
  app.use('/api/v1/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Royal App API Documentation'
  }));

  app.use('/api/v1/auth', authRoute)
  app.use('/api/v1/admin', adminRoute)
  app.use('/api/v1/user', userRoute)
  app.use('/api/v1/orders', orderRoute)
  app.use('/api/v1/approvals', approvalRoute)
  app.use('/api/v1/products', productRoute)
  app.use('/api/v1/targets', targetRoute)
  app.use('/api/v1/outstanding', outstandingRoute)
app.use('/api/v1/ledger', ledgerRoute)
app.use('/api/v1/stock', stockRoute)
app.use('/api/v1/zonal', zonalRoute)
app.use('/api/v1/rsm', rsmRoute)
app.use('/api/v1/asm', asmRoute)
app.use('/api/v1/dealer', dealerTeamRoute)
app.use('/api/v1/tally', tallyRoute)
app.use('/api/v1/pricelists', priceListRoute)
app.use('/api/v1/maintenance', maintenanceRoute)
app.use('/api/v1/upload', uploadRoute)
  app.use('/api/v1/superadmin', superAdminRoute)
  //404 handler for unmatched routes
  app.use((req, res) => {
    res.status(404).json({ 
      status: 'error',
      message: 'Route not found'
    });
  });  

export {app} 
   