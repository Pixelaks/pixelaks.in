import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch, deleteField, arrayUnion, arrayRemove, increment, enableIndexedDbPersistence, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// 🚀 OPTIMIZATION 1: Imported enableIndexedDbPersistence to cut refresh costs to ZERO
// Add getMessaging, getToken, deleteToken to your imports
import { getMessaging, getToken, deleteToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

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
// Then initialize it right after your db variable:
const messaging = getMessaging(app);

// 🚀 OPTIMIZATION 2: Enable Local Disk Caching. This prevents the massive Firebase read spike when you refresh the page.
try {
    enableIndexedDbPersistence(db).catch((err) => {
        console.warn("Firebase Offline Persistence Notice: ", err.code);
    });
} catch(e) {}

// 🚀 OPTIMIZATION 3: Debounce Function. This stops the UI from freezing when typing in search bars.
function debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

let currentCollegeID = "";
let currentUserID = "";
let collegeSemesterType = "Odd";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";
let myRealName = "Principal"; 

const el = {
    settingsOverlay: document.getElementById("settingsOverlay"), btnSettings: document.getElementById("btnSettings"), closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    principalName: document.getElementById("principalNameText"), principalEmail: document.getElementById("principalEmailText"), versionText: document.getElementById("versionText"),
    btnContactUs: document.getElementById("btnContactUs"), btnWebsite: document.getElementById("btnWebsite"), btnPrivacy: document.getElementById("btnPrivacy"),
    btnTerms: document.getElementById("btnTerms"), btnSignOut: document.getElementById("btnSignOut")
};

const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

// ==========================================
// 🚨 INITIAL AUTHENTICATION CHECK
// ==========================================
if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            
            // 🚨 FIRE BIOMETRIC CHECK FIRST: Now that we have the User ID!
            InitBiometricUI(); 
            
            // 🚨 THEN LOAD DASHBOARD
            fetchPrincipalProfile(); 
        } 
        else { 
            window.location.href = "index.html"; 
        }
    });
}
el.versionText.innerText = "Version 1.0.0 (Web Admin)";

// ==========================================
// 🚨 PROFILE, SESSIONS & THEME ENGINE
// ==========================================
let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let sessionsCache = new Map();

async function fetchPrincipalProfile() {
    try {
        const docSnap = await getDoc(doc(db, "colleges", currentCollegeID, "principals", currentUserID));
        if (docSnap.exists()) {
            const data = docSnap.data(); myRealName = data.name || "Principal";
            el.principalName.innerText = myRealName; el.principalEmail.innerText = data.email || "No Email Provided";
            
            registerWebSession();
            startSessionListener();
            // 🚨 Replaced Subscription with PIN check. Pin check will trigger Subscription upon success.
            CheckSecurityPin(); 
        } else {
            el.principalName.innerText = "Profile Not Found"; el.principalEmail.innerText = "";
        }
    } catch (e) {}
}

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
        const sessionRef = doc(db, "colleges", currentCollegeID, "principals", currentUserID, "sessions", myWebDeviceID);
        await setDoc(sessionRef, { deviceName: osName, loginTime: serverTimestamp() }, {merge: true});
        
        // Listen for remote kick
        onSnapshot(sessionRef, (docSnap) => {
            if (!docSnap.exists()) signOut(auth).then(() => window.location.href = "index.html");
        });
    } catch(e) {}
}

function startSessionListener() {
    onSnapshot(query(collection(db, "colleges", currentCollegeID, "principals", currentUserID, "sessions")), (snap) => {
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
        
        let timeStr = "Recently";
        if (d.loginTime) timeStr = d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        let btnHtml = isMe ? `<span style="font-size:11px; color:var(--brand-green); font-weight:bold;">Active</span>` : `<button onclick="revokeSession('${d.id}')" style="background:#fef2f2; color:#ef4444; border:1px solid #fca5a5; padding:6px 12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px; transition:0.2s;">Kick</button>`;
        
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-grid-color); border:1px solid var(--border-color); border-radius:12px; padding:15px;">
                <div>
                    <div style="font-weight:bold; color:var(--text-green); font-size:13px; margin-bottom:4px;">${devName}</div>
                    <div style="font-size:11px; color:#64748b;">Logged in: ${timeStr}</div>
                </div>
                ${btnHtml}
            </div>`;
    });
    container.innerHTML = html;
}

window.revokeSession = async function(sessionID) {
    if (!confirm("Are you sure you want to log this device out?")) return;
    try {
        await deleteDoc(doc(db, "colleges", currentCollegeID, "principals", currentUserID, "sessions", sessionID));
        showRcToast("Device kicked successfully.");
    } catch(e) { showRcToast("Error revoking session."); }
};

// --- BUTTON HOOKS ---
document.getElementById("btnThemes").addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("active");
    document.getElementById("themesModal").classList.add("active");
});

document.getElementById("btnDevices").addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("active");
    document.getElementById("sessionsModal").classList.add("active");
    renderSessions(); 
});

// --- THEME LOGIC ---
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add("dark-mode");
        document.getElementById("btnDarkMode").style.border = "2px solid var(--brand-green)";
        document.getElementById("btnLightMode").style.border = "1px solid #475569";
    } else {
        document.body.classList.remove("dark-mode");
        document.getElementById("btnLightMode").style.border = "2px solid var(--brand-green)";
        document.getElementById("btnDarkMode").style.border = "1px solid #cbd5e1";
    }
    localStorage.setItem("adhyora_principal_theme", isDark ? "dark" : "light");
}

document.getElementById("btnDarkMode").addEventListener("click", () => applyTheme(true));
document.getElementById("btnLightMode").addEventListener("click", () => applyTheme(false));

// Load saved theme immediately on boot
applyTheme(localStorage.getItem("adhyora_principal_theme") === "dark");


function handleContactUs() {
    const deviceInfo = `\n========================\nBrowser/Device: ${navigator.userAgent}\nOS: ${navigator.platform}\nApp Version: 1.0.0 (Web)\nCollege ID: ${currentCollegeID}\nRole: Principal\n========================`;
    window.open(`mailto:pixelaks.technologies@gmail.com?subject=${encodeURIComponent("Support Request")}&body=${encodeURIComponent("Describe issue here:\n\n\n" + deviceInfo)}`, "_blank");
}

el.btnSettings.addEventListener("click", () => el.settingsOverlay.classList.add("active"));
el.closeSettingsBtn.addEventListener("click", () => el.settingsOverlay.classList.remove("active"));
el.settingsOverlay.addEventListener("click", (e) => { if (e.target === el.settingsOverlay) el.settingsOverlay.classList.remove("active"); });
el.btnContactUs.addEventListener("click", handleContactUs);
el.btnWebsite.addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));
el.btnPrivacy.addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
el.btnTerms.addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));
el.btnSignOut.addEventListener("click", () => { if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); });

const views = {
    welcome: document.getElementById("welcomeView"), roomcode: document.getElementById("roomcodeView"),
    teacherList: document.getElementById("teacherListView"), teacherDashboard: document.getElementById("teacherDashboardView"),
    studentList: document.getElementById("studentListView"), studentDashboard: document.getElementById("studentDashboardView"),
    batch: document.getElementById("batchView"),
    notifications: document.getElementById("notificationsView"), calendar: document.getElementById("calendarView"), messages: document.getElementById("messagesView"),
    timetable: document.getElementById("timetableView"),
    assign: document.getElementById("assignView"),
    data: document.getElementById("dataView"),
    subjectList: document.getElementById("subjectListView"),
    stuSub: document.getElementById("stuSubView"),
    events: document.getElementById("eventsView"),
    attendance: document.getElementById("attendanceView")
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn");

function switchView(targetView, clickedBtn) {
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn && clickedBtn.classList.contains('nav-icon-btn')) clickedBtn.classList.add("active-nav");
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });

    if (targetView === "HOME") {
        sidebar.classList.remove("mobile-hidden"); mainContent.classList.remove("mobile-active");
        if (window.innerWidth > 900) views.welcome.classList.remove("hidden-view");
    } else {
        sidebar.classList.add("mobile-hidden"); mainContent.classList.add("mobile-active");
        if (targetView) { targetView.classList.remove("hidden-view"); targetView.style.opacity = 0; setTimeout(() => targetView.style.opacity = 1, 50); }
    }
}

document.getElementById("btnHome").addEventListener("click", (e) => switchView("HOME", e.currentTarget));
document.getElementById("btnNotifications").addEventListener("click", (e) => { switchView(views.notifications, e.currentTarget); document.querySelector("#btnNotifications .notification-dot").style.display = "none"; });
document.getElementById("btnCalendar").addEventListener("click", (e) => { switchView(views.calendar, e.currentTarget); if (!calendarLoaded) loadCalendarData(); });
document.getElementById("btnMessages").addEventListener("click", (e) => { switchView(views.messages, e.currentTarget); document.querySelector("#btnMessages .notification-dot").style.display = "none"; });
document.getElementById("btnNavRoomcode").addEventListener("click", () => { switchView(views.roomcode); if (!rcLoaded) startRoomcodeListener(); });
document.getElementById("btnNavTeacherList").addEventListener("click", () => { switchView(views.teacherList); if (!tlLoaded) startTeacherListListener(); });
document.getElementById("btnBackToTeachers").addEventListener("click", () => switchView(views.teacherList));
document.getElementById("btnNavStudentList").addEventListener("click", () => { switchView(views.studentList); if (!slLoaded) startStudentListListener(); });
document.getElementById("btnBackToStudents").addEventListener("click", () => switchView(views.studentList));

document.getElementById("btnNavBatch").addEventListener("click", () => { switchView(views.batch); if (!bchLoaded) BCH_Init(); });
document.getElementById("btnNavTimetable").addEventListener("click", () => { switchView(views.timetable); if (!ttLoaded) TT_Init(); });
document.getElementById("btnNavData").addEventListener("click", () => { switchView(views.data); });
document.getElementById("btnNavSubjectList").addEventListener("click", () => { switchView(views.subjectList); if (!subLoaded) SUB_Init(); });
document.getElementById("btnNavStuSub").addEventListener("click", () => { switchView(views.stuSub); if (!ssLoaded) SS_Init(); });
document.getElementById("btnNavEvents").addEventListener("click", () => { switchView(views.events); if (!evtLoaded) EVT_Init(); });
document.getElementById("btnNavAttendance").addEventListener("click", () => { switchView(views.attendance); if (!attdLoaded) ATTD_Init(); });

document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "none");

// ==========================================
// NOTIFICATIONS INBOX 
// ==========================================
let cachedNotifs = [];
function startInboxListener() {
    const myTopics = [`${currentCollegeID.replace(/[^a-zA-Z0-9]/g, '')}_ALL`, `${currentCollegeID.replace(/[^a-zA-Z0-9]/g, '')}_PRINCIPAL`];
    let inboxCache = []; let globalCache = [];
    const updateNotifUI = () => { cachedNotifs = [...inboxCache, ...globalCache].sort((a,b) => b.time - a.time); renderNotifications(); };

    onSnapshot(query(collection(db, "colleges", currentCollegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        inboxCache = []; snap.forEach(doc => { let d = doc.data(); inboxCache.push({ title: d.title || "Notice", body: d.body || "", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        document.querySelector("#btnNotifications .notification-dot").style.display = "block"; updateNotifUI();
    });

    onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        globalCache = []; snap.forEach(doc => { let d = doc.data(); globalCache.push({ title: d.title || "System Update", body: d.body || "", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        document.querySelector("#btnNotifications .notification-dot").style.display = "block"; updateNotifUI();
    });
}
function renderNotifications() {
    const listEl = document.getElementById("notificationsList");
    if (cachedNotifs.length === 0) { listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
    listEl.innerHTML = cachedNotifs.map(n => {
        return `<div class="data-card"><div class="card-title">${n.title}</div><div class="card-body">${n.body}</div><div class="card-meta"><span>Adhyora System</span><span>${n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span></div></div>`;
    }).join('');
}
setTimeout(startInboxListener, 2000); 

// ==========================================
// CALENDAR ENGINE
// ==========================================
let currentDisplayDate = new Date();
let cachedCalYear = ""; let calWorkingDays = new Set(); let calNonWorkingDays = new Map(); let semStarts = new Map(); let semEnds = new Map(); let calendarLoaded = false;

document.getElementById("calPrevMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1); loadCalendarData(); });
document.getElementById("calNextMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1); loadCalendarData(); });

async function loadCalendarData() {
    calendarLoaded = true;
    document.getElementById("calMonthYearText").innerText = currentDisplayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    document.getElementById("calendarGrid").innerHTML = ""; document.getElementById("upcomingEventText").innerText = "Loading...";

    let displayYear = currentDisplayDate.getFullYear(); let displayMonth = currentDisplayDate.getMonth() + 1; 
    let targetYearStr = (displayMonth >= 6) ? `${displayYear}-${displayYear + 1}` : `${displayYear - 1}-${displayYear}`;
    
    if (cachedCalYear !== targetYearStr) {
        cachedCalYear = targetYearStr; calWorkingDays.clear(); calNonWorkingDays.clear(); semStarts.clear(); semEnds.clear();
        try {
            const [semDoc, workDoc, holDoc] = await Promise.all([ 
                getDoc(doc(db, "colleges", currentCollegeID, "semesters", targetYearStr)), getDoc(doc(db, "colleges", currentCollegeID, "workingDays", targetYearStr)), getDoc(doc(db, "colleges", currentCollegeID, "nonWorkingDays", targetYearStr)) 
            ]);
            if (semDoc.exists()) { let d = semDoc.data(); if(d.oddSemester?.startDate) semStarts.set(d.oddSemester.startDate, "Odd"); if(d.oddSemester?.endDate) semEnds.set(d.oddSemester.endDate, "Odd"); if(d.evenSemester?.startDate) semStarts.set(d.evenSemester.startDate, "Even"); if(d.evenSemester?.endDate) semEnds.set(d.evenSemester.endDate, "Even"); }
            if (workDoc.exists()) Object.keys(workDoc.data()).forEach(k => calWorkingDays.add(k));
            if (holDoc.exists()) Object.entries(holDoc.data()).forEach(([k, v]) => calNonWorkingDays.set(k, v));
        } catch(e) {}
    }
    renderCalendarGrid(); updateUpcomingEvent();
}

function renderCalendarGrid() {
    const grid = document.getElementById("calendarGrid"); grid.innerHTML = ""; 
    const year = currentDisplayDate.getFullYear(); const month = currentDisplayDate.getMonth(); const today = new Date();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let cellClass = "cal-cell normal"; let subText = ""; let popupText = "";
        
        if (semStarts.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>Start</span>"; popupText = `${semStarts.get(dateStr)} Semester Starts`; } 
        else if (semEnds.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>End</span>"; popupText = `${semEnds.get(dateStr)} Semester Ends`; }
        else { 
            if (!calWorkingDays.has(dateStr)) { 
                if (calNonWorkingDays.has(dateStr)) { cellClass = "cal-cell holiday"; popupText = calNonWorkingDays.get(dateStr); } 
                else { let dWeek = new Date(year, month, day).getDay(); if (dWeek === 0 || dWeek === 6) cellClass = "cal-cell holiday"; } 
            } 
        }
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) cellClass += " today";
        let clickEvent = popupText ? `onclick="alert('${popupText}')"` : "";
        grid.innerHTML += `<div class="${cellClass}" ${clickEvent}>${day}${subText}</div>`;
    }
}
function updateUpcomingEvent() {
    let checkDate = new Date(); let found = false;
    for (let i = 0; i < 60; i++) {
        let fDate = new Date(checkDate); fDate.setDate(checkDate.getDate() + i);
        let dateStr = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}-${String(fDate.getDate()).padStart(2, '0')}`;
        if (calNonWorkingDays.has(dateStr)) { 
            let reason = calNonWorkingDays.get(dateStr) === "Holiday/Weekend" ? "Holiday" : calNonWorkingDays.get(dateStr);
            document.getElementById("upcomingEventText").innerHTML = `<b>Upcoming:</b> ${fDate.getDate()} ${fDate.toLocaleString('default', { month: 'short' })} - ${reason}`; 
            found = true; break; 
        }
        let dWeek = fDate.getDay(); 
        if ((dWeek === 0 || dWeek === 6) && !calWorkingDays.has(dateStr)) { 
            document.getElementById("upcomingEventText").innerHTML = `<b>Upcoming:</b> ${fDate.getDate()} ${fDate.toLocaleString('default', { month: 'short' })} - Weekend`; 
            found = true; break; 
        }
    }
    if (!found) document.getElementById("upcomingEventText").innerHTML = "No upcoming holidays in the next 60 days.";
}

// ==========================================
// MESSAGES SYSTEM (WITH INFINITE SCROLL)
// ==========================================
let cachedMessages = [];
let messageLimit = 30; // Start with 30 messages
let messageListenerUnsub = null;
let isFetchingMessages = false;

function startMessagesListener() {
    if (messageListenerUnsub) messageListenerUnsub(); // Clear old listener when limit increases

    messageListenerUnsub = onSnapshot(query(collection(db, "colleges", currentCollegeID, "sent_messages"), orderBy("timestamp", "desc"), limit(messageLimit)), (snap) => {
        cachedMessages = [];
        snap.forEach(doc => {
            let d = doc.data(); let roleClass = (d.senderRole || "").toLowerCase().includes("teacher") ? "msg-teacher" : "msg-principal";
            cachedMessages.push({ title: d.title || "Notice", body: d.body || "", sender: d.senderName || "System", target: d.targetSummary || "", roleClass: roleClass, time: d.timestamp ? d.timestamp.toDate() : new Date() });
        });
        document.querySelector("#btnMessages .notification-dot").style.display = "block"; 
        renderMessages();
    });
}

function renderMessages() {
    const listEl = document.getElementById("messagesList");
    if (cachedMessages.length === 0) { listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
    
    // Remember scroll position before updating
    let oldScroll = listEl.scrollTop;
    
    listEl.innerHTML = cachedMessages.map(m => {
        return `<div class="data-card ${m.roleClass}"><div class="card-title">${m.title}</div><div class="card-body">${m.body}</div><div class="card-meta"><span>${m.sender} <span style="color:#94a3b8; font-weight:normal;">→ ${m.target}</span></span><span>${m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span></div></div>`;
    }).join('');

    // Restore scroll position so it doesn't snap to top
    if (isFetchingMessages) { listEl.scrollTop = oldScroll; }
}

// 🚀 INFINITE SCROLL DETECTOR
document.getElementById("messagesList").addEventListener("scroll", (e) => {
    let el = e.target;
    // If user scrolls within 50px of the bottom
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
        // Only load more if we aren't currently fetching AND there might be more data
        if (!isFetchingMessages && cachedMessages.length >= messageLimit) {
            isFetchingMessages = true;
            messageLimit += 30; // Load 30 more older messages
            startMessagesListener(); 
            
            // Prevent spamming the scroll event
            setTimeout(() => { isFetchingMessages = false; }, 1000); 
        }
    }
});

setTimeout(startMessagesListener, 2000);

const elCompose = {
    overlay: document.getElementById("composeOverlay"), openBtn: document.getElementById("btnOpenCompose"), closeBtn: document.getElementById("closeComposeBtn"),
    titleText: document.getElementById("composeModalTitle"), groupFilters: document.getElementById("composeGroupFilters"), dropFilters: document.getElementById("composeDropdownFilters"),
    btnTeachers: document.getElementById("toggleTeachers"), btnStudents: document.getElementById("toggleStudents"),
    deptDrop: document.getElementById("composeDept"), yearDrop: document.getElementById("composeYear"), title: document.getElementById("composeTitle"),
    body: document.getElementById("composeBody"), sendBtn: document.getElementById("btnSendMessage"), status: document.getElementById("composeStatusText")
};
let composeIsPersonal = false; let composeTargetTokens = [];

window.OpenCompose = async (isPersonal = false, name = "", tokens = []) => {
    composeIsPersonal = isPersonal; composeTargetTokens = tokens; elCompose.overlay.classList.add("active");
    elCompose.title.value = ""; elCompose.body.value = ""; elCompose.status.innerText = "";
    if (isPersonal) {
        elCompose.titleText.innerHTML = `<i class="fas fa-comment-dots"></i> Message to: ${name}`;
        elCompose.groupFilters.style.display = "none"; elCompose.dropFilters.style.display = "none";
    } else {
        elCompose.titleText.innerHTML = `<i class="fas fa-bullhorn"></i> Send Announcement`;
        elCompose.groupFilters.style.display = "flex"; elCompose.dropFilters.style.display = "flex";
        elCompose.btnTeachers.checked = false; elCompose.btnStudents.checked = false; elCompose.yearDrop.style.display = "none";
        if (rcCachedDepts.length === 0) {
            try {
                const deptQuery = await getDocs(collection(db, "colleges", currentCollegeID, "departments"));
                rcCachedDepts = []; deptQuery.forEach(d => rcCachedDepts.push({ name: d.data().name || d.id, maxYears: d.data().maxYears || 4 }));
            } catch(e) {}
        }
        elCompose.deptDrop.innerHTML = '<option value="All">All Departments</option>' + rcCachedDepts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
        elCompose.deptDrop.dispatchEvent(new Event("change"));
    }
};

elCompose.openBtn.addEventListener("click", () => window.OpenCompose(false));
elCompose.closeBtn.addEventListener("click", () => elCompose.overlay.classList.remove("active"));
elCompose.btnStudents.addEventListener("change", (e) => elCompose.yearDrop.style.display = e.target.checked ? "block" : "none");
elCompose.deptDrop.addEventListener("change", (e) => {
    let selectedDept = rcCachedDepts.find(d => d.name === e.target.value);
    let maxYears = selectedDept ? selectedDept.maxYears : 4;
    elCompose.yearDrop.innerHTML = '<option value="All">All Years</option>';
    for(let i=1; i<=maxYears; i++) elCompose.yearDrop.innerHTML += `<option value="${i}">Year ${i}</option>`;
});

elCompose.sendBtn.addEventListener("click", async () => {
    let title = elCompose.title.value.trim(); let body = elCompose.body.value.trim();
    if (!title || !body) { elCompose.status.innerText = "Title and message required."; return; }
    if (!composeIsPersonal && !elCompose.btnTeachers.checked && !elCompose.btnStudents.checked) { elCompose.status.innerText = "Select Teachers or Students."; return; }
    elCompose.sendBtn.innerText = "Sending..."; elCompose.sendBtn.disabled = true;

    let topicsToPing = []; let targetDescription = "";
    if (composeIsPersonal) { targetDescription = "Personal Message"; } 
    else {
        let targetDept = elCompose.deptDrop.value; let targetYear = elCompose.yearDrop.value;
        const getSafeTopic = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
        let deptSafe = getSafeTopic(targetDept); let yearSafe = getSafeTopic("Year " + targetYear); let collegeSafe = getSafeTopic(currentCollegeID);
        if (elCompose.btnTeachers.checked) { topicsToPing.push(`${collegeSafe}_TEACHERS_${deptSafe}`); targetDescription += (targetDept === "All") ? "Teachers (All)" : `Teachers (${targetDept})`; }
        if (elCompose.btnStudents.checked) {
            topicsToPing.push(`${collegeSafe}_STUDENTS_${deptSafe}_${yearSafe}`);
            if (targetDescription !== "") targetDescription += " & ";
            if (targetDept === "All" && targetYear === "All") targetDescription += "All Students";
            else if (targetDept === "All") targetDescription += `Students (All Depts - Year ${targetYear})`;
            else if (targetYear === "All") targetDescription += `Students (${targetDept} - All Years)`;
            else targetDescription += `Students (${targetDept} - Year ${targetYear})`;
        }
    }
    try {
        await addDoc(collection(db, "colleges", currentCollegeID, "sent_messages"), {
            title: title, body: body, targetSummary: targetDescription, timestamp: serverTimestamp(),
            type: composeIsPersonal ? "personal" : "broadcast", status: "sent", senderID: currentUserID, senderRole: "Principal", senderName: myRealName
        });
        let payload = { title: `${title} • ${myRealName} (Principal)`, body: body, image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/4c9dc43b4b3fd2c66679498581de26d690053f61/AdhyoraSplashLogo5.png", type: "chat", priority: "high" };
        if (composeIsPersonal && composeTargetTokens.length > 0) payload.tokens = composeTargetTokens;
        else if (!composeIsPersonal && topicsToPing.length > 0) payload.topics = topicsToPing;
        fetch(APPS_SCRIPT_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) }).then(() => {
            elCompose.status.style.color = "var(--text-light-green)"; elCompose.status.innerText = "Message Sent Successfully!";
            setTimeout(() => { elCompose.overlay.classList.remove("active"); elCompose.sendBtn.innerText = "Send Broadcast"; elCompose.sendBtn.disabled = false; }, 1500);
        }).catch(err => { elCompose.status.innerText = "Logged, but push failed."; elCompose.sendBtn.innerText = "Send Broadcast"; elCompose.sendBtn.disabled = false; });
    } catch(e) { elCompose.status.innerText = "Network Error."; elCompose.sendBtn.innerText = "Send Broadcast"; elCompose.sendBtn.disabled = false; }
});

// ==========================================
// ROOMCODE MANAGER
// ==========================================
let rcLoaded = false; let rcCachedDepts = []; let rcCurrentAction = ""; let rcTargetID = ""; let rcTargetName = ""; let rcPendingNewName = ""; let rcIsCreatingNew = false;
function showRcToast(msg) { let t = document.getElementById("rcToast"); t.innerText = msg; t.style.bottom = "30px"; setTimeout(() => t.style.bottom = "-100px", 3000); }

