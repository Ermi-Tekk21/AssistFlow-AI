import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkflowExecution } from './WorkflowExecution';

export enum EventStatus {
  CONFIRMED = 'confirmed',
  TENTATIVE = 'tentative',
  CANCELLED = 'cancelled',
}

@Entity('calendar_event_refs')
export class CalendarEventRef {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  provider_event_id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'timestamptz' })
  start_at!: Date;

  @Column({ type: 'timestamptz' })
  end_at!: Date;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone!: string;

  @Column({ type: 'simple-array', nullable: true })
  attendees!: string[];

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.CONFIRMED,
  })
  status!: EventStatus;

  @Column({ type: 'uuid', nullable: true })
  workflow_execution_id!: string | null;

  @ManyToOne(() => WorkflowExecution, (wf) => wf.calendar_events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_execution_id' })
  workflow_execution!: WorkflowExecution | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
