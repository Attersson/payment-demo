import PlanSelection from './PlanSelection.js';
import SubscriptionManager from './SubscriptionManager.js';

class SubscriptionFlow {
  constructor(containerId, apiBaseUrl = 'http://localhost:3000/api') {
    this.container = document.getElementById(containerId);
    this.apiBaseUrl = apiBaseUrl;
    this.customerId = null;
    this.selectedPlan = null;
    this.paymentMethodId = null;
    this.provider = 'stripe';
    
    // Initialize sub-components
    this.planSelector = new PlanSelection(`${containerId}-plans`, apiBaseUrl);
    this.subscriptionManager = new SubscriptionManager(`${containerId}-subscription`, apiBaseUrl);
    
    // Create container divs for sub-components if they don't exist
    this.ensureContainers();
  }

  setCustomerId(customerId) {
    this.customerId = customerId;
    this.subscriptionManager.setCustomerId(customerId);
  }

  setPaymentMethodId(paymentMethodId) {
    this.paymentMethodId = paymentMethodId;
  }

  setProvider(provider) {
    this.provider = provider;
  }

  ensureContainers() {
    if (!this.container) {
      console.error('Main subscription flow container is missing');
      return;
    }
    
    console.log('Ensuring subscription flow containers exist');
    
    // Check if the containers already exist
    let planContainer = document.getElementById(`${this.container.id}-plans`);
    let subscriptionContainer = document.getElementById(`${this.container.id}-subscription`);
    
    // Create containers for sub-components if needed
    if (!planContainer) {
      console.log('Creating plan selection container');
      planContainer = document.createElement('div');
      planContainer.id = `${this.container.id}-plans`;
      this.container.appendChild(planContainer);
    }
    
    if (!subscriptionContainer) {
      console.log('Creating subscription container');
      subscriptionContainer = document.createElement('div');
      subscriptionContainer.id = `${this.container.id}-subscription`;
      this.container.appendChild(subscriptionContainer);
    }
    
    // Update references in components
    if (this.planSelector) {
      this.planSelector.container = planContainer;
    }
    
    if (this.subscriptionManager) {
      this.subscriptionManager.container = subscriptionContainer;
    }
  }

  async initialize(existingSubscriptionId = null) {
    // Ensure containers exist and references are up-to-date before proceeding
    this.ensureContainers();
    
    // Always hide the plan selection UI - we don't want to allow subscription creation here
    const planElement = document.getElementById(`${this.container.id}-plans`);
    if (planElement) planElement.classList.add('d-none');
    
    // Clear any loading spinner that might be in the main container
    if (this.container) {
      // Look for spinner elements
      const spinners = this.container.querySelectorAll('.spinner-border');
      if (spinners.length > 0) {
        // Remove any spinners
        spinners.forEach(spinner => {
          if (spinner.parentElement) {
            spinner.parentElement.remove();
          }
        });
      }
    }
    
    // Initialize subscription manager for viewing existing subscriptions
    if (existingSubscriptionId) {
      // If we have a specific subscription ID, initialize with it
      await this.subscriptionManager.initialize(existingSubscriptionId);
    } else {
      // Otherwise check if user has any existing subscriptions
      try {
        if (this.customerId) {
          console.log(`Checking subscriptions for customer: ${this.customerId}`);
          
          // Call the API to get the customer's subscriptions
          const response = await fetch(`${this.apiBaseUrl}/customers/${this.customerId}/subscriptions?provider=${this.provider}`);
          const data = await response.json();
          
          if (data && data.success && data.subscriptions && data.subscriptions.length > 0) {
            console.log(`Found ${data.subscriptions.length} subscriptions`, data.subscriptions);
            
            // If user has an active subscription, initialize subscription manager with it
            const activeSubscription = data.subscriptions.find(s => s && s.status === 'active');
            if (activeSubscription && activeSubscription.id) {
              console.log(`Initializing with active subscription: ${activeSubscription.subscription_id || activeSubscription.id}`);
              await this.subscriptionManager.initialize(activeSubscription.subscription_id || activeSubscription.id);
              return;
            } else {
              console.log('No active subscription found among existing subscriptions');
              // Just initialize subscription manager to show the list of subscriptions
              await this.subscriptionManager.initialize();
            }
          } else {
            if (!data || !data.success) {
              console.error('Error fetching customer subscriptions:', data?.message || 'Unknown error');
            } else {
              console.log('No subscriptions found for customer');
              // Initialize subscription manager with no subscription ID
              await this.subscriptionManager.initialize();
            }
          }
        } else {
          console.log('No customer ID available, nothing to display');
          // Display a message that no customer is selected
          this.renderNoCustomerMessage();
        }
      } catch (error) {
        console.error('Error checking for existing subscriptions:', error);
        // Show error in subscription container
        const subscriptionElement = document.getElementById(`${this.container.id}-subscription`);
        if (subscriptionElement) {
          subscriptionElement.innerHTML = `<div class="alert alert-danger">Failed to load subscription data: ${error.message}</div>`;
          subscriptionElement.classList.remove('d-none');
        }
      }
    }
  }