function startRoomcodeListener() {
    if (rcLoaded) return;
    rcLoaded = true;
    onSnapshot(collection(db, "colleges", currentCollegeID, "departments"), (snap) => {
        rcCachedDepts = []; let idToName = {}; snap.forEach(d => idToName[d.id] = d.data().name || d.id);
        snap.forEach(doc => {
            let d = doc.data(); let code = d.roomCode || "";
            if(!code) { code = String(Math.floor(100000 + Math.random() * 900000)); RC_SaveCodeToDB(d.name || doc.id, code, d.maxYears || 3, ""); }
            let linkedName = (d.linkedDepartments && d.linkedDepartments.length > 0) ? idToName[d.linkedDepartments[0]] : null;
            rcCachedDepts.push({ id: doc.id, name: d.name || doc.id, roomCode: code, maxYears: d.maxYears || 3, linkedName: linkedName });
        });
        if (rcCachedDepts.length === 0) document.getElementById("roomcodeList").innerHTML = `<div class="no-data-text">No Roomcodes Available</div>`;
        else renderRoomcodes();
    });
}
function renderRoomcodes() {
    document.getElementById("roomcodeList").innerHTML = rcCachedDepts.map(d => {
        let linkUI = d.linkedName ? `<span style="color:#eab308; font-size:12px; margin-left:8px;" title="Linked to ${d.linkedName}"><i class="fas fa-link"></i> ${d.linkedName}</span>` : "";
        return `<div class="data-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">
            <div><div class="card-title">${d.name} ${linkUI}</div><div class="card-body" style="margin-bottom:0;">Code: <strong style="font-size:16px; color:var(--brand-green); letter-spacing:1px;">${d.roomCode}</strong> (${d.maxYears} Yrs)</div></div>
            <div style="display:flex; gap:8px;">
                <button class="action-icon-btn" title="Share" onclick="window.RC_Share('${d.name}', '${d.roomCode}')"><i class="fas fa-share-alt"></i></button>
                <button class="action-icon-btn" title="Edit Duration" onclick="window.RC_EditDuration('${d.id}', '${d.name}', ${d.maxYears})"><i class="fas fa-pen"></i></button>
                <button class="action-icon-btn" title="Regenerate" onclick="window.RC_RegenSingle('${d.id}', '${d.name}')"><i class="fas fa-sync-alt"></i></button>
                <button class="action-icon-btn" title="Delete" style="color:#ef4444;" onclick="window.RC_Delete('${d.id}', '${d.name}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

window.RC_Share = (name, code) => { let shareText = `Room Code for ${name}: ${code}`; if (navigator.share) { navigator.share({ title: 'Adhyora Room Code', text: shareText }); } else { navigator.clipboard.writeText(shareText); showRcToast("Room code copied to clipboard!"); } };
window.RC_EditDuration = (id, name, years) => { rcIsCreatingNew = false; rcTargetID = id; rcTargetName = name; document.getElementById("durationTitle").innerHTML = `<i class="fas fa-clock"></i> Edit: ${name}`; document.getElementById("durationSelect").value = years; document.getElementById("durationOverlay").classList.add("active"); };
window.RC_RegenSingle = (id, name) => { rcCurrentAction = "REGEN_SINGLE"; rcTargetName = name; document.getElementById("confirmText").innerHTML = `Regenerate code for <b>${name}</b>?<br>(Teacher will be logged out)`; document.getElementById("confirmOverlay").classList.add("active"); };
window.RC_Delete = (id, name) => { rcCurrentAction = "DELETE"; rcTargetName = name; document.getElementById("confirmText").innerHTML = `Delete <b>${name}</b>?<br>(All data will be lost)`; document.getElementById("confirmOverlay").classList.add("active"); };

document.getElementById("btnRegenAll").addEventListener("click", () => { if(rcCachedDepts.length === 0) return; rcCurrentAction = "REGEN_ALL"; document.getElementById("confirmText").innerHTML = `Regenerate <b>ALL</b> Room Codes?`; document.getElementById("confirmOverlay").classList.add("active"); });
document.getElementById("btnOpenAddDept").addEventListener("click", () => { document.getElementById("addDeptInput").value = ""; document.getElementById("addDeptOverlay").classList.add("active"); });
document.getElementById("btnOpenCombine").addEventListener("click", () => {
    if(rcCachedDepts.length < 2) { showRcToast("Need at least 2 departments!"); return; }
    let options = rcCachedDepts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    document.getElementById("combineSelect1").innerHTML = options; document.getElementById("combineSelect2").innerHTML = options; document.getElementById("combineSelect2").selectedIndex = 1;
    document.getElementById("combineOverlay").classList.add("active");
});
document.getElementById("btnAddDeptNext").addEventListener("click", () => {
    rcPendingNewName = document.getElementById("addDeptInput").value.trim(); if(!rcPendingNewName) { showRcToast("Enter a name!"); return; }
    rcCurrentAction = "ADD"; document.getElementById("addDeptOverlay").classList.remove("active");
    document.getElementById("confirmText").innerHTML = `Create new department:<br><b>${rcPendingNewName}</b>?`; document.getElementById("confirmOverlay").classList.add("active");
});
document.getElementById("btnConfirmYes").addEventListener("click", () => { document.getElementById("confirmOverlay").classList.remove("active"); document.getElementById("pinInput").value = ""; document.getElementById("pinOverlay").classList.add("active"); });
document.getElementById("btnSubmitCombine").addEventListener("click", () => {
    let name1 = document.getElementById("combineSelect1").value; let name2 = document.getElementById("combineSelect2").value;
    if(name1 === name2) { showRcToast("Cannot combine with itself!"); return; }
    rcCurrentAction = "COMBINE"; document.getElementById("combineOverlay").classList.remove("active"); document.getElementById("pinInput").value = ""; document.getElementById("pinOverlay").classList.add("active");
});
// 🚀 OPTIMIZATION 10: Spam-Proof the Security PIN Button
document.getElementById("btnVerifyPin").addEventListener("click", async () => {
    let pinBtn = document.getElementById("btnVerifyPin");
    let pin = document.getElementById("pinInput").value.trim(); 
    if(!pin) return;

    // 🚨 LOCK THE BUTTON TO PREVENT DOUBLE-CLICKS
    pinBtn.innerText = "Verifying..."; 
    pinBtn.disabled = true; 
    pinBtn.style.opacity = "0.7";

    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "metadata", "security"));
        let correctPin = (snap.exists() && snap.data().adminPin) ? snap.data().adminPin : "1234";
        
        if (pin === correctPin) { 
            document.getElementById("pinOverlay").classList.remove("active"); 
            RC_ExecuteAction(); 
        } else { 
            showRcToast("Incorrect PIN."); 
        }
    } catch(e) { 
        showRcToast("Error verifying PIN."); 
    }

    // 🚨 UNLOCK THE BUTTON AFTER 1 SECOND
    setTimeout(() => {
        pinBtn.innerText = "Verify & Execute"; 
        pinBtn.disabled = false;
        pinBtn.style.opacity = "1";
        document.getElementById("pinInput").value = "";
    }, 1000);
});
document.getElementById("btnSaveDuration").addEventListener("click", () => {
    document.getElementById("durationOverlay").classList.remove("active"); let yrs = parseInt(document.getElementById("durationSelect").value);
    if (rcIsCreatingNew) { let code = String(Math.floor(100000 + Math.random() * 900000)); RC_SaveCodeToDB(rcPendingNewName, code, yrs, ""); showRcToast(`Added ${rcPendingNewName}!`); } 
    else { updateDoc(doc(db, "colleges", currentCollegeID, "departments", "DEPT_" + rcTargetName.replace(/\s+/g, '')), { maxYears: yrs }); showRcToast("Duration Updated!"); }
});
function RC_ExecuteAction() {
    if (rcCurrentAction === "ADD") { rcIsCreatingNew = true; document.getElementById("durationTitle").innerHTML = `<i class="fas fa-clock"></i> Set Duration`; document.getElementById("durationSelect").value = 3; document.getElementById("durationOverlay").classList.add("active"); }
    else if (rcCurrentAction === "REGEN_SINGLE") { let newCode = String(Math.floor(100000 + Math.random() * 900000)); let oldCode = rcCachedDepts.find(d => d.name === rcTargetName)?.roomCode || ""; RC_SaveCodeToDB(rcTargetName, newCode, 3, oldCode); RC_KickTeachers(rcTargetName); showRcToast(`New Code Generated`); }
    else if (rcCurrentAction === "REGEN_ALL") { rcCachedDepts.forEach(d => { let newCode = String(Math.floor(100000 + Math.random() * 900000)); RC_SaveCodeToDB(d.name, newCode, d.maxYears, d.roomCode); RC_KickTeachers(d.name); }); showRcToast(`All Codes Regenerated`); }
    else if (rcCurrentAction === "DELETE") { let deptID = "DEPT_" + rcTargetName.replace(/\s+/g, ''); deleteDoc(doc(db, "colleges", currentCollegeID, "departments", deptID)); RC_KickTeachers(rcTargetName); showRcToast(`Deleted ${rcTargetName}`); }
    else if (rcCurrentAction === "COMBINE") {
        let name1 = document.getElementById("combineSelect1").value; let name2 = document.getElementById("combineSelect2").value;
        let deptID1 = "DEPT_" + name1.replace(/\s+/g, ''); let deptID2 = "DEPT_" + name2.replace(/\s+/g, '');
        const batch = writeBatch(db); batch.set(doc(db, "colleges", currentCollegeID, "departments", deptID1), { linkedDepartments: [deptID2] }, { merge: true }); batch.set(doc(db, "colleges", currentCollegeID, "departments", deptID2), { linkedDepartments: [deptID1] }, { merge: true }); batch.commit().then(() => showRcToast("Departments Combined!"));
    }
    else if (rcCurrentAction === "DATA_UPLOAD") {
        document.getElementById("pinOverlay").classList.remove("active");
        ExecuteDataUpload();
    }
    else if (rcCurrentAction === "PROMOTE_STUDENTS") {
        document.getElementById("pinOverlay").classList.remove("active");
        ExecuteSemesterPromotion();
    }
    else if (rcCurrentAction === "EDIT_SUBJECT") {
        document.getElementById("pinOverlay").classList.remove("active");
        SUB_ExecuteEdit();
    }
    else if (rcCurrentAction === "DELETE_SUBJECT") {
        document.getElementById("pinOverlay").classList.remove("active");
        SUB_ExecuteDelete();
    }
    else if (rcCurrentAction === "MOVE_STU_SUB") {
        document.getElementById("pinOverlay").classList.remove("active");
        SS_ExecuteMove();
    }
}
function RC_SaveCodeToDB(name, code, years, oldCode) {
    let deptID = "DEPT_" + name.replace(/\s+/g, '');
    if (oldCode) deleteDoc(doc(db, "colleges", currentCollegeID, "public_lookup", "TEACHER_" + oldCode));
    setDoc(doc(db, "colleges", currentCollegeID, "departments", deptID), { name: name, roomCode: code, maxYears: years }, { merge: true });
    setDoc(doc(db, "colleges", currentCollegeID, "public_lookup", "TEACHER_" + code), { collegeID: currentCollegeID, deptID: deptID, deptName: name });
}
function RC_KickTeachers(deptName) {
    let deptID = "DEPT_" + deptName.replace(/\s+/g, '');
    getDocs(query(collection(db, "colleges", currentCollegeID, "teachers"), where("departmentID", "==", deptID))).then(snap => {
        const batch = writeBatch(db); snap.forEach(docSnap => batch.update(docSnap.ref, { status: "Pending" })); batch.commit();
    });
}

// ==========================================
// TEACHER LIST MANAGER
// ==========================================
let tlLoaded = false; let cachedTeachers = [];
function startTeacherListListener() {
    if (tlLoaded) return;
    tlLoaded = true;
    onSnapshot(collection(db, "colleges", currentCollegeID, "teachers"), (snap) => {
        cachedTeachers = []; snap.forEach(doc => { cachedTeachers.push({ id: doc.id, ...doc.data() }); });
        document.getElementById("tlTotalTeachers").innerText = `Total: ${cachedTeachers.length}`; renderTeacherList(document.getElementById("tlSearchInput").value);
    });
}
function renderTeacherList(searchTerm = "") {
    const listEl = document.getElementById("teacherListContainer"); const noData = document.getElementById("tlNoDataText");
    let filtered = cachedTeachers;
    if (searchTerm) { let lowerTerm = searchTerm.toLowerCase(); filtered = cachedTeachers.filter(t => (t.name || "").toLowerCase().includes(lowerTerm) || (t.departmentID || "").toLowerCase().includes(lowerTerm)); }
    if (filtered.length === 0) { noData.style.display = "block"; noData.innerText = searchTerm ? `No teacher matching "${searchTerm}"` : "No teacher requests found."; listEl.innerHTML = ""; listEl.appendChild(noData); return; }
    noData.style.display = "none";
    
    listEl.innerHTML = filtered.map(t => {
        let cleanDept = (t.departmentID || "Unknown").replace("DEPT_", ""); let status = t.status || "Pending"; let isHod = t.isHOD || false;
        let statusClass = status === "Approved" ? "status-approved" : (status === "Declined" ? "status-declined" : "status-pending");
        let hodBadge = isHod ? `<span class="hod-badge">HOD</span>` : "";
        let pendingOption = status === "Pending" ? `<option value="Pending" selected>Pending</option>` : "";
        let tokensArr = []; if (t.fcmTokens) tokensArr = t.fcmTokens; else if (t.fcmToken) tokensArr = [t.fcmToken];
        let tokensJson = JSON.stringify(tokensArr).replace(/"/g, '&quot;'); 

        return `<div class="data-card ${statusClass}" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">
            <div style="flex:1; cursor:pointer;" onclick="window.TL_OpenDashboard('${t.id}')">
                <div class="card-title" style="margin-bottom:2px;">${t.name || "Unknown"} ${hodBadge}</div>
                <div style="font-size:11px; color:#64748b;">${t.email || "No Email"}</div><div style="font-size:12px; font-weight:bold; color:#475569; margin-top:2px;">Dept: ${cleanDept}</div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <label style="display:flex; align-items:center; gap:5px; font-size:11px; font-weight:bold; color:#64748b; cursor:pointer;">
                    <input type="checkbox" ${isHod ? 'checked' : ''} onchange="window.TL_ToggleHOD('${t.id}', '${t.departmentID || ""}', this.checked)" style="accent-color:var(--brand-green);"> HOD
                </label>
                <select class="input-field" style="margin:0; padding:6px 10px; font-size:12px; width:auto; border-radius:8px;" onchange="window.TL_UpdateStatus('${t.id}', this.value)">
                    ${pendingOption} <option value="Approved" ${status === 'Approved' ? 'selected' : ''}>Approved</option> <option value="Declined" ${status === 'Declined' ? 'selected' : ''}>Declined</option>
                </select>
                <button class="action-icon-btn" title="Message" onclick="window.OpenCompose(true, '${t.name || ""}', ${tokensJson})"><i class="fas fa-comment-dots"></i></button>
            </div>
        </div>`;
    }).join('');
    listEl.appendChild(noData); 
}

// 🚀 OPTIMIZATION 4: Debounce Search Input
document.getElementById("tlSearchInput").addEventListener("input", debounce((e) => renderTeacherList(e.target.value.trim()), 250));

window.TL_UpdateStatus = async (tID, newStatus) => {
    if (newStatus === "Pending") return; 
    try {
        await updateDoc(doc(db, "colleges", currentCollegeID, "teachers", tID), { status: newStatus });
        let teacher = cachedTeachers.find(t => t.id === tID);
        if (teacher) {
            let tokens = []; if (teacher.fcmTokens) tokens = teacher.fcmTokens; else if (teacher.fcmToken) tokens = [teacher.fcmToken];
            if (tokens.length > 0) {
                fetch(APPS_SCRIPT_URL, {
                    method: "POST", mode: "no-cors",
                    body: JSON.stringify({
                        title: newStatus === "Approved" ? "Account Approved! 🎉" : "Account Update", 
                        body: newStatus === "Approved" ? "Your teacher account has been approved. You can now log in!" : "Your request was declined.",
                        image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/4c9dc43b4b3fd2c66679498581de26d690053f61/AdhyoraSplashLogo5.png",
                        type: "general", senderRole: "Principal", priority: "high", tokens: tokens
                    })
                });
            }
        }
        showRcToast(`Status updated to ${newStatus}`);
    } catch(e) { showRcToast("Error updating status."); }
};
window.TL_ToggleHOD = async (tID, deptID, isHod) => {
    try {
        const batch = writeBatch(db); batch.update(doc(db, "colleges", currentCollegeID, "teachers", tID), { isHOD: isHod });
        if (deptID) { if (isHod) batch.update(doc(db, "colleges", currentCollegeID, "departments", deptID), { hodID: tID }); else batch.update(doc(db, "colleges", currentCollegeID, "departments", deptID), { hodID: deleteField() }); }
        await batch.commit(); showRcToast(isHod ? "HOD Assigned" : "HOD Removed");
    } catch(e) { showRcToast("Error updating HOD status."); }
};

// ==========================================
// TEACHER DASHBOARD
// ==========================================
let tdCurrentTeacherID = ""; let tdAssignedSubjectsCache = [];
window.TL_OpenDashboard = (tID) => {
    let teacher = cachedTeachers.find(t => t.id === tID); if (!teacher) return;
    tdCurrentTeacherID = tID; switchView(views.teacherDashboard);
    let cleanDept = (teacher.departmentID || "Unknown").replace("DEPT_", "");
    document.getElementById("tdNameText").innerText = teacher.name || "Unknown"; document.getElementById("tdEmailText").innerText = teacher.email || "No Email Provided"; document.getElementById("tdDeptText").innerText = cleanDept;
    let today = new Date().toISOString().split('T')[0]; document.getElementById("tdDateFilter").value = today;
    tdAssignedSubjectsCache = []; document.getElementById("tdSubjectsList").innerHTML = ""; document.getElementById("tdTimetableGrid").innerHTML = "Loading..."; document.getElementById("tdTotalHoursText").innerText = "0 hrs";
    TD_FetchTimetableAndSubjects(today);
};
async function TD_FetchTimetableAndSubjects(filterDate) {
    try {
        const [subSnap, ttSnap] = await Promise.all([ getDocs(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), where("teacherID", "==", tdCurrentTeacherID))), getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("teacherID", "==", tdCurrentTeacherID))) ]);
        tdAssignedSubjectsCache = []; subSnap.forEach(doc => { if (doc.data().subjectName) tdAssignedSubjectsCache.push(doc.data().subjectName); });
        TD_GenerateTimetableGrid(ttSnap); TD_FetchHours(filterDate);
    } catch(e) {}
}
function TD_GenerateTimetableGrid(ttSnap) {
    const gridEl = document.getElementById("tdTimetableGrid"); let grid = Array.from({ length: 6 }, () => Array(6).fill('<span class="tt-empty">--</span>'));
    const dayMap = { "monday":0, "tuesday":1, "wednesday":2, "thursday":3, "friday":4, "saturday":5 };
    ttSnap.forEach(doc => {
        let d = doc.data(); let dIdx = dayMap[(d.day || "").toLowerCase()]; let pIdx = parseInt(d.period) - 1;
        if (dIdx !== undefined && pIdx >= 0 && pIdx < 6) { let sem = (d.semester || "?").replace("Semester ", "S").replace("Semester_", "S"); grid[dIdx][pIdx] = `<span class="tt-slot">${sem}</span>`; }
    });
    const dayLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
    let html = `<div class="tt-header">DAY</div>`; for(let i=1; i<=6; i++) html += `<div class="tt-header">P${i}</div>`;
    for(let i=0; i<6; i++) { html += `<div class="tt-day">${dayLabels[i]}</div>`; grid[i].forEach(cell => html += cell); }
    gridEl.innerHTML = html;
}
async function TD_FetchHours(targetDate) {
    document.getElementById("tdSubjectsList").innerHTML = ""; document.getElementById("tdTotalHoursText").innerText = "Calc...";
    if (targetDate === "All Time") {
        try {
            const docSnap = await getDoc(doc(db, "colleges", currentCollegeID, "teachers", tdCurrentTeacherID));
            let totalHrs = 0; let subjectHours = {};
            if (docSnap.exists()) {
                let d = docSnap.data(); if (d.total_hours_taught) totalHrs = d.total_hours_taught;
                if (d.semester_hours) { Object.values(d.semester_hours).forEach(semData => { if (semData.subjects) { Object.entries(semData.subjects).forEach(([subName, hrs]) => { if (!subjectHours[subName]) subjectHours[subName] = 0; subjectHours[subName] += parseInt(hrs); }); } }); }
            }
            document.getElementById("tdTotalHoursText").innerText = `${totalHrs} hrs`; TD_DrawSubjectRows(subjectHours);
        } catch(e) {}
    } else {
        try {
            const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "attendance"), where("date", "==", targetDate)));
            let totalHrs = 0; let subjectHours = {};
            snap.forEach(doc => { let d = doc.data(); Object.keys(d).forEach(k => { if (k.startsWith("period_") && d[k].markedByTeacherID === tdCurrentTeacherID) { let subName = d[k].subject || "Unknown Subject"; if (!subjectHours[subName]) subjectHours[subName] = 0; subjectHours[subName]++; totalHrs++; } }); });
            document.getElementById("tdTotalHoursText").innerText = `${totalHrs} hrs`; TD_DrawSubjectRows(subjectHours);
        } catch(e) {}
    }
}
function TD_DrawSubjectRows(hoursMap) {
    const listEl = document.getElementById("tdSubjectsList"); const noData = document.getElementById("tdNoSubjectsText");
    let html = ""; let drawn = 0;
    Object.entries(hoursMap).forEach(([name, hrs]) => { html += `<div style="background: white; border: 1px solid var(--brand-green); padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(74, 222, 128, 0.1);"><span style="font-weight: bold; color: #334155; font-size: 13px;">${name}</span> <span style="color: #64748b; font-size: 13px;">Hours: <b style="color: var(--text-green); font-size: 15px;">${hrs}</b></span></div>`; drawn++; });
    tdAssignedSubjectsCache.forEach(sub => {
        if (!hoursMap[sub]) { html += `<div style="background: white; border: 1px solid #cbd5e1; padding: 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;"><span style="font-weight: bold; color: #64748b; font-size: 13px;">${sub}</span> <span style="color: #94a3b8; font-size: 13px;">Hours: <b style="font-size: 15px;">0</b></span></div>`; drawn++; }
    });
    listEl.innerHTML = html; noData.style.display = drawn === 0 ? "block" : "none";
}
document.getElementById("tdDateFilter").addEventListener("change", (e) => TD_FetchHours(e.target.value));
document.getElementById("tdBtnAllTime").addEventListener("click", () => { document.getElementById("tdDateFilter").value = ""; TD_FetchHours("All Time"); });

// ==========================================
// STUDENT LIST MANAGER (RAM INFINITE SCROLL)
// ==========================================
let slLoaded = false; 
let cachedStudents = [];
let studentRenderLimit = 50; // Start with 50

function startStudentListListener() {
    if (slLoaded) return;
    slLoaded = true;
    onSnapshot(collection(db, "colleges", currentCollegeID, "students"), (snap) => {
        cachedStudents = []; 
        snap.forEach(doc => { cachedStudents.push({ id: doc.id, ...doc.data() }); });
        document.getElementById("slTotalStudents").innerText = `Total: ${cachedStudents.length}`; 
        renderStudentList(document.getElementById("slSearchInput").value);
    });
}

function renderStudentList(searchTerm = "") {
    const listEl = document.getElementById("studentListContainer"); 
    const noData = document.getElementById("slNoDataText");
    let filtered = cachedStudents;
    
    // Filter logic
    if (searchTerm) { 
        let terms = searchTerm.toLowerCase().split(':').map(t => t.trim()); 
        filtered = cachedStudents.filter(s => { 
            let sStr = `${s.Name || ""} ${s.RollNumber || ""} ${s.Department || ""} year ${s.Year || ""}`.toLowerCase(); 
            return terms.every(term => sStr.includes(term)); 
        }); 
    }
    
    if (filtered.length === 0) { 
        noData.style.display = "block"; 
        noData.innerText = searchTerm ? `No student matching "${searchTerm}"` : "No students found."; 
        listEl.innerHTML = ""; 
        listEl.appendChild(noData); 
        return; 
    }
    noData.style.display = "none";
    
    // 🚀 RAM SCROLL: Slice the array based on the current limit (Costs $0 Firebase reads)
    let renderBatch = filtered.slice(0, studentRenderLimit);
    
    // Remember scroll position before rebuilding DOM
    let oldScroll = listEl.scrollTop;

    listEl.innerHTML = renderBatch.map(s => {
        let cleanDept = (s.Department || "Unknown").replace("DEPT_", ""); let status = s.status || "Approved";
        let statusClass = status === "Approved" ? "status-approved" : (status === "Declined" ? "status-declined" : "status-pending");
        let statusLabel = status === "Approved" ? "Active" : status;
        let tokensArr = []; if (s.fcmTokens) tokensArr = s.fcmTokens; else if (s.fcmToken) tokensArr = [s.fcmToken]; let tokensJson = JSON.stringify(tokensArr).replace(/"/g, '&quot;');
        return `<div class="data-card ${statusClass}" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">
            <div style="flex:1; cursor:pointer;" onclick="window.SL_OpenDashboard('${s.id}')">
                <div class="card-title" style="margin-bottom:2px;">${s.Name || "Unknown"} <span style="font-size:11px; color:#94a3b8; font-weight:normal;">(${s.RollNumber || "N/A"})</span></div>
                <div style="font-size:12px; font-weight:bold; color:#475569; margin-top:4px;">${cleanDept} - Year ${s.Year || "1"}</div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <span class="hod-badge" style="background:transparent; border:none; color:inherit; opacity:0.8;">${statusLabel}</span>
                <button class="action-icon-btn" title="Manage Access" onclick="window.SL_OpenAdmin('${s.id}', '${s.Name}', '${status}')"><i class="fas fa-user-shield"></i></button>
                <button class="action-icon-btn" title="Message" onclick="window.OpenCompose(true, '${s.Name || ""}', ${tokensJson})"><i class="fas fa-comment-dots"></i></button>
            </div>
        </div>`;
    }).join('');
    
    listEl.appendChild(noData); 
    
    // Restore scroll
    listEl.scrollTop = oldScroll;
}

// Search Input Logic
document.getElementById("slSearchInput").addEventListener("input", debounce((e) => {
    studentRenderLimit = 50; // Reset scroll limit when they search
    renderStudentList(e.target.value.trim());
}, 250));

// 🚀 SCROLL DETECTOR: Triggers when they reach the bottom of the list
document.getElementById("studentListContainer").addEventListener("scroll", (e) => {
    let el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 100) {
        let searchTerm = document.getElementById("slSearchInput").value.trim();
        let totalCurrentMatches = searchTerm ? cachedStudents.length : cachedStudents.length; // Simplified for length check
        
        // If we haven't rendered all the students yet, increase limit by 50 and render
        if (studentRenderLimit < totalCurrentMatches) {
            studentRenderLimit += 50;
            renderStudentList(searchTerm);
        }
    }
});
// 🚀 OPTIMIZATION 5: Debounce Student Search
document.getElementById("slSearchInput").addEventListener("input", debounce((e) => renderStudentList(e.target.value.trim()), 250));

let slTargetAdminID = "";
window.SL_OpenAdmin = (sID, name, currentStatus) => {
    slTargetAdminID = sID; document.getElementById("saStudentName").innerText = name;
    document.getElementById("saStatusDrop").value = (currentStatus === "Declined" || currentStatus === "Banned") ? "Declined" : "Approved";
    document.getElementById("studentAdminOverlay").classList.add("active");
};
document.getElementById("btnConfirmSA").addEventListener("click", async () => {
    if(!slTargetAdminID) return; let newStatus = document.getElementById("saStatusDrop").value;
    try { await updateDoc(doc(db, "colleges", currentCollegeID, "students", slTargetAdminID), { status: newStatus }); showRcToast(`Status updated to ${newStatus}`); document.getElementById("studentAdminOverlay").classList.remove("active"); } catch(e) { showRcToast("Error updating status"); }
});

// ==========================================
// STUDENT DASHBOARD
// ==========================================
let sdCurrentStudentID = "";
let sdStudentData = null;
let sdSemKeys = [];
let sdCurrentSemIndex = 0;
let sdWorkingDays = new Set();
let sdSemesterRanges = {};

let sdCachedGlobalSubjects = [];
async function fetchGlobalSubjects() {
    if (sdCachedGlobalSubjects.length > 0) return;

    // 🚀 OPTIMIZATION 6: Load from Session Storage to prevent constant Database hits
    let localCache = sessionStorage.getItem(`adhyora_subjects_${currentCollegeID}`);
    if (localCache) {
        sdCachedGlobalSubjects = JSON.parse(localCache);
        return;
    }

    try {
        const snap = await getDocs(collection(db, "colleges", currentCollegeID, "subjects"));
        snap.forEach(doc => {
            let d = doc.data();
            sdCachedGlobalSubjects.push({
                id: doc.id,
                cleanType: (d.Type || d.type || "").toUpperCase().replace(/\s+/g, ''),
                cleanSubDept: (d.Department || d.department || "").toLowerCase().replace(/\s+/g, '').replace("dept_", ""),
                semesterArray: (d.Semester || d.semester || "").toString(),
                displayName: d.Name || d.name || "Unnamed",
                rawType: d.Type || d.type || ""
            });
        });
        sessionStorage.setItem(`adhyora_subjects_${currentCollegeID}`, JSON.stringify(sdCachedGlobalSubjects));
    } catch(e) {}
}

window.SL_OpenDashboard = async (sID) => {
    sdCurrentStudentID = sID;
    switchView(views.studentDashboard);
    
    document.getElementById("sdNameText").innerText = "Loading..."; document.getElementById("sdRollText").innerText = ""; document.getElementById("sdStatusBadge").innerText = "..."; document.getElementById("sdSemesterTitle").innerText = "Loading...";
    SD_UpdateWaveUI(0); ["sdStatAtt", "sdStatAbs", "sdStatTot", "sdStatPAtt", "sdStatPAbs", "sdStatPTot"].forEach(id => document.getElementById(id).innerText = "0");
    document.getElementById("sdSubjectList").innerHTML = ""; document.getElementById("sdEnrolledList").innerHTML = "<i>Loading subjects...</i>";
    
    if(sdWorkingDays.size === 0) {
        let displayYear = new Date().getFullYear(); let displayMonth = new Date().getMonth() + 1; 
        let aYear = (displayMonth >= 6) ? `${displayYear}-${displayYear + 1}` : `${displayYear - 1}-${displayYear}`;
        try {
            const [wDoc, sDoc] = await Promise.all([ getDoc(doc(db, "colleges", currentCollegeID, "workingDays", aYear)), getDoc(doc(db, "colleges", currentCollegeID, "semesters", aYear)) ]);
            if(wDoc.exists()) Object.entries(wDoc.data()).forEach(([k,v]) => { if(v==="Regular Working Day") sdWorkingDays.add(k); });
            if(sDoc.exists()) { let d = sDoc.data(); if(d.oddSemester?.startDate) sdSemesterRanges.Odd = { start: new Date(d.oddSemester.startDate), end: new Date(d.oddSemester.endDate) }; if(d.evenSemester?.startDate) sdSemesterRanges.Even = { start: new Date(d.evenSemester.startDate), end: new Date(d.evenSemester.endDate) }; }
        } catch(e) {}
    }

    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "students", sID));
        if(snap.exists()) {
            sdStudentData = snap.data();
            document.getElementById("sdNameText").innerText = sdStudentData.Name || "Unknown"; document.getElementById("sdRollText").innerText = `Roll No: ${sdStudentData.RollNumber || "N/A"}`;
            let status = sdStudentData.status || "Approved"; let badge = document.getElementById("sdStatusBadge"); badge.innerText = status; badge.style.color = status==="Approved" ? "#166534" : "#b91c1c"; badge.style.backgroundColor = status==="Approved" ? "#f0fdf4" : "#fef2f2"; badge.style.borderColor = status==="Approved" ? "#86efac" : "#fca5a5";

            sdSemKeys = []; for(let i=1; i<=8; i++) sdSemKeys.push(`Semester_${i}`);
            let yearStr = (sdStudentData.Year || "1").toString().replace(/[^0-9]/g, ''); 
            let studentYear = parseInt(yearStr) || 1; 
            
            // 🚨 THE FIX: Perfectly matches your Unity SemesterManager math!
            let currentSemNum = (collegeSemesterType === "Odd") ? (studentYear * 2) - 1 : (studentYear * 2);
            
            sdCurrentSemIndex = Math.max(0, Math.min(7, currentSemNum - 1));
            
            document.getElementById("sdDateFilter").value = "";
            document.getElementById("sdBtnAllTime").click(); 
        }
    } catch(e) { }
};

document.getElementById("sdBtnNextSem").addEventListener("click", () => { if(sdCurrentSemIndex < 7) { sdCurrentSemIndex++; SD_BuildUI(); } });
document.getElementById("sdBtnPrevSem").addEventListener("click", () => { if(sdCurrentSemIndex > 0) { sdCurrentSemIndex--; SD_BuildUI(); } });

async function SD_BuildUI(specificDate = "All Time") {
    if(!sdStudentData) return;
    let semKey = sdSemKeys[sdCurrentSemIndex]; 
    let semDisplay = semKey.replace("_", " ");
    document.getElementById("sdSemesterTitle").innerText = semDisplay;

    await fetchGlobalSubjects(); 
    let cleanSemNum = semKey.replace(/[^0-9]/g, '');
    let cleanStuDept = (sdStudentData.Department || sdStudentData.department || "").toLowerCase().replace(/\s+/g, '').replace("dept_", "");
    let finalSubjects = [];

    let enrollMap = {};
    if (sdStudentData.enrolledSubjects) enrollMap = sdStudentData.enrolledSubjects[semKey] || sdStudentData.enrolledSubjects[semDisplay] || {};

    Object.entries(enrollMap).forEach(([k,v]) => {
        finalSubjects.push(`<div style="padding:10px 0; border-bottom:1px dashed #e2e8f0; display:flex; align-items:center; gap:8px;"><b style="color:var(--brand-green); font-size:12px;">[${k}]</b> <span style="font-size:13px; color:#475569;">${v}</span></div>`);
    });

    sdCachedGlobalSubjects.forEach(sub => {
        let semMatch = sub.semesterArray.split(',').map(s=>s.trim()).includes(cleanSemNum);
        if (semMatch) {
            let isDeptMatch = (sub.cleanSubDept === cleanStuDept) || (cleanStuDept.includes(sub.cleanSubDept) && sub.cleanSubDept.length > 3) || (sub.cleanSubDept.includes(cleanStuDept) && cleanStuDept.length > 3);
            if ((sub.cleanType.includes("MJD") || sub.cleanType.includes("CORE") || sub.cleanType.includes("TUTORIAL")) && isDeptMatch) {
                let isAlreadyEnrolled = finalSubjects.some(existing => existing.includes(sub.displayName));
                if (!isAlreadyEnrolled) {
                    finalSubjects.unshift(`<div style="padding:10px 0; border-bottom:1px dashed #e2e8f0; display:flex; align-items:center; gap:8px;"><b style="color:var(--brand-green); font-size:12px;">[${sub.rawType}]</b> <span style="font-size:13px; color:#475569;">${sub.displayName}</span></div>`);
                }
            }
        }
    });

    document.getElementById("sdEnrolledList").innerHTML = finalSubjects.length === 0 ? "<i>No subjects assigned for this semester.</i>" : finalSubjects.join('');
    SD_FetchMarks(semDisplay);

    let strictPresent = 0, strictTotal = 0, simpleAtt = 0, simpleTotal = 0;
    let subjectAtt = {}; 

    let statsObj = null;
    if (sdStudentData.attendance_stats) {
        let foundKey = Object.keys(sdStudentData.attendance_stats).find(k => k.toLowerCase() === semKey.toLowerCase());
        if (foundKey) statsObj = sdStudentData.attendance_stats[foundKey];
    }

    if(statsObj) {
        Object.entries(statsObj).forEach(([subName, s]) => {
            if(subName === "Strict_Global") { strictPresent = s.present || 0; strictTotal = s.total || 0; }
            else {
                let p = s.present || 0, t = s.total || 0; simpleAtt += p; simpleTotal += t;
                let cleanSubName = subName.replace("-", "/");
                if(cleanSubName.toUpperCase().endsWith("_DROPPED")) cleanSubName = cleanSubName.substring(0, cleanSubName.length - 8) + " <span style='color:#ef4444; font-size:11px;'>(Dropped)</span>";
                subjectAtt[cleanSubName] = { p:p, t:t };
            }
        });
    }

    let projectedAtt = strictTotal > 0 ? strictPresent : simpleAtt;
    let projectedTot = strictTotal > 0 ? strictTotal : simpleTotal;
    let percent = projectedTot > 0 ? (projectedAtt / projectedTot) * 100 : 0;
    
    SD_UpdateWaveUI(percent);
    document.getElementById("sdStatAtt").innerText = strictPresent; document.getElementById("sdStatAbs").innerText = strictTotal - strictPresent; document.getElementById("sdStatTot").innerText = strictTotal;
    document.getElementById("sdStatPAtt").innerText = simpleAtt; document.getElementById("sdStatPAbs").innerText = simpleTotal - simpleAtt; document.getElementById("sdStatPTot").innerText = simpleTotal;

    if(specificDate === "All Time") {
        document.getElementById("sdNoDataText").style.display = Object.keys(subjectAtt).length === 0 ? "block" : "none";
        document.getElementById("sdNoDataText").innerText = "No attendance data for this semester.";
        
        document.getElementById("sdSubjectList").innerHTML = Object.entries(subjectAtt).map(([name, data]) => {
            let p = data.p, t = data.t, per = t>0 ? (p/t)*100 : 0; let col = per >= 75 ? "#4CAF50" : (per >= 60 ? "#FF9800" : "#F44336");
            return `<div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span style="font-weight:bold; font-size:13px; color:#334155;">${name}</span> <span style="font-size:12px; font-weight:bold; color:${col};">${per.toFixed(0)}% (${p}/${t})</span></div>
                <div style="background:#f1f5f9; height:6px; border-radius:3px; overflow:hidden;"><div style="height:100%; background:${col}; width:${per}%;"></div></div>
            </div>`;
        }).join('');
    } else {
        SD_FetchDailyAttendance(specificDate, semDisplay);
    }
}

function SD_UpdateWaveUI(percentage) {
    let col = percentage >= 75 ? "var(--brand-green)" : (percentage >= 60 ? "#f59e0b" : "#ef4444");
    let txt = percentage.toFixed(2) + "%";
    let visualPercent = 10 + (percentage * 0.75); 

    let circleFill = document.getElementById("sdCircleWave");
    circleFill.style.setProperty('--wave-color', col);
    circleFill.style.top = `${105 - visualPercent}%`; 
    
    document.getElementById("sdCircleText").innerHTML = `<span style="font-size: 11px; display: block; line-height: 1; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Projected</span><span id="sdCirclePercentVal" style="font-size: 26px;">${txt}</span>`;

    let rowFill = document.getElementById("sdWavyFill");
    rowFill.style.setProperty('--wave-color', col);
    rowFill.style.setProperty('--wave-percent', `${visualPercent}%`);
    document.getElementById("sdWavyText").innerText = `Current: ${txt}`;
}

document.getElementById("sdBtnAllTime").addEventListener("click", () => { document.getElementById("sdDateFilter").value = ""; SD_BuildUI("All Time"); });
document.getElementById("sdDateFilter").addEventListener("change", (e) => { if(e.target.value) SD_BuildUI(e.target.value); });

async function SD_FetchDailyAttendance(targetDate, dbSemesterFormat) {
    const listEl = document.getElementById("sdSubjectList"); listEl.innerHTML = "";
    try {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "attendance"), where("date", "==", targetDate), where("semester", "==", dbSemesterFormat)));
        if (snap.empty) {
            document.getElementById("sdNoDataText").style.display = "block"; document.getElementById("sdNoDataText").innerText = "No data available on this date.";
            document.getElementById("sdStatPAtt").innerText = "0"; document.getElementById("sdStatPAbs").innerText = "0"; document.getElementById("sdStatPTot").innerText = "0"; return;
        }
        document.getElementById("sdNoDataText").style.display = "none";
        let dayPres = 0, dayAbs = 0; let html = "";
        snap.forEach(doc => {
            let d = doc.data();
            Object.keys(d).forEach(k => {
                if (k.startsWith("period_")) {
                    let pData = d[k];
                    if (pData.attendance && pData.attendance[sdCurrentStudentID] !== undefined) {
                        let isPres = pData.attendance[sdCurrentStudentID]; if(isPres) dayPres++; else dayAbs++;
                        let subName = pData.subject || "Unknown Subject"; let col = isPres ? "#4CAF50" : "#F44336";
                        html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:bold; font-size:13px; color:#334155;">${subName}</span> <span style="font-size:12px; font-weight:bold; color:white; background:${col}; padding:3px 8px; border-radius:6px;">${isPres ? 'Present' : 'Absent'}</span></div>`;
                    }
                }
            });
        });
        document.getElementById("sdStatPAtt").innerText = dayPres; document.getElementById("sdStatPAbs").innerText = dayAbs; document.getElementById("sdStatPTot").innerText = dayPres + dayAbs; listEl.innerHTML = html;
    } catch(e) { }
}

