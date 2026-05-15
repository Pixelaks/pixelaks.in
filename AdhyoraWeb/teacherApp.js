import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🚨 FIREBASE CONFIGURATION
// ==========================================
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

// Global State Variables
let currentCollegeID = "";
let currentUserID = "";
let isHOD = false;
let profileListener = null;
let teacherDeptRaw = ""; // 🚨 Needed to figure out which notifications to download!

// Get College ID from URL
const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            ListenToProfile(); // Connects to the DB immediately
        } else { 
            window.location.href = "index.html"; 
        }
    });
}

// ==========================================
// 🚨 PROFILE DATA ENGINE
// ==========================================
function ListenToProfile() {
    if (profileListener) profileListener(); // Stop old listener

    const teacherDocRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);

    profileListener = onSnapshot(teacherDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            document.getElementById("teacherInfoName").innerText = "Profile Not Found";
            return;
        }

        const data = snapshot.data();
        
        // 1. Check HOD Flag
        isHOD = data.isHOD || false;
        
        // 2. Get Raw Data
        const rawName = data.name || "Unknown";
        const email = auth.currentUser.email || data.email;

        // 3. Format Department & Save RAW department for notifications
        let deptName = "Unknown Dept";
        if (data.department) {
            deptName = data.department;
            teacherDeptRaw = deptName;
        } else if (data.departmentID) {
            teacherDeptRaw = data.departmentID;
            deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
        }

        // 4. Update UI Elements 
        let hodBadgeText = isHOD ? " <span style='color:#f59e0b; font-size:14px;'>(HOD)</span>" : "";
        document.getElementById("teacherInfoName").innerHTML = `${rawName}${hodBadgeText}`;
        document.getElementById("teacherInfoEmail").innerText = email;
        document.getElementById("teacherInfoDept").innerText = deptName;

        // HOD Notification Logic (Matches Unity exactly)
        if (isHOD) {
            const seenKey = `HOD_Seen_${currentUserID}`;
            if (localStorage.getItem(seenKey) !== "1") {
                document.getElementById("hodNotificationPanel").classList.add("active");
                localStorage.setItem(seenKey, "1");
            }
        }

        // 🚨 TRIGGER THE INBOX: Now that we know their department, download their messages!
        if (!hasStartedInbox && teacherDeptRaw !== "") {
            startInboxListener();
            hasStartedInbox = true;
        }

        // Unlock UI once data is fully loaded
        document.getElementById("initialAppLoader").style.display = "none";
    }, (error) => {
        console.error("Error listening to profile:", error);
        document.getElementById("teacherInfoName").innerText = "Network Error";
    });
}

// ==========================================
// 🚨 NOTIFICATION INBOX ENGINE (Step 1)
// ==========================================
let cachedNotifs = [];
let inboxListenerUnsub = null;
let globalListenerUnsub = null;
let hasStartedInbox = false;

function startInboxListener() {
    // 1. Format the topics exactly like the Unity C# code
    const getSafeTopic = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
    let safeColID = getSafeTopic(currentCollegeID);
    let safeDept = getSafeTopic(teacherDeptRaw);

    // The Teacher listens to ALL messages, ALL_TEACHERS messages, and specific DEPT messages
    const myTopics = [
        `${safeColID}_ALL`, 
        `${safeColID}_TEACHERS_ALL`, 
        `${safeColID}_TEACHERS_${safeDept}`
    ];

    let inboxCache = []; 
    let globalCache = [];
    
    const updateNotifUI = () => { 
        // Combine college messages and global dev messages, then sort by newest
        cachedNotifs = [...inboxCache, ...globalCache].sort((a,b) => b.time - a.time); 
        renderNotifications(); 
    };

    // 2. Listen to College-Level Messages
    if (inboxListenerUnsub) inboxListenerUnsub();
    inboxListenerUnsub = onSnapshot(query(collection(db, "colleges", currentCollegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        inboxCache = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            inboxCache.push({ 
                title: d.title || "Notice", 
                body: d.body || "", 
                time: d.timestamp ? d.timestamp.toDate() : new Date(), 
                sender: d.senderName || "System" 
            }); 
        });
        
        // Show Red Dot if data exists
        if (snap.docs.length > 0) {
            document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "block");
        }
        updateNotifUI();
    });

    // 3. Listen to Global Adhyora System Messages
    if (globalListenerUnsub) globalListenerUnsub();
    globalListenerUnsub = onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        globalCache = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            globalCache.push({ 
                title: d.title || "System Update", 
                body: d.body || "", 
                time: d.timestamp ? d.timestamp.toDate() : new Date(), 
                sender: "Adhyora Team" 
            }); 
        });
        
        if (snap.docs.length > 0) {
            document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "block");
        }
        updateNotifUI();
    });
}

