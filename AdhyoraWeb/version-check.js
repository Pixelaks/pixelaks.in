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

remoteConfig.settings = {
  minimumFetchIntervalMillis: 0
};

// ==========================================
// 🚨 CHANGE ONLY THIS VERSION
// ==========================================
const LOCAL_VERSION = "1.0.3";

// ==========================================
// SHOW VERSION TEXT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const versionDisplayElement = document.getElementById("versionText");

  if (versionDisplayElement) {
    versionDisplayElement.innerText = `Version ${LOCAL_VERSION} (Web)`;
  }
});

// ==========================================
// LOAD CORRECT PAGE SCRIPT
// ==========================================
function loadMainApp() {

  const currentPage = window.location.pathname.toLowerCase();

  let appFile = "app.js";

  // INDEX
  if (currentPage.includes("index")) {
    appFile = "app.js";
  }

  // STUDENT
  else if (currentPage.includes("student")) {
    appFile = "dashboardApp.js";
  }

  // TEACHER
  else if (currentPage.includes("teacher")) {
    appFile = "teacherApp.js";
  }

  // PRINCIPAL
  else if (currentPage.includes("principal")) {
    appFile = "principalApp.js";
  }

  const appScript = document.createElement("script");
  appScript.type = "module";
  appScript.src = `${appFile}?v=${LOCAL_VERSION}`;

  document.body.appendChild(appScript);
}

// ==========================================
// CHECK FIREBASE VERSION
// ==========================================
async function enforceVersionCheck() {

  try {

    await fetchAndActivate(remoteConfig);

    const remoteVersion =
      getString(remoteConfig, "web_version");

    console.log(
      "LOCAL:",
      LOCAL_VERSION,
      "| REMOTE:",
      remoteVersion
    );

    // ==========================================
    // NEW VERSION DETECTED
    // ==========================================
    if (
      remoteVersion &&
      remoteVersion !== LOCAL_VERSION
    ) {

      console.log("🚨 NEW VERSION DETECTED!");

      // STOP LOOP
      if (sessionStorage.getItem("updatingNow")) {

        sessionStorage.removeItem("updatingNow");

        loadMainApp();

        return;
      }

      sessionStorage.setItem("updatingNow", "true");

      // REMOVE SERVICE WORKERS
      if ("serviceWorker" in navigator) {

        const registrations =
          await navigator.serviceWorker.getRegistrations();

        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // CLEAR CACHE
      if ("caches" in window) {

        const cacheKeys = await caches.keys();

        await Promise.all(
          cacheKeys.map(key => caches.delete(key))
        );
      }

      // CLEAR STORAGE
      localStorage.clear();

      // FORCE HARD REFRESH
      window.location.href =
        window.location.pathname +
        `?update=${Date.now()}`;

      return;
    }

    // ==========================================
    // APP IS UP TO DATE
    // ==========================================
    loadMainApp();

  } catch (error) {

    console.error(
      "Version Check Failed:",
      error
    );

    // LOAD APP EVEN IF REMOTE CONFIG FAILS
    loadMainApp();
  }
}

// START
enforceVersionCheck();
