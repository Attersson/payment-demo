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
      planName.textContent = plan.name;
      
      cardHeader.appendChild(planName);
      card.appendChild(cardHeader);
      
      // Card body
      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';
      
      const priceElement = document.createElement('h3');
      priceElement.className = 'text-center mb-3';
      
      // Format price based on interval
      const formattedPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: plan.currency || 'USD'
      }).format(plan.amount / 100);
      
      priceElement.innerHTML = `${formattedPrice}<small class="text-muted">/${plan.interval}</small>`;
      cardBody.appendChild(priceElement);
      
      // Features list
      if (plan.features && plan.features.length > 0) {
        const featuresList = document.createElement('ul');
        featuresList.className = 'list-group list-group-flush mb-3';
        
        plan.features.forEach(feature => {
          const featureItem = document.createElement('li');
          featureItem.className = 'list-group-item';
          featureItem.textContent = feature;
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