let sdCachedMarks = {};
async function SD_FetchMarks(semDisplay) {
    let drop = document.getElementById("sdExamDropdown"); drop.innerHTML = "<option>Loading...</option>"; document.getElementById("sdMarksList").innerHTML = ""; document.getElementById("sdNoMarksText").style.display = "none"; sdCachedMarks = {};
    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "students", sdCurrentStudentID, "nep_marks", semDisplay));
        if (snap.exists()) {
            let data = snap.data();
            Object.entries(data).forEach(([subName, examsMap]) => {
                Object.entries(examsMap).forEach(([examName, stats]) => { if(!sdCachedMarks[examName]) sdCachedMarks[examName] = []; sdCachedMarks[examName].push({ sub: subName, obt: stats.total || 0, max: stats.max }); });
            });
            let exams = Object.keys(sdCachedMarks).sort();
            if(exams.length === 0) { drop.innerHTML = "<option>No Exams Data</option>"; document.getElementById("sdNoMarksText").style.display = "block"; } 
            else { drop.innerHTML = exams.map(e => `<option value="${e}">${e}</option>`).join(''); SD_RenderMarksUI(exams[0]); }
        } else { drop.innerHTML = "<option>No Exams Data</option>"; document.getElementById("sdNoMarksText").style.display = "block"; }
    } catch(e) { drop.innerHTML = "<option>Error</option>"; }
}

document.getElementById("sdExamDropdown").addEventListener("change", (e) => { if(e.target.value && e.target.value !== "No Exams Data") SD_RenderMarksUI(e.target.value); });
function SD_RenderMarksUI(examName) {
    let marks = sdCachedMarks[examName]; if(!marks) return;
    document.getElementById("sdMarksList").innerHTML = marks.map(m => {
        let maxText = m.max ? m.max : "N/A"; let ratio = m.max ? m.obt / m.max : 0; let per = m.max ? (ratio * 100).toFixed(0) + "%" : "";
        let barHtml = m.max ? `<div style="background:#f1f5f9; height:6px; border-radius:3px; overflow:hidden;"><div style="height:100%; background:var(--brand-green); width:${ratio*100}%;"></div></div>` : "";
        return `<div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px;"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span style="font-weight:bold; font-size:13px; color:#334155;">${m.sub}</span><span style="font-size:13px; font-weight:bold; color:#1e293b;">${m.obt}/${maxText} <span style="font-size:10px; color:#64748b;">${per}</span></span></div>${barHtml}</div>`;
    }).join('');
}


