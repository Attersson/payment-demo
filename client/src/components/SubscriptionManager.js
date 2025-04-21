class SubscriptionManager {
  constructor(containerId, apiBaseUrl = 'http://localhost:3000/api') {
    this.container = document.getElementById(containerId);
    this.apiBaseUrl = apiBaseUrl;
    this.subscription = null;
    this.customerId = null;
    this.onActionCompleteCallback = null;
  }

  setCustomerId(customerId) {
    this.customerId = customerId;
  }

  onActionComplete(callback) {
    this.onActionCompleteCallback = callback;
  }

  async initialize(subscriptionId = null) {
    try {
      // If no specific subscription is provided, we'll show subscription creation UI
      if (!subscriptionId) {
        this.renderCreateSubscription();
        return;
      }

      // Fetch subscription details
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${subscriptionId}`);
      const data = await response.json();
      
      if (data.success) {
        this.subscription = data.subscription;
        this.renderSubscriptionDetails();
      } else {
        console.error('Failed to fetch subscription:', data.message);
        this.renderError('Failed to load subscription details. Please try again later.');
      }
    } catch (error) {
      console.error('Error initializing subscription manager:', error);
      this.renderError('Failed to load subscription details. Please try again later.');
    }
  }

  async createSubscription(planId, paymentMethodId, provider = 'stripe') {
    try {
      if (!this.customerId) {
        this.renderError('Customer ID is required to create a subscription.');
        return;
      }

      // Create loading state
      this.renderLoading('Creating your subscription...');

      // Create the subscription
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerId: this.customerId,
          planId,
          paymentMethodId,
          provider
        })
      });

      const data = await response.json();
      
      if (data.success) {
        this.subscription = data.subscription;
        this.renderSubscriptionDetails();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('created', this.subscription);
        }
      } else {
        console.error('Failed to create subscription:', data.message);
        this.renderError(`Failed to create subscription: ${data.message}`);
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      this.renderError('Failed to create subscription. Please try again later.');
    }
  }

  async cancelSubscription() {
    try {
      if (!this.subscription) {
        this.renderError('No active subscription found.');
        return;
      }

      // Confirm cancellation
      if (!confirm('Are you sure you want to cancel your subscription?')) {
        return;
      }

      // Create loading state
      this.renderLoading('Cancelling your subscription...');

      // Cancel the subscription
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscriptionId: this.subscription.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        this.subscription = data.subscription;
        this.renderSubscriptionDetails();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('cancelled', this.subscription);
        }
      } else {
        console.error('Failed to cancel subscription:', data.message);
        this.renderError(`Failed to cancel subscription: ${data.message}`);
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      this.renderError('Failed to cancel subscription. Please try again later.');
    }
  }

  async pauseSubscription() {
    try {
      if (!this.subscription) {
        this.renderError('No active subscription found.');
        return;
      }

      // Create loading state
      this.renderLoading('Pausing your subscription...');

      // Pause the subscription
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${this.subscription.id}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        this.subscription = data.subscription;
        this.renderSubscriptionDetails();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('paused', this.subscription);
        }
      } else {
        console.error('Failed to pause subscription:', data.message);
        this.renderError(`Failed to pause subscription: ${data.message}`);
      }
    } catch (error) {
      console.error('Error pausing subscription:', error);
      this.renderError('Failed to pause subscription. Please try again later.');
    }
  }

  async resumeSubscription() {
    try {
      if (!this.subscription) {
        this.renderError('No active subscription found.');
        return;
      }

      // Create loading state
      this.renderLoading('Resuming your subscription...');

      // Resume the subscription
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${this.subscription.id}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        this.subscription = data.subscription;
        this.renderSubscriptionDetails();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('resumed', this.subscription);
        }
      } else {
        console.error('Failed to resume subscription:', data.message);
        this.renderError(`Failed to resume subscription: ${data.message}`);
      }
    } catch (error) {
      console.error('Error resuming subscription:', error);
      this.renderError('Failed to resume subscription. Please try again later.');
    }
  }

  async changePlan(newPlanId) {
    try {
      if (!this.subscription) {
        this.renderError('No active subscription found.');
        return;
      }

      // Create loading state
      this.renderLoading('Updating your subscription plan...');

      // Change the plan
      const response = await fetch(`${this.apiBaseUrl}/plans/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscriptionId: this.subscription.id,
          newPlanId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        this.subscription = data.subscription;
        this.renderSubscriptionDetails();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('plan_changed', this.subscription);
        }
      } else {
        console.error('Failed to change plan:', data.message);
        this.renderError(`Failed to change plan: ${data.message}`);
      }
    } catch (error) {
      console.error('Error changing plan:', error);
      this.renderError('Failed to change plan. Please try again later.');
    }
  }

  renderCreateSubscription() {
    // This will be handled by the PlanSelection component
    // This component just provides the API methods
    if (this.container) {
      this.container.innerHTML = '';
      
      const message = document.createElement('div');
      message.className = 'alert alert-info';
      message.textContent = 'Please select a plan to create a subscription.';
      
      this.container.appendChild(message);
    }
  }

  renderSubscriptionDetails() {
    if (!this.container || !this.subscription) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create card
    const card = document.createElement('div');
    card.className = 'card';
    
    // Card header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = 'Subscription Details';
    
    cardHeader.appendChild(title);
    card.appendChild(cardHeader);
    
    // Card body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // Create a table for subscription details
    const table = document.createElement('table');
    table.className = 'table';
    
    const tbody = document.createElement('tbody');
    
    // Add rows for subscription details
    const detailsMap = [
      { label: 'Status', value: this.formatStatus(this.subscription.status) },
      { label: 'Plan', value: this.subscription.plan_name || this.subscription.plan_id },
      { label: 'Start Date', value: this.formatDate(this.subscription.start_date) },
      { label: 'Current Period', value: `${this.formatDate(this.subscription.current_period_start)} to ${this.formatDate(this.subscription.current_period_end)}` },
      { label: 'Provider', value: this.subscription.provider }
    ];
    
    detailsMap.forEach(detail => {
      const row = document.createElement('tr');
      
      const labelCell = document.createElement('th');
      labelCell.scope = 'row';
      labelCell.textContent = detail.label;
      
      const valueCell = document.createElement('td');
      valueCell.innerHTML = detail.value;
      
      row.appendChild(labelCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    cardBody.appendChild(table);
    card.appendChild(cardBody);
    
    // Card footer with action buttons
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer d-flex justify-content-between';
    
    // Add buttons based on subscription status
    if (this.subscription.status === 'active') {
      // Pause button
      const pauseButton = document.createElement('button');
      pauseButton.className = 'btn btn-warning';
      pauseButton.textContent = 'Pause Subscription';
      pauseButton.addEventListener('click', () => this.pauseSubscription());
      cardFooter.appendChild(pauseButton);
      
      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn btn-danger';
      cancelButton.textContent = 'Cancel Subscription';
      cancelButton.addEventListener('click', () => this.cancelSubscription());
      cardFooter.appendChild(cancelButton);
      
      // Change plan button
      const changePlanButton = document.createElement('button');
      changePlanButton.className = 'btn btn-primary';
      changePlanButton.textContent = 'Change Plan';
      changePlanButton.addEventListener('click', () => this.showChangePlanModal());
      cardFooter.appendChild(changePlanButton);
    } else if (this.subscription.status === 'paused') {
      // Resume button
      const resumeButton = document.createElement('button');
      resumeButton.className = 'btn btn-success';
      resumeButton.textContent = 'Resume Subscription';
      resumeButton.addEventListener('click', () => this.resumeSubscription());
      cardFooter.appendChild(resumeButton);
      
      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn btn-danger';
      cancelButton.textContent = 'Cancel Subscription';
      cancelButton.addEventListener('click', () => this.cancelSubscription());
      cardFooter.appendChild(cancelButton);
    } else if (this.subscription.status === 'canceled' || this.subscription.status === 'expired') {
      // New subscription button
      const newSubButton = document.createElement('button');
      newSubButton.className = 'btn btn-primary';
      newSubButton.textContent = 'Create New Subscription';
      newSubButton.addEventListener('click', () => {
        this.subscription = null;
        this.renderCreateSubscription();
      });
      cardFooter.appendChild(newSubButton);
    }
    
    card.appendChild(cardFooter);
    this.container.appendChild(card);
  }

  renderLoading(message = 'Loading...') {
    if (!this.container) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create loading message
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'd-flex justify-content-center align-items-center';
    loadingDiv.style.minHeight = '200px';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner-border text-primary me-3';
    spinner.role = 'status';
    
    const loadingText = document.createElement('h4');
    loadingText.textContent = message;
    
    loadingDiv.appendChild(spinner);
    loadingDiv.appendChild(loadingText);
    
    this.container.appendChild(loadingDiv);
  }

  renderError(message) {
    if (!this.container) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger';
    alert.textContent = message;
    
    this.container.appendChild(alert);
  }

  showChangePlanModal() {
    // This would be implemented with a modal and the PlanSelection component
    alert('Plan change functionality would be implemented with a modal showing available plans.');
  }

  formatStatus(status) {
    const statusMap = {
      'active': '<span class="badge bg-success">Active</span>',
      'paused': '<span class="badge bg-warning text-dark">Paused</span>',
      'canceled': '<span class="badge bg-danger">Cancelled</span>',
      'past_due': '<span class="badge bg-warning text-dark">Past Due</span>',
      'incomplete': '<span class="badge bg-secondary">Incomplete</span>',
      'expired': '<span class="badge bg-secondary">Expired</span>',
      'trial': '<span class="badge bg-info">Trial</span>'
    };
    
    return statusMap[status] || `<span class="badge bg-secondary">${status}</span>`;
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }
}

export default SubscriptionManager; 