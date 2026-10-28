import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AppDataSource } from "./config/database";
import assistantRoutes from "./routes/assistantRoutes";
import orchestratorRoutes from "./routes/orchestratorRoutes";
import { startSchedulerWorker } from "./services/schedulerWorker";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Basic health check route
app.get("/", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.use("/api/assistant", assistantRoutes);
app.use("/api/orchestrator", orchestratorRoutes);

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.log("✅ PostgreSQL database connected successfully with TypeORM");

    app.listen(PORT, () => {
      console.log(`🚀 AssistFlow Backend running at http://localhost:${PORT}`);
      if (process.env.ENABLE_INTERNAL_WORKER !== "false") {
        startSchedulerWorker();
      } else {
        console.log(
          "⏸️ Internal background worker disabled (n8n is orchestrator)",
        );
      }
    });
  } catch (error) {
    console.error("❌ Error during Database initialization:", error);
    process.exit(1);
  }
}

bootstrap();