// ==========================================
// BATCH MANAGER
// ==========================================
let bchLoaded = false; let bchSubjectsCache = []; let bchCurrentSem = "1"; let bchBatchesData = []; let bchStudentRamCache = {};
function BCH_Init() {
    if (bchLoaded) return;
    bchLoaded = true;
    let dropSem = document.getElementById("bchSemDrop"); 
    let optionsHtml = "";
    let activeValue = "";
    
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((collegeSemesterType === "Odd" && isOdd) || (collegeSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); // Default to first available
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    bchCurrentSem = activeValue;
    dropSem.value = bchCurrentSem;

    let newDropSem = dropSem.cloneNode(true); dropSem.parentNode.replaceChild(newDropSem, dropSem);
    newDropSem.addEventListener("change", (e) => { bchCurrentSem = e.target.value; BCH_RefreshCategories(); });

    document.getElementById("bchCatDrop").addEventListener("change", BCH_RefreshSubjects);
    document.getElementById("bchSubDrop").addEventListener("change", BCH_FetchBatches);
    document.getElementById("btnOpenBatchMove").addEventListener("click", BCH_OpenMoveModal);

    if (bchSubjectsCache.length === 0) {
        getDocs(collection(db, "colleges", currentCollegeID, "subjects")).then(snap => {
            snap.forEach(doc => {
                let d = doc.data();
                bchSubjectsCache.push({ id: doc.id, name: d.Name || d.name || "Unnamed", type: d.Type || d.type || "", semesters: (d.Semester || d.semester || "1").toString() });
            });
            BCH_RefreshCategories();
        }).catch(e => console.error("Error fetching subjects for batches."));
    } else { BCH_RefreshCategories(); }
}

function BCH_RefreshCategories() {
    let types = new Set();
    bchSubjectsCache.forEach(sub => { let sems = sub.semesters.split(',').map(s=>s.trim()); if (sems.includes(bchCurrentSem) && sub.type) types.add(sub.type.trim()); });
    let catDrop = document.getElementById("bchCatDrop");
    if (types.size === 0) catDrop.innerHTML = `<option value="">No Categories</option>`;
    else {
        let arr = Array.from(types).sort(); catDrop.innerHTML = `<option value="">Select Category</option>` + arr.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    BCH_RefreshSubjects();
}

function BCH_RefreshSubjects() {
    let cat = document.getElementById("bchCatDrop").value; let subDrop = document.getElementById("bchSubDrop");
    if (!cat) { subDrop.innerHTML = `<option value="">Select Subject</option>`; BCH_ShowEmpty("Select a Category and Subject to view batches."); return; }
    let subs = bchSubjectsCache.filter(s => s.semesters.split(',').map(x=>x.trim()).includes(bchCurrentSem) && s.type.trim() === cat);
    if (subs.length === 0) { subDrop.innerHTML = `<option value="">No Subjects</option>`; BCH_ShowEmpty("No subjects found for this category."); } 
    else { subDrop.innerHTML = `<option value="">Select Subject</option>` + subs.sort((a,b)=>a.name.localeCompare(b.name)).map(s => `<option value="${s.name}">${s.name}</option>`).join(''); BCH_ShowEmpty("Select a Subject to view batches."); }
}

function BCH_ShowEmpty(msg) { document.getElementById("bchListContainer").innerHTML = `<div class="no-data-text">${msg}</div>`; document.getElementById("btnOpenBatchMove").disabled = true; bchBatchesData = []; }

async function BCH_FetchBatches() {
    let sub = document.getElementById("bchSubDrop").value;
    if (!sub) { BCH_ShowEmpty("Select a valid Subject to view batches."); return; }
    BCH_ShowEmpty(`Loading batches for ${sub}...`);
    try {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", bchCurrentSem), where("subjectName", "==", sub)));
        if (snap.empty) { BCH_ShowEmpty(`No batches found for ${sub}.`); return; }
        
        let rawDocs = []; snap.forEach(doc => rawDocs.push({ id: doc.id, ...doc.data() }));
        rawDocs.sort((a,b) => (a.batchName||"").localeCompare(b.batchName||""));
        
        let studentToBatchMap = {}; let needsRepair = false; let batchUpdates = {}; 
        rawDocs.forEach(d => {
            let sList = d.studentIDs || [];
            sList.forEach(sid => {
                if (studentToBatchMap[sid]) { needsRepair = true; let oldBatch = studentToBatchMap[sid]; if(!batchUpdates[oldBatch]) batchUpdates[oldBatch] = []; batchUpdates[oldBatch].push(sid); }
                studentToBatchMap[sid] = d.id;
            });
        });
        
        if (needsRepair) {
            const wb = writeBatch(db);
            Object.keys(batchUpdates).forEach(bID => { wb.update(doc(db, "colleges", currentCollegeID, "subject_batches", bID), { studentIDs: arrayRemove(...batchUpdates[bID]) }); });
            await wb.commit(); BCH_FetchBatches(); return;
        }
        
        bchBatchesData = rawDocs; await BCH_RenderGroups();
    } catch(e) { BCH_ShowEmpty("Error loading batches."); }
}

async function BCH_RenderGroups() {
    let container = document.getElementById("bchListContainer"); container.innerHTML = ""; document.getElementById("btnOpenBatchMove").disabled = true;
    
    let missingIDs = new Set();
    bchBatchesData.forEach(b => { (b.studentIDs || []).forEach(sid => { if (!bchStudentRamCache[sid]) missingIDs.add(sid); }); });
    
    if (missingIDs.size > 0) {
        let idsArray = Array.from(missingIDs);
        for (let i = 0; i < idsArray.length; i += 30) {
            let chunk = idsArray.slice(i, i + 30);
            try {
                const sSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("__name__", "in", chunk)));
                sSnap.forEach(doc => { let d = doc.data(); bchStudentRamCache[doc.id] = { name: d.Name || d.studentName || "Unknown", roll: d.RollNumber || d.rollNumber || "No Roll", dept: (d.Department || d.department || "Unknown Dept").replace("DEPT_", "") }; });
            } catch(e) {}
        }
    }
    
    let html = "";
    bchBatchesData.forEach((b, idx) => {
        let tName = b.teacherName || "Unassigned"; let room = b.room || "TBD"; let sList = b.studentIDs || [];
        let studentsHtml = "";
        if (sList.length === 0) { studentsHtml = `<div style="padding:10px; text-align:center; color:#94a3b8; font-size:12px;">No students in this batch</div>`; } 
        else {
            sList.forEach(sid => {
                let sInfo = bchStudentRamCache[sid] || { name: "Unknown", roll: "N/A", dept: "Unknown Dept" };
                // 🚨 ADDED: Card ID, pointer cursor, click listener, and pointer-events:none on the checkbox!
                studentsHtml += `
                <div class="bch-stu-card" id="bch_card_${sid}" onclick="BCH_ToggleStudentCard('${sid}')" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border-color); cursor:pointer; transition:0.2s;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" id="bch_chk_${sid}" class="bch-student-chk" data-sid="${sid}" data-bid="${b.id}" style="width:16px; height:16px; accent-color:var(--brand-green); pointer-events:none;">
                        <div>
                            <div style="font-size:13px; font-weight:bold; color:var(--text-green);">${sInfo.name} <span style="font-size:11px; color:#94a3b8; font-weight:normal;">(${sInfo.roll})</span></div>
                            <div style="font-size:11px; color:#64748b;">${sInfo.dept}</div>
                        </div>
                    </div>
                </div>`;
            });
        }
        
        html += `
        <div style="background:white; border:1px solid var(--border-color); border-radius:12px; margin-bottom:15px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
            <div style="background:var(--bg-grid-color); padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="document.getElementById('bchBody_${b.id}').classList.toggle('hidden-view')">
                <div style="font-weight:bold; color:var(--text-green); font-size:14px;">${b.batchName} <span style="font-size:12px; font-weight:normal; background:white; padding:2px 8px; border-radius:10px; margin-left:10px; color:var(--brand-green);">${sList.length} Students</span></div>
                <div style="color:#64748b; font-size:12px;"><i class="fas fa-chalkboard-teacher"></i> ${tName} &nbsp;|&nbsp; <i class="fas fa-door-open"></i> ${room}</div>
            </div>
            <div id="bchBody_${b.id}" style="padding:10px;">
                ${studentsHtml}
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

window.BCH_OnCheckboxChange = () => { let anyChecked = document.querySelector('.bch-student-chk:checked') !== null; document.getElementById("btnOpenBatchMove").disabled = !anyChecked; };

// 🚨 NEW: Programmatically clicks the checkbox and highlights the row
window.BCH_ToggleStudentCard = (sid) => {
    let chk = document.getElementById(`bch_chk_${sid}`);
    if (!chk) return;
    
    chk.checked = !chk.checked; 
    
    let card = document.getElementById(`bch_card_${sid}`);
    if (chk.checked) {
        card.style.backgroundColor = "rgba(74, 222, 128, 0.05)"; // Green tint
    } else {
        card.style.backgroundColor = "transparent"; // Reset
    }
    
    BCH_OnCheckboxChange(); // Update the Move button state
};

function BCH_OpenMoveModal() {
    let chks = document.querySelectorAll('.bch-student-chk:checked'); if (chks.length === 0) return;
    let sourceBatchID = chks[0].dataset.bid; 
    let container = document.getElementById("moveBatchButtonsContainer"); container.innerHTML = "";
    
    bchBatchesData.forEach(b => {
        let btn = document.createElement("button");
        btn.style.cssText = "width: 100%; padding: 12px; border-radius: 10px; font-weight: bold; cursor: pointer; text-align: left; display: flex; justify-content: space-between; align-items: center; margin-bottom:10px;";
        if (b.id === sourceBatchID) {
            btn.style.background = "#f1f5f9"; btn.style.color = "#94a3b8"; btn.style.border = "1px solid #e2e8f0"; btn.disabled = true;
            btn.innerHTML = `Move to ${b.batchName} <i class="fas fa-ban"></i>`;
        } else {
            btn.style.background = "white"; btn.style.color = "var(--text-green)"; btn.style.border = "1px solid var(--brand-green)";
            btn.innerHTML = `Move to ${b.batchName} <i class="fas fa-arrow-right"></i>`;
            btn.onclick = () => BCH_ExecuteMove(sourceBatchID, b.id, Array.from(chks).filter(c => c.dataset.bid === sourceBatchID).map(c => c.dataset.sid));
        }
        container.appendChild(btn);
    });
    document.getElementById("moveBatchOverlay").classList.add("active");
}

async function BCH_ExecuteMove(sourceID, targetID, studentIDsArray) {
    if (!studentIDsArray || studentIDsArray.length === 0) return;
    document.getElementById("moveBatchOverlay").classList.remove("active");
    BCH_ShowEmpty("Moving students...");
    try {
        const wb = writeBatch(db);
        wb.update(doc(db, "colleges", currentCollegeID, "subject_batches", sourceID), { studentIDs: arrayRemove(...studentIDsArray) });
        wb.update(doc(db, "colleges", currentCollegeID, "subject_batches", targetID), { studentIDs: arrayUnion(...studentIDsArray) });
        await wb.commit();
        BCH_FetchBatches();
        showRcToast(`Moved ${studentIDsArray.length} student(s) successfully!`);
    } catch(e) { BCH_ShowEmpty("Error moving students."); }
}

// ==========================================
// TIMETABLE STRUCTURE MANAGER
// ==========================================
let ttLoaded = false; let ttPhase = 0; let ttCurrentSem = "1"; let ttSelectedDay = "Monday";
let ttSubjectsCached = false; let ttAllSubjectsMasterList = []; let ttCachedCategoriesList = []; let ttCachedSubjectsByCategory = {}; let ttCachedTimetableStructures = {}; let ttStructureListener = null;
let ttActiveSlotsData = []; 
const ttPeriodEndTimes = [10.5, 11.5, 12.5, 14.5, 15.5, 16.5];

function TT_Init() {
    if (ttLoaded) return;
    ttLoaded = true;
    let dropSem = document.getElementById("ttSemDrop"); 
    let optionsHtml = "";
    let activeValue = ""; 
    
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((collegeSemesterType === "Odd" && isOdd) || (collegeSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); 
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    ttCurrentSem = activeValue;
    dropSem.value = ttCurrentSem;
    
    let newDropSem = dropSem.cloneNode(true); dropSem.parentNode.replaceChild(newDropSem, dropSem);
    newDropSem.addEventListener("change", (e) => { ttCurrentSem = e.target.value; TT_LoadGlobalCategories(); });

    let dBtns = document.querySelectorAll(".tt-day-btn");
    dBtns.forEach(btn => {
        let newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", (e) => {
            ttSelectedDay = e.target.dataset.day; document.querySelectorAll(".tt-day-btn").forEach(b => b.classList.remove("active")); e.target.classList.add("active"); TT_LoadTimetableForDay();
        });
    });

    let btnSave = document.getElementById("btnTTSaveStructure"); let newBtnSave = btnSave.cloneNode(true); btnSave.parentNode.replaceChild(newBtnSave, btnSave);
    newBtnSave.addEventListener("click", TT_SaveStructureAndLock);

    let btnEdit = document.getElementById("btnTTEdit"); let newBtnEdit = btnEdit.cloneNode(true); btnEdit.parentNode.replaceChild(newBtnEdit, btnEdit);
    newBtnEdit.addEventListener("click", () => TT_SetPhase(0));
    
    let btnAssign = document.getElementById("btnTTAssign"); let newBtnAssign = btnAssign.cloneNode(true); btnAssign.parentNode.replaceChild(newBtnAssign, btnAssign);
    newBtnAssign.addEventListener("click", () => {
        switchView(views.assign); 
        ASN_Init(ttCurrentSem, ttSelectedDay); 
    });
    
    let btnBack = document.getElementById("btnBackToTimetable"); let newBtnBack = btnBack.cloneNode(true); btnBack.parentNode.replaceChild(newBtnBack, btnBack);
    newBtnBack.addEventListener("click", () => {
        switchView(views.timetable);
        TT_LoadTimetableForDay(); 
    });

    TT_LoadGlobalCategories();
    
    if (window.ttInterval) clearInterval(window.ttInterval);
    window.ttInterval = setInterval(() => { if (!document.getElementById('timetableView').classList.contains('hidden-view')) TT_UpdateTimelineVisuals(); }, 60000); 
}
function TT_LoadGlobalCategories() {
    if (ttSubjectsCached) { TT_ProcessSubjectsFromRAM(); return; }
    getDocs(collection(db, "colleges", currentCollegeID, "subjects")).then(snap => {
        ttAllSubjectsMasterList = [];
        snap.forEach(doc => { let d = doc.data(); ttAllSubjectsMasterList.push({ semester: (d.Semester || d.semester || "").toString(), type: (d.Type || d.type || "").trim(), name: (d.Name || d.name || "").trim() }); });
        ttSubjectsCached = true; TT_ProcessSubjectsFromRAM();
    });
}

function TT_ProcessSubjectsFromRAM() {
    let types = new Set(); ttCachedSubjectsByCategory = {};
    ttAllSubjectsMasterList.forEach(sub => {
        let sems = sub.semester.split(',').map(s => s.trim());
        if (sems.includes(ttCurrentSem) && sub.type) { types.add(sub.type); if (!ttCachedSubjectsByCategory[sub.type]) ttCachedSubjectsByCategory[sub.type] = []; ttCachedSubjectsByCategory[sub.type].push(sub.name); }
    });
    ttCachedCategoriesList = Array.from(types).sort();
    if (!ttCachedCategoriesList.includes("Select Category")) ttCachedCategoriesList.unshift("Select Category");
    if (!ttCachedCategoriesList.includes("Break")) ttCachedCategoriesList.push("Break");
    if (!ttCachedCategoriesList.includes("Lunch")) ttCachedCategoriesList.push("Lunch");

    let dayNum = new Date().getDay(); let todayIndex = (dayNum >= 1 && dayNum <= 5) ? dayNum - 1 : 0; const daysList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    ttSelectedDay = daysList[todayIndex]; let dBtns = document.querySelectorAll(".tt-day-btn");
    dBtns.forEach((b, idx) => { if(idx === todayIndex) b.classList.add("active"); else b.classList.remove("active"); });
    TT_LoadTimetableForDay();
}

function TT_LoadTimetableForDay() {
    let docID = `Sem${ttCurrentSem}_${ttSelectedDay}`;
    if (ttStructureListener) ttStructureListener(); 
    if (ttCachedTimetableStructures[docID]) TT_BuildSlotsFromData(ttCachedTimetableStructures[docID]);

    ttStructureListener = onSnapshot(doc(db, "colleges", currentCollegeID, "timetable_structure", docID), (snapshot) => {
        let slotsData = {}; if (snapshot.exists() && snapshot.data().slots) slotsData = snapshot.data().slots;
        ttCachedTimetableStructures[docID] = slotsData; TT_BuildSlotsFromData(slotsData);
    });
}

function TT_BuildSlotsFromData(slotsData) {
    ttActiveSlotsData = []; let hasStructure = Object.keys(slotsData).length > 0;
    for (let p = 1; p <= 6; p++) {
        let mainKey = `P${p}`; let mainCat = slotsData[mainKey] || "Select Category";
        ttActiveSlotsData.push({ period: p, splitIndex: 0, isSplit: false, category: mainCat, subject: "Select Subject", teacher: "Waiting for HOD", room: "", bgCol: "white" });
    }
    TT_SetPhase(hasStructure ? 1 : 0); 
}

function TT_SetPhase(phase) {
    ttPhase = phase;
    document.getElementById("btnTTSaveStructure").style.display = (phase === 0) ? "inline-flex" : "none";
    document.getElementById("btnTTAssign").style.display = (phase === 1) ? "inline-flex" : "none";
    document.getElementById("btnTTEdit").style.display = (phase === 1) ? "inline-flex" : "none";
    TT_RenderLayout();
}

function TT_RenderLayout() {
    let wrapper = document.getElementById("ttMainWrapper");
    ttActiveSlotsData.sort((a, b) => { if (a.period !== b.period) return a.period - b.period; return a.splitIndex - b.splitIndex; });

    let html = "";
    ttActiveSlotsData.forEach((slot, idx) => {
        let idBase = `tt_${slot.period}_${slot.splitIndex}`;
        let catOpts = ttCachedCategoriesList.map(c => `<option value="${c}" ${c === slot.category ? 'selected' : ''}>${c}</option>`).join('');
        let subOpts = `<option value="Select Subject">Select Subject</option>`;
        if (ttPhase === 1 && !slot.isSplit && ttCachedSubjectsByCategory[slot.category]) subOpts += ttCachedSubjectsByCategory[slot.category].map(s => `<option value="${s}" ${s === slot.subject ? 'selected' : ''}>${s}</option>`).join('');
        else if (slot.subject !== "Select Subject") subOpts += `<option value="${slot.subject}" selected>${slot.subject}</option>`;

        let catLocked = (ttPhase === 1) ? "disabled" : ""; let subLocked = (ttPhase === 1 && !slot.isSplit) ? "" : "disabled";
        let cardClass = slot.isSplit ? "tt-card tt-split-card" : "tt-card"; let nodeNum = slot.isSplit ? "" : slot.period;
        let nodeColor = slot.isSplit ? "transparent" : "white"; let nodeBorder = slot.isSplit ? "none" : "2px solid #333"; let bgPaint = slot.bgCol || "white";

        html += `<div class="tt-row" id="row_${idBase}">
            <div class="tt-timeline-col"><div class="tt-node" id="node_${idBase}" style="background:${nodeColor}; border:${nodeBorder}">${nodeNum}</div>${!slot.isSplit && slot.period < 6 ? `<div class="tt-line-bg"><div class="tt-line-fill" id="fill_${idBase}"></div></div>` : ''}</div>
            <div class="${cardClass}" style="background-color: ${bgPaint}">
                <select class="tt-input-field select" id="cat_${idBase}" ${catLocked}>${catOpts}</select>
                <select class="tt-input-field select" id="sub_${idBase}" ${subLocked}>${subOpts}</select>
                <select class="tt-input-field select" disabled><option>${slot.teacher}</option></select>
                <input type="text" class="tt-input-field" disabled value="${slot.room}" placeholder="Room TBD">
            </div></div>`;
    });

    wrapper.innerHTML = html; TT_UpdateTimelineVisuals();

    ttActiveSlotsData.forEach((slot) => {
        let idBase = `tt_${slot.period}_${slot.splitIndex}`;
        if (!slot.isSplit && ttPhase === 0) document.getElementById(`cat_${idBase}`).addEventListener("change", (e) => { slot.category = e.target.value; });
        if (!slot.isSplit && ttPhase === 1) document.getElementById(`sub_${idBase}`).addEventListener("change", (e) => { slot.subject = e.target.value; TT_OnSubjectSelectedByPrincipal(slot.period, slot.subject); });
    });
}

function TT_OnSubjectSelectedByPrincipal(period, subjectName) {
    ttActiveSlotsData = ttActiveSlotsData.filter(s => !(s.period === period && s.isSplit)); let mainSlot = ttActiveSlotsData.find(s => s.period === period && !s.isSplit);
    if (subjectName === "Select Subject" || subjectName === "Waiting for HOD" || !subjectName) { mainSlot.teacher = "Waiting for HOD"; mainSlot.room = ""; mainSlot.bgCol = "white"; TT_RenderLayout(); return; }
    mainSlot.teacher = "Loading..."; TT_RenderLayout(); 
    getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", ttCurrentSem), where("day", "==", ttSelectedDay), where("period", "==", period.toString()), where("subjectName", "==", subjectName))).then(snap => {
        if (snap.empty) { mainSlot.teacher = "Waiting for HOD"; mainSlot.room = ""; mainSlot.bgCol = "white"; TT_RenderLayout(); return; }
        let docs = []; snap.forEach(d => docs.push(d.data())); docs.sort((a,b) => (parseInt(a.splitIndex) || 0) - (parseInt(b.splitIndex) || 0));
        let mainDoc = docs[0]; mainSlot.teacher = mainDoc.teacherName || "Unassigned"; mainSlot.room = mainDoc.room || "TBD"; mainSlot.markerID = mainDoc.teacherID || "";
        TT_CheckAttendanceCompliance(mainSlot, subjectName);
        for (let i = 1; i < docs.length; i++) {
            let sDoc = docs[i]; let newSplit = { period: period, splitIndex: parseInt(sDoc.splitIndex), isSplit: true, category: mainSlot.category, subject: subjectName, teacher: sDoc.teacherName || "Unassigned", room: sDoc.room || "TBD", bgCol: "white", markerID: sDoc.teacherID || "" };
            ttActiveSlotsData.push(newSplit); TT_CheckAttendanceCompliance(newSplit, subjectName);
        }
    });
}

function TT_CheckAttendanceCompliance(slotObj, subjectName) {
    let currentDayNum = new Date().getDay(); if (currentDayNum === 0) currentDayNum = 7; const daysList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    let targetDayNum = daysList.indexOf(ttSelectedDay) + 1; let daysDiff = targetDayNum - currentDayNum; let targetDate = new Date(); targetDate.setDate(targetDate.getDate() + daysDiff); let dateStr = targetDate.toISOString().split('T')[0];
    let now = new Date(); let currentHour = now.getHours() + (now.getMinutes() / 60.0); let endTime = ttPeriodEndTimes[slotObj.period - 1]; let isDeadlinePassed = false;
    let targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()); let nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (targetDateOnly < nowDateOnly) isDeadlinePassed = true; else if (targetDateOnly.getTime() === nowDateOnly.getTime()) { if (currentHour >= endTime) isDeadlinePassed = true; }
    if (!isDeadlinePassed) { slotObj.bgCol = "white"; TT_RenderLayout(); return; }

    let semName = `Semester${ttCurrentSem}`; let cleanSubID = subjectName.replace(/\s+/g, '').replace(/\//g, '-').replace(/\./g, ''); let docID = `${dateStr}_${semName}_${cleanSubID}`; let periodKey = `period_${slotObj.period}`;
    getDoc(doc(db, "colleges", currentCollegeID, "attendance", docID)).then(snap => {
        if (snap.exists() && snap.data()[periodKey]) {
            let pData = snap.data()[periodKey];
            if (slotObj.isSplit || pData.batch_teachers) {
                let batchMap = pData.batch_teachers || {}; let bKey = slotObj.isSplit ? slotObj.splitIndex.toString() : "common";
                if (batchMap[bKey]) { let markerID = batchMap[bKey].id || ""; slotObj.bgCol = (markerID === slotObj.markerID) ? "rgba(187,247,208,0.6)" : "rgba(254,240,138,0.6)"; } else slotObj.bgCol = "rgba(254,202,202,0.6)"; 
            } else { let actualID = pData.markedByTeacherID || ""; slotObj.bgCol = (actualID === slotObj.markerID) ? "rgba(187,247,208,0.6)" : "rgba(254,240,138,0.6)"; }
        } else slotObj.bgCol = "rgba(254,202,202,0.6)"; TT_RenderLayout();
    }).catch(e => { slotObj.bgCol = "rgba(254,202,202,0.6)"; TT_RenderLayout(); });
}

function TT_SaveStructureAndLock() {
    document.getElementById("btnTTSaveStructure").innerText = "Saving...";
    let newSlots = {}; ttActiveSlotsData.forEach(s => { if (!s.isSplit) newSlots[`P${s.period}`] = s.category; });
    let docID = `Sem${ttCurrentSem}_${ttSelectedDay}`;
    setDoc(doc(db, "colleges", currentCollegeID, "timetable_structure", docID), { semester: ttCurrentSem, day: ttSelectedDay, slots: newSlots }, { merge: true }).then(() => {
        showRcToast("Categories Updated!"); document.getElementById("btnTTSaveStructure").innerHTML = '<i class="fas fa-save"></i> Save Structure'; TT_SetPhase(1);
    });
}

function TT_UpdateTimelineVisuals() {
    let now = new Date(); let currentHour = now.getHours() + (now.getMinutes() / 60.0);
    ttActiveSlotsData.forEach(slot => {
        if (slot.isSplit) return;
        let pIndex = slot.period - 1; let endTime = ttPeriodEndTimes[pIndex]; let startTime = endTime - 1.0; let idBase = `tt_${slot.period}_0`;
        let nodeEl = document.getElementById(`node_${idBase}`); let fillEl = document.getElementById(`fill_${idBase}`);
        if (nodeEl) { let nodeColor = (currentHour >= endTime) ? "#94a3b8" : (currentHour >= startTime && currentHour < endTime) ? "#4ade80" : "white"; nodeEl.style.background = nodeColor; nodeEl.style.color = (nodeColor === "white") ? "#333" : "white"; }
        if (fillEl) { let fillAmount = (currentHour >= endTime) ? 100 : (currentHour <= startTime) ? 0 : ((currentHour - startTime) / (endTime - startTime)) * 100; fillEl.style.height = `${fillAmount}%`; }
    });
}

// ==========================================
// ASSIGN MANAGER (GENERAL DEPT)
// ==========================================
let asnCurrentSem = "1"; let asnSelectedDay = "Monday";
let asnGeneralSubjects = []; let asnStudentsByYear = {}; let asnActiveRows = []; 
let asnAllTeachers = [];

function ASN_Init(startSem, startDay) {
    asnSelectedDay = startDay || "Monday";

    let dropSem = document.getElementById("asnSemDrop"); 
    let optionsHtml = "";
    let activeValue = "";

    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((collegeSemesterType === "Odd" && isOdd) || (collegeSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); 
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    asnCurrentSem = startSem || activeValue;
    dropSem.value = asnCurrentSem;
    
    let newDropSem = dropSem.cloneNode(true); dropSem.parentNode.replaceChild(newDropSem, dropSem);
    newDropSem.addEventListener("change", (e) => { asnCurrentSem = e.target.value; ASN_LoadData(); });

    let dBtns = document.querySelectorAll(".asn-day-btn");
    dBtns.forEach(btn => {
        let newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", (e) => {
            asnSelectedDay = e.target.dataset.day; document.querySelectorAll(".asn-day-btn").forEach(b => b.classList.remove("active")); e.target.classList.add("active"); ASN_LoadData();
        });
    });
    document.querySelectorAll(".asn-day-btn").forEach((b) => { if(b.dataset.day === asnSelectedDay) b.classList.add("active"); else b.classList.remove("active"); });

    let btnSave = document.getElementById("btnAsnSave");
    let newBtnSave = btnSave.cloneNode(true); btnSave.parentNode.replaceChild(newBtnSave, btnSave);
    newBtnSave.addEventListener("click", ASN_SaveAll);

    if (asnAllTeachers.length === 0) {
        getDocs(collection(db, "colleges", currentCollegeID, "teachers")).then(snap => {
            asnAllTeachers = []; snap.forEach(d => asnAllTeachers.push({ id: d.id, name: d.data().name || d.data().teacherName || "Unknown", dept: d.data().departmentID || "" }));
            ASN_LoadData();
        });
    } else {
        ASN_LoadData();
    }
}

async function ASN_LoadData() {
    document.getElementById("asnListContainer").innerHTML = `<div class="no-data-text">Loading Assign Panel...</div>`;
    
    if (asnGeneralSubjects.length === 0) {
        const subSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subjects"), where("department", "==", "General")));
        asnGeneralSubjects = []; subSnap.forEach(doc => { let d = doc.data(); asnGeneralSubjects.push({ id: doc.id, name: d.Name || d.name || "", type: d.Type || d.type || "", semesters: (d.Semester || d.semester || "").toString() }); });
    }

    let validCats = new Set();
    asnGeneralSubjects.forEach(s => { if (s.semesters.split(',').map(x=>x.trim()).includes(asnCurrentSem) && s.type && !s.type.toUpperCase().includes("TUTORIAL")) validCats.add(s.type.trim()); });
    
    let docID = `Sem${asnCurrentSem}_${asnSelectedDay}`;
    const structSnap = await getDoc(doc(db, "colleges", currentCollegeID, "timetable_structure", docID));
    if (!structSnap.exists() || !structSnap.data().slots) { document.getElementById("asnListContainer").innerHTML = `<div class="no-data-text">No General classes structure set for this day.</div>`; return; }
    
    let slots = structSnap.data().slots; let validPeriods = []; let pCats = {};
    for(let i=1; i<=6; i++) {
        if(slots[`P${i}`]) {
            let cat = slots[`P${i}`].trim();
            if(!cat.toUpperCase().includes("TUTORIAL") && validCats.has(cat)) { validPeriods.push(i); pCats[i] = cat; }
        }
    }
    if(validPeriods.length === 0) { document.getElementById("asnListContainer").innerHTML = `<div class="no-data-text">No General classes scheduled today.</div>`; return; }

    const allocSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", asnCurrentSem), where("day", "==", asnSelectedDay), where("departmentID", "==", "DEPT_General")));
    let allocsByPeriod = {}; allocSnap.forEach(d => { let p = parseInt(d.data().period); if(!allocsByPeriod[p]) allocsByPeriod[p] = []; allocsByPeriod[p].push(d.data()); });

    asnActiveRows = [];
    validPeriods.forEach(p => {
        let cat = pCats[p];
        if (allocsByPeriod[p]) {
            let docs = allocsByPeriod[p].sort((a,b) => (parseInt(a.splitIndex)||0) - (parseInt(b.splitIndex)||0));
            docs.forEach((d, idx) => {
                asnActiveRows.push({ id: `r_${p}_${idx}`, period: p, splitIndex: parseInt(d.splitIndex)||0, isSplit: (parseInt(d.splitIndex)||0) > 0 || !d.isCommon, category: cat, subject: d.subjectName || "", teacher: d.teacherName || "", teacherID: d.teacherID || "", room: d.room || "" });
            });
        } else {
            asnActiveRows.push({ id: `r_${p}_0`, period: p, splitIndex: 0, isSplit: false, category: cat, subject: "", teacher: "", teacherID: "", room: "" });
        }
    });

    let yearStr = Math.ceil(parseInt(asnCurrentSem) / 2).toString();
    if (!asnStudentsByYear[yearStr]) {
        const stuSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", yearStr)));
        asnStudentsByYear[yearStr] = []; stuSnap.forEach(d => asnStudentsByYear[yearStr].push({ id: d.id, ...d.data() }));
    }

    ASN_RenderLayout();
}

function ASN_RenderLayout() {
    let container = document.getElementById("asnListContainer");
    
    let groupedRows = {};
    asnActiveRows.forEach(r => {
        if (!groupedRows[r.period]) groupedRows[r.period] = [];
        groupedRows[r.period].push(r);
    });

    let html = "";
    Object.keys(groupedRows).sort((a,b) => a - b).forEach(p => {
        let rows = groupedRows[p].sort((a,b) => a.splitIndex - b.splitIndex);
        
        html += `<div class="asn-period-wrapper">`;
        html += `<div class="asn-period-header">Period ${p}</div>`;
        
        rows.forEach((row, idx) => {
            let catOptions = `<option value="${row.category}">${row.category}</option>`;
            let subOptions = `<option value="">Select Subject</option>`;
            asnGeneralSubjects.filter(s => s.type === row.category && s.semesters.split(',').map(x=>x.trim()).includes(asnCurrentSem)).forEach(s => {
                subOptions += `<option value="${s.name}" ${s.name === row.subject ? 'selected' : ''}>${s.name}</option>`;
            });

            let teacherOptions = `<option value="">Unassigned</option>`;
            if (row.subject) {
                teacherOptions += asnAllTeachers.map(t => `<option value="${t.id}|${t.name}" ${t.name === row.teacher ? 'selected' : ''}>${t.name}</option>`).join('');
            }

            let isDel = row.isSplit; 
            let btnClass = isDel ? "asn-split-btn del" : "asn-split-btn"; 
            let btnIcon = isDel ? '<i class="fas fa-trash"></i> Delete Batch' : '<i class="fas fa-cut"></i> Split';
            let cardClass = isDel ? "asn-card split" : "asn-card";
            
            let badgeHtml = "";
            if (rows.length > 1) {
                badgeHtml = `<div class="asn-batch-badge">Batch ${idx + 1}</div>`;
            }

            html += `
            <div class="${cardClass}" id="card_${row.id}">
                ${badgeHtml}
                <div class="asn-grid">
                    <select class="asn-input select" disabled>${catOptions}</select>
                    <select class="asn-input select" id="sub_${row.id}" ${isDel ? 'disabled' : ''} onchange="ASN_OnSubjectChange('${row.id}', this.value)">${subOptions}</select>
                    <select class="asn-input select" id="tea_${row.id}" onchange="ASN_OnTeacherChange('${row.id}', this.value)">${teacherOptions}</select>
                    <input type="text" class="asn-input" id="rm_${row.id}" value="${row.room}" placeholder="Room" onchange="ASN_OnRoomChange('${row.id}', this.value)">
                </div>
                <button class="${btnClass}" onclick="ASN_RequestSplit('${row.id}')">${btnIcon}</button>
            </div>`;
        });
        html += `</div>`;
    });
    
    container.innerHTML = `<div class="asn-periods-grid">${html}</div>`;
}

window.ASN_OnSubjectChange = (rowId, newSub) => {
    let row = asnActiveRows.find(r => r.id === rowId); if(!row) return;
    row.subject = newSub; row.teacher = ""; row.teacherID = ""; row.room = "";
    asnActiveRows = asnActiveRows.filter(r => !(r.period === row.period && r.isSplit)); 
    
    if (newSub) {
        let docID = `Sem${asnCurrentSem}_${asnSelectedDay}_P${row.period}_0_${newSub.replace(/\s+/g, '').replace(/\//g, '')}`;
        getDoc(doc(db, "colleges", currentCollegeID, "timetable_allocations", docID)).then(snap => {
            if (snap.exists()) {
                row.teacher = snap.data().teacherName || ""; row.teacherID = snap.data().teacherID || ""; row.room = snap.data().room || "";
                
                getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", newSub))).then(bSnap => {
                    if (bSnap.size > 1) {
                        let bDocs = []; bSnap.forEach(d => bDocs.push(d.data())); bDocs.sort((a,b) => a.batchName.localeCompare(b.batchName));
                        for(let i=1; i<bDocs.length; i++) {
                            asnActiveRows.push({ id: `r_${row.period}_${i}_${Date.now()}`, period: row.period, splitIndex: i, isSplit: true, category: row.category, subject: newSub, teacher: "", teacherID: "", room: "" });
                        }
                    }
                    ASN_RenderLayout();
                });
            } else ASN_RenderLayout();
        });
    } else ASN_RenderLayout();
};
window.ASN_OnTeacherChange = (rowId, val) => { let row = asnActiveRows.find(r => r.id === rowId); if(!row) return; if(val){ let parts = val.split('|'); row.teacherID = parts[0]; row.teacher = parts[1]; } else { row.teacherID = ""; row.teacher = ""; } };
window.ASN_OnRoomChange = (rowId, val) => { let row = asnActiveRows.find(r => r.id === rowId); if(!row) return; row.room = val; };

window.ASN_RequestSplit = (rowId) => {
    let row = asnActiveRows.find(r => r.id === rowId); if(!row) return;
    let isVac = (row.subject.toUpperCase().includes("VAC") || row.category.toUpperCase().includes("VAC"));

    if (row.isSplit) {
        let title = document.getElementById("asnConfirmTitle"); 
        title.innerHTML = '<i class="fas fa-trash"></i> Delete Batch'; title.style.color = "#ef4444";
        document.getElementById("asnConfirmText").innerHTML = isVac ? `Remove a batch for <b>${row.subject}</b>?<br>You will need to reassign departments.` : `Delete this specific batch?<br>Students will be re-distributed.`;
        
        let btnYes = document.getElementById("btnAsnConfirmYes");
        let newBtnYes = btnYes.cloneNode(true); btnYes.parentNode.replaceChild(newBtnYes, btnYes);
        newBtnYes.onclick = () => { document.getElementById("asnConfirmOverlay").classList.remove("active"); ASN_ProcessDeleteSplit(row, isVac); };
        
        document.getElementById("asnConfirmOverlay").classList.add("active");
    } else {
        if (!row.subject) { showRcToast("Select a subject first!"); return; }
        let title = document.getElementById("asnConfirmTitle"); 
        title.innerHTML = '<i class="fas fa-cut"></i> Divide Class'; title.style.color = "var(--text-green)";
        document.getElementById("asnConfirmText").innerHTML = `Are you sure you want to divide ALL students for<br><b>${row.subject}</b> into a new batch?`;
        
        let btnYes = document.getElementById("btnAsnConfirmYes");
        let newBtnYes = btnYes.cloneNode(true); btnYes.parentNode.replaceChild(newBtnYes, btnYes);
        newBtnYes.onclick = () => { 
            document.getElementById("asnConfirmOverlay").classList.remove("active"); 
            if (isVac) ASN_OpenDeptSplit(row, false); else ASN_DivideEvenly(row); 
        };
        
        document.getElementById("asnConfirmOverlay").classList.add("active");
    }
};

async function ASN_ProcessDeleteSplit(rowToRemove, isVac) {
    let p = rowToRemove.period; let sub = rowToRemove.subject;
    asnActiveRows = asnActiveRows.filter(r => r.id !== rowToRemove.id);
    let remRows = asnActiveRows.filter(r => r.period === p).sort((a,b) => a.splitIndex - b.splitIndex);
    remRows.forEach((r, idx) => { r.splitIndex = idx; if(idx === 0) r.isSplit = false; });
    ASN_RenderLayout();

    if (!sub) return;
    let newBatches = remRows.length;
    if (newBatches === 1) {
        showRcToast("Reverted to a single class.");
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", sub)));
        snap.forEach(d => deleteDoc(d.ref));
    } else {
        if (isVac) ASN_OpenDeptSplit(remRows[0], true);
        else {
            showRcToast(`Re-balancing students into ${newBatches} batches...`);
            const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", sub)));
            const wb = writeBatch(db); snap.forEach(d => wb.delete(d.ref)); await wb.commit();
            await ASN_ExecuteDivideEvenly(sub, newBatches);
        }
    }
}

async function ASN_DivideEvenly(row) { await ASN_ExecuteDivideEvenly(row.subject, asnActiveRows.filter(r => r.period === row.period).length + 1); let newIdx = asnActiveRows.filter(r => r.period === row.period && r.isSplit).length + 1; asnActiveRows.push({ id: `r_${row.period}_${newIdx}_${Date.now()}`, period: row.period, splitIndex: newIdx, isSplit: true, category: row.category, subject: row.subject, teacher: "", teacherID: "", room: "" }); ASN_RenderLayout(); showRcToast(`Split Class evenly!`); }

async function ASN_ExecuteDivideEvenly(subject, totalBatches) {
    let yearStr = Math.ceil(parseInt(asnCurrentSem) / 2).toString();
    let allStudents = asnStudentsByYear[yearStr].map(s => s.id);
    let baseSize = Math.floor(allStudents.length / totalBatches); let remainder = allStudents.length % totalBatches;
    const wb = writeBatch(db); let cleanSub = subject.replace(/\s+/g, '').replace(/\//g, ''); let offset = 0;
    for(let i=0; i<totalBatches; i++){
        let size = baseSize + (i < remainder ? 1 : 0); let bStudents = allStudents.slice(offset, offset + size); offset += size; let bName = `Batch ${i+1}`; let docID = `BATCH_Sem${asnCurrentSem}_${cleanSub}_${bName.replace(/\s+/g,'')}`;
        wb.set(doc(db, "colleges", currentCollegeID, "subject_batches", docID), { batchName: bName, subjectName: subject, semester: asnCurrentSem, studentIDs: bStudents }, {merge: true});
    }
    await wb.commit();
}

let asnPendingDeptRow = null;
function ASN_OpenDeptSplit(row, isDeleting) {
    asnPendingDeptRow = row; let sub = row.subject; let yearStr = Math.ceil(parseInt(asnCurrentSem) / 2).toString();
    let students = asnStudentsByYear[yearStr]; let uniqueDepts = new Set(); let studentToDept = {};
    students.forEach(s => {
        let isEnrolled = false;
        if(s.enrolledSubjects) { let semKey = "Semester_" + asnCurrentSem; let semSpace = "Semester " + asnCurrentSem; let map = s.enrolledSubjects[semKey] || s.enrolledSubjects[semSpace] || s.enrolledSubjects[asnCurrentSem]; if(map) { Object.values(map).forEach(v => { if(v.toString().trim() === sub.trim()) isEnrolled = true; }); } }
        if (isEnrolled) { let d = (s.Department || s.department || "Unknown").trim(); uniqueDepts.add(d); studentToDept[s.id] = d; }
    });
    if (uniqueDepts.size === 0) { showRcToast("No students enrolled in this subject."); return; }

    getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", sub))).then(snap => {
        let existingMap = {}; let existCount = snap.size;
        snap.forEach(d => { let bName = d.data().batchName; (d.data().studentIDs || []).forEach(sid => { if(studentToDept[sid]) existingMap[studentToDept[sid]] = bName; }); });
        
        let drop = document.getElementById("dsBatchCount"); drop.innerHTML = `<option value="1">1 Batch (Unified)</option><option value="2">2 Batches</option><option value="3">3 Batches</option><option value="4">4 Batches</option><option value="5">5 Batches</option><option value="6">6 Batches</option>`;
        let targetCount = existCount > 0 ? existCount : 2; if(isDeleting && targetCount > 1) targetCount--; drop.value = targetCount;

        const renderDepts = () => {
            let count = parseInt(drop.value); let html = "";
            Array.from(uniqueDepts).forEach(d => {
                let opts = count === 1 ? `<option>Unified Class</option>` : Array.from({length:count}, (_,i)=>`<option value="Batch ${i+1}">Batch ${i+1}</option>`).join('') + `<option value="Exclude">Exclude</option>`;
                html += `<div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px 15px; border-radius:10px; border:1px solid #e2e8f0;">
                    <span style="font-weight:bold; color:#475569; font-size:13px;">${d.replace('DEPT_','')}</span>
                    <select class="ds-dept-select" data-dept="${d}" style="padding:6px 10px; border-radius:8px; border:1px solid #cbd5e1; outline:none; font-family:'Poppins'; font-size:12px; font-weight:bold; color:var(--text-green);" ${count===1?'disabled':''}>${opts}</select>
                </div>`;
            });
            document.getElementById("dsDeptList").innerHTML = html;
            if(count > 1) { document.querySelectorAll(".ds-dept-select").forEach(s => { let d = s.dataset.dept; if(existingMap[d]) { let idx = Array.from(s.options).findIndex(o=>o.value===existingMap[d]); if(idx>=0) s.selectedIndex = idx; } }); }
        };
        drop.onchange = renderDepts; renderDepts();
        document.getElementById("btnConfirmDeptSplit").onclick = () => ASN_ConfirmDeptSplit(sub, uniqueDepts, studentToDept);
        document.getElementById("deptSplitOverlay").classList.add("active");
    });
}

