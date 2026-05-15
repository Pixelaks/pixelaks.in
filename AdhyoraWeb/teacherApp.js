import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🚨 GLOBAL VARIABLES
// ==========================================
let currentCollegeID = "";
let currentUserID = "";
let isHOD = false;
let profileListener = null;
let teacherDeptRaw = ""; 
let hasStartedInbox = false;

// 🚨 FIXED: Cleaned up duplicate notification variables
let allMessagesMap = new Map(); // For Messages Tab
let allNotifsMap = new Map();   // For Notifications Tab (Inbox + Global)
let globalListenerUnsub = null;
let inboxListenerUnsub = null;

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

    profileListener = onSnapshot(teacherDocRef, async (snapshot) => {
        if (!snapshot.exists()) {
            document.getElementById("teacherInfoName").innerText = "Profile Not Found";
            return;
        }

        const data = snapshot.data();
        isHOD = data.isHOD || false;
        const rawName = data.name || "Unknown";
        const email = auth.currentUser ? auth.currentUser.email : data.email;

        let deptName = "Unknown Dept";

        // 🚨 MATCH C# LOGIC: Resolve the actual readable Department Name
        if (data.department) {
            deptName = data.department;
            teacherDeptRaw = deptName;
            finalizeProfileUI(rawName, email, deptName);
        } else if (data.departmentID) {
            try {
                const deptSnap = await getDoc(doc(db, "colleges", currentCollegeID, "departments", data.departmentID));
                if (deptSnap.exists()) {
                    deptName = deptSnap.data().name || data.departmentID;
                    teacherDeptRaw = deptName; // Need exact name for Inbox matching!
                } else {
                    teacherDeptRaw = data.departmentID;
                    deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
                }
            } catch (e) {
                console.error("Dept Fetch Error:", e);
                teacherDeptRaw = data.departmentID;
            }
            finalizeProfileUI(rawName, email, deptName);
        } else {
            finalizeProfileUI(rawName, email, deptName);
        }
    });
}

function finalizeProfileUI(rawName, email, deptName) {
    let hodBadgeText = isHOD ? " <span style='color:#f59e0b; font-size:14px;'>(HOD)</span>" : "";
    
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
}

// ==========================================
// 🚨 NOTIFICATIONS & UNIVERSAL MESSAGES ENGINE
// ==========================================

function getSafeTopic(str) {
    if (!str || str === "All") return "ALL";
    return str.replace(/[^a-zA-Z0-9]/g, '');
}

function startInboxListener() {
    // ==========================================
    // 📩 1. MESSAGES TAB (Universal Inbox: Broadcasts & Chats)
    // ==========================================
    const sentMessagesRef = collection(db, "colleges", currentCollegeID, "sent_messages");
    const qBroadcast = query(sentMessagesRef, orderBy("timestamp", "desc"), limit(30));

    onSnapshot(qBroadcast, (snap) => {
        snap.docChanges().forEach((change) => {
            const doc = change.doc;
            if (change.type === "removed") { allMessagesMap.delete(doc.id); return; }
            
            const d = doc.data();
            const targetText = d.targetSummary || "";
            const senderID = d.senderID || "";

            if (IsMessageForMe(targetText, senderID)) {
                allMessagesMap.set(doc.id, {
                    id: doc.id, title: d.title || "Notice", body: d.body || "",
                    time: d.timestamp ? d.timestamp.toDate() : new Date(),
                    sender: d.senderName || d.senderRole || "Principal",
                    role: d.senderRole || "Principal", type: d.type || "broadcast",
                    source: targetText, isMe: senderID === currentUserID
                });
            }
        });
        
        let dot = document.querySelector("#btnMessages .notification-dot");
        if (dot && snap.docs.length > 0) dot.style.display = "block";
        renderMessages();
    });

    const chatsRef = collection(db, "colleges", currentCollegeID, "chats");
    const qChats = query(chatsRef, where("participants", "array-contains", currentUserID), orderBy("lastUpdated", "desc"), limit(10));

    onSnapshot(qChats, (snap) => {
        snap.forEach(roomDoc => {
            const roomID = roomDoc.id;
            const messagesRef = collection(db, "colleges", currentCollegeID, "chats", roomID, "messages");
            const qMessages = query(messagesRef, orderBy("timestamp", "desc"), limit(20));

            onSnapshot(qMessages, (msgSnap) => {
                msgSnap.docChanges().forEach(change => {
                    const msgDoc = change.doc;
                    if (change.type === "removed") { allMessagesMap.delete(msgDoc.id); return; }
                    
                    const md = msgDoc.data();
                    if ((md.senderID || "") === currentUserID) return; // Skip my own messages

                    allMessagesMap.set(msgDoc.id, {
                        id: msgDoc.id, title: md.title || "Private Message", body: md.body || "",
                        time: md.timestamp ? md.timestamp.toDate() : new Date(),
                        sender: md.senderName || "User", role: md.senderRole || "Student",
                        type: "incoming", isMe: false
                    });
                });
                renderMessages();
            });
        });
    });

    // ==========================================
    // 🔔 2. NOTIFICATIONS TAB (College Inbox + Global Updates)
    // ==========================================
    let safeColID = getSafeTopic(currentCollegeID);
    let safeDept = getSafeTopic(teacherDeptRaw);
    let myTopics = [ `${safeColID}_ALL`, `${safeColID}_TEACHERS_ALL`, `${safeColID}_TEACHERS_${safeDept}` ];

    // A. College Level Notifications (inbox_messages)
    const inboxRef = collection(db, "colleges", currentCollegeID, "inbox_messages");
    const qInbox = query(inboxRef, where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30));

    if (inboxListenerUnsub) inboxListenerUnsub();
    inboxListenerUnsub = onSnapshot(qInbox, (snap) => {
        snap.docChanges().forEach(change => {
            const doc = change.doc;
            if (change.type === "removed") { allNotifsMap.delete(doc.id); return; }
            let d = doc.data();
            allNotifsMap.set(doc.id, {
                id: doc.id, title: d.title || "Message", body: d.body || "",
                time: d.timestamp ? d.timestamp.toDate() : new Date(),
                sender: d.senderName || "Unknown", role: (d.senderRole || "").toLowerCase(),
                isGlobal: false
            });
        });
        
        let dot = document.querySelector("#btnNotifications .notification-dot");
        if (dot && snap.docs.length > 0) dot.style.display = "block";
        renderNotifications();
    });

    // B. Global Developer Updates
    const globalRef = collection(db, "adhyora_global_updates");
    const qGlobal = query(globalRef, orderBy("timestamp", "desc"), limit(10));
    
    if (globalListenerUnsub) globalListenerUnsub();
    globalListenerUnsub = onSnapshot(qGlobal, (snap) => {
        snap.docChanges().forEach(change => {
            const doc = change.doc;
            if (change.type === "removed") { allNotifsMap.delete(doc.id); return; }
            let d = doc.data();
            allNotifsMap.set(doc.id, {
                id: doc.id, title: d.title || "System Update", body: d.body || "",
                time: d.timestamp ? d.timestamp.toDate() : new Date(),
                sender: "Adhyora Team", role: "system",
                isGlobal: true
            });
        });
        
        let dot = document.querySelector("#btnNotifications .notification-dot");
        if (dot && snap.docs.length > 0) dot.style.display = "block";
        renderNotifications();
    });
}

