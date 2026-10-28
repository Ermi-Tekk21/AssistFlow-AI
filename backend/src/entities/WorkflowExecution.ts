import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

export enum WorkflowStatus {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

@Entity("workflow_executions")
export class WorkflowExecution {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  workflow_type!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  reference_id!: string | null;

  @Column({
    type: "enum",
    enum: WorkflowStatus,
    default: WorkflowStatus.RUNNING,
  })
  status!: WorkflowStatus;

  @CreateDateColumn({ type: "timestamptz" })
  started_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  finished_at!: Date | null;

  @Column({ type: "text", nullable: true })
  error_code!: string | null;
}
