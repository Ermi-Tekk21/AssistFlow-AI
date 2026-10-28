import { google } from 'googleapis';
import dotenv from 'dotenv';
import { AppDataSource } from '../config/database';
import { UserCredential } from '../entities/UserCredential';
import { CalendarEventRef, EventStatus } from '../entities/CalendarEventRef';

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/calendar/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export interface CalendarEventDTO {
  id: string;
  provider_event_id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  timezone: string;
  attendees?: string[];
  source: 'google' | 'local';
}

function getOAuth2ClientInstance() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return null;
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate Google OAuth consent URL
 */
export function getGoogleAuthUrl(): string | null {
  const oauth2Client = getOAuth2ClientInstance();
  if (!oauth2Client) return null;

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * Handle OAuth callback code and persist tokens in database
 */
export async function saveGoogleTokens(code: string): Promise<UserCredential> {
  const oauth2Client = getOAuth2ClientInstance();
  if (!oauth2Client) {
    throw new Error('Google OAuth Client credentials not configured in .env');
  }

  const { tokens } = await oauth2Client.getToken(code);
  const credRepo = AppDataSource.getRepository(UserCredential);

  let credential = await credRepo.findOne({
    where: { owner_id: 'default_user', provider: 'google' },
  });

  if (!credential) {
    credential = credRepo.create({
      owner_id: 'default_user',
      provider: 'google',
    });
  }

  credential.access_token = tokens.access_token || credential.access_token;
  credential.refresh_token = tokens.refresh_token || credential.refresh_token;
  credential.scope = tokens.scope || credential.scope;
  credential.expiry_date = tokens.expiry_date || null;

  return await credRepo.save(credential);
}

/**
 * Check if the user is authenticated with Google Calendar
 */
export async function isGoogleAuthenticated(): Promise<boolean> {
  const credRepo = AppDataSource.getRepository(UserCredential);
  const cred = await credRepo.findOne({
    where: { owner_id: 'default_user', provider: 'google' },
  });
  return Boolean(cred && (cred.access_token || cred.refresh_token));
}

/**
 * Get authenticated Google Calendar client
 */
async function getAuthenticatedCalendar() {
  const oauth2Client = getOAuth2ClientInstance();
  if (!oauth2Client) return null;

  const credRepo = AppDataSource.getRepository(UserCredential);
  const cred = await credRepo.findOne({
    where: { owner_id: 'default_user', provider: 'google' },
  });

  if (!cred || !cred.access_token) return null;

  oauth2Client.setCredentials({
    access_token: cred.access_token,
    refresh_token: cred.refresh_token || undefined,
    expiry_date: cred.expiry_date ? Number(cred.expiry_date) : undefined,
  });

  // Listen for refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) cred.access_token = tokens.access_token;
    if (tokens.refresh_token) cred.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) cred.expiry_date = tokens.expiry_date;
    await credRepo.save(cred);
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Retrieve calendar agenda for a specific date (YYYY-MM-DD)
 */
export async function getAgendaForDate(
  dateStr: string,
  userTimezone: string = 'UTC'
): Promise<CalendarEventDTO[]> {
  const eventRefRepo = AppDataSource.getRepository(CalendarEventRef);

  // Define date window [00:00:00 to 23:59:59]
  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59Z`);

  const results: CalendarEventDTO[] = [];

  // 1. Check Google Calendar if authenticated
  const calendar = await getAuthenticatedCalendar();
  if (calendar) {
    try {
      const gRes = await calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const items = gRes.data.items || [];
      for (const item of items) {
        results.push({
          id: item.id || '',
          provider_event_id: item.id || '',
          title: item.summary || 'Busy',
          description: item.description || undefined,
          start_at: item.start?.dateTime || item.start?.date || '',
          end_at: item.end?.dateTime || item.end?.date || '',
          timezone: item.start?.timeZone || userTimezone,
          attendees: item.attendees?.map((a) => a.email || '') || [],
          source: 'google',
        });
      }
    } catch (err: any) {
      console.warn('Failed to fetch from Google Calendar API:', err.message);
    }
  }

  // 2. Fetch locally stored events from CalendarEventRef
  const localEvents = await eventRefRepo
    .createQueryBuilder('e')
    .where('e.status != :status', { status: EventStatus.CANCELLED })
    .andWhere('e.start_at < :dayEnd AND e.end_at > :dayStart', {
      dayStart,
      dayEnd,
    })
    .orderBy('e.start_at', 'ASC')
    .getMany();

  for (const le of localEvents) {
    // Avoid duplicates if Google already returned this provider_event_id
    if (!results.some((r) => r.provider_event_id === le.provider_event_id)) {
      results.push({
        id: le.id,
        provider_event_id: le.provider_event_id,
        title: le.title,
        description: le.description || undefined,
        start_at: le.start_at.toISOString(),
        end_at: le.end_at.toISOString(),
        timezone: le.timezone,
        attendees: le.attendees || [],
        source: 'local',
      });
    }
  }

  return results.sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}

/**
 * Check availability / conflicts for a requested time window
 */
export async function checkSlotAvailability(
  startAt: Date,
  endAt: Date
): Promise<{ hasConflict: boolean; conflicts: CalendarEventDTO[] }> {
  const dateStr = startAt.toISOString().split('T')[0];
  const allEvents = await getAgendaForDate(dateStr);

  const startMs = startAt.getTime();
  const endMs = endAt.getTime();

  const conflicts = allEvents.filter((event) => {
    const eStart = new Date(event.start_at).getTime();
    const eEnd = new Date(event.end_at).getTime();
    // Overlap condition: start < otherEnd and end > otherStart
    return startMs < eEnd && endMs > eStart;
  });

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Create a calendar event (Only called upon explicit confirmation)
 */
export async function createConfirmedEvent(details: {
  title: string;
  start_at: Date;
  end_at: Date;
  timezone: string;
  attendees?: string[];
  description?: string;
}): Promise<CalendarEventRef> {
  const eventRefRepo = AppDataSource.getRepository(CalendarEventRef);
  let providerEventId = `local_${Date.now()}`;

  // 1. Create on Google Calendar if authenticated
  const calendar = await getAuthenticatedCalendar();
  if (calendar) {
    try {
      const gRes = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: details.title,
          description: details.description,
          start: {
            dateTime: details.start_at.toISOString(),
            timeZone: details.timezone,
          },
          end: {
            dateTime: details.end_at.toISOString(),
            timeZone: details.timezone,
          },
          attendees: details.attendees?.map((email) => ({ email })),
        },
      });
      if (gRes.data.id) {
        providerEventId = gRes.data.id;
      }
    } catch (err: any) {
      console.warn('Failed to insert event into Google Calendar:', err.message);
    }
  }

  // 2. Persist in PostgreSQL CalendarEventRef
  const eventRecord = eventRefRepo.create({
    provider_event_id: providerEventId,
    title: details.title,
    description: details.description || null,
    start_at: details.start_at,
    end_at: details.end_at,
    timezone: details.timezone,
    attendees: details.attendees || [],
    status: EventStatus.CONFIRMED,
  });

  return await eventRefRepo.save(eventRecord);
}
