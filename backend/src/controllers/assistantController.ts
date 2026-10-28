import { Request, Response } from "express";
import { interpretUserRequest } from "../services/geminiService";
import { AppDataSource } from "../config/database";
import { Reminder, ReminderStatus } from "../entities/Reminder";

const reminderRepo = AppDataSource.getRepository(Reminder);

export async function handleAssistantMessage(req: Request, res: Response) {
  try {
    const { message, timezone = "UTC" } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message string is required" });
    }

    // 1. Process intent with Gemini
    const aiResult = await interpretUserRequest(message, timezone);
    console.log("AI Interpretation:", JSON.stringify(aiResult, null, 2));

    // 2. Validate and execute based on intent
    if (aiResult.intent === "create_reminder" && aiResult.reminder) {
      const { title, scheduled_at } = aiResult.reminder;

      if (!title || !scheduled_at) {
        return res.json({
          status: "clarification",
          reply:
            "Could you please specify what and when you want to be reminded?",
        });
      }

      const scheduledDate = new Date(scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          status: "error",
          reply: "I could not parse a valid date and time. Please try again.",
        });
      }

      // Check if scheduled time is in the past
      if (scheduledDate.getTime() <= Date.now()) {
        return res.json({
          status: "clarification",
          reply:
            "That time is in the past! Please choose a future time for your reminder.",
        });
      }

      // 3. Persist in PostgreSQL
      const reminder = reminderRepo.create({
        title,
        scheduled_at: scheduledDate,
        timezone: aiResult.reminder.timezone || timezone,
        status: ReminderStatus.PENDING,
        owner_id: "default_user",
      });

      const savedReminder = await reminderRepo.save(reminder);

      return res.json({
        status: "created",
        action: "reminder_created",
        reply: aiResult.reply_message,
        data: savedReminder,
      });
    }

    // Fallback or clarification
    return res.json({
      status:
        aiResult.intent === "clarification_needed" ? "clarification" : "ok",
      action: aiResult.intent,
      reply: aiResult.reply_message,
      data: aiResult,
    });
  } catch (error: any) {
    console.error("Error handling assistant message:", error);
    return res.status(500).json({
      error: "Failed to process message",
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
      order: { scheduled_at: "ASC" },
      relations: { notification_attempts: true },
    });
    return res.json({ reminders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
