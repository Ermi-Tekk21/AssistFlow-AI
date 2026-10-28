import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Reminder } from "./Reminder";

export enum NotificationStatus {
  SUCCESS = "success",
  FAILED = "failed",
  RETRYING = "retrying",
}

@Entity("notification_attempts")
export class NotificationAttempt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  reminder_id!: string;

  @ManyToOne(() => Reminder, (reminder) => reminder.notification_attempts, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "reminder_id" })
  reminder!: Reminder;

  @Column({ type: "varchar", length: 50, default: "telegram" })
  provider!: string;

  @Column({ type: "int", default: 1 })
  attempt_number!: number;

  @Column({
    type: "enum",
    enum: NotificationStatus,
    default: NotificationStatus.SUCCESS,
  })
  status!: NotificationStatus;

  @CreateDateColumn({ type: "timestamptz" })
  attempted_at!: Date;

  @Column({ type: "varchar", length: 100, nullable: true })
  provider_message_id!: string | null;

  @Column({ type: "text", nullable: true })
  error_code!: string | null;
}
