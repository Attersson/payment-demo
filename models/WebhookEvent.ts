import { db } from '../lib/db';

export enum WebhookProcessingStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed'
}

export interface WebhookEvent {
  id: number;
  event_id: string;
  provider: string;
  event_type: string;
  event_data: any;
  processing_status: WebhookProcessingStatus;
  error_message?: string;
  received_at: Date;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class WebhookEventModel {
  static async create(data: Omit<WebhookEvent, 'id' | 'created_at' | 'updated_at' | 'received_at'>) {
    const result = await db.query(
      `INSERT INTO webhook_events (
        event_id, provider, event_type, event_data, processing_status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *`,
      [
        data.event_id,
        data.provider,
        data.event_type,
        data.event_data,
        data.processing_status,
        data.error_message
      ]
    );
    return result.rows[0];
  }

  static async findByEventId(provider: string, eventId: string): Promise<WebhookEvent | null> {
    const result = await db.query(
      `SELECT * FROM webhook_events 
       WHERE provider = $1 AND event_id = $2 
       LIMIT 1`,
      [provider, eventId]
    );
    return result.rows[0] || null;
  }

  static async updateStatus(id: number, status: WebhookProcessingStatus, errorMessage?: string) {
    // Using separate queries for with and without error message to handle types correctly
    if (errorMessage) {
      const result = await db.query(
        `UPDATE webhook_events 
         SET processing_status = $1, 
             error_message = $2, 
             processed_at = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          status, 
          errorMessage,
          status === WebhookProcessingStatus.PROCESSED || status === WebhookProcessingStatus.FAILED ? new Date() : null,
          id
        ]
      );
      return result.rows[0];
    } else {
      const result = await db.query(
        `UPDATE webhook_events 
         SET processing_status = $1,
             processed_at = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [
          status,
          status === WebhookProcessingStatus.PROCESSED || status === WebhookProcessingStatus.FAILED ? new Date() : null,
          id
        ]
      );
      return result.rows[0];
    }
  }

  static async getPendingEvents(limit = 100): Promise<WebhookEvent[]> {
    const result = await db.query(
      `SELECT * FROM webhook_events 
       WHERE processing_status = $1
       ORDER BY received_at ASC
       LIMIT $2`,
      [WebhookProcessingStatus.PENDING, limit]
    );
    
    return result.rows;
  }
} 