import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, onSnapshot, setDoc, deleteDoc, serverTimestamp, enableIndexedDbPersistence, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken, deleteToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// ==========================================
// 🚨 SILENCE CONSOLE IN PRODUCTION
// ==========================================
if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    console.log = function() {};
    console.warn = function() {};
    console.error = function() {};
}

// 🚨 SECURE HASHING ALGORITHM (SHA-256)
async function hashText(text) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Firebase Configuration
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
const messaging = getMessaging(app);

// Enable Offline Caching
try { enableIndexedDbPersistence(db); } catch(e) {}

// Global State
let currentCollegeID = "";
let currentUserID = "";
let myRealName = "Teacher"; 
let teacherDeptRaw = "";
let isHOD = false;
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";

// UI Elements
const el = {
    teacherName: document.getElementById("teacherNameText"),
    teacherDept: document.getElementById("teacherDeptText"),
    teacherEmail: document.getElementById("teacherEmailText"),
    settingsOverlay: document.getElementById("settingsOverlay"),
    hodNotificationOverlay: document.getElementById("hodNotificationOverlay")
};

function showToast(msg) { 
    let t = document.getElementById("rcToast"); 
    t.innerText = msg; 
    t.style.bottom = "30px"; 
    setTimeout(() => t.style.bottom = "-100px", 3000); 
}

// ==========================================
// 🚨 INITIAL AUTHENTICATION CHECK
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            InitBiometricUI(); 
            fetchTeacherProfile(); 
        } 
        else { 
            window.location.href = "index.html"; 
        }
    });
}
document.getElementById("versionText").innerText = "Version 1.0.0 (Web Teacher)";

// ==========================================
// 🚨 PROFILE, HOD LOGIC & SESSIONS
// ==========================================
let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let sessionsCache = new Map();
let profileListener = null;

async function fetchTeacherProfile() {
    try {
        ListenToProfile();
        registerWebSession();
        startSessionListener();
        
        // 🚨 Trigger Local Security Lock
        CheckSecurityPin(); 
    } catch (e) {}
}

function ListenToProfile() {
    if (profileListener) profileListener(); 

    const teacherDocRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);

    profileListener = onSnapshot(teacherDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            el.teacherName.innerText = "Profile Not Found";
            return;
        }

        const data = snapshot.data();
        
        // Check HOD Status
        isHOD = data.isHOD || false;
        let hodBadge = isHOD ? " <span style='color:#eab308; font-size:14px;'>(HOD)</span>" : "";

        // Format Name and Email
        myRealName = data.name || "Unknown";
        el.teacherName.innerHTML = myRealName + hodBadge;
        el.teacherEmail.innerText = auth.currentUser.email || "No Email Provided";

        // Format Department
        let deptName = "Unknown Dept";
        if (data.department) {
            deptName = data.department;
            teacherDeptRaw = deptName;
        } else if (data.departmentID) {
            teacherDeptRaw = data.departmentID;
            deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
        }
        el.teacherDept.innerText = deptName;

        // HOD Notification Logic
        if (isHOD) {
            let seenKey = `HOD_Seen_${currentUserID}`;
            if (localStorage.getItem(seenKey) !== "1") {
                el.hodNotificationOverlay.classList.add("active");
                localStorage.setItem(seenKey, "1");
            }
        }
    });
}

// Session Management
async function registerWebSession() {
    if (!myWebDeviceID) {
        myWebDeviceID = "WEB_" + Date.now().toString(36) + Math.random().toString(36).substr(2);
        localStorage.setItem("myWebDeviceID", myWebDeviceID);
    }
    let osName = "Web Browser";
    if (navigator.userAgent.indexOf("Win") != -1) osName = "Windows PC";
    if (navigator.userAgent.indexOf("Mac") != -1) osName = "Mac OS";
    if (navigator.userAgent.indexOf("Linux") != -1) osName = "Linux PC";

    try {
        const sessionRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID, "sessions", myWebDeviceID);
        await setDoc(sessionRef, { deviceName: osName, loginTime: serverTimestamp() }, {merge: true});
        
        onSnapshot(sessionRef, (docSnap) => {
            if (!docSnap.exists()) signOut(auth).then(() => window.location.href = "index.html");
        });
    } catch(e) {}
}

