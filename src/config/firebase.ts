import admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

// Download this file from Firebase Console > Project Settings > Service Accounts
const serviceAccount = require('./firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const messaging = getMessaging();
export default admin;