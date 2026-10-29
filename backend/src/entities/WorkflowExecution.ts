import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Reminder } from './Reminder';
import { CalendarEventRef } from './CalendarEventRef';
import { NotificationAttempt } from './NotificationAttempt';

export enum WorkflowStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('workflow_executions')
export class WorkflowExecution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  workflow_type!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference_id!: string | null;

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.RUNNING,
  })
  status!: WorkflowStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  started_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finished_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  error_code!: string | null;

  // Inverse relation: all reminders associated with this workflow execution
  @OneToMany(() => Reminder, (reminder) => reminder.workflow_execution)
  reminders!: Reminder[];

  // Inverse relation: all calendar events created/managed by this workflow execution
  @OneToMany(() => CalendarEventRef, (event) => event.workflow_execution)
  calendar_events!: CalendarEventRef[];

  // Inverse relation: all delivery attempts spawned under this workflow execution
  @OneToMany(() => NotificationAttempt, (attempt) => attempt.workflow_execution)
  notification_attempts!: NotificationAttempt[];
}
