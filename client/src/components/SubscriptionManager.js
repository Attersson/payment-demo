class SubscriptionManager {
  constructor(containerId, apiBaseUrl = 'http://localhost:3000/api') {
    this.containerId = containerId; // Store the ID for later use
    this.container = document.getElementById(containerId);
    this.apiBaseUrl = apiBaseUrl;
    this.subscriptions = [];
    this.customerId = null;
    this.onActionCompleteCallback = null;
    
    // If container wasn't found on initialization, set up a retry mechanism
    if (!this.container) {
      console.warn(`Container with ID ${containerId} not found during initialization. Will attempt to find it when needed.`);
      
      // Try to find it on the next tick (after DOM might be updated)
      setTimeout(() => {
        this.container = document.getElementById(this.containerId);
        if (this.container) {
          console.log(`Container with ID ${this.containerId} found after delay.`);
        }
      }, 100);
    }
  }

  setCustomerId(customerId) {
    this.customerId = customerId;
  }

  onActionComplete(callback) {
    this.onActionCompleteCallback = callback;
  }

  async initialize(subscriptionId = null) {
    // Log the state of container and containerId at the start of initialization
    console.log(`SubscriptionManager.initialize START: Container:`, this.container, `Container ID: ${this.containerId}`);
    
    try {
      // If no specific subscription is provided, try to fetch customer subscriptions
      if (!subscriptionId && this.customerId) {
        console.log(`Fetching subscriptions for customer: ${this.customerId}`);
        
        try {
          // Try to fetch from our API first with direct=true to force Stripe lookup
          const response = await fetch(`${this.apiBaseUrl}/customers/${this.customerId}/subscriptions?provider=stripe&direct=true`);
          const data = await response.json();
          
          console.log('Customer subscriptions API response:', data);
          
          // Process the subscriptions if we got them successfully
          if (data && data.success && data.subscriptions) {
            if (Array.isArray(data.subscriptions)) {
              this.subscriptions = data.subscriptions;
              console.log(`SubscriptionManager.initialize: About to render list (Array). Container:`, this.container);
              this.renderSubscriptionsList();
              return;
            } else {
              // Handle case where it's not an array but an object
              this.subscriptions = [data.subscriptions];
              console.log(`SubscriptionManager.initialize: About to render list (Object). Container:`, this.container);
              this.renderSubscriptionsList();
              return;
            }
          } else if (data && data.error && data.error.includes('database')) {
            // Database error but maybe we have subscription data
            if (data.subscriptions) {
              console.log('Using subscription data from Stripe despite database error');
              const subscriptions = Array.isArray(data.subscriptions) ? 
                data.subscriptions : [data.subscriptions];
              this.subscriptions = subscriptions;
              console.log(`SubscriptionManager.initialize: About to render list (DB Error Fallback). Container:`, this.container);
              this.renderSubscriptionsList();
              return;
            }
          } else {
            console.log('No subscriptions found or API response not successful:', data);
          }
        } catch (apiError) {
          console.error('Error fetching subscriptions from API:', apiError);
          // We'll continue to the fallback approach below
        }
        
        // If we reach here, there was an issue or no subscriptions found
        // Let's try a fallback approach by fetching subscription data directly
        try {
          console.log('Attempting direct fetch strategy...');
          // Display a message to the user that we're trying to retrieve data
          console.log(`SubscriptionManager.initialize: About to render loading (Direct Fetch). Container:`, this.container);
          this.renderLoading('Trying to retrieve your subscriptions directly...');
          
          // Try to directly get subscription data if we have a customerId
          const directResponse = await fetch(`${this.apiBaseUrl}/subscriptions/list-direct?customerId=${this.customerId}&provider=stripe`);
          const directData = await directResponse.json();
          
          if (directData && directData.success && directData.subscriptions) {
            console.log('Direct fetch successful:', directData);
            const subscriptions = Array.isArray(directData.subscriptions) ? 
              directData.subscriptions : [directData.subscriptions];
            this.subscriptions = subscriptions;
            console.log(`SubscriptionManager.initialize: About to render list (Direct Fetch Success). Container:`, this.container);
            this.renderSubscriptionsList();
            return;
          } else {
            console.log('Direct fetch was unsuccessful:', directData);
          }
        } catch (directError) {
          console.error('Error with direct fetch approach:', directError);
        }
        
        // If we still don't have subscriptions, check if there's a last known subscription ID in localStorage
        const lastSubscriptionId = localStorage.getItem(`${this.customerId}_last_subscription`);
        if (lastSubscriptionId) {
          console.log(`Trying with last known subscription ID: ${lastSubscriptionId}`);
          try {
            await this.initialize(lastSubscriptionId);
            return;
          } catch (lastSubError) {
            console.error('Error using last known subscription ID:', lastSubError);
          }
        }
        
        // If all else fails, show the create subscription or no subscriptions message
        console.log(`SubscriptionManager.initialize: About to render create message (Fallback). Container:`, this.container);
        this.renderCreateSubscription();
        return;
      }
      
      // If we have a specific subscription ID, fetch that subscription
      if (subscriptionId) {
        console.log(`Fetching subscription details for: ${subscriptionId}`);
        
        // Store this subscription ID for future reference
        if (this.customerId) {
          localStorage.setItem(`${this.customerId}_last_subscription`, subscriptionId);
        }
        
        // Ensure subscriptionId is a string and then check if it starts with 'test_'
        const subscriptionIdStr = String(subscriptionId);
        const isTestSubscription = subscriptionIdStr.startsWith('test_');
        
        // Add a parameter to force direct Stripe lookup
        const endpoint = isTestSubscription 
          ? `${this.apiBaseUrl}/test/subscriptions/${subscriptionIdStr}`
          : `${this.apiBaseUrl}/subscriptions/${subscriptionIdStr}?direct=true`; 
        
        try {
          // First try with our API
          const response = await fetch(endpoint);
          console.log('Raw API response status:', response.status);
          
          const data = await response.json();
          console.log('Subscription API response:', data);
          
          // Handle successful response
          if (data && (data.success || data.data)) {
            console.log(`SubscriptionManager.initialize: About to process data (API Success). Container:`, this.container);
            this.processSubscriptionData(data, subscriptionId);
            return;
          } else if (data && data.error && data.error.includes('database')) {
            // We have a database error but maybe subscription data is available
            if (data.subscription || data.subscriptions) {
              console.log('Using subscription data despite database error');
              const subscriptionData = data.subscription || data.subscriptions;
              console.log(`SubscriptionManager.initialize: About to process data (DB Error Fallback). Container:`, this.container);
              this.processSubscriptionData({ data: subscriptionData }, subscriptionId);
              return;
            }
          }
          
          console.warn('Unexpected API response format, will try direct method');
        } catch (apiError) {
          console.error('Error fetching from API:', apiError);
        }
        
        // If we reach here, try a direct method as fallback
        try {
          console.log('Attempting direct subscription fetch...');
          const directEndpoint = `${this.apiBaseUrl}/subscriptions/get-direct/${subscriptionIdStr}?provider=stripe`;
          const directResponse = await fetch(directEndpoint);
          const directData = await directResponse.json();
          
          if (directData && (directData.success || directData.data)) {
            console.log('Direct subscription fetch successful');
            console.log(`SubscriptionManager.initialize: About to process data (Direct Success). Container:`, this.container);
            this.processSubscriptionData(directData, subscriptionId);
            return;
          } else {
            console.warn('Direct subscription fetch failed:', directData);
          }
        } catch (directError) {
          console.error('Error with direct subscription fetch:', directError);
        }
        
        // Create a minimal fallback subscription with the ID we have
        console.log('Creating minimal fallback subscription object');
        const fallbackSub = {
          id: subscriptionId,
          status: 'unknown',
          start_date: new Date().toISOString(),
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
          plan_id: 'unknown',
          plan_name: 'Subscription',
          provider: 'stripe'
        };
        
        this.subscription = fallbackSub;
        console.log(`SubscriptionManager.initialize: About to render details (Minimal Fallback). Container:`, this.container);
        this.renderSubscriptionDetails(this.subscription);
      } else {
        // No subscription ID and no customer ID
        console.log(`SubscriptionManager.initialize: About to render create message (No IDs). Container:`, this.container);
        this.renderCreateSubscription();
      }
    } catch (error) {
      console.error('Error initializing subscription manager:', error);
      console.log(`SubscriptionManager.initialize: About to render error. Container:`, this.container);
      this.renderError(`Failed to load subscription details: ${error.message || 'Unknown error'}`);
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
        this.renderSubscriptionDetails(this.subscription);
        
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

  async cancelSubscription(subscriptionId) {
    try {
      if (!subscriptionId) {
        this.renderError('No subscription ID provided.');
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
          subscriptionId: subscriptionId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Update the subscription in our list
        if (this.subscriptions) {
          this.subscriptions = this.subscriptions.map(sub => 
            sub.id === subscriptionId ? { ...sub, status: data.status || 'canceled' } : sub
          );
        }
        
        // Refresh the subscription list
        this.initialize();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('cancelled', data.subscription || { id: subscriptionId });
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

  async pauseSubscription(subscriptionId) {
    try {
      if (!subscriptionId) {
        this.renderError('No subscription ID provided.');
        return;
      }

      // Create loading state
      this.renderLoading('Pausing your subscription...');

      // Pause the subscription
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${subscriptionId}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        // Update the subscription in our list
        if (this.subscriptions) {
          this.subscriptions = this.subscriptions.map(sub => 
            sub.id === subscriptionId ? { ...sub, status: data.status || 'paused' } : sub
          );
        }
        
        // Refresh the subscription list
        this.initialize();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('paused', data.subscription || { id: subscriptionId });
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

  async resumeSubscription(subscriptionId) {
    try {
      if (!subscriptionId) {
        this.renderError('No subscription ID provided.');
        return;
      }

      // Create loading state
      this.renderLoading('Resuming your subscription...');

      // Resume the subscription
      const response = await fetch(`${this.apiBaseUrl}/subscriptions/${subscriptionId}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        // Update the subscription in our list
        if (this.subscriptions) {
          this.subscriptions = this.subscriptions.map(sub => 
            sub.id === subscriptionId ? { ...sub, status: data.status || 'active' } : sub
          );
        }
        
        // Refresh the subscription list
        this.initialize();
        
        // Call the callback if set
        if (this.onActionCompleteCallback) {
          this.onActionCompleteCallback('resumed', data.subscription || { id: subscriptionId });
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
        this.renderSubscriptionDetails(this.subscription);
        
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
    // Updated to not show plan selection but instead a message directing to subscription tab
    if (this.ensureContainer()) {
      // Clear any loading spinners
      const spinners = this.container.querySelectorAll('.spinner-border');
      if (spinners.length > 0) {
        spinners.forEach(spinner => {
          if (spinner.parentElement && spinner.parentElement.classList.contains('d-flex')) {
            spinner.parentElement.remove();
          } else {
            spinner.remove();
          }
        });
      }
      
      // Clear container
      this.container.innerHTML = '';
      
      const message = document.createElement('div');
      message.className = 'alert alert-info';
      message.innerHTML = 'No active subscriptions found. To create a new subscription, please use the <strong>Subscription</strong> tab in the main payment form above.';
      
      this.container.appendChild(message);
    }
  }

  renderSubscriptionDetails(subscription) {
    if (!this.ensureContainer()) {
      console.error('Cannot render subscription details: container is missing');
      return;
    }
    
    if (!subscription) {
      console.error('Cannot render subscription details: subscription is missing');
      this.renderError('Subscription data is not available');
      return;
    }
    
    console.log('Rendering subscription details:', subscription);
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create card
    const card = document.createElement('div');
    card.className = 'card';
    
    // Card header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header d-flex justify-content-between align-items-center';
    
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = 'Subscription Details';
    
    const backButton = document.createElement('button');
    backButton.className = 'btn btn-sm btn-outline-secondary';
    backButton.textContent = 'Back to All Subscriptions';
    backButton.addEventListener('click', () => {
      if (this.subscriptions && this.subscriptions.length > 0) {
        this.renderSubscriptionsList();
      } else {
        this.initialize();
      }
    });
    
    cardHeader.appendChild(title);
    cardHeader.appendChild(backButton);
    card.appendChild(cardHeader);
    
    // Card body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // Create a table for subscription details
    const table = document.createElement('table');
    table.className = 'table';
    
    const tbody = document.createElement('tbody');
    
    // Safely get subscription properties with fallbacks
    const status = subscription.status || 'unknown';
    const planName = subscription.plan_name || 
                     subscription.items?.data?.[0]?.plan?.nickname || 
                     'Unknown Plan';
    const planId = subscription.plan_id || 
                   subscription.items?.data?.[0]?.plan?.id || 
                   'unknown';
    const startDate = this.formatDate(subscription.start_date || subscription.created);
    const currentPeriodStart = this.formatDate(subscription.current_period_start);
    const currentPeriodEnd = this.formatDate(subscription.current_period_end);
    const provider = subscription.provider || 'unknown';
    
    // Add rows for subscription details
    const detailsMap = [
      { label: 'Status', value: this.formatStatus(status) },
      { label: 'Plan', value: planName || planId },
      { label: 'Start Date', value: startDate },
      { label: 'Current Period', value: `${currentPeriodStart} to ${currentPeriodEnd}` },
      { label: 'Provider', value: provider },
      { label: 'ID', value: subscription.id || 'Unknown' }
    ];
    
    // Log the details we're rendering for debugging
    console.log('Rendering subscription details:', detailsMap);
    
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
    if (status === 'active') {
      // Pause button
      const pauseButton = document.createElement('button');
      pauseButton.className = 'btn btn-warning';
      pauseButton.textContent = 'Pause Subscription';
      pauseButton.addEventListener('click', () => this.pauseSubscription(subscription.id));
      cardFooter.appendChild(pauseButton);
      
      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn btn-danger';
      cancelButton.textContent = 'Cancel Subscription';
      cancelButton.addEventListener('click', () => this.cancelSubscription(subscription.id));
      cardFooter.appendChild(cancelButton);
      
      // Change plan button
      const changePlanButton = document.createElement('button');
      changePlanButton.className = 'btn btn-primary';
      changePlanButton.textContent = 'Change Plan';
      changePlanButton.addEventListener('click', () => this.showChangePlanModal(subscription.id));
      cardFooter.appendChild(changePlanButton);
    } else if (status === 'paused') {
      // Resume button
      const resumeButton = document.createElement('button');
      resumeButton.className = 'btn btn-success';
      resumeButton.textContent = 'Resume Subscription';
      resumeButton.addEventListener('click', () => this.resumeSubscription(subscription.id));
      cardFooter.appendChild(resumeButton);
      
      // Cancel button
      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn btn-danger';
      cancelButton.textContent = 'Cancel Subscription';
      cancelButton.addEventListener('click', () => this.cancelSubscription(subscription.id));
      cardFooter.appendChild(cancelButton);
    } else if (status === 'canceled' || status === 'cancelled' || status === 'expired') {
      // For cancelled subscriptions, just show a message that new subscriptions should be created using the subscription tab
      const infoMessage = document.createElement('div');
      infoMessage.className = 'alert alert-info w-100 mb-0';
      infoMessage.innerHTML = 'To create a new subscription, please use the <strong>Subscription</strong> tab in the main payment form above.';
      cardFooter.appendChild(infoMessage);
    }
    
    card.appendChild(cardFooter);
    this.container.appendChild(card);
  }

  renderLoading(message = 'Loading...') {
    if (!this.ensureContainer()) return;
    
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
    if (!this.ensureContainer()) {
      console.error(`Could not render error: ${message}`);
      return;
    }
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger';
    alert.textContent = message;
    
    this.container.appendChild(alert);
  }

  showChangePlanModal(subscriptionId) {
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
    
    try {
      // Handle Unix timestamps (seconds since epoch)
      if (typeof dateString === 'number') {
        // Ensure the timestamp is in milliseconds
        const timestamp = dateString > 10000000000 ? dateString : dateString * 1000;
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString();
        }
      }
      
      // Handle regular date strings
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date format:', dateString);
        return 'N/A';
      }
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error, dateString);
      return 'N/A';
    }
  }

  // Render a list of subscriptions
  renderSubscriptionsList() {
    if (!this.ensureContainer() || !this.subscriptions || this.subscriptions.length === 0) {
      this.renderCreateSubscription();
      return;
    }
    
    console.log('Rendering subscriptions list:', this.subscriptions);
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create card
    const card = document.createElement('div');
    card.className = 'card';
    
    // Card header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header bg-primary text-white';
    
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = 'Your Subscriptions';
    
    cardHeader.appendChild(title);
    card.appendChild(cardHeader);
    
    // Card body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    if (this.subscriptions.length === 0) {
      const noSubscriptions = document.createElement('p');
      noSubscriptions.textContent = 'You don\'t have any subscriptions yet.';
      cardBody.appendChild(noSubscriptions);
    } else {
      // Create a table for subscriptions
      const table = document.createElement('table');
      table.className = 'table table-striped';
      
      // Table header
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      const headers = ['Plan', 'Status', 'Start Date', 'Renewal Date', 'Actions'];
      
      headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);
      table.appendChild(thead);
      
      // Table body
      const tbody = document.createElement('tbody');
      
      this.subscriptions.forEach(subscription => {
        const row = document.createElement('tr');
        
        // Plan name
        const planCell = document.createElement('td');
        const planName = subscription.plan_name || subscription.plan_id || subscription.items?.data?.[0]?.plan?.nickname || 'Unknown Plan';
        planCell.textContent = planName;
        
        // Status
        const statusCell = document.createElement('td');
        statusCell.innerHTML = this.formatStatus(subscription.status || 'unknown');
        
        // Start date
        const startDateCell = document.createElement('td');
        startDateCell.textContent = this.formatDate(subscription.start_date || subscription.created);
        
        // Renewal date
        const renewalDateCell = document.createElement('td');
        renewalDateCell.textContent = this.formatDate(subscription.current_period_end);
        
        // Actions
        const actionsCell = document.createElement('td');
        
        const viewButton = document.createElement('button');
        viewButton.className = 'btn btn-sm btn-primary me-2';
        viewButton.textContent = 'Manage';
        viewButton.addEventListener('click', () => this.renderSubscriptionDetails(subscription));
        
        actionsCell.appendChild(viewButton);
        
        // Add cells to row
        row.appendChild(planCell);
        row.appendChild(statusCell);
        row.appendChild(startDateCell);
        row.appendChild(renewalDateCell);
        row.appendChild(actionsCell);
        
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      cardBody.appendChild(table);
    }
    
    card.appendChild(cardBody);
    
    // Remove the "Create New Subscription" button from the footer
    this.container.appendChild(card);
  }

  // Add this helper method to ensure container is available
  ensureContainer() {
    // Log the current state of this.container and this.containerId
    console.log(`ensureContainer: Current this.container:`, this.container, `Current this.containerId: ${this.containerId}`);
    
    // If this.container is already a valid DOM element, we are good.
    if (this.container && typeof this.container.appendChild === 'function') {
      return true;
    }
    
    // If container wasn't found before OR is not a valid element, try to find it again using the ID.
    if (this.containerId) {
      console.log(`Trying to find container with ID: ${this.containerId}`);
      const foundContainer = document.getElementById(this.containerId);
      
      if (foundContainer) {
        console.log('Found container via getElementById');
        this.container = foundContainer; // Assign the found element
        return true;
      } else {
        // Look for any subscription container as a fallback (original fallback)
        const subscriptionContainer = document.querySelector('[id$="-subscription"]');
        if (subscriptionContainer) {
          console.log(`Found alternative container with ID: ${subscriptionContainer.id}`);
          this.container = subscriptionContainer;
          this.containerId = subscriptionContainer.id;
          return true;
        } else {
          console.error('No subscription container could be found in the DOM');
          return false;
        }
      }
    } else {
      console.error('Cannot ensure container: containerId is missing.');
      return false;
    }
  }

  // Helper method to process and standardize subscription data from different sources
  processSubscriptionData(data, subscriptionId) {
    const defaultSubscription = {
      id: subscriptionId,
      status: 'active',
      start_date: new Date().toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      plan_id: 'unknown',
      plan_name: 'Subscription Plan',
      provider: 'stripe'
    };
    
    try {
      // The subscription might be directly in the response, 
      // or in a 'subscription' property, or in 'data'
      if (data.subscription) {
        this.subscription = { ...defaultSubscription, ...data.subscription };
      } else if (data.data) {
        // Format the data into the expected structure
        const formattedSubscription = {
          id: data.subscriptionId || data.data.id || subscriptionId,
          status: data.status || data.data.status || 'active',
          provider: 'stripe',
          // Handle date properties with fallbacks
          start_date: data.data.created ? 
            new Date(data.data.created * 1000).toISOString() : 
            defaultSubscription.start_date,
          current_period_start: data.data.current_period_start ? 
            new Date(data.data.current_period_start * 1000).toISOString() : 
            defaultSubscription.current_period_start,
          current_period_end: data.data.current_period_end ?
            new Date(data.data.current_period_end * 1000).toISOString() :
            defaultSubscription.current_period_end,
          // Handle plan details
          plan_id: data.data.plan?.id || 
            data.data.items?.data?.[0]?.plan?.id || 
            defaultSubscription.plan_id,
          plan_name: data.data.plan?.nickname || 
            data.data.items?.data?.[0]?.plan?.nickname || 
            defaultSubscription.plan_name
        };
        
        this.subscription = formattedSubscription;
      } else if (data.success) {
        // Data exists but not in expected format, use the bare minimum
        this.subscription = { 
          ...defaultSubscription,
          ...data // Include any available properties from the response
        };
      } else {
        // Fallback to default if structure is completely unexpected
        this.subscription = defaultSubscription;
        console.warn('Using fallback subscription object - unexpected data format', data);
      }
      
      console.log('Processed subscription data:', this.subscription);
      
      // Ensure we have a subscription object before rendering
      if (this.subscription && typeof this.subscription === 'object') {
        this.renderSubscriptionDetails(this.subscription);
      } else {
        console.error('Failed to create valid subscription object', data);
        this.renderError(`Failed to load subscription details: Invalid subscription data`);
      }
    } catch (processingError) {
      console.error('Error processing subscription data:', processingError);
      this.subscription = defaultSubscription;
      this.renderSubscriptionDetails(this.subscription);
    }
  }
}

export default SubscriptionManager; 