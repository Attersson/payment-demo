document.addEventListener('DOMContentLoaded', () => {
  // API endpoint
  const API_BASE_URL = 'http://localhost:3000/api';

  // DOM Elements
  const paymentForm = document.getElementById('payment-form');
  const subscriptionForm = document.getElementById('subscription-form');
  const refundForm = document.getElementById('refund-form');
  const responseContainer = document.getElementById('response-container');
  const responseData = document.getElementById('response-data');

  // Initialize Stripe client
  const stripe = Stripe('pk_test_your_stripe_publishable_key');

  // Helper function to display API responses
  const displayResponse = (data) => {
    responseContainer.classList.remove('d-none');
    responseData.textContent = JSON.stringify(data, null, 2);
    
    // Scroll to response
    responseContainer.scrollIntoView({ behavior: 'smooth' });
  };

  // Process one-time payment
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const amount = document.getElementById('payment-amount').value;
    const currency = document.getElementById('payment-currency').value;
    const description = document.getElementById('payment-description').value;
    const provider = document.querySelector('input[name="payment-provider"]:checked').value;
    
    try {
      // Show loading state
      const submitButton = paymentForm.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Processing...';
      
      const response = await fetch(`${API_BASE_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          currency,
          description,
          provider
        }),
      });
      
      const data = await response.json();
      displayResponse(data);
      
      // Handle Stripe payment intent confirmation if needed
      if (provider === 'stripe' && data.success && data.data.client_secret) {
        const { error } = await stripe.confirmCardPayment(data.data.client_secret);
        if (error) {
          displayResponse({
            error: true,
            message: error.message
          });
        }
      }
      
      // Reset button state
      submitButton.disabled = false;
      submitButton.textContent = originalText;
      
    } catch (error) {
      console.error('Error processing payment:', error);
      displayResponse({
        error: true,
        message: error.message || 'Unknown error occurred'
      });
      
      // Reset button state
      const submitButton = paymentForm.querySelector('button[type="submit"]');
      submitButton.disabled = false;
      submitButton.textContent = 'Process Payment';
    }
  });
  
  // Process subscription
  subscriptionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const planId = document.getElementById('subscription-plan').value;
    const customerEmail = document.getElementById('customer-email').value;
    const provider = document.querySelector('input[name="subscription-provider"]:checked').value;
    
    try {
      // Show loading state
      const submitButton = subscriptionForm.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Processing...';
      
      // First create or get customer
      const customerResponse = await fetch(`${API_BASE_URL}/customers/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: customerEmail,
          provider
        }),
      });
      
      const customerData = await customerResponse.json();
      
      if (!customerData.success) {
        displayResponse(customerData);
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        return;
      }
      
      // Create subscription with customer ID
      const response = await fetch(`${API_BASE_URL}/subscriptions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customerData.customerId,
          priceId: planId, // For Stripe
          planId: planId,  // For PayPal
          provider
        }),
      });
      
      const data = await response.json();
      displayResponse(data);
      
      // Reset button state
      submitButton.disabled = false;
      submitButton.textContent = originalText;
      
    } catch (error) {
      console.error('Error creating subscription:', error);
      displayResponse({
        error: true,
        message: error.message || 'Unknown error occurred'
      });
      
      // Reset button state
      const submitButton = subscriptionForm.querySelector('button[type="submit"]');
      submitButton.disabled = false;
      submitButton.textContent = 'Subscribe';
    }
  });
  
  // Process refund
  refundForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const transactionId = document.getElementById('transaction-id').value;
    const amount = document.getElementById('refund-amount').value;
    const reason = document.getElementById('refund-reason').value;
    const provider = document.querySelector('input[name="refund-provider"]:checked').value;
    
    try {
      // Show loading state
      const submitButton = refundForm.querySelector('button[type="submit"]');
      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Processing...';
      
      const response = await fetch(`${API_BASE_URL}/payments/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          amount: amount || undefined,
          reason,
          provider
        }),
      });
      
      const data = await response.json();
      displayResponse(data);
      
      // Reset button state
      submitButton.disabled = false;
      submitButton.textContent = originalText;
      
    } catch (error) {
      console.error('Error processing refund:', error);
      displayResponse({
        error: true,
        message: error.message || 'Unknown error occurred'
      });
      
      // Reset button state
      const submitButton = refundForm.querySelector('button[type="submit"]');
      submitButton.disabled = false;
      submitButton.textContent = 'Process Refund';
    }
  });
}); 