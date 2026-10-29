import { Request, Response } from "express";
import { LessThanOrEqual } from "typeorm";
import { AppDataSource } from "../config/database";
import { Reminder, ReminderStatus } from "../entities/Reminder";
import {
  NotificationAttempt,
  NotificationStatus,
} from "../entities/NotificationAttempt";
import {
  WorkflowExecution,
  WorkflowStatus,
} from "../entities/WorkflowExecution";

const reminderRepo = AppDataSource.getRepository(Reminder);
const attemptRepo = AppDataSource.getRepository(NotificationAttempt);
const workflowRepo = AppDataSource.getRepository(WorkflowExecution);

/**
 * Endpoint for n8n: Claim due reminders
 * Uses atomic transaction to transition status from 'pending' -> 'processing'
 * Prevents race conditions and duplicate dispatches.
 */
export async function claimDueReminders(req: Request, res: Response) {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const now = new Date();

    // 1. Find all pending reminders due right now
    const dueReminders = await queryRunner.manager.find(Reminder, {
      where: {
        status: ReminderStatus.PENDING,
        scheduled_at: LessThanOrEqual(now),
      },
      lock: { mode: "pessimistic_write" },
    });

    if (dueReminders.length === 0) {
      await queryRunner.commitTransaction();
      return res.json({ claimed: [] });
    }

    // 2. Mark claimed reminders as 'processing'
    for (const reminder of dueReminders) {
      reminder.status = ReminderStatus.PROCESSING;
      await queryRunner.manager.save(reminder);
    }

    // 3. Log a workflow execution entry for auditing
    const workflow = queryRunner.manager.create(WorkflowExecution, {
      workflow_type: "reminder_dispatch",
      status: WorkflowStatus.RUNNING,
      reference_id: `batch_${dueReminders.length}_reminders`,
    });
    await queryRunner.manager.save(workflow);

    await queryRunner.commitTransaction();

    // 4. Return reminders formatted with telegram target chat_id
    const responsePayload = dueReminders.map((r) => ({
      id: r.id,
      title: r.title,
      scheduled_at: r.scheduled_at,
      chat_id: process.env.TELEGRAM_CHAT_ID,
    }));

    return res.json({ claimed: responsePayload, workflow_id: workflow.id });
  } catch (error: any) {
    await queryRunner.rollbackTransaction();
    console.error("Error claiming due reminders:", error);
    return res
      .status(500)
      .json({ error: "Failed to claim due reminders", details: error.message });
  } finally {
    await queryRunner.release();
  }
}

/**
 * Endpoint for n8n: Report outcome of a notification delivery attempt
 * Records audit trails, handles bounded retries, and updates reminder status.
 */
export async function reportNotificationOutcome(req: Request, res: Response) {
  try {
    const {
      reminder_id,
      status,
      provider_message_id,
      error_code,
      workflow_id,
    } = req.body;

    if (!reminder_id || !status) {
      return res
        .status(400)
        .json({ error: "reminder_id and status are required" });
    }

    const reminder = await reminderRepo.findOne({
      where: { id: reminder_id },
    });

    if (!reminder) {
      return res.status(404).json({ error: "Reminder not found" });
    }

    const previousAttempts = await attemptRepo.count({
      where: { reminder_id: reminder.id },
    });
    const attemptNumber = previousAttempts + 1;
    const isSuccess = status === "success";

    // 1. Record attempt in notification_attempts table
    const attempt = attemptRepo.create({
      reminder_id: reminder.id,
      provider: "telegram",
      attempt_number: attemptNumber,
      status: isSuccess
        ? NotificationStatus.SUCCESS
        : NotificationStatus.FAILED,
      provider_message_id: provider_message_id
        ? String(provider_message_id)
        : null,
      error_code: error_code ? String(error_code) : null,
    });
    await attemptRepo.save(attempt);

    // 2. Update reminder status directly (avoiding TypeORM relation cascades)
    let newStatus = ReminderStatus.PENDING;
    if (isSuccess) {
      newStatus = ReminderStatus.SENT;
    } else if (attemptNumber >= 3) {
      newStatus = ReminderStatus.FAILED;
    }
    await reminderRepo.update(reminder.id, { status: newStatus });

    // 3. Mark workflow execution as completed if provided
    if (workflow_id) {
      await workflowRepo.update(workflow_id, {
        status: isSuccess ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED,
        finished_at: new Date(),
        error_code: error_code || null,
      });
    }

    return res.json({
      success: true,
      reminder_status: reminder.status,
      attempt_number: attemptNumber,
    });
  } catch (error: any) {
    console.error("Error reporting notification outcome:", error);
    return res.status(500).json({ error: error.message });
  }
}
