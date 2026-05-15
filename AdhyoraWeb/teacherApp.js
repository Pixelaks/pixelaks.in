import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🚨 GLOBAL VARIABLES (Moved to top to prevent crash!)
// ==========================================
let currentCollegeID = "";
let currentUserID = "";
let isHOD = false;
let profileListener = null;
let teacherDeptRaw = ""; 
let hasStartedInbox = false;

// Notification Variables
let cachedNotifs = [];
let inboxListenerUnsub = null;
let globalListenerUnsub = null;

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
    if (profileListener) profileListener(); 

    const teacherDocRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);

    profileListener = onSnapshot(teacherDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            document.getElementById("teacherInfoName").innerText = "Profile Not Found";
            return;
        }

        const data = snapshot.data();
        
        isHOD = data.isHOD || false;
        const rawName = data.name || "Unknown";
        const email = auth.currentUser.email || data.email;

        let deptName = "Unknown Dept";
        if (data.department) {
            deptName = data.department;
            teacherDeptRaw = deptName;
        } else if (data.departmentID) {
            teacherDeptRaw = data.departmentID;
            deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
        }

        let hodBadgeText = isHOD ? " <span style='color:#f59e0b; font-size:14px;'>(HOD)</span>" : "";
        
        // Safely update UI
        let nameEl = document.getElementById("teacherInfoName");
        if(nameEl) nameEl.innerHTML = `${rawName}${hodBadgeText}`;
        
        let emailEl = document.getElementById("teacherInfoEmail");
        if(emailEl) emailEl.innerText = email;
        
        let deptEl = document.getElementById("teacherInfoDept");
        if(deptEl) deptEl.innerText = deptName;

        // Unlock UI once data is fully loaded
        let loader = document.getElementById("initialAppLoader");
        if(loader) loader.style.display = "none";

        // 🚨 TRIGGER THE INBOX NOW THAT WE HAVE THE DEPT!
        if (!hasStartedInbox && teacherDeptRaw !== "") {
            startInboxListener();
            hasStartedInbox = true;
        }

    }, (error) => {
        console.error("Error listening to profile:", error);
        let nameEl = document.getElementById("teacherInfoName");
        if(nameEl) nameEl.innerText = "Network Error";
    });
}

// ==========================================
// 🚨 NOTIFICATIONS & MESSAGES ENGINE
// ==========================================
let cachedMessages = [];
let cachedNotifs = [];
let inboxListenerUnsub = null;
let globalListenerUnsub = null;

function startInboxListener() {
    const getSafeTopic = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
    let safeColID = getSafeTopic(currentCollegeID);
    let safeDept = getSafeTopic(teacherDeptRaw);

    const myTopics = [
        `${safeColID}_ALL`, 
        `${safeColID}_TEACHERS_ALL`, 
        `${safeColID}_TEACHERS_${safeDept}`
    ];

    // 1. Listen to College-Level INBOX MESSAGES
    if (inboxListenerUnsub) inboxListenerUnsub();
    inboxListenerUnsub = onSnapshot(query(collection(db, "colleges", currentCollegeID, "inbox_messages"), where("targetTopic", "in", myTopics)), (snap) => {
        cachedMessages = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            cachedMessages.push({ 
                title: d.title || "Message", 
                body: d.body || "", 
                time: d.timestamp ? d.timestamp.toDate() : new Date(), 
                sender: d.senderName || "Unknown",
                role: (d.senderRole || "").toLowerCase() // 🚨 Store role for color logic
            }); 
        });
        
        cachedMessages.sort((a, b) => b.time - a.time); // Sort newest first
        
        // Show Red Dot for Messages
        if (snap.docs.length > 0) {
            let dot = document.querySelector("#btnMessages .notification-dot");
            if (dot) dot.style.display = "block";
        }
        renderMessages();
    });

    // 2. Listen to Global Developer NOTIFICATIONS
    if (globalListenerUnsub) globalListenerUnsub();
    globalListenerUnsub = onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        cachedNotifs = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            cachedNotifs.push({ 
                title: d.title || "System Update", 
                body: d.body || "", 
                time: d.timestamp ? d.timestamp.toDate() : new Date(), 
                sender: "Adhyora Team" 
            }); 
        });
        
        // Show Red Dot for Notifications
        if (snap.docs.length > 0) {
            let dot = document.querySelector("#btnNotifications .notification-dot");
            if (dot) dot.style.display = "block";
        }
        renderNotifications();
    });
}