  // Add a method to show a message when no customer is selected
  renderNoCustomerMessage() {
    const subscriptionElement = document.getElementById(`${this.container.id}-subscription`);
    if (subscriptionElement) {
      subscriptionElement.innerHTML = `<div class="alert alert-info">Please select or create a customer to view subscriptions.</div>`;
      subscriptionElement.classList.remove('d-none');
    }
  }

  renderCreateSubscriptionButton() {
    const subscriptionContainer = document.getElementById(`${this.container.id}-subscription`);
    
    if (!subscriptionContainer) return;
    
    // Clear container
    subscriptionContainer.innerHTML = '';
    subscriptionContainer.classList.remove('d-none');
    
    // Create a card
    const card = document.createElement('div');
    card.className = 'card mt-4';
    
    // Card header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = 'Complete Your Subscription';
    
    cardHeader.appendChild(title);
    card.appendChild(cardHeader);
    
    // Card body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // Display selected plan details
    const planDetail = document.createElement('div');
    planDetail.className = 'mb-3';
    
    const planName = document.createElement('h4');
    planName.textContent = this.selectedPlan.name;
    
    const planPrice = document.createElement('p');
    const formattedPrice = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.selectedPlan.currency || 'USD'
    }).format(this.selectedPlan.amount / 100);
    
    planPrice.innerHTML = `Price: ${formattedPrice}<small class="text-muted">/${this.selectedPlan.interval}</small>`;
    
    planDetail.appendChild(planName);
    planDetail.appendChild(planPrice);
    cardBody.appendChild(planDetail);
    
    // Create a form for selecting payment method
    const paymentMethodForm = document.createElement('form');
    paymentMethodForm.className = 'mb-3';
    
    const paymentMethodLabel = document.createElement('label');
    paymentMethodLabel.className = 'form-label';
    paymentMethodLabel.textContent = 'Select Payment Method';
    
    // Temporarily only offer Stripe since PayPal isn't fully implemented
    const paymentMethods = ['Credit Card']; // Removed PayPal temporarily
    
    const paymentMethodSelect = document.createElement('select');
    paymentMethodSelect.className = 'form-select';
    
    paymentMethods.forEach((method, index) => {
      const option = document.createElement('option');
      option.value = 'stripe'; // Always use stripe for now
      option.textContent = method;
      paymentMethodSelect.appendChild(option);
    });
    
    // Add a note about PayPal not being available
    const paypalNote = document.createElement('div');
    paypalNote.className = 'form-text text-muted';
    paypalNote.textContent = 'PayPal integration is coming soon.';
    
    paymentMethodSelect.addEventListener('change', (e) => {
      this.provider = e.target.value;
      
      // You would handle payment method UI changes here
      // For example, showing a credit card form for Stripe
      // or redirecting to PayPal for PayPal
    });
    
    paymentMethodForm.appendChild(paymentMethodLabel);
    paymentMethodForm.appendChild(paymentMethodSelect);
    paymentMethodForm.appendChild(paypalNote);
    cardBody.appendChild(paymentMethodForm);
    
    // Add custom payment method UI based on provider
    // This is a placeholder - you would add the actual payment forms here
    // Calling your existing payment form setup
    
    card.appendChild(cardBody);
    
    // Card footer with subscribe button
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer';
    
    const subscribeButton = document.createElement('button');
    subscribeButton.className = 'btn btn-success';
    subscribeButton.textContent = 'Subscribe Now';
    subscribeButton.addEventListener('click', () => {
      // In a real implementation, you would first collect payment information
      // and then create the subscription with that information.
      // For now, we'll just simulate having a payment method ID.
      
      if (this.provider !== 'stripe') {
        alert('Only Stripe payments are currently supported. PayPal integration coming soon.');
        return;
      }
      
      if (!this.paymentMethodId) {
        // Simulate a payment method ID for demonstration
        this.paymentMethodId = 'pm_test_' + Math.random().toString(36).substring(2, 15);
      }
      
      this.subscriptionManager.createSubscription(
        this.selectedPlan.id,
        this.paymentMethodId,
        this.provider
      );
    });
    
    cardFooter.appendChild(subscribeButton);
    card.appendChild(cardFooter);
    
    subscriptionContainer.appendChild(card);
  }
}

export default SubscriptionFlow; 