import SubscriptionFlow from './components/SubscriptionFlow.js';

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
  let subscriptionCard;
  
  // Initialize Stripe with the key from the server
  fetch(`${API_BASE_URL}/payments/stripe-key`)
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        stripe = Stripe(data.key);
        // Setup Stripe elements after getting the key
        setupStripeElement('payment');
        setupStripeElement('subscription');
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
  
  // Initialize variables for subscription flow
  let subscriptionFlowInstance = null;
  let currentCustomerId = null;
  
  // Check for existing customer ID in localStorage
  const storedCustomerId = localStorage.getItem('currentCustomerId');
  if (storedCustomerId) {
    currentCustomerId = storedCustomerId;
    console.log('Retrieved customer ID from localStorage:', currentCustomerId);
  }
  
  // Helper function to display API responses
  const displayResponse = (data) => {
    responseContainer.classList.remove('d-none');
    responseData.textContent = JSON.stringify(data, null, 2);
    
    // Scroll to response
    responseContainer.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Add a function to get customer info
  const getCustomerInfo = async (customerId, provider = 'stripe') => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customerId}?provider=${provider}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching customer info:', error);
      return { success: false, message: 'Failed to fetch customer information' };
    }
  };

  // Add a function to list customer's subscriptions
  const getCustomerSubscriptions = async (customerId, provider = 'stripe') => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customerId}/subscriptions?provider=${provider}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      return { success: false, message: 'Failed to fetch subscription information' };
    }
  };

  // Update subscription UI by displaying customer info and subscriptions
  const refreshSubscriptionUI = async (customerId) => {
    if (!customerId) {
      console.warn('No customer ID provided for refresh');
      return;
    }
    
    console.log('Refreshing subscription info with ID:', customerId);
    
    // Save customer ID to localStorage for persistence between page refreshes
    localStorage.setItem('currentCustomerId', customerId);
    currentCustomerId = customerId;
    
    try {
      // Get customer info 
      const customerInfo = await getCustomerInfo(customerId);
      
      // Render customer info
      const customerInfoElement = document.getElementById('customer-info');
      if (customerInfoElement && customerInfo.success) {
        customerInfoElement.innerHTML = `
          <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">Customer Information</h3>
              <button id="logout-button" class="btn btn-sm btn-outline-danger">Logout</button>
            </div>
            <div class="card-body">
              <p><strong>Name:</strong> ${customerInfo.customer?.name || 'N/A'}</p>
              <p><strong>Email:</strong> ${customerInfo.customer?.email || 'N/A'}</p>
              <p><strong>ID:</strong> ${customerInfo.customer?.id || customerId}</p>
            </div>
          </div>
        `;
        
        // Add logout button event listener
        document.getElementById('logout-button').addEventListener('click', logout);
      }
      
      // Update subscription display if we have the instance
      if (subscriptionFlowInstance) {
        subscriptionFlowInstance.setCustomerId(customerId);
        await subscriptionFlowInstance.initialize();
      }
    } catch (error) {
      console.error('Error getting customer info:', error);
    }
  };
  
  // Now it's safe to call checkPaymentStatus
  checkPaymentStatus();

  // Setup Stripe card element
  const setupStripeElement = (formType = 'payment') => {
    if (!stripe) {
      console.error('Stripe not initialized yet');
      return;
    }
    
    // Determine which form and fields to use based on the form type
    const isPaymentForm = formType === 'payment';
    const formId = isPaymentForm ? 'payment-form' : 'subscription-form';
    const form = document.getElementById(formId);
    const cardElementId = isPaymentForm ? 'payment-card-element' : 'subscription-card-element';
    const cardErrorsId = isPaymentForm ? 'payment-card-errors' : 'subscription-card-errors';
    
    // Check if we already have a card element for this form
    if (document.getElementById(cardElementId)) {
      return; // Card element already exists
    }
    
    // Create a container for the card element
    const cardContainer = document.createElement('div');
    cardContainer.id = cardElementId;
    cardContainer.className = 'form-control mb-3';
    
    // Add a label
    const cardLabel = document.createElement('label');
    cardLabel.htmlFor = cardElementId;
    cardLabel.textContent = 'Credit or debit card';
    cardLabel.className = 'form-label mt-3';
    
    // Initially hide for subscription form if PayPal is selected
    if (!isPaymentForm) {
      const subscriptionProvider = document.querySelector('input[name="subscription-provider"]:checked').value;
      if (subscriptionProvider !== 'stripe') {
        cardLabel.style.display = 'none';
        cardContainer.style.display = 'none';
      }
    } else {
      // For payment form, check if Stripe is selected
      const paymentProvider = document.querySelector('input[name="payment-provider"]:checked').value;
      if (paymentProvider !== 'stripe') {
        cardLabel.style.display = 'none';
        cardContainer.style.display = 'none';
      }
    }
    
    // Add an element to display card errors
    const cardErrors = document.createElement('div');
    cardErrors.id = cardErrorsId;
    cardErrors.className = 'text-danger mb-3';
    if ((isPaymentForm && document.querySelector('input[name="payment-provider"]:checked').value !== 'stripe') ||
        (!isPaymentForm && document.querySelector('input[name="subscription-provider"]:checked').value !== 'stripe')) {
      cardErrors.style.display = 'none';
    }
    
    // Find the insertion point
    let insertAfterElement;
    if (isPaymentForm) {
      // For payment form, insert after the description field
      insertAfterElement = document.getElementById('payment-description').closest('.form-group');
    } else {
      // For subscription form, insert after the email field
      insertAfterElement = document.getElementById('customer-email').closest('.form-group');
    }
    
    // Insert the elements
    if (insertAfterElement) {
      insertAfterElement.parentNode.insertBefore(cardLabel, insertAfterElement.nextSibling);
      insertAfterElement.parentNode.insertBefore(cardContainer, cardLabel.nextSibling);
      insertAfterElement.parentNode.insertBefore(cardErrors, cardContainer.nextSibling);
    }
    
    // Initialize Stripe Elements
    const elements = stripe.elements();
    
    // Create the card Element
    const cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#32325d',
        }
      }
    });
    
    // Mount the card Element to the card-element container
    cardElement.mount(`#${cardElementId}`);
    
    // Handle validation errors
    cardElement.addEventListener('change', (event) => {
      if (event.error) {
        cardErrors.textContent = event.error.message;
      } else {
        cardErrors.textContent = '';
      }
    });
    
    // Store card element to be used for payment
    if (isPaymentForm) {
      card = cardElement;
    } else {
      // Store subscription card element in a different variable
      subscriptionCard = cardElement;
    }
    
    return cardElement;
  };

  // Show or hide the Stripe card element based on provider selection
  document.querySelectorAll('input[name="payment-provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const provider = e.target.value;
      const cardLabel = document.querySelector('label[for="payment-card-element"]');
      const cardContainer = document.getElementById('payment-card-element');
      const cardErrors = document.getElementById('payment-card-errors');
      
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
  
  // Show or hide the Stripe card element based on provider selection for subscription form
  document.querySelectorAll('input[name="subscription-provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const provider = e.target.value;
      const cardLabel = document.querySelector('label[for="subscription-card-element"]');
      const cardContainer = document.getElementById('subscription-card-element');
      const cardErrors = document.getElementById('subscription-card-errors');
      
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
          document.getElementById('payment-card-errors').textContent = 'Confirming payment...';
          
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
            document.getElementById('payment-card-errors').textContent = errorMessage;
            displayResponse({
              success: false,
              message: errorMessage
            });
          } else {
            // The payment has been processed!
            if (result.paymentIntent.status === 'succeeded') {
              // Show a success message to your customer
              document.getElementById('payment-card-errors').textContent = '';
              displayResponse({
                success: true,
                message: 'Payment succeeded!',
                data: result.paymentIntent
              });
              
              // If we have a customerId from this payment, store it
              if (result.paymentIntent.customer) {
                currentCustomerId = result.paymentIntent.customer;
                localStorage.setItem('currentCustomerId', currentCustomerId);
                // Refresh the subscription management UI
                refreshSubscriptionUI(currentCustomerId);
              }
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
      
      // Store customer ID for the subscription flow
      currentCustomerId = customerData.customerId;
      
      // Display customer ID in the response
      displayResponse({
        success: true,
        message: 'Customer created or retrieved',
        customerId: customerData.customerId
      });
      
      // Create subscription with customer ID
      const planId = document.getElementById('subscription-plan').value;
      
      // First, get the actual price ID from the lookup key (if using Stripe)
      if (provider === 'stripe') {
        try {
          // Use the lookup key to get the actual price ID
          const lookupResponse = await fetch(`${API_BASE_URL}/prices/lookup?lookup_key=${planId}`);
          const lookupData = await lookupResponse.json();
          
          if (!lookupData.success) {
            displayResponse({
              error: true,
              message: `Failed to get price: ${lookupData.message || 'Price not found'}`
            });
            
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = originalText;
            return;
          }
          
          // Create a payment method from the card element
          const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: subscriptionCard,
            billing_details: {
              email: customerEmail,
            },
          });
          
          if (paymentMethodError) {
            document.getElementById('subscription-card-errors').textContent = paymentMethodError.message;
            displayResponse({
              success: false,
              message: paymentMethodError.message
            });
            
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = originalText;
            return;
          }
          
          // Attach the payment method to the customer first
          const attachResponse = await fetch(`${API_BASE_URL}/customers/${customerData.customerId}/payment-methods`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paymentMethodId: paymentMethod.id,
              provider
            }),
          });
          
          const attachData = await attachResponse.json();
          if (!attachData.success) {
            displayResponse({
              success: false,
              message: `Failed to attach payment method: ${attachData.message}`
            });
            submitButton.disabled = false;
            submitButton.textContent = originalText;
            return;
          }
          
          // Set as default payment method
          const defaultResponse = await fetch(`${API_BASE_URL}/customers/${customerData.customerId}/default-payment-method`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paymentMethodId: paymentMethod.id,
              provider
            }),
          });
          
          const defaultData = await defaultResponse.json();
          if (!defaultData.success) {
            console.warn('Could not set default payment method:', defaultData.message);
          }
          
          // Now create the subscription with the attached payment method
          const response = await fetch(`${API_BASE_URL}/subscriptions/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              customerId: customerData.customerId,
              priceId: lookupData.price.id,
              paymentMethodId: paymentMethod.id, // Include payment method ID
              provider,
              metadata: {
                created_from: 'web_form'
              }
            }),
          });
          
          const data = await response.json();
          
          // Handle subscription activation if needed
          if (data.success && data.status === 'incomplete' && data.data.latest_invoice?.payment_intent) {
            const { client_secret } = data.data.latest_invoice.payment_intent;
            
            // Confirm the payment
            document.getElementById('subscription-card-errors').textContent = 'Confirming payment...';
            
            const result = await stripe.confirmCardPayment(client_secret);
            
            if (result.error) {
              // Show error to customer
              document.getElementById('subscription-card-errors').textContent = result.error.message;
              displayResponse({
                success: false,
                message: result.error.message
              });
            } else {
              // Subscription is active
              document.getElementById('subscription-card-errors').textContent = '';
              displayResponse({
                success: true,
                message: 'Subscription activated successfully!',
                data: result.paymentIntent
              });
              
              // Store customer ID in localStorage for persistence
              if (currentCustomerId) {
                localStorage.setItem('currentCustomerId', currentCustomerId);
                // Refresh the subscription management UI
                refreshSubscriptionUI(currentCustomerId);
              }
            }
          } else if (data.success) {
            displayResponse({
              success: true,
              message: 'Subscription created successfully!',
              data: data
            });
            
            // Refresh the subscription management UI
            if (currentCustomerId) {
              localStorage.setItem('currentCustomerId', currentCustomerId);
              refreshSubscriptionUI(currentCustomerId);
            }
          } else {
            displayResponse(data);
          }
        } catch (stripeError) {
          console.error('Stripe error:', stripeError);
          displayResponse({
            success: false,
            message: `Stripe error: ${stripeError.message || 'Unknown error'}`
          });
        }
      } else {
        // For PayPal, use the planId directly
        const response = await fetch(`${API_BASE_URL}/subscriptions/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerId: customerData.customerId,
            planId: planId,
            provider
          }),
        });
        
        const data = await response.json();
        displayResponse(data);
        
        // After successful subscription with PayPal, update the management UI
        if (data.success) {
          // Refresh the subscription management UI
          refreshSubscriptionUI(currentCustomerId);
        }
      }
      
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
  initializeApp();

  async function initializeApp() {
    // Check if subscription container exists
    const subscriptionContainer = document.getElementById('subscription-flow-container');
    if (!subscriptionContainer) {
      console.warn('Subscription container not found, skipping subscription flow initialization');
      return;
    }
    
    // Create an instance of the subscription flow for viewing existing subscriptions
    subscriptionFlowInstance = new SubscriptionFlow('subscription-flow-container', API_BASE_URL);
    
    // Clear the initial loading spinner
    subscriptionContainer.innerHTML = '';
    
    if (currentCustomerId) {
      // Set the customer ID in the subscription flow
      subscriptionFlowInstance.setCustomerId(currentCustomerId);
      
      // Check if customer exists in the database
      try {
        const response = await fetch(`${API_BASE_URL}/customers/${currentCustomerId}`);
        const data = await response.json();
        
        if (!data.success) {
          // Customer doesn't exist, clear the ID
          currentCustomerId = null;
          localStorage.removeItem('currentCustomerId');
          
          // Show the customer form
          showCustomerForm();
        } else {
          // Update UI with customer info
          updateCustomerInfo(data.customer);
        }
      } catch (error) {
        console.error('Error checking customer:', error);
        currentCustomerId = null;
        localStorage.removeItem('currentCustomerId');
        
        // Show the customer form on error
        showCustomerForm();
      }
      
      // Initialize to display existing subscriptions
      await subscriptionFlowInstance.initialize();
    }
    
    // If we don't have a customer ID, show the customer creation form
    if (!currentCustomerId) {
      showCustomerForm();
    }
  }
  
  // Function to create a new customer
  async function createCustomer(event) {
    event.preventDefault();
    
    const customerForm = document.getElementById('customer-form');
    const createButton = customerForm.querySelector('button[type="submit"]');
    const errorElement = document.getElementById('customer-error');
    
    // Disable the button and show loading state
    createButton.disabled = true;
    createButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Creating...';
    errorElement.textContent = '';
    
    // Get form data
    const formData = new FormData(customerForm);
    const customerData = {
      email: formData.get('email'),
      name: formData.get('name')
    };
    
    try {
      // Create the customer
      const response = await fetch(`${API_BASE_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(customerData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Save the customer ID
        currentCustomerId = data.customer.id;
        localStorage.setItem('currentCustomerId', currentCustomerId);
        
        // Hide the form and update UI
        updateCustomerInfo(data.customer);
        document.getElementById('customer-container').classList.add('d-none');
        
        // Update subscription UI if available
        if (subscriptionFlowInstance) {
          refreshSubscriptionUI(data.customer);
        }
      } else {
        // Show error
        errorElement.textContent = data.message || 'Failed to create customer. Please try again.';
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      errorElement.textContent = 'An error occurred. Please try again.';
    } finally {
      // Reset button state
      createButton.disabled = false;
      createButton.textContent = 'Create Customer';
    }
  }
  
  // Function to update the UI with customer info
  function updateCustomerInfo(customer) {
    const customerInfoElement = document.getElementById('customer-info');
    
    if (customerInfoElement) {
      customerInfoElement.innerHTML = `
        <div class="card mb-4">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h3 class="card-title mb-0">Customer Information</h3>
            <button id="logout-button" class="btn btn-sm btn-outline-danger">Logout</button>
          </div>
          <div class="card-body">
            <p><strong>Name:</strong> ${customer.name}</p>
            <p><strong>Email:</strong> ${customer.email}</p>
            <p><strong>ID:</strong> ${customer.id}</p>
          </div>
        </div>
      `;
      
      // Add logout button event listener
      document.getElementById('logout-button').addEventListener('click', logout);
    }
  }
  
  // Function to show the customer creation form
  function showCustomerForm() {
    const customerContainer = document.getElementById('customer-container');
    
    if (customerContainer) {
      customerContainer.classList.remove('d-none');
      customerContainer.innerHTML = `
        <div class="card mb-4">
          <div class="card-header">
            <h3 class="card-title">Create Customer</h3>
          </div>
          <div class="card-body">
            <form id="customer-form">
              <div class="mb-3">
                <label for="name" class="form-label">Name</label>
                <input type="text" class="form-control" id="name" name="name" required>
              </div>
              <div class="mb-3">
                <label for="email" class="form-label">Email</label>
                <input type="email" class="form-control" id="email" name="email" required>
              </div>
              <div id="customer-error" class="text-danger mb-3"></div>
              <button type="submit" class="btn btn-primary">Create Customer</button>
            </form>
          </div>
        </div>
      `;
      
      // Add form submit event listener
      document.getElementById('customer-form').addEventListener('submit', createCustomer);
    }
  }
  
  // Function to handle logout
  function logout() {
    currentCustomerId = null;
    localStorage.removeItem('currentCustomerId');
    
    // Clear customer info
    const customerInfoElement = document.getElementById('customer-info');
    if (customerInfoElement) {
      customerInfoElement.innerHTML = '';
    }
    
    // Reinitialize the app
    initializeApp();
  }
  
  // Function to refresh the subscription UI
  window.refreshSubscriptionUI = async function(customer) {
    if (customer && customer.id) {
      currentCustomerId = customer.id;
      localStorage.setItem('currentCustomerId', currentCustomerId);
      
      // Update customer info
      updateCustomerInfo(customer);
      
      // Update subscription display if we have the instance
      if (subscriptionFlowInstance) {
        subscriptionFlowInstance.setCustomerId(currentCustomerId);
        try {
          await subscriptionFlowInstance.initialize();
        } catch (error) {
          console.error('Error initializing subscription flow:', error);
        }
      }
      
      // Hide customer form if visible
      const customerContainer = document.getElementById('customer-container');
      if (customerContainer) {
        customerContainer.classList.add('d-none');
      }
    }
  };
}); 