// Helper: Check if message is for this teacher
function IsMessageForMe(targetText, senderID) {
    if (senderID === currentUserID) return true;
    if (!targetText) return false;
    if (targetText.includes("Everyone")) return true;
    if (targetText.includes("Teachers (All)")) return true;
    if (teacherDeptRaw && targetText.includes(`Teachers (${teacherDeptRaw})`)) return true;
    return false;
}

function renderMessages() {
    const listEl = document.getElementById("messagesList");
    if (!listEl) return;

    let sortedMessages = Array.from(allMessagesMap.values()).sort((a, b) => b.time - a.time);

    if (sortedMessages.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text" style="text-align: center; color: #94a3b8; margin-top: 20px;">Inbox is empty</div>`; 
        return; 
    }
    
    listEl.innerHTML = sortedMessages.map(m => {
        let borderColor = "var(--brand-red)"; 
        let roleLabel = m.role;
        
        if (m.role.toLowerCase().includes("principal") || m.role.toLowerCase().includes("admin")) {
            borderColor = "#10b981"; 
        } else if (m.role.toLowerCase().includes("student")) {
            borderColor = "#3b82f6"; 
        }
        
        let headerTxt = m.isMe ? `Sent to: ${m.source}` : `From: ${m.sender} <span style="font-weight:normal; opacity:0.7;">(${roleLabel})</span>`;
        if (m.type === "incoming") headerTxt = `From: ${m.sender} <span style="font-weight:normal; opacity:0.7;">• Private Chat</span>`;

        return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid ${borderColor};">
            <div style="font-weight:bold; color:var(--text-dark); font-size:15px; margin-bottom:5px;">${m.title}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">${m.body}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-light); font-weight:600;">
                <span><i class="fas ${m.type === 'incoming' ? 'fa-comment' : 'fa-bullhorn'}" style="margin-right:4px; color:${borderColor};"></i> ${headerTxt}</span>
                <span>${m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
        </div>`;
    }).join('');
}

function renderNotifications() {
    const listEl = document.getElementById("notificationsList");
    if (!listEl) return;

    let sortedNotifs = Array.from(allNotifsMap.values()).sort((a, b) => b.time - a.time);

    if (sortedNotifs.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text" style="text-align: center; color: #94a3b8; margin-top: 20px;">No new notifications.</div>`; 
        return; 
    }
    
    listEl.innerHTML = sortedNotifs.map(n => {
        // C# Logic: Give Developer updates a purple border, standard notifications get colors based on role
        let borderColor = "var(--brand-red)"; 
        let icon = "fa-bell";
        
        if (n.isGlobal) {
            borderColor = "#8b5cf6"; // Developer Purple
            icon = "fa-satellite-dish";
        } else if (n.role.includes("principal") || n.role.includes("admin")) {
            borderColor = "#10b981"; // Principal Green
        } else if (n.role.includes("student")) {
            borderColor = "#3b82f6"; // Student Blue
        }

        return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid ${borderColor};">
            <div style="font-weight:bold; color:var(--text-dark); font-size:15px; margin-bottom:5px;">${n.title}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">${n.body}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-light); font-weight:600;">
                <span><i class="fas ${icon}" style="margin-right:4px; color:${borderColor};"></i> ${n.sender}</span>
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

// 🚨 BULLETPROOF EVENT ATTACHER
function attachSafeClick(elementId, action) {
    let el = document.getElementById(elementId);
    if (el) el.addEventListener("click", action);
}

// Map Bottom Nav Icons
attachSafeClick("btnHome", (e) => switchView("HOME", e.currentTarget));
attachSafeClick("btnMessages", (e) => {
    switchView(views.messages, e.currentTarget);
    document.querySelectorAll("#btnMessages .notification-dot").forEach(dot => dot.style.display = "none");
});
attachSafeClick("btnNotifications", (e) => {
    switchView(views.notifications, e.currentTarget);
    document.querySelectorAll("#btnNotifications .notification-dot").forEach(dot => dot.style.display = "none");
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
