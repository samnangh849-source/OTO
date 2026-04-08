import express from 'express';
import jwt from 'jsonwebtoken';
import { GoogleSheetService } from '../../services/googleSheet.service.js';
import axios from 'axios';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Function to call Google Apps Script for License management
async function callGAS(action: string, data: any = {}) {
  if (!GOOGLE_SCRIPT_URL) return { success: false, error: 'GOOGLE_SCRIPT_URL not configured' };
  try {
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      type: 'license_action',
      action,
      ...data
    });
    return response.data;
  } catch (error) {
    console.error('GAS Error:', error);
    return { success: false, error: 'Failed to communicate with license server' };
  }
}

// 1. User Login with License Key
router.post('/login-license', async (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({ error: 'License Key is required' });
  }

  // Check against Google Sheet
  const result = await callGAS('validate', { key: licenseKey });

  if (result && result.success) {
    const token = jwt.sign(
      { key: licenseKey, role: 'user', expiry: result.license.expiry }, 
      JWT_SECRET, 
      { expiresIn: '30d' } // Users stay logged in for 30 days
    );
    return res.json({ token, license: result.license });
  }

  res.status(401).json({ error: result.message || 'Invalid or Expired License Key' });
});

// 2. Admin License Management (Create/List/Block)
// Note: In a real app, you'd protect these routes with an Admin Password or specific Header
router.get('/admin/licenses', async (req, res) => {
  const result = await callGAS('list');
  res.json(result);
});

router.post('/admin/licenses/create', async (req, res) => {
  const { key, expiry_date, note } = req.body;
  const result = await callGAS('create', { key, expiry_date, note });
  res.json(result);
});

router.post('/admin/licenses/status', async (req, res) => {
  const { key, status } = req.body;
  const result = await callGAS('update_status', { key, status });
  res.json(result);
});

export default router;