function renderNotifications() {
    const listEl = document.getElementById("notificationsList");
    if (!listEl) return;

    if (cachedNotifs.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; 
        return; 
    }
    
    // Renders custom styled cards that match your Red Theme
    listEl.innerHTML = cachedNotifs.map(n => {
        return `
        <div style="background:white; border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid var(--brand-red);">
            <div style="font-weight:bold; color:var(--text-dark); font-size:15px; margin-bottom:5px;">${n.title}</div>
            <div style="font-size:13px; color:#475569; margin-bottom:10px; line-height:1.5;">${n.body}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:#94a3b8; font-weight:600;">
                <span><i class="fas fa-bullhorn" style="margin-right:4px;"></i> ${n.sender}</span>
                <span>${n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// 🚨 UI NAVIGATION ROUTER
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"),
    notifications: document.getElementById("notificationsView")
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn, .nav-btn, .menu-btn");

function switchView(targetViewId, clickedBtnId) {
    // 1. Remove active state from all buttons
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    
    // 2. Add active state to clicked button
    if (clickedBtnId) {
        let btn = document.getElementById(clickedBtnId);
        if (btn) btn.classList.add("active-nav");
    }

    // 3. Hide all views
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });

    // 4. Handle Mobile/PC Layout Shifts
    if (targetViewId === "welcomeView") {
        sidebar.classList.remove("mobile-hidden"); 
        mainContent.classList.remove("mobile-active");
        if (window.innerWidth > 1024) views.welcome.classList.remove("hidden-view");
    } else {
        sidebar.classList.add("mobile-hidden"); 
        mainContent.classList.add("mobile-active");
        
        let targetEl = document.getElementById(targetViewId);
        if (targetEl) { 
            targetEl.classList.remove("hidden-view"); 
            targetEl.style.opacity = 0; 
            setTimeout(() => targetEl.style.opacity = 1, 50); 
        }
    }
}

// Map the specific Nav Buttons
document.getElementById("btnHome").addEventListener("click", (e) => switchView("welcomeView", "btnHome"));

document.getElementById("btnNotifications").addEventListener("click", (e) => {
    switchView("notificationsView", "btnNotifications");
    // 🚨 Hide the red dot when they open the inbox!
    document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "none");
});

// ==========================================
// 🚨 SETTINGS DRAWER ACTIONS
// ==========================================
const SUPPORT_EMAIL = "pixelaks.technologies@gmail.com";
const EMAIL_SUBJECT = "Support Request - Teacher App";

document.getElementById("btnSettings").addEventListener("click", () => document.getElementById("settingsOverlay").classList.add("active"));
document.getElementById("closeSettingsBtn").addEventListener("click", () => document.getElementById("settingsOverlay").classList.remove("active"));
document.getElementById("settingsOverlay").addEventListener("click", (e) => { if (e.target === document.getElementById("settingsOverlay")) document.getElementById("settingsOverlay").classList.remove("active"); });

document.getElementById("btnContactUs").addEventListener("click", () => {
    let osName = "Web Browser";
    let role = isHOD ? "Teacher (HOD)" : "Teacher";
    let deviceInfo = `\n========================\nDiagnostic Information\n========================\nDevice Model: ${osName}\nOperating System: ${navigator.platform}\nApp Version: 1.0.0 (Web)\nCollege ID: ${currentCollegeID}\nRole: ${role}\n========================`;
    
    window.open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent("Please describe your issue here:\n\n\n" + deviceInfo)}`, "_blank");
});

document.getElementById("btnWebsite").addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));
document.getElementById("btnPrivacy").addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
document.getElementById("btnTerms").addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));

document.getElementById("btnSignOut").addEventListener("click", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});

// Generic Toast Function
window.showRcToast = function(msg) { 
    let t = document.getElementById("rcToast"); 
    t.innerText = msg; t.style.bottom = "30px"; 
    setTimeout(() => t.style.bottom = "-100px", 3000); 
};

// ==========================================
// 🚨 THEME MANAGER
// ==========================================
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

document.getElementById("btnThemes").addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("active");
    document.getElementById("themesModal").classList.add("active");
});

document.getElementById("btnDarkMode").addEventListener("click", () => applyTheme(true));
document.getElementById("btnLightMode").addEventListener("click", () => applyTheme(false));
applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");
