import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleSheetService } from '../../services/googleSheet.service.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await GoogleSheetService.getUsers() || [];
  const user = users.find((u: any) => u.username === username);

  if (user && bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  } 
  
  // Fallback to Env Admin
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    const token = jwt.sign({ id: 0, username: ADMIN_USERNAME }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }

  res.status(401).json({ error: 'Authentication failed' });
});

export default router;
