# Payment Processing Integration Demo

A comprehensive learning project for implementing secure payment processing with multiple providers, subscription management, and refund capabilities.

## Overview

This project serves as a hands-on learning environment for building robust payment systems. It demonstrates best practices for handling financial transactions, implementing security measures, and creating scalable payment architectures.

## Features

- Stripe and PayPal integration
- Subscription management
- Transaction processing
- Refund handling
- Secure payment flow
- Comprehensive error handling
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
5. Start the development server:
   ```
   npm run dev
   ```
6. Access the demo UI at `http://localhost:3000`

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

#### Payment Provider Accounts

##### Stripe
1. Sign up at https://dashboard.stripe.com/register
2. Go to Developers → API keys
3. Copy your test Secret key to STRIPE_SECRET_KEY
4. For webhooks:
   - Install Stripe CLI: https://stripe.com/docs/stripe-cli
   - Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   - Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET

##### PayPal
1. Sign up for PayPal Developer at https://developer.paypal.com/
2. Create a new app in the Developer Dashboard
3. Switch to Sandbox mode
4. Copy Client ID and Secret to your .env file

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

### Using the Payment Demo

The demo includes three main functionalities:

1. **One-time Payments**
   - Process a simple payment transaction
   - Test both Stripe and PayPal integrations
   - View complete transaction data

2. **Subscription Management**
   - Create recurring subscription plans
   - Manage customer subscriptions
   - Handle upgrades, downgrades, and cancellations

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

### Testing with PayPal

1. Use PayPal sandbox credentials in your `.env` file
2. Create test accounts in the PayPal Developer Dashboard
3. Use sandbox accounts for testing payments

## Project Structure

```
payment-demo/
├── api/                # Backend API endpoints
├── config/             # Configuration files
├── db/                 # Database models and migrations
├── services/           # Business logic and payment providers
├── middleware/         # Express middleware
├── utils/              # Utility functions
├── client/             # Frontend UI components
├── workers/            # Background job processing
├── tests/              # Test suite
└── scripts/            # Helper scripts
```

## Development Roadmap

This project is structured around six key milestones:

1. **Payment Gateway Setup**
   - Configure Stripe and PayPal integrations
   - Set up webhooks and API endpoints
   - Implement error handling

2. **Subscription System**
   - Create subscription plans
   - Handle recurring billing
   - Manage subscription lifecycle

3. **Refund and Dispute Handling**
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