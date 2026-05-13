// 🚨 1. THIS MUST BE AT THE VERY TOP! 
// We must catch the click BEFORE Firebase loads!
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.stopImmediatePropagation(); // 🚨 Block Firebase from stealing the click!

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      
      // 1. Check if Adhyora is already open in a tab
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('pixelaks.in')) {
          client.postMessage({ action: 'openMessages' });
          return client.focus(); // Focus the existing tab!
        }
      }
      
      // 2. If it is completely closed, open a new tab!
      if (clients.openWindow) {
        return clients.openWindow('https://pixelaks.in/AdhyoraWeb/index.html#inbox');
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
