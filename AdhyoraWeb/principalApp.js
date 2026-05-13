// principalApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 🚨 PASTE YOUR REAL CONFIG HERE 🚨
const firebaseConfig = {
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Variables
let currentCollegeID = "";
let currentUserID = "";

// DOM Elements
const el = {
    settingsOverlay: document.getElementById("settingsOverlay"),
    btnSettings: document.getElementById("btnSettings"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    
    principalName: document.getElementById("principalNameText"),
    principalEmail: document.getElementById("principalEmailText"),
    versionText: document.getElementById("versionText"),
    
    btnContactUs: document.getElementById("btnContactUs"),
    btnWebsite: document.getElementById("btnWebsite"),
    btnPrivacy: document.getElementById("btnPrivacy"),
    btnTerms: document.getElementById("btnTerms"),
    btnSignOut: document.getElementById("btnSignOut")
};

// ==========================================
// INITIALIZATION
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) {
    window.location.href = "index.html";
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserID = user.uid;
            fetchPrincipalProfile();
        } else {
            window.location.href = "index.html";
        }
    });
}

// Set Version (Replicating Application.version)
el.versionText.innerText = "Version 1.0.0 (Web Admin)";

// ==========================================
// C# TO JS LOGIC TRANSLATION
// ==========================================

async function fetchPrincipalProfile() {
    try {
        const docRef = doc(db, "colleges", currentCollegeID, "principals", currentUserID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const pName = data.name || "Principal";
            const pEmail = data.email || "No Email Provided";

            el.principalName.innerText = pName;
            el.principalEmail.innerText = pEmail;
        } else {
            el.principalName.innerText = "Profile Not Found";
            el.principalEmail.innerText = "";
        }
    } catch (error) {
        console.error("Error fetching principal profile:", error);
        el.principalName.innerText = "Connection Error";
        el.principalEmail.innerText = "";
    }
}

function handleContactUs() {
    const SUPPORT_EMAIL = "pixelaks.technologies@gmail.com";
    const EMAIL_SUBJECT = "Support Request - Principal Web Dashboard";
    
    // Getting user agent info to replicate SystemInfo diagnostics
    const deviceModel = navigator.userAgent;
    const os = navigator.platform;
    const appVersion = "1.0.0 (Web)";
    const role = "Principal";

    const deviceInfo = `\n========================\n` +
                       `Diagnostic Information\n` +
                       `========================\n` +
                       `Browser/Device: ${deviceModel}\n` +
                       `OS: ${os}\n` +
                       `App Version: ${appVersion}\n` +
                       `College ID: ${currentCollegeID}\n` +
                       `Role: ${role}\n` +
                       `========================`;

    const fullMessage = "Please describe your issue here:\n\n\n" + deviceInfo;

    const escapedSubject = encodeURIComponent(EMAIL_SUBJECT);
    const escapedBody = encodeURIComponent(fullMessage);

    // Open default mail client
    window.open(`mailto:${SUPPORT_EMAIL}?subject=${escapedSubject}&body=${escapedBody}`, "_blank");
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Settings Drawer Toggle
el.btnSettings.addEventListener("click", () => {
    el.settingsOverlay.classList.add("active");
});
el.closeSettingsBtn.addEventListener("click", () => {
    el.settingsOverlay.classList.remove("active");
});
el.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === el.settingsOverlay) {
        el.settingsOverlay.classList.remove("active");
    }
});

// External Links & Contact (From C# Script)
el.btnContactUs.addEventListener("click", handleContactUs);
el.btnWebsite.addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));
el.btnPrivacy.addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
el.btnTerms.addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));

// Sign Out
el.btnSignOut.addEventListener("click", () => {
    if (confirm("Are you sure you want to sign out?")) {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        });
    }
});

// Placeholder clicks for the grid menu buttons
document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        const text = e.currentTarget.querySelector(".btn-text").innerText;
        alert(`Navigating to ${text}... (View logic to be implemented)`);
    });
});