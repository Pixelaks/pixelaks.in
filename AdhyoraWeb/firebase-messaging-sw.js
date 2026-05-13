// firebase-messaging-sw.js
// This runs in the background of the browser!

importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521"
});

const messaging = firebase.messaging();

// 🚨 We deleted the onBackgroundMessage block here because Firebase shows it automatically! 🚨

// Handle the user clicking the automatically generated notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. IF ADHYORA IS ALREADY OPEN: Focus it and send a secret message!
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('pixelaks.in') && 'focus' in client) {
          client.focus();
          client.postMessage({ action: 'openMessages' });
          return;
        }
      }
      // 2. IF COMPLETELY CLOSED: Open a new tab and attach "#inbox" to the URL
      if (clients.openWindow) {
        return clients.openWindow('https://pixelaks.in/AdhyoraWeb/index.html#inbox');
      }
    })
  );
});
