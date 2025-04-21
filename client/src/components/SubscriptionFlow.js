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
    if (!this.container) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create containers for sub-components
    const planContainer = document.createElement('div');
    planContainer.id = `${this.container.id}-plans`;
    this.container.appendChild(planContainer);
    
    const subscriptionContainer = document.createElement('div');
    subscriptionContainer.id = `${this.container.id}-subscription`;
    this.container.appendChild(subscriptionContainer);
  }

  async initialize(existingSubscriptionId = null) {
    // Set up event handlers
    this.planSelector.onPlanSelect((plan) => {
      this.selectedPlan = plan;
      this.renderCreateSubscriptionButton();
    });
    
    this.subscriptionManager.onActionComplete((action, subscription) => {
      if (action === 'created' || action === 'plan_changed') {
        // Hide the plan selection and just show subscription management
        document.getElementById(`${this.container.id}-plans`).classList.add('d-none');
      } else if (action === 'cancelled') {
        // Show the plan selection again
        document.getElementById(`${this.container.id}-plans`).classList.remove('d-none');
        
        // Refresh plans
        this.planSelector.initialize();
      }
    });
    
    // Initialize components
    if (existingSubscriptionId) {
      // If we have an existing subscription, hide plan selection
      document.getElementById(`${this.container.id}-plans`).classList.add('d-none');
      await this.subscriptionManager.initialize(existingSubscriptionId);
    } else {
      // Otherwise initialize plan selection
      await this.planSelector.initialize();
      
      // Check if user has any existing subscriptions
      try {
        // This would be a call to your API to get the customer's subscriptions
        // const response = await fetch(`${this.apiBaseUrl}/subscriptions?customerId=${this.customerId}`);
        // const data = await response.json();
        
        // if (data.success && data.subscriptions.length > 0) {
        //   // If user has an active subscription, initialize subscription manager with it
        //   const activeSubscription = data.subscriptions.find(s => s.status === 'active');
        //   if (activeSubscription) {
        //     document.getElementById(`${this.container.id}-plans`).classList.add('d-none');
        //     await this.subscriptionManager.initialize(activeSubscription.id);
        //   }
        // } else {
        //   // No subscriptions, just show the plan selection
        //   document.getElementById(`${this.container.id}-subscription`).classList.add('d-none');
        // }
        
        // For now, just hide the subscription manager since we're starting with plan selection
        document.getElementById(`${this.container.id}-subscription`).classList.add('d-none');
      } catch (error) {
        console.error('Error checking for existing subscriptions:', error);
      }
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
    
    const paymentMethods = ['Credit Card', 'PayPal']; // This would be dynamic based on available methods
    
    const paymentMethodSelect = document.createElement('select');
    paymentMethodSelect.className = 'form-select';
    
    paymentMethods.forEach((method, index) => {
      const option = document.createElement('option');
      option.value = index === 0 ? 'stripe' : 'paypal';
      option.textContent = method;
      paymentMethodSelect.appendChild(option);
    });
    
    paymentMethodSelect.addEventListener('change', (e) => {
      this.provider = e.target.value;
      
      // You would handle payment method UI changes here
      // For example, showing a credit card form for Stripe
      // or redirecting to PayPal for PayPal
    });
    
    paymentMethodForm.appendChild(paymentMethodLabel);
    paymentMethodForm.appendChild(paymentMethodSelect);
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