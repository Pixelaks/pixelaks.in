import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getRemoteConfig, fetchAndActivate, getString } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js";

  const firebaseConfig = {
    apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
    authDomain: "adhyora-5d4c1.firebaseapp.com",
    projectId: "adhyora-5d4c1",
    storageBucket: "adhyora-5d4c1.firebasestorage.app",
    messagingSenderId: "206050348148",
    appId: "1:206050348148:web:da4e421e00ec2f77429521"
  };
  
  const app = initializeApp(firebaseConfig);
  const remoteConfig = getRemoteConfig(app);

  remoteConfig.settings.minimumFetchIntervalMillis = 0; 

  // THIS IS YOUR SINGLE SOURCE OF TRUTH
  const LOCAL_VERSION = "1.0.0"; 

  // ==========================================
  // 1. DYNAMICALLY UPDATE THE UI TEXT
  // ==========================================
  document.addEventListener("DOMContentLoaded", () => {
    const versionDisplayElement = document.getElementById("versionText");
    if (versionDisplayElement) {
        versionDisplayElement.innerText = `Version ${LOCAL_VERSION} (Web)`;
    }
  });

  // ==========================================
  // 2. CHECK FIREBASE FOR UPDATES
  // ==========================================
  async function enforceVersionCheck() {
    try {
      await fetchAndActivate(remoteConfig);
      const remoteVersion = getString(remoteConfig, "web_version");

      if (remoteVersion && remoteVersion !== LOCAL_VERSION) {
        console.log(`Update required. Local: ${LOCAL_VERSION}, Remote: ${remoteVersion}`);
        
        if (!sessionStorage.getItem("isUpdating")) {
          sessionStorage.setItem("isUpdating", "true");
          
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
              await registration.unregister();
              console.log('Service Worker unregistered.');
            }
          }

          if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => caches.delete(key)));
            console.log('PWA cache cleared.');
          }

          window.location.reload(true); 
        } else {
          sessionStorage.removeItem("isUpdating");
        }
      } else {
         console.log(`App is up to date. Version: ${LOCAL_VERSION}`);
      }
    } catch (error) {
      console.error("Failed to check app version:", error);
    }
  }

  enforceVersionCheck();
