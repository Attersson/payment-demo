# Payment Processing Integration Demo

A comprehensive learning project for implementing secure payment processing with multiple providers, subscription management, and refund capabilities.

## Overview

This project serves as a hands-on learning environment for building robust payment systems. It demonstrates best practices for handling financial transactions, implementing security measures, and creating scalable payment architectures.

## Features

- Stripe and PayPal integration
- Subscription management with UI components
- Transaction processing
- Refund handling (API)
- Refund Processing UI
- Transaction History Display
- Secure payment flow
- Comprehensive error handling
- Webhook handling for payment events
- Audit logging
- Admin dashboard
- User payment portal

## Tech Stack

### Required Technologies

- **Node.js** - Backend runtime for payment processing
- **Stripe SDK** - Primary payment processing integration
- **PayPal SDK** - Alternative payment provider integration
- **PostgreSQL** - Database for transaction records
- **Redis** - Caching and rate limiting
- **Express.js** - Web framework for API endpoints
- **TypeScript** - Type safety for the codebase

## Getting Started

### Prerequisites

- Node.js (v14+)
- PostgreSQL
- Redis
- Stripe and PayPal developer accounts

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables by copying .env.example to .env and filling in your details:
   ```
   cp .env.example .env
   ```
4. Set up the database:
   ```
   npm run db:setup
   ```
5. Run database migrations:
   ```
   npm run db:migrate:all
   ```
6. Create subscription plans in Stripe:
   ```
   npm run stripe:create-plans
   ```
7. Start the development server:
   ```
   npm run dev
   ```
8. Access the demo UI at `http://localhost:3000`

## UI Overview

The main user interface (`client/src/index.html`) provides several tabs for interacting with the payment system:

- **One-time Payment:** Initiate a single payment using Stripe or PayPal.
- **Subscription:** Create a new subscription using Stripe or PayPal (requires customer email).
- **Refund:** Process refunds for existing transactions.
  - Includes a **Recent Transactions** list that displays the latest payments recorded in the database.
  - Use the transaction ID from this list (or from the `payments` table) when processing a refund.
  - The list indicates the refunded amount for each transaction and highlights fully refunded ones.

## API Endpoints

Key API endpoints provided by the Express server (`src/server.ts`):

- **Payments:**
  - `GET /api/payments/stripe-key`: Get the Stripe publishable key.
  - `POST /api/payments/create`: Create a payment intent (Stripe) or order (PayPal).
  - `POST /api/payments/refund`: Process a refund for a given transaction ID.
  - `GET /api/payments/list`: List recent payment transactions from the database.
  - `POST /api/payments/webhooks/stripe`: Handle incoming Stripe webhooks.
  - `POST /api/payments/webhooks/paypal`: Handle incoming PayPal webhooks.
- **Customers:**
  - `POST /api/customers/create`: Create a customer record.
  - `GET /api/customers/:customerId`: Get customer details.
  - `POST /api/customers/:customerId/payment-methods`: Attach a payment method.
  - `POST /api/customers/:customerId/default-payment-method`: Set the default payment method.
  - `GET /api/customers/:customerId/subscriptions`: List customer subscriptions.
- **Subscriptions:**
  - `POST /api/subscriptions/create`: Create a new subscription.
  - `GET /api/subscriptions/:subscriptionId`: Get subscription details.
  - `POST /api/subscriptions/update`: Update a subscription.
  - `POST /api/subscriptions/cancel`: Cancel a subscription.
  - `POST /api/subscriptions/pause`: Pause a subscription.
  - `POST /api/subscriptions/resume`: Resume a subscription.
- **Prices:**
  - `GET /api/prices/lookup`: Look up a Stripe price ID by its lookup key.

### Detailed Setup Instructions

#### Environment Setup

Create the .env file with the following values:

```
# Server Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment_db
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=generate_a_secure_random_string
JWT_EXPIRES_IN=1d

# Payment Gateways
# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret

# PayPal
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox
```

#### Required Software Installation

##### Node.js
1. Download from https://nodejs.org/ (LTS version recommended)
2. Verify installation: `node -v` and `npm -v`

##### PostgreSQL
- **Windows**:
  1. Download installer from https://www.postgresql.org/download/windows/
  2. Run installer and follow prompts
  3. Set password for postgres user (use for DB_PASSWORD)
  4. After installation, create your database: 
     ```
     createdb payment_db
     ```