async function ASN_ConfirmDeptSplit(subject, uniqueDepts, studentToDept) {
    let totalBatches = parseInt(document.getElementById("dsBatchCount").value); 
    let cleanSub = subject.replace(/\s+/g, '').replace(/\//g, '');
    
    if (totalBatches > 1) {
        let selectedBatches = new Set();
        document.querySelectorAll(".ds-dept-select").forEach(s => {
            if (s.value !== "Exclude") selectedBatches.add(s.value);
        });
        
        for (let i = 1; i <= totalBatches; i++) {
            if (!selectedBatches.has(`Batch ${i}`)) {
                showRcToast(`⚠️ Please assign at least one department to Batch ${i}!`);
                return;
            }
        }
    }

    document.getElementById("deptSplitOverlay").classList.remove("active"); 
    showRcToast("Saving configurations...");
    
    if (totalBatches === 1) {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", subject)));
        const wb = writeBatch(db); snap.forEach(d => wb.delete(d.ref)); await wb.commit();
        asnActiveRows = asnActiveRows.filter(r => !(r.period === asnPendingDeptRow.period && r.isSplit)); let mRow = asnActiveRows.find(r => r.period === asnPendingDeptRow.period); if(mRow) { mRow.isSplit = false; mRow.splitIndex = 0; }
        ASN_RenderLayout(); return;
    }

    let batchMap = {}; for(let i=1; i<=totalBatches; i++) batchMap[`Batch ${i}`] = [];
    document.querySelectorAll(".ds-dept-select").forEach(s => { let val = s.value; if(val !== "Exclude") { Object.keys(studentToDept).forEach(sid => { if(studentToDept[sid] === s.dataset.dept) batchMap[val].push(sid); }); } });

    const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", subject)));
    const wb = writeBatch(db); snap.forEach(d => wb.delete(d.ref));
    for(let i=1; i<=totalBatches; i++) { wb.set(doc(db, "colleges", currentCollegeID, "subject_batches", `BATCH_Sem${asnCurrentSem}_${cleanSub}_Batch${i}`), { batchName: `Batch ${i}`, subjectName: subject, semester: asnCurrentSem, studentIDs: batchMap[`Batch ${i}`] }, {merge:true}); }
    await wb.commit();

    let existingCount = asnActiveRows.filter(r => r.period === asnPendingDeptRow.period).length;
    if (totalBatches > existingCount) { for(let i=existingCount; i<totalBatches; i++) asnActiveRows.push({ id: `r_${asnPendingDeptRow.period}_${i}_${Date.now()}`, period: asnPendingDeptRow.period, splitIndex: i, isSplit: true, category: asnPendingDeptRow.category, subject: subject, teacher: "", teacherID: "", room: "" }); }
    else if (totalBatches < existingCount) { asnActiveRows = asnActiveRows.filter(r => r.period !== asnPendingDeptRow.period || r.splitIndex < totalBatches); }
    ASN_RenderLayout(); showRcToast(`Saved as ${totalBatches} batches!`);
}

async function ASN_SaveAll() {
    let btn = document.getElementById("btnAsnSave"); btn.innerText = "Saving..."; btn.disabled = true;
    let tMap = {}; let conflict = false;
    asnActiveRows.forEach(r => {
        if(r.subject && r.teacher && r.teacher !== "Unassigned") {
            if(!tMap[r.period]) tMap[r.period] = {};
            if(tMap[r.period][r.teacher]) { let eSub = tMap[r.period][r.teacher]; let isVac3 = r.subject.toUpperCase().includes("VAC3") || r.category.toUpperCase().includes("VAC3"); if(!isVac3 || eSub !== r.subject) conflict = true; }
            else tMap[r.period][r.teacher] = r.subject;
        }
    });
    if(conflict) { showRcToast("⚠️ Save Failed: Teacher assigned multiple times in same period!"); btn.innerText = "Save Timetable"; btn.disabled = false; return; }

    const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", asnCurrentSem), where("day", "==", asnSelectedDay), where("departmentID", "==", "DEPT_General")));
    const wb = writeBatch(db); snap.forEach(d => wb.delete(d.ref));

    asnActiveRows.forEach(r => {
        if(r.subject && r.teacher && r.teacher !== "Unassigned") {
            let safeSubj = r.subject.replace(/\s+/g, '').replace(/\//g, ''); let sIdx = r.isSplit ? r.splitIndex.toString() : "0";
            let isCom = !asnActiveRows.some(x => x.period === r.period && x.isSplit);
            wb.set(doc(db, "colleges", currentCollegeID, "timetable_allocations", `Sem${asnCurrentSem}_${asnSelectedDay}_P${r.period}_${sIdx}_${safeSubj}`), {
                semester: asnCurrentSem, day: asnSelectedDay, period: r.period.toString(), category: r.category, subjectName: r.subject, teacherName: r.teacher, teacherID: r.teacherID, departmentID: "DEPT_General", room: r.room, isCommon: isCom, splitIndex: isCom ? null : sIdx
            }, {merge:true});
        }
    });
    await wb.commit(); showRcToast("Successfully Saved General Timetable!"); btn.innerText = "Save Timetable"; btn.disabled = false;
    switchView(views.timetable); 
    TT_LoadTimetableForDay();
}

// ==========================================
// DATA UPLOAD MANAGER & PARSER
// ==========================================
const csvSplitter = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

const DataParser = {
    isValidStudentFormat: (header) => {
        if (!header) return false;
        let h = header.toLowerCase();
        return h.includes("roll") || h.includes("register") || h.includes("sl no");
    },
    isValidSubjectFormat: (header) => {
        if (!header) return false;
        let h = header.toLowerCase();
        let hasSubject = h.includes("code") && (h.includes("subject") || h.includes("name"));
        let hasStudent = h.includes("roll") || h.includes("register") || h.includes("sl no");
        let hasCalendar = h.includes("date") || h.includes("working");
        return hasSubject && !hasStudent && !hasCalendar;
    },
    isValidCalendarFormat: (header) => {
        if (!header) return false;
        let h = header.toLowerCase();
        let hasCalendar = h.includes("date") || h.includes("event") || h.includes("working");
        let hasStudent = h.includes("roll") || h.includes("register");
        return hasCalendar && !hasStudent;
    },
    parseStudents: (lines) => {
        let students = [];
        const spellFixer = { "botony": "Botany", "computerscience": "Computer Science", "maths": "Mathematics", "commerce": "Commerce", "economics": "Economics" };
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            let row = lines[i].split(csvSplitter).map(v => v.trim().replace(/^"|"$/g, ''));
            if (row.length < 6) continue;
            let rawDept = row[3]; let courseType = row[5];
            let finalDept = generateDeptName(rawDept, courseType, spellFixer);
            students.push({ SLNumber: row[0], RollNumber: row[1], Name: row[2].replace(/\./g, " "), Department: finalDept, Year: row[4], CourseType: courseType });
        }
        return students;
    },
    parseSubjects: (lines) => {
        let subjects = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            let row = lines[i].split(csvSplitter).map(v => v.trim().replace(/^"|"$/g, ''));
            if (row.length < 5) continue;
            let code = row[0]; let name = row[1]; let type = row[2].toUpperCase().trim(); let dept = row[3];
            let sems = [];
            for (let s = 4; s < row.length; s++) { let val = row[s].toUpperCase().trim(); if (val && val !== "NIL") sems.push(val); }
            if (type.includes("MJD")) {
                if (sems.includes("4") || sems.includes("IV")) type = "MJD 4";
                else if (sems.includes("5") || sems.includes("V")) type = "MJD 5";
                else if (sems.includes("6") || sems.includes("VI")) type = "MJD 6";
            }
            subjects.push({ code: code, name: name, type: type, department: dept, semester: sems.join(","), search_key: name.toLowerCase(), isElective: (type === "MLD" || type === "VAC" || type === "SEC") });
        }
        return subjects;
    },
    parseCalendar: (lines) => {
        let workingMap = {}; let nonWorkingMap = {}; let oddStart = "", oddEnd = "", evenStart = "", evenEnd = "";
        let currentYear = new Date().getFullYear(); let currentMonth = 0; let detectedAcademicYear = "";
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            let row = lines[i].split(csvSplitter).map(v => v.trim().replace(/^"|"$/g, ''));
            if (row.length < 3) continue;
            let colDate = row[0]; let colEvent = row.length > 2 ? row[2] : ""; let colWork = row.length > 3 ? row[3] : "";
            let monthMatch = colEvent.match(/^([a-z]+)[\s\-](\d{2,4})$/i);
            if (monthMatch) {
                let mStr = monthMatch[1].toLowerCase().substring(0,3); currentMonth = monthNames.indexOf(mStr) + 1;
                let yStr = monthMatch[2]; currentYear = yStr.length === 2 ? 2000 + parseInt(yStr) : parseInt(yStr);
                if (!detectedAcademicYear) detectedAcademicYear = `${currentYear}-${currentYear + 1}`;
                continue;
            }
            if (currentMonth > 0 && !isNaN(parseInt(colDate))) {
                let day = parseInt(colDate); let fullDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                let eventUpper = colEvent.toUpperCase();
                if (eventUpper.includes("START OF ODD")) oddStart = fullDate; else if (eventUpper.includes("END OF ODD")) oddEnd = fullDate; else if (eventUpper.includes("START OF EVEN")) evenStart = fullDate; else if (eventUpper.includes("END OF EVEN")) evenEnd = fullDate;
                let isWorking = colWork && !isNaN(parseInt(colWork));
                if (isWorking) workingMap[fullDate] = "Regular Working Day"; else nonWorkingMap[fullDate] = colEvent ? colEvent : "Holiday/Weekend";
            }
        }
        let currentSemType = "Odd"; let today = new Date().toISOString().split('T')[0];
        if (evenStart && evenEnd && today >= evenStart && today <= evenEnd) currentSemType = "Even";
        return { workingMap, nonWorkingMap, detectedAcademicYear, oddStart, oddEnd, evenStart, evenEnd, currentSemType };
    }
};

function generateDeptName(raw, courseType, spellFixer) {
    let input = raw.trim(); let cType = courseType.toUpperCase(); let isPG = cType.includes("PG") || cType.includes("POST"); let detectedPrefix = "";
    if (/\b(BSc|MSc|B\.Sc|M\.Sc)\b/i.test(input)) detectedPrefix = isPG ? "MSc" : "BSc";
    else if (/\b(BCom|MCom|B\.Com|M\.Com)\b/i.test(input)) detectedPrefix = isPG ? "MCom" : "BCom";
    else if (/\b(BA|MA|B\.A|M\.A)\b/i.test(input)) detectedPrefix = isPG ? "MA" : "BA";
    else if (/\b(BBA|MBA|B\.B\.A|M\.B\.A)\b/i.test(input)) detectedPrefix = isPG ? "MBA" : "BBA";
    else if (/\b(BCA|MCA|B\.C\.A|M\.C\.A)\b/i.test(input)) detectedPrefix = isPG ? "MCA" : "BCA";
    let core = input.replace(/^(MSc|BSc|MA|BA|BCom|MCom|BBA|BCA|B\.Sc|M\.Sc|B\.A|M\.A|B\.Com|M\.Com|B\.B\.A|B\.C\.A)(?=\s|$)\s*/i, "").trim(); core = core.replace(/^[.\s-]+/, "");
    let lowerCore = core.toLowerCase().replace(/\s+/g, '');
    if (spellFixer[lowerCore]) core = spellFixer[lowerCore]; else core = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
    let finalPrefix = detectedPrefix;
    if (!finalPrefix) {
        if (core.includes("Commerce") || core.includes("Account")) finalPrefix = isPG ? "MCom" : "BCom";
        else if (core.includes("Business") || core.includes("Manage")) finalPrefix = isPG ? "MBA" : "BBA";
        else if (core.includes("Application") || core.includes("Computing")) finalPrefix = isPG ? "MCA" : "BCA";
        else if (/(logy|ics|try|math|physics|science|biotech|nature|geo|electronics|botany)$/i.test(core)) finalPrefix = isPG ? "MSc" : "BSc";
        else finalPrefix = isPG ? "MA" : "BA";
    }
    return `${finalPrefix} ${core}`;
}

let pendingUploadType = ""; 
let pendingUploadData = null;

function handleFileSelect(event, type) {
    let file = event.target.files[0];
    if (!file) return;
    
    showRcToast(`Reading ${type} file...`);
    
    let reader = new FileReader();
    reader.onload = function(e) {
        let lines = e.target.result.split(/\r?\n/);
        if(lines.length < 2) { showRcToast("❌ Error: File is empty!"); return; }
        
        let header = lines[0];
        let isValid = false;
        
        if (type === "STUDENTS") isValid = DataParser.isValidStudentFormat(header);
        else if (type === "SUBJECTS") isValid = DataParser.isValidSubjectFormat(header);
        else if (type === "CALENDAR") isValid = DataParser.isValidCalendarFormat(header);

        if (!isValid) {
            showRcToast(`❌ Error: Invalid ${type} File Format!`);
            return;
        }

        if (type === "STUDENTS") pendingUploadData = DataParser.parseStudents(lines);
        else if (type === "SUBJECTS") pendingUploadData = DataParser.parseSubjects(lines);
        else if (type === "CALENDAR") pendingUploadData = DataParser.parseCalendar(lines);

        pendingUploadType = type;
        
        let countMsg = (type === "CALENDAR") ? "Calendar Parsed" : `${pendingUploadData.length} Items Found`;
        showRcToast(`✅ Success: ${countMsg}. Waiting for PIN...`);
        
        document.getElementById("pinInput").value = "";
        document.getElementById("pinOverlay").classList.add("active");
        rcCurrentAction = "DATA_UPLOAD"; 
    };
    reader.readAsText(file);
    event.target.value = ""; 
}

document.getElementById('fileStudents').addEventListener('change', (e) => handleFileSelect(e, 'STUDENTS'));
document.getElementById('fileSubjects').addEventListener('change', (e) => handleFileSelect(e, 'SUBJECTS'));
document.getElementById('fileCalendar').addEventListener('change', (e) => handleFileSelect(e, 'CALENDAR'));

