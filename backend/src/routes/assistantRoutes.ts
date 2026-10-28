import { Router } from "express";
import {
  handleAssistantMessage,
  createDirectReminder,
  getReminders,
} from "../controllers/assistantController";

const router = Router();

router.post("/message", handleAssistantMessage);
router.post("/direct", createDirectReminder);
router.get("/reminders", getReminders);

export default router;