function startSessionListener() {
    onSnapshot(query(collection(db, "colleges", currentCollegeID, "teachers", currentUserID, "sessions")), (snap) => {
        sessionsCache.clear();
        snap.docs.forEach(doc => { sessionsCache.set(doc.id, { id: doc.id, ...doc.data() }); });
        if (document.getElementById("sessionsModal").classList.contains("active")) renderSessions();
    });
}

function renderSessions() {
    let container = document.getElementById("sessionsListContainer");
    if (sessionsCache.size === 0) { container.innerHTML = `<div class="no-data-text">No active sessions.</div>`; return; }
    
    let html = "";
    sessionsCache.forEach((d) => {
        let devName = d.deviceName || "Unknown Device";
        let isMe = (d.id === myWebDeviceID);
        if (isMe) devName += " (This Browser)";
        let timeStr = d.loginTime ? d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : "Recently";
        let btnHtml = isMe ? `<span style="font-size:11px; color:var(--brand-red); font-weight:bold;">Active</span>` : `<button onclick="revokeSession('${d.id}')" style="background:#fef2f2; color:#ef4444; border:1px solid #fca5a5; padding:6px 12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">Kick</button>`;
        
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-grid-color); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px;">
                <div>
                    <div style="font-weight:bold; color:var(--text-dark); font-size:13px; margin-bottom:4px;">${devName}</div>
                    <div style="font-size:11px; color:#64748b;">Logged in: ${timeStr}</div>
                </div>
                ${btnHtml}
            </div>`;
    });
    container.innerHTML = html;
}

window.revokeSession = async function(sessionID) {
    if (!confirm("Log this device out?")) return;
    try {
        await deleteDoc(doc(db, "colleges", currentCollegeID, "teachers", currentUserID, "sessions", sessionID));
        showToast("Device kicked successfully.");
    } catch(e) { showToast("Error revoking session."); }
};

// ==========================================
// 🚨 ROUTING ENGINE (Sidebar & Grid Map)
// ==========================================
const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");

// Map your Grid IDs and Sidebar IDs to their respective Views
const navigationMap = [
    { nav: "btnHome", view: "welcomeView" },
    { nav: "btnNavAttendance", grid: "gridBtnAttendance", view: "attendanceView" },
    { nav: "btnNavTimetable", grid: "gridBtnTimetable", view: "timetableView" },
    { nav: "btnNavInternalMarks", grid: "gridBtnInternalMarks", view: "internalMarksView" },
    { nav: "btnNavSubjects", grid: "gridBtnSubjects", view: "subjectsView" },
    { nav: "btnNavCalendar", grid: "gridBtnCalendar", view: "calendarView" },
    { nav: "btnNavAssignments", grid: "gridBtnAssignments", view: "assignmentsView" },
    { nav: "btnNavStudentList", grid: "gridBtnStudentList", view: "studentListView" },
    { nav: "btnNavSubjectAssign", grid: "gridBtnSubjectAssign", view: "subjectAssignView" },
    { nav: "btnNavBatch", grid: "gridBtnBatch", view: "batchView" },
    { nav: "btnNavEventAttendance", grid: "gridBtnEventAttendance", view: "eventAttendanceView" }
];

function switchView(targetViewId, clickedBtnId) {
    // 1. Hide all views gracefully
    document.querySelectorAll(".dashboard-view").forEach(v => v.classList.add("hidden-view"));
    
    // 2. Remove active class from all sidebar nav buttons
    document.querySelectorAll(".menu-btn, .nav-icon-btn, .nav-btn").forEach(btn => btn.classList.remove("active-nav"));
    
    // 3. Highlight the correct sidebar button if it exists
    if (clickedBtnId) {
        let btn = document.getElementById(clickedBtnId);
        if (btn) btn.classList.add("active-nav");
    }

    // 4. Handle Mobile/PC Layout shifts
    if (targetViewId === "welcomeView") {
        sidebar.classList.remove("mobile-hidden");
        mainContent.classList.remove("mobile-active");
        let wView = document.getElementById("welcomeView");
        if (wView && window.innerWidth > 900) wView.classList.remove("hidden-view");
    } else {
        sidebar.classList.add("mobile-hidden");
        mainContent.classList.add("mobile-active");
        
        let targetEl = document.getElementById(targetViewId);
        if (targetEl) {
            targetEl.classList.remove("hidden-view");
            targetEl.style.opacity = 0;
            setTimeout(() => targetEl.style.opacity = 1, 50);
        } else {
            // View hasn't been built in HTML yet
            showToast("This module is under construction.");
        }
    }
}

// Wire up the navigation mapping!
navigationMap.forEach(route => {
    if (route.nav) {
        let navBtn = document.getElementById(route.nav);
        if (navBtn) navBtn.addEventListener("click", () => switchView(route.view, route.nav));
    }
    if (route.grid) {
        let gridBtn = document.getElementById(route.grid);
        if (gridBtn) gridBtn.addEventListener("click", () => switchView(route.view, route.nav));
    }
});


// ==========================================
// 🚨 SETTINGS & THEMES
// ==========================================
document.getElementById("btnSettings").addEventListener("click", () => el.settingsOverlay.classList.add("active"));
document.getElementById("closeSettingsBtn").addEventListener("click", () => el.settingsOverlay.classList.remove("active"));
el.settingsOverlay.addEventListener("click", (e) => { if (e.target === el.settingsOverlay) el.settingsOverlay.classList.remove("active"); });

document.getElementById("btnThemes").addEventListener("click", () => {
    el.settingsOverlay.classList.remove("active");
    document.getElementById("themesModal").classList.add("active");
});
document.getElementById("btnDevices").addEventListener("click", () => {
    el.settingsOverlay.classList.remove("active");
    document.getElementById("sessionsModal").classList.add("active");
    renderSessions(); 
});

document.getElementById("btnContactUs").addEventListener("click", () => {
    let role = isHOD ? "Teacher (HOD)" : "Teacher";
    let deviceInfo = `\n========================\nDiagnostic Information\n========================\nBrowser/Device: ${navigator.userAgent}\nOS: ${navigator.platform}\nApp Version: 1.0.0 (Web)\nCollege ID: ${currentCollegeID}\nRole: ${role}\n========================`;
    window.open(`mailto:pixelaks.technologies@gmail.com?subject=${encodeURIComponent("Support Request - Teacher App")}&body=${encodeURIComponent("Describe issue here:\n\n\n" + deviceInfo)}`, "_blank");
});

document.getElementById("btnPrivacy").addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
document.getElementById("btnTerms").addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));
document.getElementById("btnWebsite").addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));
document.getElementById("btnSignOut").addEventListener("click", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});

// Theme Logic
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add("dark-mode");
        document.getElementById("btnDarkMode").style.border = "2px solid var(--brand-red)";
        document.getElementById("btnLightMode").style.border = "1px solid #475569";
    } else {
        document.body.classList.remove("dark-mode");
        document.getElementById("btnLightMode").style.border = "2px solid var(--brand-red)";
        document.getElementById("btnDarkMode").style.border = "1px solid #cbd5e1";
    }
    localStorage.setItem("adhyora_teacher_theme", isDark ? "dark" : "light");
}
document.getElementById("btnDarkMode").addEventListener("click", () => applyTheme(true));
document.getElementById("btnLightMode").addEventListener("click", () => applyTheme(false));
applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");


// ==========================================
// 🚨 LOCAL ENCRYPTED SECURITY PIN ENGINE
// ==========================================
let cachedAdminPinHash = ""; 
let lockMode = "LOGIN"; 
let setupTempPin = "";
let failedPinAttempts = 0;
let isFirstSecurityLoad = true;

const elLock = {
    screen: document.getElementById("appLockScreen"), title: document.getElementById("lockTitle"), status: document.getElementById("lockStatus"),
    input: document.getElementById("lockPinInput"), btnSubmit: document.getElementById("btnLockSubmit"), btnForgot: document.getElementById("btnLockForgot"),
    reAuthOverlay: document.getElementById("reAuthOverlay"), reAuthPass: document.getElementById("reAuthPasswordInput"), 
    reAuthStatus: document.getElementById("reAuthStatus"), btnReAuth: document.getElementById("btnReAuthSubmit"),
    btnBio: document.getElementById("btnLockBiometrics"), toggleBio: document.getElementById("bioToggleSwitch"), btnToggleWrap: document.getElementById("btnToggleBiometrics")
};

function CheckSecurityPin() {
    document.querySelector(".main-content").style.display = "none";
    document.getElementById("mainSidebar").style.display = "none";
    document.getElementById("initialAppLoader").style.display = "none"; 
    elLock.screen.style.display = "flex"; 

    // 🚨 LOCAL VAULT FIX: Teachers save their PIN hash to local device storage to respect Firestore Rules
    const localPinKey = `adhyora_teacher_pin_${currentUserID}`;
    const storedHash = localStorage.getItem(localPinKey);

    if (storedHash) {
        cachedAdminPinHash = storedHash;
        
        const linkedPin = localStorage.getItem(`adhyora_bio_linked_pin_${currentUserID}`);
        if (isBioEnabledLocally && linkedPin && linkedPin !== cachedAdminPinHash) {
            isBioEnabledLocally = false;
            localStorage.setItem(`adhyora_bio_${currentUserID}`, "false");
            localStorage.removeItem(`adhyora_bio_id_${currentUserID}`);
            localStorage.removeItem(`adhyora_bio_linked_pin_${currentUserID}`);
            if (elLock.toggleBio) elLock.toggleBio.classList.remove("active");
        }
        
        SetLockMode("LOGIN");
    } else {
        SetLockMode("SETUP_1");
    }
}

function SetLockMode(mode) {
    lockMode = mode;
    elLock.input.value = "";
    elLock.btnForgot.style.display = "none";
    elLock.btnForgot.innerText = "Forgot PIN?"; 
    elLock.input.style.display = "inline-block"; 
    
    if (mode !== "SETUP_BIO") elLock.input.focus();

    if (mode === "LOGIN") {
        elLock.title.innerText = "ENTER SECURE PIN";
        elLock.status.innerText = "Enter 4-digit PIN to unlock.";
        elLock.status.style.color = "#94a3b8";
        elLock.btnSubmit.innerText = "Unlock Dashboard";
        if (failedPinAttempts >= 2) elLock.btnForgot.style.display = "block";
        
        if (isBioEnabledLocally && isBiometricSupported) {
            elLock.btnBio.style.display = "block";
            setTimeout(() => elLock.btnBio.click(), 500); 
        } else {
            elLock.btnBio.style.display = "none";
        }
    } 
    else if (mode === "SETUP_1" || mode === "RESET_NEW_1") {
        elLock.title.innerText = "CREATE SECURITY PIN";
        elLock.status.innerText = "Set a 4-digit PIN to secure this device.";
        elLock.status.style.color = "var(--brand-red)";
        elLock.btnSubmit.innerText = "Next Step";
        elLock.btnBio.style.display = "none";
    }
    else if (mode === "SETUP_2" || mode === "RESET_NEW_2") {
        elLock.title.innerText = "CONFIRM NEW PIN";
        elLock.status.innerText = "Please re-enter the PIN to confirm.";
        elLock.status.style.color = "#facc15";
        elLock.btnSubmit.innerText = "Save Security PIN";
        elLock.btnBio.style.display = "none";
    }
    else if (mode === "SETUP_BIO") {
        elLock.title.innerHTML = '<i class="fas fa-fingerprint" style="color:var(--brand-red); font-size:40px; margin-bottom:10px;"></i><br>ENABLE BIOMETRICS';
        elLock.status.innerText = "Unlock your dashboard instantly with your Fingerprint or Face ID.";
        elLock.status.style.color = "var(--brand-red)";
        elLock.input.style.display = "none"; 
        elLock.btnSubmit.innerText = "Enable Fingerprint";
        elLock.btnForgot.innerText = "Skip for now";
        elLock.btnForgot.style.display = "block";
    }
}

elLock.btnSubmit.addEventListener("click", async () => {
    let val = elLock.input.value.trim();
    
    if (lockMode !== "SETUP_BIO" && val.length !== 4) {
        elLock.status.innerText = "PIN must be exactly 4 digits.";
        elLock.status.style.color = "#ef4444";
        return;
    }

    if (lockMode === "LOGIN") {
        let hashedInput = await hashText(val);
        if (hashedInput === cachedAdminPinHash) {
            UnlockSecurityWall();
        } else {
            failedPinAttempts++;
            elLock.status.innerText = "Incorrect PIN.";
            elLock.status.style.color = "#ef4444";
            elLock.input.value = "";
            if (failedPinAttempts >= 2) elLock.btnForgot.style.display = "block";
        }
    } 
    else if (lockMode === "SETUP_1" || lockMode === "RESET_NEW_1") {
        setupTempPin = val;
        SetLockMode(lockMode === "SETUP_1" ? "SETUP_2" : "RESET_NEW_2");
    }
    else if (lockMode === "SETUP_2" || lockMode === "RESET_NEW_2") {
        if (val === setupTempPin) {
            elLock.btnSubmit.innerText = "Saving...";
            elLock.btnSubmit.disabled = true;
            try {
                cachedAdminPinHash = await hashText(val);
                localStorage.setItem(`adhyora_teacher_pin_${currentUserID}`, cachedAdminPinHash);
                
                isBioEnabledLocally = false;
                localStorage.setItem(`adhyora_bio_${currentUserID}`, "false");
                localStorage.removeItem(`adhyora_bio_id_${currentUserID}`);
                localStorage.removeItem(`adhyora_bio_linked_pin_${currentUserID}`);
                if (elLock.toggleBio) elLock.toggleBio.classList.remove("active");
                
                elLock.btnSubmit.disabled = false;
                
                if (isBiometricSupported && !isBioEnabledLocally) {
                    SetLockMode("SETUP_BIO");
                } else {
                    UnlockSecurityWall();
                }
            } catch(e) {
                elLock.status.innerText = "Failed to save PIN.";
                elLock.btnSubmit.innerText = "Try Again";
                elLock.btnSubmit.disabled = false;
            }
        } else {
            elLock.status.innerText = "PINs do not match. Try again.";
            elLock.status.style.color = "#ef4444";
            setTimeout(() => SetLockMode(lockMode === "SETUP_2" ? "SETUP_1" : "RESET_NEW_1"), 1500);
        }
    }
    else if (lockMode === "SETUP_BIO") {
        elLock.btnSubmit.innerText = "Scanning...";
        try {
            const challenge = window.crypto.getRandomValues(new Uint8Array(32));
            const userIDBuffer = new TextEncoder().encode(currentUserID);
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Adhyora AMS", id: window.location.hostname },
                    user: { id: userIDBuffer, name: myRealName, displayName: myRealName },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                    timeout: 60000
                }
            });

            const credIdBase64 = bufferToBase64(credential.rawId);
            localStorage.setItem(`adhyora_bio_id_${currentUserID}`, credIdBase64);
            localStorage.setItem(`adhyora_bio_linked_pin_${currentUserID}`, cachedAdminPinHash); 
            localStorage.setItem(`adhyora_bio_${currentUserID}`, "true");
            isBioEnabledLocally = true;
            
            if(elLock.toggleBio) elLock.toggleBio.classList.add("active");
            elLock.btnSubmit.innerHTML = '<i class="fas fa-check-circle"></i> Linked!';
            setTimeout(() => { UnlockSecurityWall(); }, 800);
        } catch (err) {
            elLock.status.innerText = "Scan failed or cancelled.";
            elLock.status.style.color = "#ef4444";
            elLock.btnSubmit.innerText = "Try Again";
        }
    }
});

function UnlockSecurityWall() {
    elLock.screen.style.display = "none";
    document.querySelector(".main-content").style.display = "";
    document.getElementById("mainSidebar").style.display = "";
    failedPinAttempts = 0;
}

// ==========================================
// 🚨 BIOMETRIC (WEBAUTHN) ENGINE
// ==========================================
const isBiometricSupported = window.PublicKeyCredential !== undefined;
let isBioEnabledLocally = false; 

function bufferToBase64(buffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))); }
function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

window.InitBiometricUI = function() {
    isBioEnabledLocally = localStorage.getItem(`adhyora_bio_${currentUserID}`) === "true";
    if (!isBiometricSupported) {
        if(elLock.btnToggleWrap) { elLock.btnToggleWrap.style.opacity = "0.5"; elLock.btnToggleWrap.title = "Not supported."; }
    } else if (isBioEnabledLocally) {
        if(elLock.toggleBio) elLock.toggleBio.classList.add("active");
    }
};

if(elLock.btnToggleWrap) {
    elLock.btnToggleWrap.addEventListener("click", async () => {
        if (!isBiometricSupported) return;

        if (isBioEnabledLocally) {
            isBioEnabledLocally = false;
            localStorage.setItem(`adhyora_bio_${currentUserID}`, "false");
            localStorage.removeItem(`adhyora_bio_id_${currentUserID}`); 
            localStorage.removeItem(`adhyora_bio_linked_pin_${currentUserID}`);
            elLock.toggleBio.classList.remove("active");
            showToast("Biometrics disabled for this device.");
        } else {
            try {
                const challenge = window.crypto.getRandomValues(new Uint8Array(32));
                const userIDBuffer = new TextEncoder().encode(currentUserID);
                const credential = await navigator.credentials.create({
                    publicKey: {
                        challenge: challenge,
                        rp: { name: "Adhyora AMS", id: window.location.hostname },
                        user: { id: userIDBuffer, name: myRealName, displayName: myRealName },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                        timeout: 60000
                    }
                });

                const credIdBase64 = bufferToBase64(credential.rawId);
                localStorage.setItem(`adhyora_bio_id_${currentUserID}`, credIdBase64);
                localStorage.setItem(`adhyora_bio_linked_pin_${currentUserID}`, cachedAdminPinHash); 

                isBioEnabledLocally = true;
                localStorage.setItem(`adhyora_bio_${currentUserID}`, "true");
                elLock.toggleBio.classList.add("active");
                showToast("✅ Biometrics Linked Successfully!");
            } catch (err) {
                showToast("❌ Failed to link Biometrics.");
            }
        }
    });
}

if(elLock.btnBio) {
    elLock.btnBio.addEventListener("click", async () => {
        elLock.btnBio.innerText = "Scanning...";
        if (typeof isBiometricPromptActive !== 'undefined') isBiometricPromptActive = true; 
        
        const savedCredIdBase64 = localStorage.getItem(`adhyora_bio_id_${currentUserID}`);
        if (!savedCredIdBase64) {
            elLock.status.innerText = "Biometric data lost. Please set up again.";
            elLock.status.style.color = "#ef4444";
            if (typeof isBiometricPromptActive !== 'undefined') isBiometricPromptActive = false;
            return;
        }

        try {
            const challenge = window.crypto.getRandomValues(new Uint8Array(32));
            const credIdBuffer = base64ToBuffer(savedCredIdBase64);

            await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    rpId: window.location.hostname,
                    allowCredentials: [{ type: "public-key", id: credIdBuffer }],
                    userVerification: "required",
                    timeout: 60000
                }
            });

            if (typeof isBiometricPromptActive !== 'undefined') isBiometricPromptActive = false;
            elLock.btnBio.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';
            setTimeout(() => { UnlockSecurityWall(); }, 500);

        } catch (err) {
            if (typeof isBiometricPromptActive !== 'undefined') isBiometricPromptActive = false;
            elLock.btnBio.innerHTML = '<i class="fas fa-fingerprint" style="margin-right:8px;"></i> Try Again';
            elLock.status.innerText = "Biometric scan failed or cancelled.";
            elLock.status.style.color = "#ef4444";
        }
    });
}

// ==========================================
// 🚨 RE-AUTH & FORGOT PIN LOGIC
// ==========================================
elLock.btnForgot.addEventListener("click", () => {
    if (lockMode === "SETUP_BIO") {
        UnlockSecurityWall();
        return;
    }
    elLock.reAuthPass.value = "";
    elLock.reAuthStatus.innerText = "";
    elLock.reAuthOverlay.classList.add("active");
});

document.getElementById("btnResetPinSettings").addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("active");
    elLock.reAuthPass.value = "";
    elLock.reAuthStatus.innerText = "";
    elLock.reAuthOverlay.classList.add("active");
});

elLock.btnReAuth.addEventListener("click", async () => {
    let pass = elLock.reAuthPass.value.trim();
    if (!pass) return;
    
    elLock.btnReAuth.innerText = "Verifying...";
    elLock.btnReAuth.disabled = true;
    
    try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, pass);
        await reauthenticateWithCredential(auth.currentUser, credential);
        
        elLock.reAuthOverlay.classList.remove("active");
        elLock.reAuthPass.value = "";
        
        document.querySelector(".main-content").style.display = "none";
        document.getElementById("mainSidebar").style.display = "none";
        elLock.screen.style.display = "flex";
        SetLockMode("RESET_NEW_1");
        
    } catch(e) {
        elLock.reAuthStatus.innerText = "Incorrect Password.";
    }
    
    elLock.btnReAuth.innerText = "Verify";
    elLock.btnReAuth.disabled = false;
});

document.getElementById("btnResetPassSettings").addEventListener("click", async () => {
    if (confirm("Send a password reset link to your email?")) {
        try {
            await sendPasswordResetEmail(auth, auth.currentUser.email);
            showToast("Password reset link sent to your email!");
            document.getElementById("settingsOverlay").classList.remove("active");
        } catch(e) {
            showToast("Failed to send reset link.");
        }
    }
});

// ==========================================
// 🚨 PUSH NOTIFICATIONS ENGINE
// ==========================================
let myCurrentPushToken = "";

function updateNotificationToggleUI() {
    const toggle = document.getElementById("notifToggleSwitch");
    if (!toggle) return;
    if (Notification.permission === "granted" && myCurrentPushToken !== "") {
        toggle.classList.add("active");
    } else {
        toggle.classList.remove("active");
    }
}

async function requestPushPermissions() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const swRegistration = await navigator.serviceWorker.register('/AdhyoraWeb/firebase-messaging-sw.js');
            const currentToken = await getToken(messaging, { 
                vapidKey: "BNO8RVA-R1iOy19P2rbVYPBzlCSnptpq13ybtqqO0IgHhDOXhkauOXEWm2hGN6yIUz2_fHL-Iv7IG9cpRZv2YkU",
                serviceWorkerRegistration: swRegistration 
            });

            if (currentToken) {
                myCurrentPushToken = currentToken; 
                const teacherRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
                const tSnap = await getDoc(teacherRef);
                let activeTokens = [];
                
                if (tSnap.exists() && tSnap.data().webFcmTokens) {
                    activeTokens = tSnap.data().webFcmTokens;
                }

                activeTokens = activeTokens.filter(t => t !== currentToken);
                activeTokens.push(currentToken);
                if (activeTokens.length > 3) activeTokens = activeTokens.slice(activeTokens.length - 3);

                await setDoc(teacherRef, { webFcmTokens: activeTokens }, { merge: true });

                const getSafe = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
                let safeCol = getSafe(currentCollegeID);
                let safeDept = getSafe(teacherDeptRaw);
                
                let topicsToJoin = [
                    `${safeCol}_ALL`, 
                    `${safeCol}_TEACHERS_${safeDept}`, 
                    `ADHYORA_GLOBAL_USERS`
                ];

                fetch(APPS_SCRIPT_URL, {
                    method: "POST", mode: "no-cors",
                    body: JSON.stringify({ action: "subscribe", token: currentToken, topics: topicsToJoin })
                }).then(() => {
                    updateNotificationToggleUI();
                    showToast("✅ Notifications Enabled!");
                });
            }
        } else {
            alert("Notifications are blocked in your browser settings.");
        }
    } catch (error) {
        alert("Push Setup Failed: " + error.message);
    }
}

async function unsubscribePushNotifications() {
    try {
        const toggle = document.getElementById("notifToggleSwitch");
        toggle.style.opacity = "0.5";

        await deleteToken(messaging);

        if (myCurrentPushToken && currentCollegeID && currentUserID) {
            const teacherRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
            await setDoc(teacherRef, { webFcmTokens: arrayRemove(myCurrentPushToken) }, { merge: true });
        }
        
        myCurrentPushToken = ""; 
        toggle.style.opacity = "1";
        updateNotificationToggleUI();
        showToast("Notifications Disabled.");
    } catch (e) {}
}

document.getElementById("btnToggleNotifications").addEventListener("click", async () => {
    const toggle = document.getElementById("notifToggleSwitch");
    if (toggle.classList.contains("active")) {
        if (confirm("Disable notifications for this browser?")) await unsubscribePushNotifications();
    } else {
        toggle.style.opacity = "0.5";
        await requestPushPermissions();
        toggle.style.opacity = "1";
    }
});

// ==========================================
// 🚨 FOREGROUND / BACKGROUND APP LOCK
// ==========================================
let isBiometricPromptActive = false;

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const isLocked = elLock.screen.style.display === "flex";
        if (!isLocked && !isBiometricPromptActive && cachedAdminPinHash !== "") {
            document.querySelector(".main-content").style.display = "none";
            document.getElementById("mainSidebar").style.display = "none";
            elLock.screen.style.display = "flex";
            SetLockMode("LOGIN");
        }
    }
});

// ==========================================
// 🚨 HARDWARE BACK BUTTON / ROUTING MANAGER
// ==========================================
history.pushState(null, null, location.href);

window.addEventListener('popstate', () => {
    history.pushState(null, null, location.href);

    if (elLock.screen && elLock.screen.style.display === "flex") return;

    const closableOverlays = ["hodNotificationOverlay", "settingsOverlay", "themesModal", "sessionsModal", "reAuthOverlay"];
    
    for (let id of closableOverlays) {
        let el = document.getElementById(id);
        if (el && el.classList.contains("active")) {
            el.classList.remove("active");
            if(id === "reAuthOverlay") {
                elLock.reAuthPass.value = "";
                elLock.reAuthStatus.innerText = "";
            }
            return; 
        }
    }

    let isHome = false;
    if (window.innerWidth > 900) {
        isHome = document.getElementById("welcomeView") && !document.getElementById("welcomeView").classList.contains("hidden-view");
    } else {
        isHome = sidebar && !sidebar.classList.contains("mobile-hidden") && !mainContent.classList.contains("mobile-active");
    }

    if (!isHome) {
        switchView("welcomeView", "btnHome");
        return;
    }

    if (confirm("Are you sure you want to sign out?")) {
        if (myCurrentPushToken && currentCollegeID && currentUserID) {
            updateDoc(doc(db, "colleges", currentCollegeID, "teachers", currentUserID), {
                webFcmTokens: arrayRemove(myCurrentPushToken)
            }).finally(() => {
                signOut(auth).then(() => window.location.href = "index.html");
            });
        } else {
            signOut(auth).then(() => window.location.href = "index.html");
        }
    }
});

// ==========================================
// 🚨 BANK-GRADE ANTI-SNOOPING SHIELD 
// ==========================================
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
    if (e.keyCode === 123) return false;
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false;
    if (e.ctrlKey && e.keyCode === 85) return false;
};
