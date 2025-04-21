document.addEventListener('DOMContentLoaded', () => {
  // API endpoint
  const API_BASE_URL = 'http://localhost:3000/api';

  // DOM Elements
  const paymentForm = document.getElementById('payment-form');
  const subscriptionForm = document.getElementById('subscription-form');
  const refundForm = document.getElementById('refund-form');
  const responseContainer = document.getElementById('response-container');
  const responseData = document.getElementById('response-data');

  // Check for redirect status from payment providers
  function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const token = urlParams.get('token');
    const payerId = urlParams.get('PayerID');
    
    if (status === 'success') {
      // If we have PayPal parameters, display them
      const paypalData = token ? { token, payerId } : {};
      
      displayResponse({
        success: true,
        message: 'Payment completed successfully!',
        data: paypalData
      });
      
      // Optional: Capture the PayPal payment using the token and PayerID
      if (token && payerId) {
        // You could make an API call to your server to capture the payment
        // Example:
        // fetch(`${API_BASE_URL}/payments/capture-paypal`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ token, payerId })
        // });
      }
    } else if (status === 'cancelled') {
      displayResponse({
        success: false,
        message: 'Payment was cancelled.'
      });
    }
    
    // Clean up the URL
    if (status) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
  
  // Initialize Stripe client
  let stripe;
  let card;
  let cardElement;
  
  // Initialize Stripe with the key from the server
  fetch(`${API_BASE_URL}/payments/stripe-key`)
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        stripe = Stripe(data.key);
        // Setup Stripe elements after getting the key
        setupStripeElement();
      } else {
        console.error('Error fetching Stripe key:', data.message);
        displayResponse({
          error: true,
          message: 'Failed to initialize payment system: ' + data.message
        });
      }
    })
    .catch(error => {
      console.error('Error fetching Stripe key:', error);
      displayResponse({
        error: true,
        message: 'Failed to initialize payment system. Please try again later.'
      });
    });
  
  // Helper function to display API responses
  const displayResponse = (data) => {
    responseContainer.classList.remove('d-none');
    responseData.textContent = JSON.stringify(data, null, 2);
    
    // Scroll to response
    responseContainer.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Now it's safe to call checkPaymentStatus
  checkPaymentStatus();

  // Setup Stripe card element
  const setupStripeElement = () => {
    if (!stripe) {
      console.error('Stripe not initialized yet');
      return;
    }
    
    if (!cardElement) {
      // Create a container for the card element if it doesn't exist
      const cardContainer = document.createElement('div');
      cardContainer.id = 'card-element';
      cardContainer.className = 'form-control mb-3';
      
      // Add a label
      const cardLabel = document.createElement('label');
      cardLabel.htmlFor = 'card-element';
      cardLabel.textContent = 'Credit or debit card';
      cardLabel.className = 'form-label mt-3';
      
      // Insert the elements after the description field
      const descriptionField = document.getElementById('payment-description');
      const formGroup = descriptionField.closest('.form-group');
      formGroup.parentNode.insertBefore(cardLabel, formGroup.nextSibling);
      formGroup.parentNode.insertBefore(cardContainer, cardLabel.nextSibling);
      
      // Add an element to display card errors
      const cardErrors = document.createElement('div');
      cardErrors.id = 'card-errors';
      cardErrors.className = 'text-danger mb-3';
      formGroup.parentNode.insertBefore(cardErrors, cardContainer.nextSibling);
      
      // Initialize Stripe Elements
      const elements = stripe.elements();
      
      // Create the card Element
      card = elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            color: '#32325d',
          }
        }
      });
      
      // Mount the card Element to the card-element container
      card.mount('#card-element');
      
      // Handle validation errors
      card.addEventListener('change', (event) => {
        const displayError = document.getElementById('card-errors');
        if (event.error) {
          displayError.textContent = event.error.message;
        } else {
          displayError.textContent = '';
        }
      });
      
      cardElement = card;
    }
  };

  // Show or hide the Stripe card element based on provider selection
  document.querySelectorAll('input[name="payment-provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const provider = e.target.value;
      const cardLabel = document.querySelector('label[for="card-element"]');
      const cardContainer = document.getElementById('card-element');
      const cardErrors = document.getElementById('card-errors');
      
      // Only show card element for Stripe, hide for PayPal
      if (provider === 'stripe' && cardContainer) {
        cardLabel.style.display = 'block';
        cardContainer.style.display = 'block';
        cardErrors.style.display = 'block';
        cardLabel.textContent = 'Credit or debit card (Stripe)';
      } else if (cardContainer) {
        cardLabel.style.display = 'none';
        cardContainer.style.display = 'none';
        cardErrors.style.display = 'none';
      }
    });
  });

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
      
      if (provider === 'stripe') {
        // Check if Stripe is initialized
        if (!stripe) {
          throw new Error('Stripe is not initialized. Please try again later.');
        }
        
        // Step 1: Create a PaymentIntent on the server
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
        
        const paymentData = await response.json();
        displayResponse(paymentData);
        
        if (paymentData.data && paymentData.data.client_secret) {
          // Step 2: Confirm the payment with the card element
          document.getElementById('card-errors').textContent = 'Confirming payment...';
          
          const result = await stripe.confirmCardPayment(
            paymentData.data.client_secret,
            {
              payment_method: {
                card: card,
                billing_details: {
                  name: 'Test Customer', // In a real app, collect this from the user
                }
              }
            }
          );
          
          if (result.error) {
            // Show error to customer
            const errorMessage = result.error.message;
            document.getElementById('card-errors').textContent = errorMessage;
            displayResponse({
              success: false,
              message: errorMessage
            });
          } else {
            // The payment has been processed!
            if (result.paymentIntent.status === 'succeeded') {
              // Show a success message to your customer
              document.getElementById('card-errors').textContent = '';
              displayResponse({
                success: true,
                message: 'Payment succeeded!',
                data: result.paymentIntent
              });
            }
          }
        }
      } else {
        // For PayPal or other providers
        
        // PayPal uses its own UI for payment collection
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
        
        // If PayPal returns a redirect URL, redirect the user
        if (data.success && data.data && data.data.links) {
          const approvalLink = data.data.links.find(link => link.rel === 'approve');
          if (approvalLink) {
            window.location.href = approvalLink.href;
          }
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

  // Initialize subscription management flow
  import('./components/SubscriptionFlow.js')
    .then(module => {
      const SubscriptionFlow = module.default;
      const subscriptionFlow = new SubscriptionFlow('subscription-flow-container', API_BASE_URL);
      
      // Set a dummy customer ID for testing
      subscriptionFlow.setCustomerId('cust_test_123');
      
      // Initialize the flow
      subscriptionFlow.initialize();
    })
    .catch(error => {
      console.error('Error loading subscription flow:', error);
      const container = document.getElementById('subscription-flow-container');
      if (container) {
        container.innerHTML = `
          <div class="alert alert-danger">
            Failed to load subscription management. Please try again later.
          </div>
        `;
      }
    });
}); 