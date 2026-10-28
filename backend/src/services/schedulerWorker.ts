import { AppDataSource } from '../config/database';
import { Reminder, ReminderStatus } from '../entities/Reminder';
import { NotificationAttempt, NotificationStatus } from '../entities/NotificationAttempt';
import { WorkflowExecution, WorkflowStatus } from '../entities/WorkflowExecution';
import { sendTelegramMessage } from './telegramService';
import { LessThanOrEqual } from 'typeorm';

const reminderRepo = AppDataSource.getRepository(Reminder);
const attemptRepo = AppDataSource.getRepository(NotificationAttempt);
const workflowRepo = AppDataSource.getRepository(WorkflowExecution);

let isRunning = false;

export async function processDueRemindersWorker() {
  if (isRunning) return;
  isRunning = true;

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    const now = new Date();
    const dueReminders = await queryRunner.manager.find(Reminder, {
      where: {
        status: ReminderStatus.PENDING,
        scheduled_at: LessThanOrEqual(now),
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (dueReminders.length === 0) {
      await queryRunner.commitTransaction();
      return;
    }

    console.log(`⏰ [Scheduler] Found ${dueReminders.length} due reminder(s). Claiming...`);

    for (const reminder of dueReminders) {
      reminder.status = ReminderStatus.PROCESSING;
      await queryRunner.manager.save(reminder);
    }

    const workflow = queryRunner.manager.create(WorkflowExecution, {
      workflow_type: 'reminder_dispatch',
      status: WorkflowStatus.RUNNING,
      reference_id: `worker_batch_${dueReminders.length}`,
    });
    await queryRunner.manager.save(workflow);

    await queryRunner.commitTransaction();

    // Dispatch notifications
    for (const reminder of dueReminders) {
      try {
        const text = `🔔 *AssistFlow Reminder*\n\n📌 *${reminder.title}*\n⏰ Scheduled: ${new Date(reminder.scheduled_at).toLocaleTimeString()}`;
        const telegramResult = await sendTelegramMessage(text);

        const attempt = attemptRepo.create({
          reminder_id: reminder.id,
          provider: 'telegram',
          attempt_number: 1,
          status: NotificationStatus.SUCCESS,
          provider_message_id: String(telegramResult.result.message_id),
        });
        await attemptRepo.save(attempt);

        reminder.status = ReminderStatus.SENT;
        await reminderRepo.save(reminder);
        console.log(`✅ [Scheduler] Sent reminder "${reminder.title}" to Telegram!`);
      } catch (err: any) {
        console.error(`❌ [Scheduler] Failed to send reminder "${reminder.title}":`, err.message);

        const attempt = attemptRepo.create({
          reminder_id: reminder.id,
          provider: 'telegram',
          attempt_number: 1,
          status: NotificationStatus.FAILED,
          error_code: err.message || 'Dispatch error',
        });
        await attemptRepo.save(attempt);

        reminder.status = ReminderStatus.FAILED;
        await reminderRepo.save(reminder);
      }
    }

    await workflowRepo.update(workflow.id, {
      status: WorkflowStatus.COMPLETED,
      finished_at: new Date(),
    });
  } catch (error: any) {
    console.error('Error in scheduler worker:', error);
    try {
      await queryRunner.rollbackTransaction();
    } catch {}
  } finally {
    await queryRunner.release();
    isRunning = false;
  }
}

export function startSchedulerWorker(intervalMs: number = 15000) {
  console.log(`⏱️ [Scheduler] Background reminder worker active (polling every ${intervalMs / 1000}s)`);
  setInterval(() => {
    processDueRemindersWorker().catch((err) => console.error('Worker tick error:', err));
  }, intervalMs);
}
