import { Request, Response } from 'express';
import {
  getGoogleAuthUrl,
  saveGoogleTokens,
  isGoogleAuthenticated,
  getAgendaForDate,
  checkSlotAvailability,
  createConfirmedEvent,
} from '../services/calendarService';

/**
 * Get Google Calendar OAuth connection status and auth URL
 */
export async function getAuthStatus(req: Request, res: Response) {
  try {
    const authUrl = getGoogleAuthUrl();
    const authenticated = await isGoogleAuthenticated();

    return res.json({
      is_configured: Boolean(authUrl),
      is_authenticated: authenticated,
      auth_url: authUrl,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle Google OAuth callback code
 */
export async function handleOAuthCallback(req: Request, res: Response) {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send('Authorization code missing in query parameters');
    }

    await saveGoogleTokens(code);

    // Provide friendly HTML feedback or redirect to frontend
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Calendar Connected</title></head>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
          <div style="text-align: center; background: #1e293b; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <h1 style="color: #22c55e;">✅ Google Calendar Connected!</h1>
            <p>AssistFlow AI can now view your agenda and schedule confirmed meetings.</p>
            <p style="color: #94a3b8; font-size: 0.875rem;">You may close this tab and return to AssistFlow.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('OAuth Callback error:', error);
    return res.status(500).send(`Failed to complete authorization: ${error.message}`);
  }
}

/**
 * Retrieve agenda for a specific date (YYYY-MM-DD)
 */
export async function getAgenda(req: Request, res: Response) {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const timezone = (req.query.timezone as string) || 'UTC';

    const events = await getAgendaForDate(date, timezone);
    return res.json({
      date,
      timezone,
      count: events.length,
      events,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Check slot availability for conflicts
 */
export async function checkAvailability(req: Request, res: Response) {
  try {
    const { start_time, end_time } = req.body;
    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'start_time and end_time are required' });
    }

    const startAt = new Date(start_time);
    const endAt = new Date(end_time);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return res.status(400).json({ error: 'Invalid start_time or end_time' });
    }

    const result = await checkSlotAvailability(startAt, endAt);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Confirm and create a meeting event (SRS FR-08)
 */
export async function confirmMeeting(req: Request, res: Response) {
  try {
    const {
      title,
      start_time,
      end_time,
      timezone = 'UTC',
      attendees = [],
      description,
      workflow_execution_id,
    } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({
        error: 'title, start_time, and end_time are required to confirm a meeting',
      });
    }

    const startAt = new Date(start_time);
    const endAt = new Date(end_time);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return res.status(400).json({ error: 'Invalid start_time or end_time' });
    }

    if (endAt.getTime() <= startAt.getTime()) {
      return res.status(400).json({ error: 'end_time must be strictly after start_time' });
    }

    const event = await createConfirmedEvent({
      title,
      start_at: startAt,
      end_at: endAt,
      timezone,
      attendees,
      description,
      workflow_execution_id: workflow_execution_id || null,
    });

    return res.json({
      status: 'confirmed',
      action: 'meeting_created',
      message: `Meeting "${title}" confirmed and scheduled successfully!`,
      data: event,
    });
  } catch (error: any) {
    console.error('Error confirming meeting:', error);
    return res.status(500).json({ error: error.message });
  }
}
