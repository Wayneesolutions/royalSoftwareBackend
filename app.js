import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import adminRoute from './routes/adminRoute.js'
import path from 'path'
import { fileURLToPath } from 'url';
import { superAdminRoute } from './routes/superAdminRoute.js'
import { tallyRoute } from './routes/tally/tallyRoute.js'

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

app.use(
  express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf
    } // Store raw body for webhooks
  })
)

app.use(express.json({ 
    limit: "50mb",
    verify: (req, res, buf) => { req.rawBody = buf } // Store raw body for webhooks
  }));

  // Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
    crossOriginOpenerPolicy: process.env.NODE_ENV === 'production'
  }));


 
  app.use(cors());  

   // Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });


  app.use('/api/v1/admin',adminRoute)

  app.use('/api/v1/superadmin',superAdminRoute)
  
  app.use('/api/v1/tally',tallyRoute)
  //404 handler for unmatched routes
  app.use((req, res) => {
    res.status(404).json({ 
      status: 'error',
      message: 'Route not found'
    });
  });  

export {app} 
   