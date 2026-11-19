import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { config } from './backend/config/index.js';
import { connectDB } from './backend/config/db.js';
import { seedDatabase } from './backend/scripts/seed.js';

import authRoutes from './backend/routes/authRoutes.js';
import userRoutes from './backend/routes/userRoutes.js';
import propertyRoutes from './backend/routes/propertyRoutes.js';
import roomRoutes from './backend/routes/roomRoutes.js';
import assignmentRoutes from './backend/routes/assignmentRoutes.js';
import rentRoutes from './backend/routes/rentRoutes.js';
import paymentRoutes from './backend/routes/paymentRoutes.js';
import complaintRoutes from './backend/routes/complaintRoutes.js';
import analyticsRoutes from './backend/routes/analyticsRoutes.js';
import { errorHandler } from './backend/middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = process.env.PORT || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Database Connection & Initial Seeding
  await connectDB();
  await seedDatabase();

  // 2. Security Middleware
  // Helmet configured to allow AI Studio iframe embedding
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Rate Limiting on API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      forwardedHeader: false,
    },
    message: {
      success: false,
      message: 'Too many requests from this IP. Please try again later.',
    },
  });
  app.use('/api', apiLimiter);

  // Body Parsing & Cookies
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Health check
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      app: 'RentWise',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // 3. API Routes Mounting
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/assignments', assignmentRoutes);
  app.use('/api/rent-records', rentRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // Central Error Handler for API
  app.use('/api', errorHandler);

  // 4. Vite Dev Middleware / Static Client Delivery
  // Create the HTTP server up-front so Vite's HMR WebSocket can attach to the
  // SAME port (3000) instead of spawning a separate one (e.g. 24678).
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Attach Vite's HMR WebSocket to the same HTTP server (no separate port)
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  // Fallback error handler
  app.use(errorHandler);

  // Friendly, actionable error if the port is already taken
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('');
      console.error('================================================================');
      console.error(`  Port ${PORT} is already in use!`);
      console.error('');
      console.error('  Another server is currently running on this port.');
      console.error('  Options:');
      console.error(`    1. Stop the other server, then run "npm run dev" again.`);
      console.error(`    2. Find what is using it with:`);
      console.error(`         netstat -ano | findstr :${PORT}`);
      console.error(`       Then kill that process (replace <PID>):`);
      console.error(`         taskkill /PID <PID> /F`);
      console.error(`    3. Run on a different port with:`);
      console.error(`         $env:PORT='3001'; npm run dev`);
      console.error('================================================================');
      console.error('');
    } else {
      console.error('[RentWise] Server error:', err);
    }
    process.exit(1);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[RentWise] Server running at http://localhost:${PORT}`);
    console.log(`[RentWise] Open in your browser: http://localhost:${PORT}`);
    console.log(`[RentWise] Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown so Ctrl+C never leaves zombie processes holding the port
  const shutdown = (signal) => {
    console.log(`\n[RentWise] ${signal} received. Shutting down gracefully...`);
    try {
      if (httpServer.listening) {
        httpServer.close(() => {
          console.log('[RentWise] HTTP server closed.');
          process.exit(0);
        });
        // Safety net: force-exit if close hangs
        setTimeout(() => process.exit(0), 3000).unref();
      } else {
        process.exit(0);
      }
    } catch (err) {
      console.error('[RentWise] Error during shutdown:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('[RentWise] Fatal error starting server:', err);
  process.exit(1);
});
