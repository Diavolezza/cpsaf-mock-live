// Firebase project settings. Copy the "firebaseConfig" object from the Firebase console
// (Project settings > General > Your apps > Web app) into this file.
// These values are not secret; access is controlled by database.rules.json.
// With firebaseConfig = null the app runs in demo mode only; ?demo=1 forces demo mode.
export const firebaseConfig = {
  apiKey: 'AIzaSyA1g6I06ThJVRD_F41rOZU4A1uswGVelcg',
  authDomain: 'cpsaf-mock-live.firebaseapp.com',
  databaseURL: 'https://cpsaf-mock-live-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'cpsaf-mock-live',
  storageBucket: 'cpsaf-mock-live.firebasestorage.app',
  messagingSenderId: '26489378074',
  appId: '1:26489378074:web:6b2334a8d11cbe4e86c8a3',
};

// Shown to GitHub users who are not trainers yet: whom to ask for approval.
export const ADMIN_CONTACT = { name: 'Gerhard Wanner', email: 'gerhard.wanner@hft-stuttgart.de' };

// Pass mark in percent of the reachable points.
export const PASS_PERCENT = 60;
