// 🚨 1. THIS MUST BE AT THE VERY TOP! 
// 🚨 1. THIS MUST BE AT THE VERY TOP! 
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.stopImmediatePropagation();

  // DEFAULT FALLBACK: Open Inbox
  let targetAction = 'openMessages';
  let targetHash = '#inbox';

  // THE SMART ROUTER: Read the hidden Firebase payload!
  try {
    let msgType = event.notification.data.FCM_MSG.data.type;
    
    // If the Developer sent this, route them to Notifications!
    if (msgType === 'admin_broadcast') {
      targetAction = 'openNotifications';
      targetHash = '#notifications';
    }
  } catch(e) {
    console.log("Could not read message type, defaulting to inbox.");
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('pixelaks.in')) {
          client.postMessage({ action: targetAction }); // 🚨 DYNAMIC ACTION
          return client.focus(); 
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow('https://pixelaks.in/AdhyoraWeb/index.html' + targetHash); // 🚨 DYNAMIC HASH
      }
    })
  );
});

// ==========================================================
// 2. NOW we are safe to let Firebase load in the background
// ==========================================================
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
