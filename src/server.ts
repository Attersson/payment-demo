import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import paymentRoutes from '../api/routes/paymentRoutes';
import subscriptionRoutes from '../api/routes/subscriptionRoutes';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Configure Helmet with custom Content Security Policy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https://api.stripe.com"],
        frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"]
      }
    }
  })
);

app.use(morgan('dev'));

// Serve static files from client/src directory
app.use(express.static(path.join(__dirname, '../client/src')));

// Root route to serve the HTML file
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../client/src/index.html'));
});

// API Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Handle Stripe webhook route separately to access raw body
// The Stripe webhook will be handled in the paymentRoutes
// NOTE: This route should be defined before the general JSON body parser

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Server UI available at http://localhost:${port}`);
});

export default app; 