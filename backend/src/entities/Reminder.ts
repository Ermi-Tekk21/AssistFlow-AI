import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { NotificationAttempt } from "./NotificationAttempt";

export enum ReminderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SENT = "sent",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

@Entity("reminders")
export class Reminder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "varchar", length: 100, default: "default_user" })
  owner_id!: string;

  @Column({ type: "timestamptz" })
  scheduled_at!: Date;

  @Column({ type: "varchar", length: 50, default: "UTC" })
  timezone!: string;

  @Column({
    type: "enum",
    enum: ReminderStatus,
    default: ReminderStatus.PENDING,
  })
  status!: ReminderStatus;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @OneToMany(() => NotificationAttempt, (attempt) => attempt.reminder)
  notification_attempts!: NotificationAttempt[];
}