- **macOS**:
  ```
  brew install postgresql
  brew services start postgresql
  createdb payment_db
  ```

- **Linux (Ubuntu/Debian)**:
  ```
  sudo apt update
  sudo apt install postgresql postgresql-contrib
  sudo service postgresql start
  sudo -u postgres createdb payment_db
  ```

##### Redis
- **Windows**:
  1. Use Windows Subsystem for Linux (WSL) or
  2. Download from https://github.com/microsoftarchive/redis/releases

- **macOS**:
  ```
  brew install redis
  brew services start redis
  ```

- **Linux**:
  ```
  sudo apt update
  sudo apt install redis-server
  sudo systemctl enable redis-server
  ```

#### Database and Plan Setup

##### First-Time Database Setup

1. Initial database setup creates tables and base structure:
   ```
   npm run db:setup
   ```

2. Run all migrations in sequence to complete the schema:
   ```
   npm run db:migrate:all
   ```

   Or run specific migrations if needed:
   ```
   npm run db:migrate:webhook      # Set up webhook event tables
   npm run db:migrate:subscription # Set up subscription tables
   npm run db:migrate:plans        # Set up plan management tables
   npm run db:migrate:customers    # Set up customer tables
   ```

3. Update the database with the current Stripe price IDs:
   ```
   npm run db:update-stripe-prices
   ```
   This script:
   - Creates/updates plans in your Stripe account (if needed)
   - Automatically retrieves the current price IDs using lookup keys
   - Updates the database with the actual Stripe price IDs
   - This step is crucial for ensuring the application can create subscriptions correctly

##### Creating Subscription Plans

The system needs plans defined in both the database and Stripe.

1. **Database Plans**: Migration `003_plan_management.sql` automatically creates subscription plans in the database:
   - Monthly plans:
     - Basic: $9.99/month
     - Pro: $19.99/month
     - Enterprise: $49.99/month
   - Annual plans (save ~16%):
     - Basic: $99.99/year
     - Pro: $199.99/year
     - Enterprise: $499.99/year

2. **Stripe Plans**: Create corresponding plans in Stripe with:
   ```
   npm run stripe:create-plans
   ```
   
   This script:
   - Creates products in Stripe for both monthly and annual billing
   - Sets up recurring prices at both monthly and yearly intervals
   - Uses lookup keys that match the database configuration

3. If you want to customize the plans, edit:
   - `db/migrations/003_plan_management.sql` for database plans
   - `scripts/create-stripe-plans.js` for Stripe plans

#### Payment Provider Accounts

##### Stripe
1. Sign up at https://dashboard.stripe.com/register
2. Go to Developers → API keys
3. Copy your test Secret key to STRIPE_SECRET_KEY
4. Copy your test Publishable key to STRIPE_PUBLISHABLE_KEY
5. For webhooks:
   - Install Stripe CLI: https://stripe.com/docs/stripe-cli
   - Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   - Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET

##### PayPal
1. Sign up for PayPal Developer at https://developer.paypal.com/
2. Create a new app in the Developer Dashboard
3. Switch to Sandbox mode
4. Copy Client ID and Secret to your .env file
5. For webhooks, configure your sandbox application to send webhook events to `http://your-domain/api/webhooks/paypal`

#### Troubleshooting

If your database setup fails, you might need to:
1. Check PostgreSQL is running
2. Verify credentials in .env
3. Create the payment_db database manually:
   ```
   psql -U postgres
   CREATE DATABASE payment_db;
   \q
   ```

Then try running the setup script again.

If you need to start over with a clean database:
```
npm run db:clean    # Clear all tables
npm run db:migrate:all    # Recreate tables
npm run db:update-stripe-prices    # Update price IDs
```

If Stripe plan creation fails:
1. Verify your Stripe API key is correct in .env
2. Check the Stripe dashboard for any existing products/prices
3. You may need to delete existing plans in Stripe if you're recreating them

If you encounter "No such price" errors when creating subscriptions:
1. Make sure you've run `npm run stripe:create-plans` to create the required price points in Stripe
2. Verify that the price IDs in your forms match those created by the script (`price_basic_monthly`, `price_pro_monthly`, `price_enterprise_monthly`)
3. Check the Stripe dashboard to confirm the prices have been created with the correct lookup keys
4. Run `npm run db:update-stripe-prices` to refresh your database with the current Stripe price IDs 
5. After running the update script, you can verify the price IDs in your database with:
   ```sql
   SELECT id, name, stripe_price_id FROM subscription_plans;
   ```

