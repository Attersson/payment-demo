class PlanSelection {
  constructor(containerId, apiBaseUrl = 'http://localhost:3000/api') {
    this.container = document.getElementById(containerId);
    this.apiBaseUrl = apiBaseUrl;
    this.plans = [];
    this.selectedPlan = null;
    this.onPlanSelectCallback = null;
  }

  async initialize() {
    try {
      // Fetch plans from the API
      const response = await fetch(`${this.apiBaseUrl}/plans`);
      const data = await response.json();
      
      if (data.success) {
        this.plans = data.plans;
        console.log('Fetched plans data:', this.plans); // Debug log to see plan data structure
        this.render();
      } else {
        console.error('Failed to fetch plans:', data.message);
        this.renderError('Failed to load plans. Please try again later.');
      }
    } catch (error) {
      console.error('Error initializing plan selection:', error);
      this.renderError('Failed to load plans. Please try again later.');
    }
  }

  onPlanSelect(callback) {
    this.onPlanSelectCallback = callback;
  }

  render() {
    if (!this.container) return;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create header
    const header = document.createElement('h2');
    header.className = 'text-center mb-4';
    header.textContent = 'Choose a Plan';
    this.container.appendChild(header);
    
    // Create plan cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'row row-cols-1 row-cols-md-3 g-4 mb-4';
    
    // Create a card for each plan
    this.plans.forEach(plan => {
      // Debug log to see individual plan data
      console.log(`Rendering plan ${plan.id}:`, plan);
      
      const cardCol = document.createElement('div');
      cardCol.className = 'col';
      
      const card = document.createElement('div');
      card.className = 'card h-100';
      
      if (this.selectedPlan && this.selectedPlan.id === plan.id) {
        card.classList.add('border-primary');
      }
      
      // Card header
      const cardHeader = document.createElement('div');
      cardHeader.className = 'card-header text-center';
      
      const planName = document.createElement('h5');
      planName.className = 'card-title mb-0';
      planName.textContent = plan.name || 'Plan';
      
      cardHeader.appendChild(planName);
      card.appendChild(cardHeader);
      
      // Card body
      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';
      
      const priceElement = document.createElement('h3');
      priceElement.className = 'text-center mb-3';
      
      // Improved price parsing to handle all possible formats
      let price = 0;
      
      // Try to parse price from various possible formats
      if (typeof plan.price === 'number') {
        price = plan.price;
      } else if (typeof plan.price === 'string') {
        price = parseFloat(plan.price);
      } else if (typeof plan.amount === 'number') {
        price = plan.amount / 100;
      } else if (typeof plan.amount === 'string') {
        price = parseFloat(plan.amount) / 100;
      }
      
      // Log the extracted price for debugging
      console.log(`Plan ${plan.id} price calculation:`, {
        rawPrice: plan.price,
        rawAmount: plan.amount,
        calculatedPrice: price
      });
      
      const formattedPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: plan.currency || 'USD'
      }).format(price);
      
      // Get interval from either direct field or billing_cycle
      const interval = plan.interval || plan.billing_cycle || 'month';
      
      priceElement.innerHTML = `${formattedPrice}<small class="text-muted">/${interval}</small>`;
      cardBody.appendChild(priceElement);
      
      // Features list - handle features from API or features array
      if (plan.features) {
        const featuresList = document.createElement('ul');
        featuresList.className = 'list-group list-group-flush mb-3';
        
        // Handle features array or object with array inside
        const featuresArray = Array.isArray(plan.features) ? plan.features : 
                              (Array.isArray(plan.features.features) ? plan.features.features : 
                               (typeof plan.features === 'object' ? [plan.features] : []));
        
        featuresArray.forEach(feature => {
          const featureItem = document.createElement('li');
          featureItem.className = 'list-group-item';
          
          // Handle different feature formats
          if (typeof feature === 'string') {
            featureItem.textContent = feature;
          } else if (feature && typeof feature === 'object') {
            // If feature is an object with name property
            const featureName = feature.name || 'Feature';
            const featureIncluded = feature.included !== undefined ? feature.included : true;
            const featureLimit = feature.feature_limit || feature.limit;
            const featureUnits = feature.units || '';
            
            if (featureIncluded) {
              if (featureLimit) {
                featureItem.textContent = `${featureName}: ${featureLimit} ${featureUnits}`;
              } else {
                featureItem.textContent = featureName;
              }
              featureItem.classList.add('text-success');
            } else {
              featureItem.textContent = `${featureName} (Not included)`;
              featureItem.classList.add('text-muted');
            }
          }
          
          featuresList.appendChild(featureItem);
        });
        
        cardBody.appendChild(featuresList);
      }
      
      // Description
      if (plan.description) {
        const description = document.createElement('p');
        description.className = 'card-text';
        description.textContent = plan.description;
        cardBody.appendChild(description);
      }
      
      card.appendChild(cardBody);
      
      // Card footer with select button
      const cardFooter = document.createElement('div');
      cardFooter.className = 'card-footer text-center';
      
      const selectButton = document.createElement('button');
      selectButton.className = 'btn btn-primary';
      selectButton.textContent = this.selectedPlan && this.selectedPlan.id === plan.id ? 
        'Selected' : 'Select Plan';
      
      if (this.selectedPlan && this.selectedPlan.id === plan.id) {
        selectButton.disabled = true;
      }
      
      selectButton.addEventListener('click', () => {
        this.selectPlan(plan);
      });
      
      cardFooter.appendChild(selectButton);
      card.appendChild(cardFooter);
      
      // Add card to container
      cardCol.appendChild(card);
      cardsContainer.appendChild(cardCol);
    });
    
    this.container.appendChild(cardsContainer);
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

  selectPlan(plan) {
    this.selectedPlan = plan;
    
    // Call the callback if set
    if (this.onPlanSelectCallback) {
      this.onPlanSelectCallback(plan);
    }
    
    // Re-render to update the UI
    this.render();
  }
}

export default PlanSelection; 