async function ExecuteDataUpload() {
    showRcToast(`🚀 Uploading ${pendingUploadType}... Please wait.`);
    
    if (pendingUploadType === "STUDENTS") {
        let students = pendingUploadData;
        let batchCount = 0; let total = 0;
        let wb = writeBatch(db);
        
        let deptMaxYears = {};
        students.forEach(s => { if(!deptMaxYears[s.Department] || parseInt(s.Year) > deptMaxYears[s.Department]) deptMaxYears[s.Department] = parseInt(s.Year); });
        for (let dept in deptMaxYears) {
            let deptID = "DEPT_" + dept.replace(/\s+/g, '');
            setDoc(doc(db, "colleges", currentCollegeID, "departments", deptID), { name: dept, maxYears: deptMaxYears[dept] }, {merge: true});
        }

        for (let i = 0; i < students.length; i++) {
            let s = students[i];
            wb.set(doc(db, "colleges", currentCollegeID, "students", s.RollNumber), {
                SLNumber: s.SLNumber, RollNumber: s.RollNumber, Name: s.Name, Department: s.Department, 
                DepartmentSearchable: s.Department.toLowerCase(), Year: s.Year, CourseType: s.CourseType, LastUpdated: serverTimestamp()
            }, {merge:true});
            wb.set(doc(db, "colleges", currentCollegeID, "public_lookup", s.RollNumber), { collegeID: currentCollegeID, name: s.Name }, {merge:true});
            
            batchCount += 2; total++;
            if (batchCount >= 480 || i === students.length - 1) {
                await wb.commit();
                wb = writeBatch(db); batchCount = 0;
            }
        }
        showRcToast(`✅ Success! ${total} Students Uploaded.`);
    } 
    else if (pendingUploadType === "SUBJECTS") {
        let subs = pendingUploadData;
        let batchCount = 0; let total = 0;
        let wb = writeBatch(db);
        
        for (let i = 0; i < subs.length; i++) {
            let s = subs[i];
            wb.set(doc(db, "colleges", currentCollegeID, "subjects", s.code), {
                code: s.code, name: s.name, type: s.type, department: s.department, semester: s.semester, 
                search_key: s.search_key, isElective: s.isElective, lastUpdated: serverTimestamp()
            }, {merge:true});
            
            batchCount++; total++;
            if (batchCount >= 450 || i === subs.length - 1) {
                await wb.commit();
                wb = writeBatch(db); batchCount = 0;
            }
        }
        sessionStorage.removeItem(`adhyora_subjects_${currentCollegeID}`); // 🚀 Clear local cache to force refresh
        showRcToast(`✅ Success! ${total} Subjects Synced.`);
    }
    else if (pendingUploadType === "CALENDAR") {
        let d = pendingUploadData;
        let year = d.detectedAcademicYear || "2025-2026";
        
        await setDoc(doc(db, "colleges", currentCollegeID, "workingDays", year), d.workingMap);
        await setDoc(doc(db, "colleges", currentCollegeID, "nonWorkingDays", year), d.nonWorkingMap);
        
        await setDoc(doc(db, "colleges", currentCollegeID), {
            currentSemesterType: d.currentSemType, currentAcademicYear: year, lastCalendarUpdate: serverTimestamp()
        }, {merge:true});

        await setDoc(doc(db, "colleges", currentCollegeID, "semesters", year), {
            year: year,
            oddSemester: { startDate: d.oddStart, endDate: d.oddEnd },
            evenSemester: { startDate: d.evenStart, endDate: d.evenEnd }
        });

        await setDoc(doc(db, "colleges", currentCollegeID, "system_flags", "calendar_version"), { updatedAt: serverTimestamp() }, {merge:true});
        showRcToast(`✅ Calendar Upload Successful! (${d.currentSemType} Sem)`);
    }
    
    pendingUploadData = null;
}

// ==========================================
// YEAR UPDATER & PROMOTION ENGINE
// ==========================================
document.getElementById("btnOpenPromote").addEventListener("click", () => {
    document.getElementById("promoteWarningOverlay").classList.add("active");
});

document.getElementById("btnPromoteProceed").addEventListener("click", () => {
    document.getElementById("promoteWarningOverlay").classList.remove("active");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinOverlay").classList.add("active");
    rcCurrentAction = "PROMOTE_STUDENTS"; 
});

async function ExecuteSemesterPromotion() {
    showRcToast("Analyzing Departments...");
    
    let deptMaxYears = {};
    const deptSnap = await getDocs(collection(db, "colleges", currentCollegeID, "departments"));
    deptSnap.forEach(d => {
        let name = d.data().name || d.id.replace("DEPT_", "");
        deptMaxYears[name] = d.data().maxYears ? parseInt(d.data().maxYears) : 3;
    });

    const stuSnap = await getDocs(collection(db, "colleges", currentCollegeID, "students"));
    if (stuSnap.empty) { showRcToast("No students found."); return; }

    showRcToast(`Promoting ${stuSnap.size} Students...`);

    let wb = writeBatch(db);
    let batchCount = 0; let promoted = 0; let graduated = 0;
    let currentRealYear = new Date().getFullYear();
    let alumniBatchName = "Alumni_" + currentRealYear;

    for (let i = 0; i < stuSnap.docs.length; i++) {
        let docSnap = stuSnap.docs[i];
        let data = docSnap.data();
        if (!data.Department) continue;

        let deptName = data.Department;
        let rawYear = data.Year ? data.Year.toString() : "1";
        if (rawYear.startsWith("Alumni")) continue;

        let currentSem = 1;
        if (data.currentSemester) {
            currentSem = parseInt(data.currentSemester);
        } else {
            let yearNum = parseInt(rawYear.replace(/\D/g, '')) || 1;
            // 🚨 THE FIX: Uses the global collegeSemesterType instead of hardcoding to Odd!
            currentSem = (collegeSemesterType === "Odd") ? (yearNum * 2) - 1 : (yearNum * 2);
        }

        let maxYears = deptMaxYears[deptName] || 3;
        let maxSemesters = maxYears * 2;

        let updates = {};
        if (currentSem >= maxSemesters) {
            updates.Year = alumniBatchName;
            updates.status = "Graduated";
            updates.GraduatedDate = serverTimestamp();
            graduated++;
        } else {
            let newSem = currentSem + 1;
            let newYear = Math.ceil(newSem / 2);
            updates.currentSemester = newSem;
            updates.Year = newYear.toString();
            promoted++;
        }

        wb.update(docSnap.ref, updates);
        batchCount++;

        if (batchCount >= 450 || i === stuSnap.docs.length - 1) {
            await wb.commit();
            wb = writeBatch(db);
            batchCount = 0;
        }
    }
    
    showRcToast(`✅ Success! Promoted: ${promoted} | Graduated: ${graduated}`);
}

// ==========================================
// EXPORT DATA ENGINE
// ==========================================
let expAllDepts = [];

document.getElementById("btnOpenExport").addEventListener("click", async () => {
    document.getElementById("exportOverlay").classList.add("active");
    
    const snap = await getDocs(collection(db, "colleges", currentCollegeID, "departments"));
    expAllDepts = [];
    snap.forEach(d => {
        let name = d.data().name || d.id.replace("DEPT_", "");
        let myrs = d.data().maxYears ? parseInt(d.data().maxYears) : 3;
        expAllDepts.push({ name: name, maxYears: myrs });
    });
    
    let maxOverall = Math.max(4, ...expAllDepts.map(d => d.maxYears));
    let yDrop = document.getElementById("expYearDrop");
    yDrop.innerHTML = "";
    for(let i=1; i<=maxOverall; i++) yDrop.innerHTML += `<option value="${i}">${i} Year</option>`;
    
    ExpFilterDepts(1);
});

document.getElementById("expYearDrop").addEventListener("change", (e) => {
    ExpFilterDepts(parseInt(e.target.value));
});

function ExpFilterDepts(selectedYear) {
    let dDrop = document.getElementById("expDeptDrop");
    dDrop.innerHTML = `<option value="All">All Departments</option>`;
    
    let validDepts = expAllDepts.filter(d => d.maxYears >= selectedYear).sort((a,b) => a.name.localeCompare(b.name));
    validDepts.forEach(d => {
        dDrop.innerHTML += `<option value="${d.name}">${d.name}</option>`;
    });

    document.getElementById("btnExecuteExport").disabled = (validDepts.length === 0);
}

document.getElementById("btnExecuteExport").addEventListener("click", async () => {
    let btn = document.getElementById("btnExecuteExport");
    btn.innerText = "Processing..."; btn.disabled = true;

    let type = parseInt(document.getElementById("expDataType").value);
    let year = document.getElementById("expYearDrop").value;
    let deptSel = document.getElementById("expDeptDrop").value;

    let targetSems = [((year * 2) - 1).toString(), (year * 2).toString()];
    let deptsToProcess = deptSel === "All" ? expAllDepts.filter(d => d.maxYears >= year).map(d => d.name) : [deptSel];

    try {
        if (type === 0 || type === 1) {
            let masterCSV = "";
            for (let i = 0; i < deptsToProcess.length; i++) {
                let dName = deptsToProcess[i];
                showRcToast(`Fetching ${dName} (${i+1}/${deptsToProcess.length})...`);
                
                let sSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Department", "==", dName), where("Year", "==", year.toString())));
                let students = sSnap.docs;

                if (students.length > 0) {
                    masterCSV += `\n########################################\n### DEPARTMENT: ${dName.toUpperCase()} ###\n########################################\n`;
                    for (let sem of targetSems) {
                        if (type === 0) masterCSV += await GenerateMarksCSV(students, sem);
                        else masterCSV += await GenerateStatsCSV(students, sem);
                    }
                }
            }
            let pfx = deptSel === "All" ? "All" : deptSel.replace(/\s+/g, '');
            let ftype = type === 0 ? "Marks" : "AttStats";
            DownloadCSV(masterCSV, `${pfx}_${ftype}_Year${year}.csv`);
        } 
        else if (type === 2) {
            showRcToast("Fetching Attendance Logs...");
            let logsRef = collection(db, "colleges", currentCollegeID, "attendance");
            let logsData = [];
            for (let sem of targetSems) {
                let snap = await getDocs(query(logsRef, where("semester", "==", `Semester ${sem}`))); 
                snap.forEach(d => logsData.push({ id: d.id, ...d.data() }));
                let snap2 = await getDocs(query(logsRef, where("semester", "==", `Semester_${sem}`))); 
                snap2.forEach(d => logsData.push({ id: d.id, ...d.data() }));
            }

            for (let i = 0; i < deptsToProcess.length; i++) {
                let dName = deptsToProcess[i];
                showRcToast(`Processing Logs: ${dName} (${i+1}/${deptsToProcess.length})...`);
                let sSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Department", "==", dName), where("Year", "==", year.toString())));
                let students = sSnap.docs;

                if (students.length > 0) {
                    let logCSV = "Date,Semester,Roll No,Name,P1,P2,P3,P4,P5,P6,Status\n";
                    logCSV += GenerateLogsCSV(students, logsData);
                    DownloadCSV(logCSV, `${dName.replace(/\s+/g, '')}_Logs_Year${year}.csv`);
                }
            }
        }
        showRcToast("✅ Export Complete!");
    } catch (e) {
        showRcToast("❌ Export Failed!");
        console.error(e);
    }
    
    document.getElementById("exportOverlay").classList.remove("active");
    btn.innerText = "Download CSV"; btn.disabled = false;
});

async function GenerateMarksCSV(students, sem) {
    let semKey = `Semester ${sem}`;
    let globalData = {}; 
    
    for (let docSnap of students) {
        let markSnap = await getDoc(doc(db, "colleges", currentCollegeID, "students", docSnap.id, "nep_marks", semKey));
        if (markSnap.exists()) {
            let data = markSnap.data();
            for (let subject in data) {
                for (let exam in data[subject]) {
                    if (!globalData[exam]) globalData[exam] = {};
                    if (!globalData[exam][subject]) globalData[exam][subject] = {};
                    globalData[exam][subject][docSnap.id] = data[subject][exam];
                }
            }
        }
    }

    let csv = `\n========== SEMESTER ${sem} ==========\n`;
    if (Object.keys(globalData).length === 0) return csv + "No Marks Data Uploaded.\n";

    for (let exam of Object.keys(globalData).sort()) {
        csv += `\n===== EXAM: ${exam} =====,,,,,,,\n`;
        for (let sub of Object.keys(globalData[exam]).sort()) {
            csv += `--- ${sub} ---,,,,,,,\nRoll No,Name,Obtained,Max,Test,Assign,Att,Status\n`;
            for (let stu of students) {
                if (globalData[exam][sub][stu.id]) {
                    let s = globalData[exam][sub][stu.id];
                    csv += `${stu.id},${stu.data().Name || ""},${s.total||0},${s.max||50},${s.test||0},${s.assign||0},${s.att||0},Present\n`;
                } else {
                    csv += `${stu.id},${stu.data().Name || ""},Nil,--,--,--,--,Not Entered\n`;
                }
            }
        }
    }
    return csv;
}

async function GenerateStatsCSV(students, sem) {
    let semKey = `Semester_${sem}`;
    let grouped = {};
    
    for (let stu of students) {
        let stats = stu.data().attendance_stats;
        if (stats && stats[semKey]) {
            for (let sub in stats[semKey]) {
                if (sub === "Strict_Global") continue;
                if (!grouped[sub]) grouped[sub] = [];
                let s = stats[semKey][sub];
                let p = s.present || 0; let t = s.total || 0; let pct = t > 0 ? (p/t)*100 : 0;
                grouped[sub].push({ id: stu.id, name: stu.data().Name || "", p: p, t: t, pct: pct.toFixed(2) });
            }
        }
    }

    let csv = `\n========== SEMESTER ${sem} STATS ==========\n`;
    for (let sub of Object.keys(grouped).sort()) {
        csv += `\n--- SUBJECT: ${sub} ---,,,,\nRoll No,Name,Present,Total,Percentage\n`;
        for (let row of grouped[sub].sort((a,b) => a.id.localeCompare(b.id))) {
            csv += `${row.id},${row.name},${row.p},${row.t},${row.pct}%\n`;
        }
    }
    return csv;
}

function GenerateLogsCSV(students, logsData) {
    let csv = "";
    let groupedLogs = {};
    logsData.forEach(l => {
        let parts = l.id.split('_'); 
        let key = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : l.id;
        if (!groupedLogs[key]) groupedLogs[key] = [];
        groupedLogs[key].push(l);
    });

    for (let key in groupedLogs) {
        let kParts = key.split('_'); let dateStr = kParts[0]; let semStr = kParts.length > 1 ? kParts[1] : "";
        let dailyData = groupedLogs[key];

        for (let stu of students) {
            let r = stu.id;
            let p1="-", p2="-", p3="-", p4="-", p5="-", p6="-";

            dailyData.forEach(d => {
                if (d.period_1 && d.period_1.attendance && d.period_1.attendance[r] !== undefined) p1 = d.period_1.attendance[r] ? "P" : "A";
                if (d.period_2 && d.period_2.attendance && d.period_2.attendance[r] !== undefined) p2 = d.period_2.attendance[r] ? "P" : "A";
                if (d.period_3 && d.period_3.attendance && d.period_3.attendance[r] !== undefined) p3 = d.period_3.attendance[r] ? "P" : "A";
                if (d.period_4 && d.period_4.attendance && d.period_4.attendance[r] !== undefined) p4 = d.period_4.attendance[r] ? "P" : "A";
                if (d.period_5 && d.period_5.attendance && d.period_5.attendance[r] !== undefined) p5 = d.period_5.attendance[r] ? "P" : "A";
                if (d.period_6 && d.period_6.attendance && d.period_6.attendance[r] !== undefined) p6 = d.period_6.attendance[r] ? "P" : "A";
            });

            let status = (p1==="P"||p2==="P"||p3==="P"||p4==="P"||p5==="P"||p6==="P") ? "Present" : "Absent";
            csv += `${dateStr},${semStr},${r},${stu.data().Name || ""},${p1},${p2},${p3},${p4},${p5},${p6},${status}\n`;
        }
        csv += ",,,,,,,,,,\n"; 
    }
    return csv;
}