### Using the Payment Demo

The demo includes three main functionalities:

1. **One-time Payments**
   - Process a simple payment transaction
   - Test both Stripe and PayPal integrations
   - View complete transaction data

2. **Subscription Management**
   - Create recurring subscription plans
   - Manage customer subscriptions (create, update, pause, resume, cancel)
   - Handle upgrades, downgrades, and cancellations
   - Modern UI with detailed subscription information

3. **Refund Processing**
   - Process full or partial refunds
   - Handle different refund scenarios
   - View refund history

### Testing with Stripe

1. Use Stripe test mode credentials in your `.env` file
2. For test card payments, use these card details:
   - Card number: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

3. To test webhooks locally, install the Stripe CLI and run:
   ```
   npm run webhook:listen
   ```
   Remember to run this command so that there's 1 terminal active with it, before `npm run dev` while testing in dev mode. This doesn't mean that each time you run the dev mode it you must also execute the command -- you can just leave 1 webhook terminal open in the background. Only when you run the webhook terminal for the first time ever you will need to copy the webhook token to the `.env` file.

### Testing with PayPal

1. Use PayPal sandbox credentials in your `.env` file
2. Create test accounts in the PayPal Developer Dashboard
3. Use sandbox accounts for testing payments
4. For test card payments, use these card details:
   - Card number: `371449635398431`
   - Expiry: Any future date
   - CVC: Any 4 digits
   - ZIP: Any 5 digits

## Project Structure

```
payment-demo/
├── api/                # Backend API endpoints
│   └── routes/         # API route handlers
├── config/             # Configuration files
├── db/                 # Database models and migrations
│   └── migrations/     # SQL migration files
├── services/           # Business logic and payment providers
│   ├── stripe/         # Stripe service implementation
│   ├── paypal/         # PayPal service implementation
│   └── webhookService.ts # Webhook handling for payment providers
├── middleware/         # Express middleware
├── utils/              # Utility functions
├── client/             # Frontend UI components
│   └── src/
│       ├── components/ # UI components including subscription management
│       ├── app.js      # Main application code
│       └── index.html  # Main HTML template
├── models/             # Data models
├── lib/                # Library utilities
├── workers/            # Background job processing
├── tests/              # Test suite
└── scripts/            # Helper scripts
    └── runMigration.ts # Database migration script
    └── create-stripe-plans.js # Script to create Stripe subscription plans
```

## Webhooks and Event Processing

The system implements a comprehensive webhook processing system for both Stripe and PayPal:

- **Webhook Endpoints**:
  - Stripe: `/api/webhooks/stripe`
  - PayPal: `/api/webhooks/paypal`

- **Event Types Handled**:
  - Subscription lifecycle (created, updated, cancelled, paused, resumed)
  - Payment events (succeeded, failed)
  - Invoice events

- **Event Processing Flow**:
  1. Receive webhook event
  2. Verify provider signature (for Stripe)
  3. Log event to database
  4. Process event based on type
  5. Update subscription/payment status
  6. Record event processing status

## Development Roadmap

This project is structured around six key milestones:

1. **Payment Gateway Setup** ✓
   - Configure Stripe and PayPal integrations
   - Set up webhooks and API endpoints
   - Implement error handling

2. **Subscription System** ✓
   - Create subscription plans
   - Handle recurring billing
   - Manage subscription lifecycle
   - UI components for subscription management

3. **Refund and Dispute Handling** ✓
   - Process refunds through multiple providers
   - Handle disputes and chargebacks
   - Implement notification systems

4. **Security Implementation**
   - Apply PCI compliance best practices
   - Implement data encryption
   - Add fraud detection measures

5. **Testing and Monitoring**
   - Create test scenarios
   - Set up monitoring systems
   - Implement error tracking

6. **Analytics and Reporting**
   - Create revenue reports
   - Track key metrics
   - Build dashboard visualizations

## Security Considerations

This project implements several security best practices:

- PCI DSS compliance guidelines
- Data encryption for sensitive information
- Secure API authentication
- Rate limiting to prevent abuse
- Input validation on all endpoints
- Comprehensive audit logging

## License

MIT 