import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { Reminder } from "../entities/Reminder";
import { NotificationAttempt } from "../entities/NotificationAttempt";
import { WorkflowExecution } from "../entities/WorkflowExecution";
import { CalendarEventRef } from "../entities/CalendarEventRef";
import { UserCredential } from "../entities/UserCredential";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USER || "assistflow_user",
  password: process.env.DB_PASSWORD || "assistflow_password",
  database: process.env.DB_NAME || "assistflow_db",
  synchronize: process.env.NODE_ENV !== "production", // Automatically creates tables in dev
  logging: false,
  entities: [
    Reminder,
    NotificationAttempt,
    WorkflowExecution,
    CalendarEventRef,
    UserCredential,
  ],
});
