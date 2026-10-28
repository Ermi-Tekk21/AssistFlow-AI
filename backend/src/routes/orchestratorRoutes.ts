import { Router } from 'express';
import { claimDueReminders, reportNotificationOutcome } from '../controllers/orchestratorController';
import { requireInternalSecret } from '../middleware/authMiddleware';

const router = Router();

// Protect all orchestrator endpoints with internal secret
router.use(requireInternalSecret);

router.post('/claim-due', claimDueReminders);
router.post('/report-delivery', reportNotificationOutcome);

export default router;
