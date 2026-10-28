import { Router } from 'express';
import {
  getAuthStatus,
  handleOAuthCallback,
  getAgenda,
  checkAvailability,
  confirmMeeting,
} from '../controllers/calendarController';

const router = Router();

router.get('/auth-status', getAuthStatus);
router.get('/callback', handleOAuthCallback);
router.get('/agenda', getAgenda);
router.post('/check-availability', checkAvailability);
router.post('/confirm-meeting', confirmMeeting);

export default router;
