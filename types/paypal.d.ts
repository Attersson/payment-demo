declare module '@paypal/checkout-server-sdk' {
  namespace core {
    class PayPalHttpClient {
      constructor(environment: any);
      execute(request: any): Promise<any>;
    }
    
    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    
    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
  }
  
  namespace orders {
    class OrdersCreateRequest {
      prefer(preference: string): void;
      requestBody(body: any): void;
    }
    
    class OrdersCaptureRequest {
      constructor(orderId: string);
      prefer(preference: string): void;
    }
  }
  
  namespace subscriptions {
    class SubscriptionsCreateRequest {
      prefer(preference: string): void;
      requestBody(body: any): void;
    }
    
    class SubscriptionsCancelRequest {
      constructor(subscriptionId: string);
      requestBody(body: any): void;
    }

    class SubscriptionsGetRequest {
      constructor(subscriptionId: string);
    }

    class SubscriptionsUpdateRequest {
      constructor(subscriptionId: string);
      requestBody(body: any): void;
    }

    class SubscriptionsSuspendRequest {
      constructor(subscriptionId: string);
      requestBody(body: any): void;
    }

    class SubscriptionsActivateRequest {
      constructor(subscriptionId: string);
      requestBody(body: any): void;
    }

    class SubscriptionsCaptureRequest {
      constructor(subscriptionId: string);
      requestBody(body: any): void;
    }

    class SubscriptionsTransactionsRequest {
      constructor(subscriptionId: string);
      startTime: string;
      endTime: string;
    }
  }
  
  namespace payments {
    class CapturesRefundRequest {
      constructor(captureId: string);
      requestBody(body: any): void;
    }
  }
} 