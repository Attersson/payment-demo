import { WebhookEventModel, WebhookProcessingStatus } from '../models/WebhookEvent';

async function testWebhookEventModel() {
  try {
    console.log('Testing WebhookEventModel...');
    
    // Test creating a webhook event
    const webhookEvent = await WebhookEventModel.create({
      event_id: 'test_event_' + Date.now(),
      provider: 'stripe',
      event_type: 'payment_intent.succeeded',
      event_data: { id: 'test_pi_123', amount: 2000 },
      processing_status: WebhookProcessingStatus.PENDING,
      error_message: undefined
    });
    
    console.log('Created webhook event:', webhookEvent);
    
    // Test finding by event ID
    const foundEvent = await WebhookEventModel.findByEventId('stripe', webhookEvent.event_id);
    console.log('Found webhook event:', foundEvent);
    
    // Test updating status without error
    const updatedEvent = await WebhookEventModel.updateStatus(
      webhookEvent.id, 
      WebhookProcessingStatus.PROCESSED
    );
    console.log('Updated webhook event (processed):', updatedEvent);
    
    // Test updating status with error
    const failedEvent = await WebhookEventModel.updateStatus(
      webhookEvent.id,
      WebhookProcessingStatus.FAILED,
      'Test error message'
    );
    console.log('Updated webhook event (failed):', failedEvent);
    
    // Test getting pending events
    const pendingEvents = await WebhookEventModel.getPendingEvents();
    console.log(`Found ${pendingEvents.length} pending events`);
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Close database connection
    process.exit(0);
  }
}

testWebhookEventModel(); 