import { Request, Response } from 'express';
import { interpretUserRequest } from '../services/geminiService';
import { AppDataSource } from '../config/database';
import { Reminder, ReminderStatus } from '../entities/Reminder';
import { getAgendaForDate, checkSlotAvailability } from '../services/calendarService';

const reminderRepo = AppDataSource.getRepository(Reminder);

export async function handleAssistantMessage(req: Request, res: Response) {
  try {
    const { message, timezone = 'UTC' } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message string is required' });
    }

    // 1. Process intent with Gemini
    const aiResult = await interpretUserRequest(message, timezone);
    console.log('AI Interpretation:', JSON.stringify(aiResult, null, 2));

    // 2. Intent: create_reminder
    if (aiResult.intent === 'create_reminder' && aiResult.reminder) {
      const { title, scheduled_at } = aiResult.reminder;

      if (!title || !scheduled_at) {
        return res.json({
          status: 'clarification',
          reply: 'Could you please specify what and when you want to be reminded?',
        });
      }

      const scheduledDate = new Date(scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          status: 'error',
          reply: 'I could not parse a valid date and time. Please try again.',
        });
      }

      // Check if scheduled time is in the past
      if (scheduledDate.getTime() <= Date.now()) {
        return res.json({
          status: 'clarification',
          reply: 'That time is in the past! Please choose a future time for your reminder.',
        });
      }

      // Persist in PostgreSQL
      const reminder = reminderRepo.create({
        title,
        scheduled_at: scheduledDate,
        timezone: aiResult.reminder.timezone || timezone,
        status: ReminderStatus.PENDING,
        owner_id: 'default_user',
      });

      const savedReminder = await reminderRepo.save(reminder);

      return res.json({
        status: 'created',
        action: 'reminder_created',
        reply: aiResult.reply_message,
        data: savedReminder,
      });
    }

    // 3. Intent: get_daily_agenda
    if (aiResult.intent === 'get_daily_agenda') {
      const targetDate =
        aiResult.agenda?.date || new Date().toISOString().split('T')[0];
      const events = await getAgendaForDate(targetDate, timezone);

      let summary = aiResult.reply_message;
      if (events.length === 0) {
        summary = `You have no scheduled meetings for ${targetDate}. Your calendar is completely clear!`;
      } else {
        const eventLines = events
          .map((e) => {
            const start = new Date(e.start_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const end = new Date(e.end_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            return `• ${e.title} (${start} - ${end})`;
          })
          .join('\n');
        summary = `Here is your agenda for ${targetDate} (${events.length} event${events.length > 1 ? 's' : ''}):\n${eventLines}`;
      }

      return res.json({
        status: 'ok',
        action: 'agenda_retrieved',
        reply: summary,
        data: {
          date: targetDate,
          count: events.length,
          events,
        },
      });
    }

    // 4. Intent: create_meeting (Requires explicit user confirmation - SRS FR-08)
    if (aiResult.intent === 'create_meeting' && aiResult.meeting) {
      const { title, start_time, duration_minutes = 30, attendees = [] } = aiResult.meeting;

      if (!title || !start_time) {
        return res.json({
          status: 'clarification',
          reply: 'Could you please clarify the meeting title and start time?',
        });
      }

      const startAt = new Date(start_time);
      if (isNaN(startAt.getTime())) {
        return res.status(400).json({
          status: 'error',
          reply: 'I could not parse a valid meeting start time.',
        });
      }

      const durationMs = (duration_minutes || 30) * 60 * 1000;
      const endAt = aiResult.meeting.end_time
        ? new Date(aiResult.meeting.end_time)
        : new Date(startAt.getTime() + durationMs);

      // Check for slot availability / conflicts
      const availability = await checkSlotAvailability(startAt, endAt);

      let reply = `I've prepared a meeting proposal: "${title}" on ${startAt.toLocaleDateString()} from ${startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${endAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;

      if (availability.hasConflict) {
        const conflictingTitles = availability.conflicts.map((c) => c.title).join(', ');
        reply += ` ⚠️ Warning: You already have a conflicting event (${conflictingTitles}) during this time!`;
      }

      reply += ' Would you like me to confirm and book this on your calendar?';

      return res.json({
        status: 'awaiting_approval',
        action: 'meeting_proposal',
        reply,
        data: {
          title,
          start_time: startAt.toISOString(),
          end_time: endAt.toISOString(),
          timezone,
          duration_minutes: duration_minutes || 30,
          attendees,
          has_conflict: availability.hasConflict,
          conflicts: availability.conflicts,
        },
      });
    }

    // Fallback or clarification
    return res.json({
      status:
        aiResult.intent === 'clarification_needed' ? 'clarification' : 'ok',
      action: aiResult.intent,
      reply: aiResult.reply_message,
      data: aiResult,
    });
  } catch (error: any) {
    console.error('Error handling assistant message:', error);
    return res.status(500).json({
      error: 'Failed to process message',
      details: error.message,
    });
  }
}

// Controller to create a direct reminder (useful for testing & development without waiting on AI)
export async function createDirectReminder(req: Request, res: Response) {
  try {
    const { title, scheduled_at, timezone = 'UTC' } = req.body;
    if (!title || !scheduled_at) {
      return res.status(400).json({ error: 'title and scheduled_at are required' });
    }
    const reminder = reminderRepo.create({
      title,
      scheduled_at: new Date(scheduled_at),
      timezone,
      status: ReminderStatus.PENDING,
      owner_id: 'default_user',
    });
    const saved = await reminderRepo.save(reminder);
    return res.json({ status: 'created', data: saved });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Controller to fetch all reminders
export async function getReminders(req: Request, res: Response) {
  try {
    const reminders = await reminderRepo.find({
      order: { scheduled_at: 'ASC' },
      relations: { notification_attempts: true },
    });
    return res.json({ reminders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