function DownloadCSV(csvContent, fileName) {
    let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    let url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// SUBJECT LIST MANAGER (RAM INFINITE SCROLL)
// ==========================================
let subLoaded = false;
let subCachedData = [];
let subTargetId = "";
let subListener = null;
let subjectRenderLimit = 50; // Start with 50

function SUB_Init() {
    if (subLoaded) return;
    subLoaded = true;
    if (subListener) subListener(); 

    subListener = onSnapshot(collection(db, "colleges", currentCollegeID, "subjects"), (snap) => {
        subCachedData = [];
        snap.forEach(doc => {
            let d = doc.data();
            subCachedData.push({
                code: doc.id,
                name: d.name || d.Name || "",
                type: d.type || d.Type || "",
                department: d.department || d.Department || "",
                semester: d.semester || d.Semester || ""
            });
        });
        
        subCachedData.sort((a,b) => {
            let dCmp = a.department.localeCompare(b.department);
            if (dCmp !== 0) return dCmp;
            return a.semester.localeCompare(b.semester);
        });

        document.getElementById("subTotalCount").innerText = `Total: ${subCachedData.length}`;
        SUB_RenderList(document.getElementById("subSearchInput").value);
    });
}

function SUB_RenderList(searchTerm = "") {
    let container = document.getElementById("subListContainer");
    let filtered = subCachedData;
    
    if (searchTerm) {
        let q = searchTerm.toLowerCase();
        filtered = subCachedData.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.type.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="no-data-text">${searchTerm ? "No subjects match your search." : "No subjects available. Upload Master CSV."}</div>`;
        return;
    }

    // 🚀 RAM SCROLL: Slice the array
    let renderBatch = filtered.slice(0, subjectRenderLimit);
    let oldScroll = container.scrollTop;

    let html = "";
    renderBatch.forEach(s => {
        let tUp = s.type.toUpperCase();
        let badgeClass = "sub-other";
        if (tUp === "CORE") badgeClass = "sub-core";
        else if (tUp === "ELECTIVE") badgeClass = "sub-elec";
        else if (tUp.includes("MLD") || tUp.includes("VAC")) badgeClass = "sub-mld";

        html += `
        <div class="sub-card ${badgeClass}">
            <div class="sub-info-col">
                <div class="sub-badge">${s.type}</div>
                <div class="sub-title">${s.name}</div>
                <div class="sub-code">${s.code}</div>
                <div class="sub-meta"><i class="fas fa-building"></i> ${s.department} &nbsp;•&nbsp; <i class="fas fa-layer-group"></i> Sem ${s.semester}</div>
            </div>
            <div class="sub-actions">
                <button class="action-icon-btn" onclick="SUB_OpenEdit('${s.code}')"><i class="fas fa-pen"></i></button>
                <button class="action-icon-btn" style="color: #ef4444;" onclick="SUB_RequestDelete('${s.code}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
    container.scrollTop = oldScroll;
}

// Search Logic
document.getElementById("subSearchInput").addEventListener("input", debounce((e) => {
    subjectRenderLimit = 50; // Reset scroll limit on search
    SUB_RenderList(e.target.value.trim());
}, 250));

// 🚀 SCROLL DETECTOR
document.getElementById("subListContainer").addEventListener("scroll", (e) => {
    let el = e.target;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 100) {
        let searchTerm = document.getElementById("subSearchInput").value.trim();
        if (subjectRenderLimit < subCachedData.length) {
            subjectRenderLimit += 50;
            SUB_RenderList(searchTerm);
        }
    }
});
// 🚀 OPTIMIZATION 7: Debounce Subject Search
document.getElementById("subSearchInput").addEventListener("input", debounce((e) => SUB_RenderList(e.target.value.trim()), 250));

window.SUB_OpenEdit = (code) => {
    let data = subCachedData.find(s => s.code === code);
    if(!data) return;
    subTargetId = code;

    document.getElementById("editSubCode").value = data.code;
    document.getElementById("editSubName").value = data.name;
    document.getElementById("editSubType").value = data.type;
    document.getElementById("editSubDept").value = data.department;
    document.getElementById("editSubSem").value = data.semester;

    document.getElementById("subjectEditOverlay").classList.add("active");
};

document.getElementById("btnSaveSubjectEdit").addEventListener("click", () => {
    document.getElementById("subjectEditOverlay").classList.remove("active");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinOverlay").classList.add("active");
    rcCurrentAction = "EDIT_SUBJECT"; 
});

async function SUB_ExecuteEdit() {
    showRcToast("Saving Subject...");
    let newCode = document.getElementById("editSubCode").value.trim();
    let name = document.getElementById("editSubName").value.trim();
    let type = document.getElementById("editSubType").value.trim();
    let dept = document.getElementById("editSubDept").value.trim();
    let sem = document.getElementById("editSubSem").value.trim();
    let oldCode = subTargetId;

    if(!newCode || !name) { showRcToast("Code and Name required!"); return; }

    let subRef = collection(db, "colleges", currentCollegeID, "subjects");
    let data = { 
        code: newCode, name: name, type: type, department: dept, semester: sem, 
        search_key: name.toLowerCase(), 
        isElective: (type.toUpperCase() === "MLD" || type.toUpperCase() === "VAC" || type.toUpperCase() === "SEC"), 
        lastUpdated: serverTimestamp() 
    };

    try {
        if (newCode !== oldCode) {
            let wb = writeBatch(db);
            wb.set(doc(subRef, newCode), data, {merge: true});
            wb.delete(doc(subRef, oldCode));
            await wb.commit();
        } else {
            await updateDoc(doc(subRef, oldCode), data);
        }
        sessionStorage.removeItem(`adhyora_subjects_${currentCollegeID}`); // 🚀 Clear Local Cache
        showRcToast("✅ Subject Updated Successfully!");
    } catch(e) { showRcToast("❌ Error updating subject."); }
}

window.SUB_RequestDelete = (code) => {
    let data = subCachedData.find(s => s.code === code);
    if(!data) return;
    subTargetId = code;

    document.getElementById("confirmIconTitle").innerHTML = '<i class="fas fa-trash"></i> Delete Subject';
    document.getElementById("confirmIconTitle").style.color = "#ef4444";
    document.getElementById("confirmText").innerHTML = `Are you sure you want to delete<br><b>${data.name} (${data.code})</b>?`;
    
    let btnYes = document.getElementById("btnConfirmYes");
    let newBtnYes = btnYes.cloneNode(true); btnYes.parentNode.replaceChild(newBtnYes, btnYes);
    newBtnYes.onclick = () => { 
        document.getElementById("confirmOverlay").classList.remove("active"); 
        document.getElementById("pinInput").value = "";
        document.getElementById("pinOverlay").classList.add("active");
        rcCurrentAction = "DELETE_SUBJECT"; 
    };
    
    document.getElementById("confirmOverlay").classList.add("active");
};

async function SUB_ExecuteDelete() {
    showRcToast("Deleting Subject...");
    try {
        await deleteDoc(doc(db, "colleges", currentCollegeID, "subjects", subTargetId));
        sessionStorage.removeItem(`adhyora_subjects_${currentCollegeID}`); // 🚀 Clear Local Cache
        showRcToast("✅ Subject Deleted.");
    } catch(e) { showRcToast("❌ Error deleting subject."); }
}

// ==========================================
// STUDENTS SUBJECTS REASSIGNMENT MANAGER
// ==========================================
let ssLoaded = false; 
let ssCurrentSem = "1"; 
let ssStudentsRamCache = []; 
let ssActiveSubjects = [];
let ssSelectedStudents = new Set();

function SS_Init() {
    if (ssLoaded) return;
    ssLoaded = true;
    let dropSem = document.getElementById("ssSemDrop"); 
    let optionsHtml = "";
    let activeValue = "";
    
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((collegeSemesterType === "Odd" && isOdd) || (collegeSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); 
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    ssCurrentSem = activeValue;
    dropSem.value = ssCurrentSem;
    
    let newDropSem = dropSem.cloneNode(true); dropSem.parentNode.replaceChild(newDropSem, dropSem);
    newDropSem.addEventListener("change", (e) => { ssCurrentSem = e.target.value; SS_RefreshCategories(); });

    document.getElementById("ssCatDrop").addEventListener("change", SS_RefreshSubjects);
    document.getElementById("ssSubDrop").addEventListener("change", SS_FetchStudents);
    document.getElementById("btnOpenStuSubMove").addEventListener("click", SS_OpenMoveModal);
    document.getElementById("btnConfirmStuSubMove").addEventListener("click", SS_ConfirmMovePrep);

    if (subCachedData.length === 0) {
        getDocs(collection(db, "colleges", currentCollegeID, "subjects")).then(snap => {
            subCachedData = [];
            snap.forEach(doc => { let d = doc.data(); subCachedData.push({ code: doc.id, name: d.name || d.Name || "", type: d.type || d.Type || "", department: d.department || d.Department || "", semester: (d.semester || d.Semester || "").toString() }); });
            SS_RefreshCategories();
        });
    } else { SS_RefreshCategories(); }
}
function SS_RefreshCategories() {
    let types = new Set();
    subCachedData.forEach(sub => { let sems = sub.semester.split(',').map(s=>s.trim()); if (sems.includes(ssCurrentSem) && sub.type) types.add(sub.type.trim()); });
    let catDrop = document.getElementById("ssCatDrop");
    if (types.size === 0) catDrop.innerHTML = `<option value="">No Categories</option>`;
    else {
        let arr = Array.from(types).sort(); catDrop.innerHTML = `<option value="">Select Category</option>` + arr.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    SS_RefreshSubjects();
}

function SS_RefreshSubjects() {
    let cat = document.getElementById("ssCatDrop").value; let subDrop = document.getElementById("ssSubDrop");
    if (!cat) { subDrop.innerHTML = `<option value="">Select Subject</option>`; SS_ShowEmpty("Select a Category and Subject to view enrolled students."); return; }
    
    ssActiveSubjects = subCachedData.filter(s => s.semester.split(',').map(x=>x.trim()).includes(ssCurrentSem) && s.type.trim() === cat);
    if (ssActiveSubjects.length === 0) { subDrop.innerHTML = `<option value="">No Subjects</option>`; SS_ShowEmpty("No subjects found for this category."); } 
    else { subDrop.innerHTML = `<option value="">Select Subject</option>` + ssActiveSubjects.sort((a,b)=>a.name.localeCompare(b.name)).map(s => `<option value="${s.name}">${s.name}</option>`).join(''); SS_ShowEmpty("Select a Subject to view enrolled students."); }
}

function SS_ShowEmpty(msg) { 
    document.getElementById("ssListContainer").innerHTML = `<div class="no-data-text">${msg}</div>`; 
    document.getElementById("btnOpenStuSubMove").disabled = true; 
    ssSelectedStudents.clear();
}

async function SS_FetchStudents() {
    let cat = document.getElementById("ssCatDrop").value;
    let sub = document.getElementById("ssSubDrop").value;
    if (!sub || !cat) { SS_ShowEmpty("Select a valid Subject to view students."); return; }
    SS_ShowEmpty(`Loading students enrolled in ${sub}...`);
    
    ssStudentsRamCache = [];
    ssSelectedStudents.clear();

    let cleanSubFilter = sub.replace(/\s+/g, '').toLowerCase();
    let targetYear = Math.ceil(parseInt(ssCurrentSem) / 2).toString();

    try {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", targetYear)));
        
        let html = "";
        let count = 0;

        snap.forEach(docSnap => {
            let d = docSnap.data();
            if (!d.enrolledSubjects) return;

            let semMap = d.enrolledSubjects[`Semester_${ssCurrentSem}`] || d.enrolledSubjects[`Semester ${ssCurrentSem}`] || d.enrolledSubjects[ssCurrentSem];
            if (!semMap || !semMap[cat]) return;

            let stuSubClean = semMap[cat].toString().replace(/\s+/g, '').toLowerCase();
            
            if (stuSubClean === cleanSubFilter) {
                count++;
                let sName = d.Name || d.name || "Unknown";
                let sRoll = d.RollNumber || d.rollNumber || docSnap.id;
                let sDept = (d.Department || d.department || "Unknown Dept").replace("DEPT_", "");

                ssStudentsRamCache.push(docSnap.id);

                html += `
                <div class="ss-stu-card" id="card_${docSnap.id}" onclick="SS_ToggleStudentCard('${docSnap.id}')" style="display:flex; justify-content:space-between; align-items:center; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); cursor:pointer; transition:0.2s;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <input type="checkbox" id="chk_${docSnap.id}" class="ss-student-chk" data-sid="${docSnap.id}" style="width:18px; height:18px; accent-color:var(--brand-green); pointer-events:none;">
                        <div>
                            <div style="font-size:14px; font-weight:bold; color:var(--text-green);">${sName} <span style="font-size:12px; color:#94a3b8; font-weight:normal;">(${sRoll})</span></div>
                            <div style="font-size:12px; color:#64748b;">${sDept}</div>
                        </div>
                    </div>
                </div>`;
            }
        });

        if (count === 0) SS_ShowEmpty(`No students found enrolled in "${sub}".`);
        else document.getElementById("ssListContainer").innerHTML = html;

    } catch(e) { SS_ShowEmpty("Error loading students."); console.error(e); }
}

window.SS_ToggleStudentCard = (sid) => {
    let chk = document.getElementById(`chk_${sid}`);
    if (!chk) return;

    chk.checked = !chk.checked; 

    if (chk.checked) {
        ssSelectedStudents.add(sid);
        document.getElementById(`card_${sid}`).style.borderColor = "var(--brand-green)";
        document.getElementById(`card_${sid}`).style.backgroundColor = "rgba(74, 222, 128, 0.05)";
    } else {
        ssSelectedStudents.delete(sid);
        document.getElementById(`card_${sid}`).style.borderColor = "#e2e8f0";
        document.getElementById(`card_${sid}`).style.backgroundColor = "white";
    }

    let btn = document.getElementById("btnOpenStuSubMove");
    btn.disabled = ssSelectedStudents.size === 0;
    btn.innerHTML = ssSelectedStudents.size > 0 ? `<i class="fas fa-exchange-alt" style="margin-right: 8px;"></i> Move (${ssSelectedStudents.size})` : `<i class="fas fa-exchange-alt" style="margin-right: 8px;"></i> Move Selected`;
};

function SS_OpenMoveModal() {
    if (ssSelectedStudents.size === 0) return;
    let currentSub = document.getElementById("ssSubDrop").value;
    
    let targetDrop = document.getElementById("ssTargetSubDrop");
    targetDrop.innerHTML = "";
    
    let validTargets = ssActiveSubjects.filter(s => s.name !== currentSub);
    if (validTargets.length === 0) {
        showRcToast("No other subjects available in this category!");
        return;
    }

    validTargets.forEach(s => {
        targetDrop.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });

    document.getElementById("ssMoveTitleText").innerHTML = `Move <b style="color:var(--text-green);">${ssSelectedStudents.size} Student(s)</b><br>from <b>${currentSub}</b> to...?`;
    document.getElementById("stuSubMoveOverlay").classList.add("active");
}

function SS_ConfirmMovePrep() {
    document.getElementById("stuSubMoveOverlay").classList.remove("active");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinOverlay").classList.add("active");
    rcCurrentAction = "MOVE_STU_SUB"; 
}

async function SS_ExecuteMove() {
    if (ssSelectedStudents.size === 0) return;
    showRcToast(`Moving ${ssSelectedStudents.size} Students...`);

    let cat = document.getElementById("ssCatDrop").value;
    let oldSub = document.getElementById("ssSubDrop").value;
    let newSub = document.getElementById("ssTargetSubDrop").value;
    let semKey = `Semester_${ssCurrentSem}`;
    let semNum = ssCurrentSem;

    try {
        let newBatchSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", semNum), where("subjectName", "==", newSub)));
        let newBatches = [];
        newBatchSnap.forEach(d => { newBatches.push({ ref: d.ref, count: (d.data().studentIDs || []).length, incoming: [] }); });

        let oldBatchSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", semNum), where("subjectName", "==", oldSub)));
        let sidsArr = Array.from(ssSelectedStudents);

        let wb = writeBatch(db);
        let ops = 0;

        oldBatchSnap.forEach(d => {
            wb.update(d.ref, { studentIDs: arrayRemove(...sidsArr) });
            ops++;
        });

        if (newBatches.length > 0) {
            sidsArr.forEach(sid => {
                newBatches.sort((a,b) => a.count - b.count);
                newBatches[0].incoming.push(sid);
                newBatches[0].count++;
            });

            newBatches.forEach(b => {
                if (b.incoming.length > 0) {
                    wb.update(b.ref, { studentIDs: arrayUnion(...b.incoming) });
                    ops++;
                }
            });
        }

        for (let i = 0; i < sidsArr.length; i++) {
            let sid = sidsArr[i];
            let stuRef = doc(db, "colleges", currentCollegeID, "students", sid);
            
            let updates = {};
            updates[`enrolledSubjects.Semester_${ssCurrentSem}.${cat}`] = newSub;
            updates[`assigned_by.Semester_${ssCurrentSem}.${cat}`] = "Principal";
            updates[`assignment_timestamps.Semester_${ssCurrentSem}.${cat}`] = serverTimestamp();

            let sDoc = await getDoc(stuRef);
            if (sDoc.exists()) {
                let stats = sDoc.data().attendance_stats;
                if (stats && stats[semKey]) {
                    let semMap = stats[semKey];
                    let oldKey = Object.keys(semMap).find(k => k.replace(/\s+/g,'').toLowerCase() === oldSub.replace(/\s+/g,'').replace(/\//g,'-').replace(/\./g,'').toLowerCase());
                    
                    if (oldKey) {
                        updates[`attendance_stats.${semKey}.${oldKey}_DROPPED`] = semMap[oldKey];
                        updates[`attendance_stats.${semKey}.${oldKey}`] = deleteField();
                    }

                    let restKey = Object.keys(semMap).find(k => k.toLowerCase().endsWith("_dropped") && k.substring(0, k.length - 8).replace(/\s+/g,'').toLowerCase() === newSub.replace(/\s+/g,'').replace(/\//g,'-').replace(/\./g,'').toLowerCase());
                    if (restKey) {
                        updates[`attendance_stats.${semKey}.${restKey.substring(0, restKey.length - 8)}`] = semMap[restKey];
                        updates[`attendance_stats.${semKey}.${restKey}`] = deleteField();
                    }
                }
            }

            wb.update(stuRef, updates);
            ops++;

            if (ops >= 450) {
                await wb.commit();
                wb = writeBatch(db); ops = 0;
            }
        }
        await wb.commit();
        
        showRcToast("✅ Move Successful!");
        SS_FetchStudents(); 

    } catch(e) { showRcToast("❌ Error moving students."); console.error(e); }
}

// ==========================================
// EVENT REQUESTS & APPROVAL ENGINE
// ==========================================
let evtLoaded = false;
let evtCachedData = [];
let evtListener = null;

function EVT_Init() {
    if (evtLoaded) return;
    evtLoaded = true;
    if (evtListener) evtListener(); 

    evtListener = onSnapshot(query(collection(db, "colleges", currentCollegeID, "event_requests"), orderBy("submittedAt", "desc"), limit(100)), (snap) => {
        evtCachedData = [];
        snap.forEach(doc => { evtCachedData.push({ id: doc.id, ...doc.data() }); });
        
        document.getElementById("evtTotalCount").innerText = `Total: ${evtCachedData.length}`;
        EVT_RenderList(document.getElementById("evtSearchInput").value);
    });
}

function EVT_RenderList(searchTerm = "") {
    let container = document.getElementById("evtListContainer");
    let noData = document.getElementById("evtNoDataText");
    let filtered = evtCachedData;

    if (searchTerm) {
        let q = searchTerm.toLowerCase().trim();
        filtered = evtCachedData.filter(e => (e.eventName||"").toLowerCase().includes(q) || (e.teacherName||"").toLowerCase().includes(q) || (e.date||"").includes(q) || (e.semester||"").toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
        noData.style.display = "block"; noData.innerText = searchTerm ? `No requests match '${searchTerm}'.` : "No event requests found.";
        container.innerHTML = ""; container.appendChild(noData);
        return;
    }
    noData.style.display = "none";

    let html = "";
    filtered.forEach(e => {
        let isAcc = e.status === "Accepted";
        let statusHtml = `<span class="evt-status ${isAcc ? 'accepted' : 'pending'}">${isAcc ? 'ACCEPTED' : 'PENDING'}</span>`;
        let sList = e.studentIDs || [];
        let sidsJson = JSON.stringify(sList).replace(/"/g, '&quot;');
        
        html += `
        <div class="evt-card">
            <div class="evt-header" onclick="EVT_ToggleBody('${e.id}', ${sidsJson})">
                <div>
                    <div class="evt-title">${e.eventName || "Special Event"}</div>
                    <div class="evt-meta">Req: ${e.teacherName || "Unknown"} | ${e.date || ""} | Period ${e.period || 1}</div>
                </div>
                ${statusHtml}
            </div>
            <div class="evt-body" id="evt_body_${e.id}">
                ${!isAcc ? `<button id="btn_acc_${e.id}" style="width:100%; background:var(--brand-green); color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; margin-bottom:15px; box-shadow:0 4px 10px rgba(74, 222, 128, 0.3);" onclick="EVT_Accept('${e.id}')">Approve Event & Save Attendance</button>` : ''}
                <div id="evt_stu_${e.id}"><i>Loading students...</i></div>
            </div>
        </div>`;
    });
    
    container.innerHTML = html; container.appendChild(noData);
}

// 🚀 OPTIMIZATION 8: Debounce Event Search
document.getElementById("evtSearchInput").addEventListener("input", debounce((e) => EVT_RenderList(e.target.value.trim()), 250));

window.EVT_ToggleBody = async (id, sids) => {
    let body = document.getElementById(`evt_body_${id}`);
    let stuContainer = document.getElementById(`evt_stu_${id}`);
    
    let isOpening = !body.classList.contains("active");
    body.classList.toggle("active");

    if (isOpening && stuContainer.innerHTML.includes("Loading")) {
        if (sids.length === 0) { stuContainer.innerHTML = "No students attached."; return; }
        
        let fetchedStudents = [];
        for (let i = 0; i < sids.length; i += 30) {
            let chunk = sids.slice(i, i + 30);
            let sSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("__name__", "in", chunk)));
            sSnap.forEach(d => fetchedStudents.push({ id: d.id, ...d.data() }));
        }

        let html = "";
        fetchedStudents.forEach(s => {
            let dept = (s.Department || s.department || "Unknown").replace("DEPT_", "");
            html += `<div class="evt-student-row">
                <div><b style="color:var(--text-green); font-size:13px;">${s.Name || "Unknown"}</b> <span style="font-size:11px; color:#94a3b8;">(${s.RollNumber || s.id})</span></div>
                <div style="font-size:11px; color:#64748b; font-weight:600;">[${dept}]</div>
            </div>`;
        });
        stuContainer.innerHTML = html;
    }
};

window.EVT_Accept = async (id) => {
    let evt = evtCachedData.find(e => e.id === id); if (!evt) return;
    let btn = document.getElementById(`btn_acc_${id}`); btn.innerText = "Scanning & Saving..."; btn.disabled = true;
    showRcToast("Processing Heavy Transaction...");

    let sids = evt.studentIDs || [];
    if (sids.length === 0) return;

    try {
        let studentsBySem = {};
        for (let i = 0; i < sids.length; i += 30) {
            let chunk = sids.slice(i, i + 30);
            let sSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("__name__", "in", chunk)));
            sSnap.forEach(d => {
                let yStr = d.data().Year ? d.data().Year.toString() : "1";
                let yearNum = parseInt(yStr.replace(/\D/g, '')) || 1;
                let sem = (collegeSemesterType === "Odd") ? (yearNum * 2) - 1 : (yearNum * 2);
                if (!studentsBySem[sem]) studentsBySem[sem] = [];
                studentsBySem[sem].push(d.id);
            });
        }

        let dateStr = evt.date; let periodIndex = evt.period || "1"; let pKey = `period_${periodIndex}`;
        let todaySnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "attendance"), where("date", "==", dateStr)));
        
        let wb = writeBatch(db);
        let ops = 0;

        todaySnap.forEach(docSnap => {
            let dID = docSnap.id; if (dID.includes("GLOBAL") || dID.includes("EVENTS")) return;
            let d = docSnap.data();
            
            if (d[pKey] && d[pKey].attendance && d[pKey].subject) {
                let attMap = d[pKey].attendance; let subName = d[pKey].subject;
                let cleanSub = subName.replace(/\s+/g, '').replace(/\//g, '-').replace(/\./g, '');
                let semKey = d.semester.replace(" ", "_");

                sids.forEach(uid => {
                    if (attMap[uid] !== undefined) {
                        let wasPresent = attMap[uid];
                        
                        wb.update(docSnap.ref, {
                            [`${pKey}.attendance.${uid}`]: deleteField(),
                            [`${pKey}.stats.totalStudents`]: increment(-1),
                            [`${pKey}.stats.${wasPresent ? 'presentCount' : 'absentCount'}`]: increment(-1)
                        }); ops++;

                        let sRef = doc(db, "colleges", currentCollegeID, "students", uid);
                        let rUpdates = {};
                        rUpdates[`attendance_stats.${semKey}.${cleanSub}.total`] = increment(-1);
                        if (wasPresent) rUpdates[`attendance_stats.${semKey}.${cleanSub}.present`] = increment(-1);
                        wb.update(sRef, rUpdates); ops++;
                    }
                });
            }
        });

        for (let sem in studentsBySem) {
            let semDocKey = `Semester ${sem}`; let semKey = `Semester_${sem}`; let semName = `Semester${sem}`;
            let eventDocID = `${dateStr}_${semName}_EVENTS`; let globalDocID = `${dateStr}_${semName}_GLOBAL`;
            
            let gSnap = await getDoc(doc(db, "colleges", currentCollegeID, "attendance", globalDocID));
            let allStudentPeriods = gSnap.exists() && gSnap.data().student_periods ? gSnap.data().student_periods : {};
            let oldStrictScores = gSnap.exists() && gSnap.data().strict_scores_cache ? gSnap.data().strict_scores_cache : {};
            let newStrictScoresCache = { ...oldStrictScores };

            let attMap = {}; let eventDetailsMap = {}; let pCount = 0;
            
            studentsBySem[sem].forEach(uid => {
                attMap[uid] = true; eventDetailsMap[uid] = evt.eventName; pCount++;
                
                let sRef = doc(db, "colleges", currentCollegeID, "students", uid);
                let ups = {};
                ups[`attendance_stats.${semKey}.Events.present`] = increment(1);
                ups[`attendance_stats.${semKey}.Events.total`] = increment(1);

                let myPeriods = allStudentPeriods[uid] || {};
                myPeriods[`p${periodIndex}`] = true;
                allStudentPeriods[uid] = myPeriods;

                let morningLost = false; let eveningLost = false;
                [1,2,3].forEach(p => { if (myPeriods[`p${p}`] === false) morningLost = true; });
                [4,5,6].forEach(p => { if (myPeriods[`p${p}`] === false) eveningLost = true; });
                let newStrict = 0; if(!morningLost) newStrict += 0.5; if(!eveningLost) newStrict += 0.5;
                newStrictScoresCache[uid] = newStrict;

                let isNewDay = oldStrictScores[uid] === undefined;
                let oldStrict = isNewDay ? 0 : parseFloat(oldStrictScores[uid]);
                let delta = newStrict - oldStrict;

                if (delta !== 0) ups[`attendance_stats.${semKey}.Strict_Global.present`] = increment(delta);
                if (isNewDay) ups[`attendance_stats.${semKey}.Strict_Global.total`] = increment(1);

                wb.update(sRef, ups); ops++;
            });

            let eRef = doc(db, "colleges", currentCollegeID, "attendance", eventDocID);
            let periodPayload = { subject: "Special Events", category: "EVENT", markedByTeacherID: evt.teacherID, markedByTeacherName: evt.teacherName, timestamp: serverTimestamp(), stats: { totalStudents: pCount, presentCount: pCount, absentCount: 0 }, attendance: attMap, event_details: eventDetailsMap };
            let dayData = { [`period_${periodIndex}`]: periodPayload, date: dateStr, semester: semDocKey };
            wb.set(eRef, dayData, { merge: true }); ops++;

            let gRef = doc(db, "colleges", currentCollegeID, "attendance", globalDocID);
            wb.set(gRef, { student_periods: allStudentPeriods, strict_scores_cache: newStrictScoresCache }, { merge: true }); ops++;
        }

        wb.update(doc(db, "colleges", currentCollegeID, "event_requests", id), { status: "Accepted" });
        await wb.commit();

        showRcToast("✅ Event Approved & Attendance Saved!");

        let tSnap = await getDoc(doc(db, "colleges", currentCollegeID, "teachers", evt.teacherID));
        if (tSnap.exists()) {
            let tokens = [];
            if (tSnap.data().fcmTokens) tokens = tSnap.data().fcmTokens;
            else if (tSnap.data().fcmToken) tokens = [tSnap.data().fcmToken];

            if (tokens.length > 0) {
                fetch(APPS_SCRIPT_URL, {
                    method: "POST", mode: "no-cors",
                    body: JSON.stringify({
                        title: "Event Approved! 🎉", 
                        body: `Your request for '${evt.eventName}' was accepted.`,
                        image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/4c9dc43b4b3fd2c66679498581de26d690053f61/AdhyoraSplashLogo5.png",
                        type: "event_request", senderRole: "Principal", priority: "high", tokens: tokens
                    })
                });
            }
        }
        EVT_Init(); 

    } catch (e) { btn.innerText = "Accept Request"; btn.disabled = false; showRcToast("❌ Save Failed!"); console.error(e); }
};

// ==========================================
// ATTENDANCE RECORDS (GOD-MODE) ENGINE
// ==========================================
let attdLoaded = false;
let attdAllTeachers = [];
let attdCachedAllocations = {};
let attdCachedAttendance = {};
let attdDailyAllocations = {};
let attdTodayAttendance = {};

let attdSelectedDate = new Date();
let attdSelectedDayName = "Monday";

let attdAllocListener = null;
let attdAttListener = null;

const attdPeriodEndTimes = [10.5, 11.5, 12.5, 14.0, 15.0, 16.0];

function ATTD_Init() {
    if (attdLoaded) return;
    attdLoaded = true;

    if (attdAllTeachers.length === 0) {
        getDocs(collection(db, "colleges", currentCollegeID, "teachers")).then(snap => {
            snap.forEach(doc => {
                let d = doc.data();
                attdAllTeachers.push({ id: doc.id, name: d.name || d.teacherName || "Unknown", dept: (d.departmentID || "").replace("DEPT_", "") });
            });
            attdAllTeachers.sort((a,b) => a.name.localeCompare(b.name));
            ATTD_SelectToday();
        });
    } else {
        ATTD_SelectToday();
    }

    // 🚀 OPTIMIZATION 9: Debounce Attendance Search
    document.getElementById("attdSearchInput").addEventListener("input", debounce(() => ATTD_RenderGrid(), 250));

    let dBtns = document.querySelectorAll("#attdDaysContainer .asn-day-btn");
    dBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            let offset = parseInt(e.target.dataset.offset);
            ATTD_CalculateDateFromDayIndex(offset);
        });
    });
}

function ATTD_SelectToday() {
    let now = new Date();
    let day = now.getDay(); 
    let index = (day >= 1 && day <= 5) ? day - 1 : 0; 
    ATTD_CalculateDateFromDayIndex(index);
}

function ATTD_CalculateDateFromDayIndex(targetIndex) {
    let now = new Date();
    let currentDayOfWeek = now.getDay();
    if (currentDayOfWeek === 0) currentDayOfWeek = 7; 

    let diff = (targetIndex + 1) - currentDayOfWeek;
    attdSelectedDate = new Date(now);
    attdSelectedDate.setDate(now.getDate() + diff);
    
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    attdSelectedDayName = days[attdSelectedDate.getDay()];

    document.querySelectorAll("#attdDaysContainer .asn-day-btn").forEach((btn, idx) => {
        if (idx === targetIndex) btn.classList.add("active");
        else btn.classList.remove("active");
    });

    ATTD_LoadDataForSelectedDay();
}

function ATTD_LoadDataForSelectedDay() {
    let dateStr = attdSelectedDate.toISOString().split('T')[0]; 
    
    if (attdAllocListener) attdAllocListener();
    if (attdAttListener) attdAttListener();

    if (attdCachedAllocations[attdSelectedDayName] && attdCachedAttendance[dateStr]) {
        attdDailyAllocations = attdCachedAllocations[attdSelectedDayName];
        attdTodayAttendance = attdCachedAttendance[dateStr];
        ATTD_RenderGrid();
    } else {
        document.getElementById("attdListContainer").innerHTML = `<div class="no-data-text">Loading ${attdSelectedDayName}...</div>`;
        attdDailyAllocations = {};
        attdTodayAttendance = {};
    }

    attdAllocListener = onSnapshot(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("day", "==", attdSelectedDayName)), (snap) => {
        let tempAllocs = {};
        snap.forEach(doc => {
            let d = doc.data();
            if (!d.teacherID || !d.period || !d.subjectName) return;
            let tID = d.teacherID;
            let pIndex = parseInt(d.period) - 1;
            
            if (!tempAllocs[tID]) tempAllocs[tID] = [];
            if (!tempAllocs[tID].some(a => a.periodIndex === pIndex)) {
                tempAllocs[tID].push({ periodIndex: pIndex, subject: d.subjectName });
            }
        });
        
        attdDailyAllocations = tempAllocs;
        attdCachedAllocations[attdSelectedDayName] = tempAllocs; 
        ATTD_RenderGrid();
    });

    attdAttListener = onSnapshot(query(collection(db, "colleges", currentCollegeID, "attendance"), where("date", "==", dateStr)), (snap) => {
        let tempAttd = {};
        snap.forEach(doc => {
            let d = doc.data();
            for (let i = 1; i <= 6; i++) {
                let pKey = `period_${i}`;
                if (d[pKey] && d[pKey].subject && d[pKey].markedByTeacherID) {
                    let comboKey = `${i - 1}_${d[pKey].subject}`;
                    tempAttd[comboKey] = { markedByTeacherID: d[pKey].markedByTeacherID };
                }
            }
        });

        attdTodayAttendance = tempAttd;
        attdCachedAttendance[dateStr] = tempAttd; 
        ATTD_RenderGrid();
    });
}