function renderMessages() {
    const listEl = document.getElementById("messagesList");
    if (!listEl) return;

    if (cachedMessages.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; 
        return; 
    }
    
    listEl.innerHTML = cachedMessages.map(m => {
        // 🚨 COLOR LOGIC BASED ON ROLE
        let borderColor = "var(--brand-red)"; // Default Teacher Red
        let roleLabel = "Teacher";
        
        if (m.role.includes("principal") || m.role.includes("admin")) {
            borderColor = "#10b981"; // Principal Green
            roleLabel = "Principal";
        } else if (m.role.includes("student")) {
            borderColor = "#3b82f6"; // Student Blue
            roleLabel = "Student";
        }
        
        return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid ${borderColor};">
            <div style="font-weight:bold; color:var(--text-dark); font-size:15px; margin-bottom:5px;">${m.title}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">${m.body}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-light); font-weight:600;">
                <span><i class="fas fa-user-circle" style="margin-right:4px; color:${borderColor};"></i> ${m.sender} <span style="font-weight:normal; opacity:0.7;">(${roleLabel})</span></span>
                <span>${m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
        </div>`;
    }).join('');
}

function renderNotifications() {
    const listEl = document.getElementById("notificationsList");
    if (!listEl) return;

    if (cachedNotifs.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text">No system updates.</div>`; 
        return; 
    }
    
    // Developer Notifications get a distinct Purple/System look
    listEl.innerHTML = cachedNotifs.map(n => {
        return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid #8b5cf6;">
            <div style="font-weight:bold; color:var(--text-dark); font-size:15px; margin-bottom:5px;">${n.title}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">${n.body}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-light); font-weight:600;">
                <span><i class="fas fa-satellite-dish" style="margin-right:4px; color:#8b5cf6;"></i> ${n.sender}</span>
                <span>${n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
        </div>`;
    }).join('');
}


// ==========================================
// 🚨 UI NAVIGATION ROUTER (BULLETPROOF)
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"),
    attendance: document.getElementById("attendanceView"),
    timetable: document.getElementById("timetableView"),
    internalMarks: document.getElementById("internalMarksView"),
    subjects: document.getElementById("subjectsView"),
    calendar: document.getElementById("calendarView"),
    assignments: document.getElementById("assignmentsView"),
    studentList: document.getElementById("studentListView"),
    subjectAssign: document.getElementById("subjectAssignView"),
    batch: document.getElementById("batchView"),
    eventAttendance: document.getElementById("eventAttendanceView"),
    notifications: document.getElementById("notificationsView"),
    messages: document.getElementById("messagesView")
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn, .nav-btn, .menu-btn");

function switchView(targetView, clickedBtn) {
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    
    if (clickedBtn && (clickedBtn.classList.contains('nav-icon-btn') || clickedBtn.classList.contains('nav-btn') || clickedBtn.classList.contains('menu-btn'))) {
        clickedBtn.classList.add("active-nav");
    }

    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });

    if (targetView === "HOME") {
        if(sidebar) sidebar.classList.remove("mobile-hidden"); 
        if(mainContent) mainContent.classList.remove("mobile-active");
        if (views.welcome && window.innerWidth > 900) views.welcome.classList.remove("hidden-view");
    } else {
        if(sidebar) sidebar.classList.add("mobile-hidden"); 
        if(mainContent) mainContent.classList.add("mobile-active");
        if (targetView) { 
            targetView.classList.remove("hidden-view"); 
            targetView.style.opacity = 0; 
            setTimeout(() => targetView.style.opacity = 1, 50); 
        } else {
            showRcToast("This module is under construction.");
        }
    }
}

// 🚨 BULLETPROOF EVENT ATTACHER: Will never crash if HTML is missing!
function attachSafeClick(elementId, action) {
    let el = document.getElementById(elementId);
    if (el) el.addEventListener("click", action);
}

// Map Bottom Nav Icons
attachSafeClick("btnHome", (e) => switchView("HOME", e.currentTarget));
attachSafeClick("btnMessages", (e) => switchView(views.messages, e.currentTarget));
attachSafeClick("btnNotifications", (e) => {
    switchView(views.notifications, e.currentTarget);
    document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "none");
});

// Map PC Sidebar Buttons
attachSafeClick("btnNavAttendance", (e) => switchView(views.attendance, e.currentTarget));
attachSafeClick("btnNavTimetable", (e) => switchView(views.timetable, e.currentTarget));
attachSafeClick("btnNavInternalMarks", (e) => switchView(views.internalMarks, e.currentTarget));
attachSafeClick("btnNavSubjects", (e) => switchView(views.subjects, e.currentTarget));
attachSafeClick("btnNavCalendar", (e) => switchView(views.calendar, e.currentTarget));
attachSafeClick("btnNavAssignments", (e) => switchView(views.assignments, e.currentTarget));
attachSafeClick("btnNavStudentList", (e) => switchView(views.studentList, e.currentTarget));
attachSafeClick("btnNavSubjectAssign", (e) => switchView(views.subjectAssign, e.currentTarget));
attachSafeClick("btnNavBatch", (e) => switchView(views.batch, e.currentTarget));
attachSafeClick("btnNavEventAttendance", (e) => switchView(views.eventAttendance, e.currentTarget));

// Map the 10 Home Grid Buttons
attachSafeClick("gridBtnAttendance", () => switchView(views.attendance, document.getElementById("btnNavAttendance")));
attachSafeClick("gridBtnTimetable", () => switchView(views.timetable, document.getElementById("btnNavTimetable")));
attachSafeClick("gridBtnInternalMarks", () => switchView(views.internalMarks, document.getElementById("btnNavInternalMarks")));
attachSafeClick("gridBtnSubjects", () => switchView(views.subjects, document.getElementById("btnNavSubjects")));
attachSafeClick("gridBtnCalendar", () => switchView(views.calendar, document.getElementById("btnNavCalendar")));
attachSafeClick("gridBtnAssignments", () => switchView(views.assignments, document.getElementById("btnNavAssignments")));
attachSafeClick("gridBtnStudentList", () => switchView(views.studentList, document.getElementById("btnNavStudentList")));
attachSafeClick("gridBtnSubjectAssign", () => switchView(views.subjectAssign, document.getElementById("btnNavSubjectAssign")));
attachSafeClick("gridBtnBatch", () => switchView(views.batch, document.getElementById("btnNavBatch")));
attachSafeClick("gridBtnEventAttendance", () => switchView(views.eventAttendance, document.getElementById("btnNavEventAttendance")));

// ==========================================
// 🚨 SETTINGS DRAWER ACTIONS
// ==========================================
window.showRcToast = function(msg) { 
    let t = document.getElementById("rcToast"); 
    if(t) { t.innerText = msg; t.style.bottom = "30px"; setTimeout(() => t.style.bottom = "-100px", 3000); }
};

attachSafeClick("btnSettings", () => {
    let s = document.getElementById("settingsOverlay");
    if(s) s.classList.add("active");
});
attachSafeClick("closeSettingsBtn", () => {
    let s = document.getElementById("settingsOverlay");
    if(s) s.classList.remove("active");
});

const elSettings = document.getElementById("settingsOverlay");
if(elSettings) {
    elSettings.addEventListener("click", (e) => { 
        if (e.target === elSettings) elSettings.classList.remove("active"); 
    });
}

attachSafeClick("btnContactUs", () => {
    const SUPPORT_EMAIL = "pixelaks.technologies@gmail.com";
    let role = isHOD ? "Teacher (HOD)" : "Teacher";
    let deviceInfo = `\n========================\nBrowser/OS: ${navigator.userAgent}\nCollege ID: ${currentCollegeID}\nRole: ${role}\n========================`;
    window.open(`mailto:${SUPPORT_EMAIL}?subject=Support Request - Teacher App&body=Please describe your issue here:\n\n\n${encodeURIComponent(deviceInfo)}`, "_blank");
});

attachSafeClick("btnWebsite", () => window.open("https://pixelaks.in/", "_blank"));
attachSafeClick("btnPrivacy", () => window.open("https://pixelaks.in/privacy", "_blank"));
attachSafeClick("btnTerms", () => window.open("https://pixelaks.in/terms", "_blank"));
attachSafeClick("btnSignOut", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});

// ==========================================
// 🚨 THEME MANAGER
// ==========================================
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add("dark-mode");
        let dBtn = document.getElementById("btnDarkMode");
        let lBtn = document.getElementById("btnLightMode");
        if(dBtn) dBtn.style.border = "2px solid var(--brand-red)";
        if(lBtn) lBtn.style.border = "1px solid #475569";
    } else {
        document.body.classList.remove("dark-mode");
        let dBtn = document.getElementById("btnDarkMode");
        let lBtn = document.getElementById("btnLightMode");
        if(lBtn) lBtn.style.border = "2px solid var(--brand-red)";
        if(dBtn) dBtn.style.border = "1px solid #cbd5e1";
    }
    localStorage.setItem("adhyora_teacher_theme", isDark ? "dark" : "light");
}

attachSafeClick("btnThemes", () => {
    let s = document.getElementById("settingsOverlay");
    let t = document.getElementById("themesModal");
    if(s) s.classList.remove("active");
    if(t) t.classList.add("active");
});

attachSafeClick("btnDarkMode", () => applyTheme(true));
attachSafeClick("btnLightMode", () => applyTheme(false));
applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");
