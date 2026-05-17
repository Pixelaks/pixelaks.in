  // Import Firebase modules from the CDN
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getRemoteConfig, fetchAndActivate, getString } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js";

  // 1. Initialize Firebase with your exact Adhyora configuration
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

  // Set minimum fetch interval. 
  // 0 is great for testing so it fetches every time.
  // For production, change to 3600000 (1 hour) or 43200000 (12 hours) to avoid hitting Firebase quota limits.
  remoteConfig.settings.minimumFetchIntervalMillis = 0; 

  // 2. Define the LOCAL version (Update this string before every deployment!)
  const LOCAL_VERSION = "1.0.0"; 

  async function enforceVersionCheck() {
    try {
      // 3. Fetch the latest config from Firebase
      await fetchAndActivate(remoteConfig);
      
      // 4. Get the remote version value using your specific parameter name
      const remoteVersion = getString(remoteConfig, "web_version");

      // 5. Compare the versions
      if (remoteVersion && remoteVersion !== LOCAL_VERSION) {
        console.log(`Update required. Local: ${LOCAL_VERSION}, Remote: ${remoteVersion}`);
        
        // Prevent infinite reload loops
        if (!sessionStorage.getItem("isUpdating")) {
          sessionStorage.setItem("isUpdating", "true");
          
          // Step A: Unregister Service Workers (Crucial for installed PWAs)
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
              await registration.unregister();
              console.log('Service Worker unregistered.');
            }
          }

          // Step B: Clear the Browser/PWA Cache Storage
          if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => caches.delete(key)));
            console.log('PWA cache cleared.');
          }

          // Step C: Force a hard reload from the server, bypassing local cache
          window.location.reload(true); 
        } else {
          // Reset the flag if the reload has already executed
          sessionStorage.removeItem("isUpdating");
        }
      } else {
         console.log(`App is up to date. Version: ${LOCAL_VERSION}`);
      }
    } catch (error) {
      console.error("Failed to check app version:", error);
    }
  }

  // Execute the check when the page loads
  enforceVersionCheck();