function ATTD_RenderGrid() {
    let container = document.getElementById("attdListContainer");
    let searchFilter = document.getElementById("attdSearchInput").value.toLowerCase().trim();
    let html = "";

    let visibleCount = 0;

    attdAllTeachers.forEach(teacher => {
        let myAllocs = attdDailyAllocations[teacher.id] || [];

        if (searchFilter) {
            let matchesName = teacher.name.toLowerCase().includes(searchFilter);
            let matchesDept = teacher.dept.toLowerCase().includes(searchFilter);
            let matchesSub = myAllocs.some(a => a.subject.toLowerCase().includes(searchFilter));
            if (!matchesName && !matchesDept && !matchesSub) return;
        }

        visibleCount++;
        let rowHtml = `<div class="attd-row"><div class="attd-teacher-col"><span class="attd-teacher-name">${teacher.name}</span><span class="attd-teacher-dept">${teacher.dept}</span></div>`;

        for (let p = 0; p < 6; p++) {
            let alloc = myAllocs.find(a => a.periodIndex === p);
            
            if (!alloc) {
                rowHtml += `<div class="attd-empty">---</div>`;
            } else {
                let comboKey = `${p}_${alloc.subject}`;
                let markedByID = attdTodayAttendance[comboKey] ? attdTodayAttendance[comboKey].markedByTeacherID : null;
                
                let colorClass = ATTD_GetStatusColorClass(p, teacher.id, markedByID);
                let shortName = alloc.subject.length <= 3 ? alloc.subject.toUpperCase() : alloc.subject.substring(0, 3).toUpperCase();
                
                let cleanSub = alloc.subject.replace(/'/g, "\\'");
                rowHtml += `<div class="attd-slot ${colorClass}" onmouseenter="ATTD_ShowTooltip(event, '${cleanSub}')" onmouseleave="ATTD_HideTooltip()"><u>${shortName}</u></div>`;
            }
        }
        rowHtml += `</div>`;
        html += rowHtml;
    });

    if (visibleCount === 0) {
        container.innerHTML = `<div class="no-data-text">No data found for this filter.</div>`;
    } else {
        container.innerHTML = html;
    }
}

function ATTD_GetStatusColorClass(periodIndex, assignedTeacherID, markedByTeacherID) {
    if (markedByTeacherID) {
        if (markedByTeacherID === assignedTeacherID) return "attd-green"; 
        else return "attd-yellow"; 
    }

    let now = new Date();
    
    let tDateOnly = new Date(attdSelectedDate.getFullYear(), attdSelectedDate.getMonth(), attdSelectedDate.getDate()).getTime();
    let nDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (tDateOnly < nDateOnly) return "attd-red"; 

    if (tDateOnly > nDateOnly) return "attd-black"; 

    let currentHour = now.getHours() + (now.getMinutes() / 60.0);
    let endTime = attdPeriodEndTimes[periodIndex];

    if (currentHour > endTime) return "attd-red"; 
    
    return "attd-black"; 
}

window.ATTD_ShowTooltip = (event, text) => {
    let tooltip = document.getElementById("attdTooltip");
    tooltip.innerText = text;
    tooltip.style.display = "block";
    
    tooltip.style.left = (event.clientX + 10) + 'px';
    tooltip.style.top = (event.clientY - 30) + 'px';
};

window.ATTD_HideTooltip = () => {
    document.getElementById("attdTooltip").style.display = "none";
};

// ==========================================
// 🚨 PRINCIPAL PUSH NOTIFICATION ENGINE 🚨
// ==========================================
let myCurrentPushToken = "";

// 1. Check UI State on Load
function updateNotificationToggleUI() {
    const toggle = document.getElementById("notifToggleSwitch");
    if (!toggle) return;
    if (Notification.permission === "granted" && myCurrentPushToken !== "") {
        toggle.classList.add("active");
    } else {
        toggle.classList.remove("active");
    }
}

// 2. Request Permissions & Subscribe to Principal Topics
async function requestPushPermissions() {
    try {
        console.log("🚀 STEP 1: Requesting Browser Permission...");
        const permission = await Notification.requestPermission();
        console.log("👉 Permission Status:", permission);

        if (permission === 'granted') {
            console.log("🚀 STEP 2: Registering Service Worker...");
            
            // 🚨 REVERTED TO THE EXACT PATH THAT WORKED FOR STUDENTS
            const swRegistration = await navigator.serviceWorker.register('/AdhyoraWeb/firebase-messaging-sw.js');
            console.log("👉 Service Worker Registered Successfully!", swRegistration);

            console.log("🚀 STEP 3: Asking Firebase for Token...");
            const currentToken = await getToken(messaging, { 
                vapidKey: "BNO8RVA-R1iOy19P2rbVYPBzlCSnptpq13ybtqqO0IgHhDOXhkauOXEWm2hGN6yIUz2_fHL-Iv7IG9cpRZv2YkU",
                serviceWorkerRegistration: swRegistration 
            });

            if (currentToken) {
                console.log("👉 TOKEN GENERATED:", currentToken);
                myCurrentPushToken = currentToken; 
                
                console.log("🚀 STEP 4: Saving Token to Principal's Firestore Profile...");
                const principalRef = doc(db, "colleges", currentCollegeID, "principals", currentUserID);
                const pSnap = await getDoc(principalRef);
                let activeTokens = [];
                
                if (pSnap.exists() && pSnap.data().webFcmTokens) {
                    activeTokens = pSnap.data().webFcmTokens;
                }

                activeTokens = activeTokens.filter(t => t !== currentToken);
                activeTokens.push(currentToken);
                if (activeTokens.length > 3) activeTokens = activeTokens.slice(activeTokens.length - 3);

                // ADD THIS INSTEAD:
                await setDoc(principalRef, { webFcmTokens: activeTokens }, { merge: true });
                console.log("👉 FIRESTORE UPDATED!");

                console.log("🚀 STEP 5: Subscribing to Apps Script Topics...");
                const getSafe = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
                let safeCol = getSafe(currentCollegeID);
                
                let topicsToJoin = [
                    `${safeCol}_ALL`, 
                    `${safeCol}_PRINCIPAL`, 
                    `ADHYORA_GLOBAL_USERS`
                ];

                fetch(APPS_SCRIPT_URL, {
                    method: "POST", mode: "no-cors",
                    body: JSON.stringify({
                        action: "subscribe", token: currentToken, topics: topicsToJoin
                    })
                }).then(() => {
                    console.log("✅ ALL STEPS COMPLETE!");
                    updateNotificationToggleUI();
                    showRcToast("✅ Notifications Enabled!");
                });
            } else {
                console.error("❌ Token generation failed: Firebase returned null.");
            }
        } else {
            alert("Notifications are blocked. Please click the Lock icon next to your URL bar and allow notifications.");
        }
    } catch (error) {
        console.error('🔥 CRITICAL ERROR IN PUSH SETUP:', error);
        alert("Push Setup Failed: " + error.message);
    }
}

// 3. Unsubscribe Logic
async function unsubscribePushNotifications() {
    try {
        const toggle = document.getElementById("notifToggleSwitch");
        toggle.style.opacity = "0.5";

        await deleteToken(messaging);

        if (myCurrentPushToken && currentCollegeID && currentUserID) {
            const principalRef = doc(db, "colleges", currentCollegeID, "principals", currentUserID);
            await setDoc(principalRef, { webFcmTokens: arrayRemove(myCurrentPushToken) }, { merge: true });
        }
        
        myCurrentPushToken = ""; 
        toggle.style.opacity = "1";
        updateNotificationToggleUI();
        showRcToast("Notifications Disabled.");
    } catch (e) {
        console.error("Error unsubscribing:", e);
    }
}

// 4. Toggle Button Listener
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

// 5. Smart Sign Out (Clears Token before logging out)
document.getElementById("btnSignOut").addEventListener("click", async () => {
    if (confirm("Sign out?")) {
        if (myCurrentPushToken && currentCollegeID && currentUserID) {
            await updateDoc(doc(db, "colleges", currentCollegeID, "principals", currentUserID), {
                webFcmTokens: arrayRemove(myCurrentPushToken)
            });
        }
        signOut(auth).then(() => window.location.href = "index.html");
    }
});

// ==========================================
// 🚨 NOTIFICATION CLICK ROUTER 🚨
// ==========================================
navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data || !event.data.action) return;
    
    if (event.data.action === 'openMessages') document.getElementById("btnMessages").click();
    else if (event.data.action === 'openNotifications') document.getElementById("btnNotifications").click();
    else if (event.data.action === 'openTeacherReq') document.getElementById("btnNavTeacherList").click();
    else if (event.data.action === 'openEventReq') document.getElementById("btnNavEvents").click();
});

window.addEventListener('load', () => {
    // Read Hash from URL (If opened from closed state)
    let hash = window.location.hash;
    
    if (hash === "#inbox") setTimeout(() => document.getElementById("btnMessages").click(), 1000);
    else if (hash === "#notifications") setTimeout(() => document.getElementById("btnNotifications").click(), 1000);
    else if (hash === "#teacher_requests") setTimeout(() => document.getElementById("btnNavTeacherList").click(), 1000);
    else if (hash === "#events") setTimeout(() => document.getElementById("btnNavEvents").click(), 1000);
});

// ==========================================
// 🚨 MASTER SUBSCRIPTION & SEMESTER ENGINE
// ==========================================
let subscriptionListener = null;
let cachedExpiryTimestamp = 0;
let isFirstSubLoad = true;
const gracePeriodDays = 8;

// Replace these with your actual Razorpay Links!
const RAZORPAY_MONTHLY = "https://pages.razorpay.com/pl_Rv6FL0YCAcrpNB/view";
const RAZORPAY_YEARLY = "https://pages.razorpay.com/pl_Rv6Dh4gbH5csJe/view";

function startSubscriptionListener() {
    subscriptionListener = onSnapshot(doc(db, "colleges", currentCollegeID), (snapshot) => {
        if (!snapshot.exists()) return;
        
        let data = snapshot.data();
        
        // 1. Semester Sync
        if (data.currentSemesterType) {
            collegeSemesterType = data.currentSemesterType;
        }

        // 2. Subscription Engine
        let subData = data.subscription;
        if (!subData) {
            // 🚨 No subscription data at all = FIRST TIME USER!
            HandleBlockState("Welcome to Adhyora! Please select a plan to activate your institution.", true);
            isFirstSubLoad = false;
            return;
        }

        let newExpiry = subData.expiryDate || 0;
        let newPlan = subData.planType || "Premium";
        let isTrialUsed = subData.isTrialUsed || false; // Check if they've had a trial
        
        let dateChanged = (!isFirstSubLoad && newExpiry !== cachedExpiryTimestamp);
        cachedExpiryTimestamp = newExpiry;

        ValidateExpiry(newExpiry, isTrialUsed);

        if (dateChanged) {
            ShowSuccessPanel(newExpiry, newPlan);
        }

        isFirstSubLoad = false;
    });
}

function ValidateExpiry(expirySeconds, isTrialUsed) {
    let expiryDate = new Date(expirySeconds * 1000); 
    let today = new Date();
    let hardBlockDate = new Date(expiryDate.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000));

    let daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    let daysLeftInGrace = Math.ceil((hardBlockDate - today) / (1000 * 60 * 60 * 24));

    if (today > hardBlockDate) {
        let dateStr = expiryDate.toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
        // 🚨 If they are expired but they used a trial, they are NOT a first-time user anymore.
        HandleBlockState(`Your plan expired on ${dateStr}. Please renew to unlock access.`, !isTrialUsed);
    } 
    else if (today > expiryDate) {
        UnlockAccess();
        TriggerBanner(`Plan Expired! Service completely stops in ${daysLeftInGrace} days.`);
    }
    else if (daysUntilExpiry === 7 || daysUntilExpiry <= 3) {
        UnlockAccess();
        TriggerBanner(`Reminder: Your Adhyora plan expires in ${daysUntilExpiry} days.`);
    }
    else {
        UnlockAccess();
        document.getElementById("subWarningBanner").style.display = "none";
    }
}

// 🚨 THE ANTI-HACK GHOST UI (SMART VERSION)
function HandleBlockState(msg, isFirstTime) {
    document.getElementById("subBlockText").innerText = msg;
    
    // 🚨 DYNAMIC TEXT UPDATES
    let heading = document.getElementById("subBlockHeading");
    let monthHigh = document.getElementById("monthlyHighlightText");
    let yearHigh = document.getElementById("yearlyHighlightText");

    if (isFirstTime) {
        heading.innerText = "CHOOSE A SUBSCRIPTION PLAN";
        monthHigh.innerText = "1st Month Free Trial";
        yearHigh.innerText = "1st Month Free Trial";
    } else {
        heading.innerText = "SUBSCRIPTION EXPIRED";
        monthHigh.innerText = "Flexi Renewal";
        yearHigh.innerText = "Best Value";
    }

    // Hide the initial loader and show the blocker
    const loader = document.getElementById("initialAppLoader");
    if (loader) loader.style.display = "none";
    
    let blockPanel = document.getElementById("subBlockPanel");
    
    document.body.appendChild(blockPanel); 
    blockPanel.style.display = "flex";
    blockPanel.style.opacity = "1";
    blockPanel.style.visibility = "visible";
    
    // Ensure dashboard remains hidden
    let mainContent = document.querySelector(".main-content");
    let sidebar = document.getElementById("mainSidebar");
    if (mainContent) mainContent.style.setProperty("display", "none", "important");
    if (sidebar) sidebar.style.setProperty("display", "none", "important");

    if (typeof tsParticles !== 'undefined') {
        tsParticles.load("subParticles", {
            particles: {
                number: { value: 80, density: { enable: true, area: 800 } },
                color: { value: "#2ecc71" }, 
                links: { enable: true, distance: 150, color: "#2ecc71", opacity: 0.4, width: 1 },
                move: { enable: true, speed: 1.5, outModes: { default: "out" } },
                opacity: { value: 0.5 },
                size: { value: { min: 1, max: 3 } }
            },
            interactivity: {
                events: { onHover: { enable: true, mode: "grab" }, onClick: { enable: true, mode: "push" } },
                modes: { grab: { distance: 200, links: { opacity: 0.8 } }, push: { quantity: 4 } }
            },
            background: { color: "transparent" }
        });
    }
}

function UnlockAccess() {
    // 1. Remove the initial loader
    const loader = document.getElementById("initialAppLoader");
    if (loader) loader.style.display = "none";

    // 2. Hide the block panel
    let blockPanel = document.getElementById("subBlockPanel");
    if (blockPanel) {
        blockPanel.style.display = "none";
        blockPanel.style.opacity = "0";
        blockPanel.style.visibility = "hidden";
        blockPanel.classList.remove("active");
    }

    // 3. 🚨 THE FIX: Hand control back to the CSS!
    let mainContent = document.querySelector(".main-content");
    let sidebar = document.getElementById("mainSidebar");
    
    if (mainContent) {
        // Remove the inline lock so your @media (max-width: 900px) can hide it on mobile!
        mainContent.style.removeProperty("display"); 
        
        mainContent.style.opacity = "0";
        setTimeout(() => mainContent.style.opacity = "1", 50);
    }
    if (sidebar) {
        // Remove the inline lock
        sidebar.style.removeProperty("display");
    }
}

function TriggerBanner(msg) {
    let banner = document.getElementById("subWarningBanner");
    document.getElementById("subWarningText").innerText = msg;
    banner.style.display = "block";
    
    // Auto-hide after 5 seconds
    setTimeout(() => { banner.style.display = "none"; }, 5000);
}

function ShowSuccessPanel(expirySeconds, planType) {
    let dateObj = new Date(expirySeconds * 1000);
    let formattedDate = dateObj.toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric' });
    let displayPlan = planType.charAt(0).toUpperCase() + planType.slice(1);

    document.getElementById("successPlanName").innerText = "Current Plan: " + displayPlan;
    document.getElementById("successExpiryDate").innerText = "Valid Until: " + formattedDate;
    
    let successPanel = document.getElementById("subSuccessPanel");
    
    // Rescue and force visibility
    document.body.appendChild(successPanel);
    successPanel.style.display = "flex";
    successPanel.style.opacity = "1";
    successPanel.style.visibility = "visible";
    successPanel.classList.add("active");
}

// 🚨 SECURE FIREBASE TRANSACTION: Prevents users from spamming the Free Trial button!
window.ProcessSubscription = async function(planType) {
    let loadingTxt = document.getElementById("subBlockLoading");
    loadingTxt.style.display = "block";
    loadingTxt.innerText = "Checking eligibility...";

    let docRef = doc(db, "colleges", currentCollegeID);
    
    try {
        let result = await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw "Document does not exist!";

            let isTrialAvailable = true;
            let data = sfDoc.data();
            if (data.subscription && data.subscription.isTrialUsed === true) {
                isTrialAvailable = false;
            }

            // If trial was already used, abort transaction and send to Razorpay
            if (!isTrialAvailable) return "OPEN_LINK";

            // If trial IS available, calculate exactly 1 month from right now
            let expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1);
            let expiryTimestamp = Math.floor(expiryDate.getTime() / 1000);

            let subData = {
                status: "active",
                planType: "trial",
                expiryDate: expiryTimestamp,
                isTrialUsed: true
            };

            // Commit the update securely
            transaction.set(docRef, { subscription: subData }, { merge: true });
            return "TRIAL_ACTIVATED";
        });

        if (result === "TRIAL_ACTIVATED") {
            loadingTxt.innerText = "Trial Activated! Unlocking...";
        } else if (result === "OPEN_LINK") {
            loadingTxt.innerText = "Opening Secure Payment Page...";
            let link = planType === 'monthly' ? RAZORPAY_MONTHLY : RAZORPAY_YEARLY;
            window.open(link + "?collegeid=" + currentCollegeID, "_blank");
        }
    } catch (e) {
        loadingTxt.innerText = "Connection Error. Please try again.";
        console.error(e);
    }
    
    setTimeout(() => { loadingTxt.style.display = "none"; }, 3000);
};

// ==========================================
// 🚨 MASTER SECURITY PIN ENGINE
// ==========================================
let cachedAdminPin = "";
let lockMode = "LOGIN"; // Modes: LOGIN, SETUP_1, SETUP_2, RESET_NEW_1, RESET_NEW_2
let setupTempPin = "";
let failedPinAttempts = 0;

const elLock = {
    screen: document.getElementById("appLockScreen"), title: document.getElementById("lockTitle"), status: document.getElementById("lockStatus"),
    input: document.getElementById("lockPinInput"), btnSubmit: document.getElementById("btnLockSubmit"), btnForgot: document.getElementById("btnLockForgot"),
    reAuthOverlay: document.getElementById("reAuthOverlay"), reAuthPass: document.getElementById("reAuthPasswordInput"), 
    reAuthStatus: document.getElementById("reAuthStatus"), btnReAuth: document.getElementById("btnReAuthSubmit"),
    // 🚨 NEW BIOMETRIC HOOKS
    btnBio: document.getElementById("btnLockBiometrics"), toggleBio: document.getElementById("bioToggleSwitch"), btnToggleWrap: document.getElementById("btnToggleBiometrics")
};

async function CheckSecurityPin() {
    // 🚨 GHOST UI: Erase Dashboard from DOM while locked
    document.querySelector(".main-content").style.display = "none";
    document.getElementById("mainSidebar").style.display = "none";

    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "metadata", "security"));
        document.getElementById("initialAppLoader").style.display = "none"; // Hide loader
        elLock.screen.style.display = "flex"; // Show Lock Screen

        if (snap.exists() && snap.data().adminPin) {
            cachedAdminPin = snap.data().adminPin;
            SetLockMode("LOGIN");
        } else {
            SetLockMode("SETUP_1");
        }
    } catch(e) {
        elLock.status.innerText = "Network error. Please refresh.";
        elLock.status.style.color = "#ef4444";
    }
}

// ==========================================
// 🚨 BIOMETRIC (WEBAUTHN) ENGINE
// ==========================================

const isBiometricSupported = window.PublicKeyCredential !== undefined;
let isBioEnabledLocally = false; 

// --- HELPER FUNCTIONS FOR CREDENTIAL IDs ---
// WebAuthn requires binary ArrayBuffers. These convert them to strings to save in localStorage.
function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

// 1. Initialization
window.InitBiometricUI = function() {
    isBioEnabledLocally = localStorage.getItem(`adhyora_bio_${currentUserID}`) === "true";

    if (!isBiometricSupported) {
        elLock.btnToggleWrap.style.opacity = "0.5";
        elLock.btnToggleWrap.title = "Not supported on this device/browser.";
    } else if (isBioEnabledLocally) {
        elLock.toggleBio.classList.add("active");
    }
};

// 2. Settings Menu Toggle Logic
elLock.btnToggleWrap.addEventListener("click", async () => {
    if (!isBiometricSupported) return;

    if (isBioEnabledLocally) {
        // Turn it off and wipe the saved credential ID
        isBioEnabledLocally = false;
        localStorage.setItem(`adhyora_bio_${currentUserID}`, "false");
        localStorage.removeItem(`adhyora_bio_id_${currentUserID}`); 
        elLock.toggleBio.classList.remove("active");
        showRcToast("Biometrics disabled for this device.");
    } else {
        // Turn it on and SAVE the credential ID
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

            // 🚨 NEW: Extract and save the exact Credential ID
            const credIdBase64 = bufferToBase64(credential.rawId);
            localStorage.setItem(`adhyora_bio_id_${currentUserID}`, credIdBase64);

            isBioEnabledLocally = true;
            localStorage.setItem(`adhyora_bio_${currentUserID}`, "true");
            elLock.toggleBio.classList.add("active");
            showRcToast("✅ Biometrics Linked Successfully!");
        } catch (err) {
            console.error(err);
            showRcToast("❌ Failed to link Biometrics.");
        }
    }
});

// 3. Lock Screen Verification Logic
elLock.btnBio.addEventListener("click", async () => {
    elLock.btnBio.innerText = "Scanning...";
    
    // 🚨 NEW: Retrieve the exact Credential ID we saved earlier
    const savedCredIdBase64 = localStorage.getItem(`adhyora_bio_id_${currentUserID}`);
    
    if (!savedCredIdBase64) {
        elLock.status.innerText = "Biometric data lost. Please set up again.";
        elLock.status.style.color = "#ef4444";
        return;
    }

    try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const credIdBuffer = base64ToBuffer(savedCredIdBase64);

        await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                rpId: window.location.hostname,
                // 🚨 NEW: By passing the ID here, Android skips the Passkey menu and goes straight to the Fingerprint!
                allowCredentials: [{
                    type: "public-key",
                    id: credIdBuffer
                }],
                userVerification: "required",
                timeout: 60000
            }
        });

        // 🚨 SUCCESS!
        elLock.btnBio.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';
        setTimeout(() => {
            UnlockSecurityWall(); // Bypass the PIN!
        }, 500);

    } catch (err) {
        console.error(err);
        elLock.btnBio.innerHTML = '<i class="fas fa-fingerprint" style="margin-right:8px;"></i> Try Again';
        elLock.status.innerText = "Biometric scan failed or cancelled.";
        elLock.status.style.color = "#ef4444";
    }
});


function SetLockMode(mode) {
    lockMode = mode;
    elLock.input.value = "";
    elLock.btnForgot.style.display = "none";
    elLock.btnForgot.innerText = "Forgot PIN?"; // Reset the text
    elLock.input.style.display = "inline-block"; // Ensure input is visible by default
    
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
        elLock.status.innerText = "Set a 4-digit PIN to secure your dashboard.";
        elLock.status.style.color = "#4ade80";
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
    // 🚨 NEW: The Biometric Prompt Mode
    else if (mode === "SETUP_BIO") {
        elLock.title.innerHTML = '<i class="fas fa-fingerprint" style="color:#4ade80; font-size:40px; margin-bottom:10px;"></i><br>ENABLE BIOMETRICS';
        elLock.status.innerText = "Unlock your dashboard instantly with your Fingerprint or Face ID.";
        elLock.status.style.color = "#4ade80";
        elLock.input.style.display = "none"; // Hide the PIN box
        elLock.btnSubmit.innerText = "Enable Fingerprint";
        
        // Repurpose the "Forgot" button into a "Skip" button!
        elLock.btnForgot.innerText = "Skip for now";
        elLock.btnForgot.style.display = "block";
    }
}

elLock.btnSubmit.addEventListener("click", async () => {
    let val = elLock.input.value.trim();
    // 🚨 THE FIX: Only enforce the 4-digit rule if we are NOT on the Biometric screen!
    if (lockMode !== "SETUP_BIO" && val.length !== 4) {
        elLock.status.innerText = "PIN must be exactly 4 digits.";
        elLock.status.style.color = "#ef4444";
        return;
    }

    if (lockMode === "LOGIN") {
        if (val === cachedAdminPin) {
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
                await setDoc(doc(db, "colleges", currentCollegeID, "metadata", "security"), { adminPin: val, updatedAt: serverTimestamp() }, { merge: true });
                cachedAdminPin = val;
                
                // 🚨 NEW: Check if device supports Biometrics. If yes, prompt them. If no, unlock immediately!
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
    // 🚨 NEW: Handle the Biometric Setup Button click!
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

            // Save the exact Credential ID for fast login later
            const credIdBase64 = bufferToBase64(credential.rawId);
            localStorage.setItem(`adhyora_bio_id_${currentUserID}`, credIdBase64);
            localStorage.setItem(`adhyora_bio_${currentUserID}`, "true");
            isBioEnabledLocally = true;
            
            // Sync settings menu toggle so it's accurate!
            if(elLock.toggleBio) elLock.toggleBio.classList.add("active");

            elLock.btnSubmit.innerHTML = '<i class="fas fa-check-circle"></i> Linked!';
            setTimeout(() => { UnlockSecurityWall(); }, 800);

        } catch (err) {
            console.error(err);
            elLock.status.innerText = "Scan failed or cancelled. You can enable it later in settings.";
            elLock.status.style.color = "#ef4444";
            elLock.btnSubmit.innerText = "Try Again";
        }
    }
});

function UnlockSecurityWall() {
    elLock.screen.style.display = "none";
    
    // Restore the DOM layout physically
    document.querySelector(".main-content").style.display = "";
    document.getElementById("mainSidebar").style.display = "";
    
    failedPinAttempts = 0;
    
    // 🚨 CHAIN REACTION: Now that PIN is verified, check Subscription!
    startSubscriptionListener(); 
}

// --- FORGOT PIN / RE-AUTH LOGIC ---
elLock.btnForgot.addEventListener("click", () => {

    // 🚨 NEW: If they are on the Bio setup screen and click "Skip for now", just unlock!
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
        
        // Push them back to the lock screen to create a new PIN
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

// --- PASSWORD RESET LOGIC ---
document.getElementById("btnResetPassSettings").addEventListener("click", async () => {
    if (confirm("Send a password reset link to your email?")) {
        try {
            await sendPasswordResetEmail(auth, auth.currentUser.email);
            showRcToast("Password reset link sent to your email!");
            document.getElementById("settingsOverlay").classList.remove("active");
        } catch(e) {
            showRcToast("Failed to send reset link.");
        }
    }
});
