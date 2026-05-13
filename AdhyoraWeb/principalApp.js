// principalApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// ==========================================
// VIEW SWITCHER LOGIC
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"),
    notifications: document.getElementById("notificationsView"),
    calendar: document.getElementById("calendarView")
    messages: document.getElementById("messagesView"),
};

function switchView(targetView) {
    Object.values(views).forEach(v => {
        if (v) v.classList.add("hidden-view");
    });
    if (targetView) {
        targetView.classList.remove("hidden-view");
        targetView.style.opacity = 0;
        setTimeout(() => targetView.style.opacity = 1, 50); // Fade in effect
    }
}

// Bind Top Nav Icons
document.getElementById("btnNotifications").addEventListener("click", () => {
    switchView(views.notifications);
    document.querySelector("#btnNotifications .notification-dot").style.display = "none"; // Clear dot
});
document.getElementById("btnCalendar").addEventListener("click", () => {
    switchView(views.calendar);
    if (!calendarLoaded) loadCalendarData(); // Load on first click
});

document.getElementById("btnMessages").addEventListener("click", () => {
    switchView(views.messages);
    document.querySelector("#btnMessages .notification-dot").style.display = "none";
});
// Hide Red Dots initially
document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "none");

// ==========================================
// NOTIFICATIONS INBOX (Cloud Connected)
// ==========================================
let cachedNotifs = [];

function startInboxListener() {
    // Determine Topics (from C# GetMyTopics)
    const safeCol = currentCollegeID ? currentCollegeID.replace(/[^a-zA-Z0-9]/g, '') : "ALL";
    const myTopics = [`${safeCol}_ALL`, `${safeCol}_PRINCIPAL`];

    let inboxCache = [];
    let globalCache = [];

    const updateNotifUI = () => {
        cachedNotifs = [...inboxCache, ...globalCache].sort((a,b) => b.time - a.time);
        renderNotifications();
    };

    // 1. Listen to College Inbox
    onSnapshot(query(collection(db, "colleges", currentCollegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        inboxCache = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            inboxCache.push({ title: d.title || "Notice", body: d.body || "", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
        });
        document.querySelector("#btnNotifications .notification-dot").style.display = "block"; // Trigger Red Dot
        updateNotifUI();
    });

    // 2. Listen to Global Developer Updates
    onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        globalCache = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            globalCache.push({ title: d.title || "System Update", body: d.body || "", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
        });
        document.querySelector("#btnNotifications .notification-dot").style.display = "block";
        updateNotifUI();
    });
}

function renderNotifications() {
    const listEl = document.getElementById("notificationsList");
    if (cachedNotifs.length === 0) { 
        listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; 
        return; 
    }
    
    listEl.innerHTML = cachedNotifs.map(n => {
        let timeStr = n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        return `<div class="data-card">
                    <div class="card-title">${n.title}</div>
                    <div class="card-body">${n.body}</div>
                    <div class="card-meta"><span>Adhyora System</span><span>${timeStr}</span></div>
                </div>`;
    }).join('');
}

// Start listener after profile loads
setTimeout(startInboxListener, 2000); 

// ==========================================
// CALENDAR ENGINE
// ==========================================
let currentDisplayDate = new Date();
let cachedCalYear = "";
let calWorkingDays = new Set();
let calNonWorkingDays = new Map();
let semStarts = new Map();
let semEnds = new Map();
let calendarLoaded = false;

document.getElementById("calPrevMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1); loadCalendarData(); });
document.getElementById("calNextMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1); loadCalendarData(); });

async function loadCalendarData() {
    calendarLoaded = true;
    document.getElementById("calMonthYearText").innerText = currentDisplayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const grid = document.getElementById("calendarGrid");
    grid.innerHTML = ""; 
    document.getElementById("upcomingEventText").innerText = "Loading...";

    let displayYear = currentDisplayDate.getFullYear(); 
    let displayMonth = currentDisplayDate.getMonth() + 1; 
    let targetYearStr = (displayMonth >= 6) ? `${displayYear}-${displayYear + 1}` : `${displayYear - 1}-${displayYear}`;
    
    if (cachedCalYear !== targetYearStr) {
        cachedCalYear = targetYearStr; 
        calWorkingDays.clear(); calNonWorkingDays.clear(); semStarts.clear(); semEnds.clear();
        
        try {
            const [semDoc, workDoc, holDoc] = await Promise.all([ 
                getDoc(doc(db, "colleges", currentCollegeID, "semesters", targetYearStr)), 
                getDoc(doc(db, "colleges", currentCollegeID, "workingDays", targetYearStr)), 
                getDoc(doc(db, "colleges", currentCollegeID, "nonWorkingDays", targetYearStr)) 
            ]);
            
            if (semDoc.exists()) { 
                let d = semDoc.data(); 
                if(d.oddSemester?.startDate) semStarts.set(d.oddSemester.startDate, "Odd"); 
                if(d.oddSemester?.endDate) semEnds.set(d.oddSemester.endDate, "Odd"); 
                if(d.evenSemester?.startDate) semStarts.set(d.evenSemester.startDate, "Even"); 
                if(d.evenSemester?.endDate) semEnds.set(d.evenSemester.endDate, "Even"); 
            }
            if (workDoc.exists()) { Object.keys(workDoc.data()).forEach(k => calWorkingDays.add(k)); }
            if (holDoc.exists()) { Object.entries(holDoc.data()).forEach(([k, v]) => calNonWorkingDays.set(k, v)); }
        } catch(e) { console.error("Calendar Fetch Error", e); }
    }
    
    renderCalendarGrid(); 
    updateUpcomingEvent();
}

function renderCalendarGrid() {
    const grid = document.getElementById("calendarGrid");
    grid.innerHTML = ""; 
    const year = currentDisplayDate.getFullYear(); const month = currentDisplayDate.getMonth(); const today = new Date();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) { grid.innerHTML += `<div class="cal-cell empty"></div>`; }
    
    for (let day = 1; day <= daysInMonth; day++) {
        let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let cellClass = "cal-cell normal"; let subText = ""; let popupText = "";
        
        if (semStarts.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>Start</span>"; popupText = `${semStarts.get(dateStr)} Semester Starts`; } 
        else if (semEnds.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>End</span>"; popupText = `${semEnds.get(dateStr)} Semester Ends`; }
        else { 
            if (!calWorkingDays.has(dateStr)) { 
                if (calNonWorkingDays.has(dateStr)) { cellClass = "cal-cell holiday"; popupText = calNonWorkingDays.get(dateStr); } 
                else { let dWeek = new Date(year, month, day).getDay(); if (dWeek === 0 || dWeek === 6) { cellClass = "cal-cell holiday"; } } 
            } 
        }
        
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) { cellClass += " today"; }
        
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
            let reason = calNonWorkingDays.get(dateStr); 
            if (reason === "Holiday/Weekend") reason = "Holiday"; 
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
// MESSAGES SYSTEM & COMPOSE LOGIC
// ==========================================
let cachedMessages = [];
let cachedDepartments = [];
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";
const myRealName = "Principal"; // You can dynamically fetch this later if needed

function startMessagesListener() {
    // Listen to Sent Messages (Broadcasts)
    onSnapshot(query(collection(db, "colleges", currentCollegeID, "sent_messages"), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        cachedMessages = [];
        snap.forEach(doc => {
            let d = doc.data();
            let roleClass = "msg-principal";
            if ((d.senderRole || "").toLowerCase().includes("teacher")) roleClass = "msg-teacher";
            
            cachedMessages.push({ 
                title: d.title || "Notice", body: d.body || "", sender: d.senderName || "System", 
                target: d.targetSummary || "", roleClass: roleClass, time: d.timestamp ? d.timestamp.toDate() : new Date() 
            });
        });
        document.querySelector("#btnMessages .notification-dot").style.display = "block";
        renderMessages();
    });
}

function renderMessages() {
    const listEl = document.getElementById("messagesList");
    if (cachedMessages.length === 0) { listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
    
    listEl.innerHTML = cachedMessages.map(m => {
        let timeStr = m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        return `<div class="data-card ${m.roleClass}">
                    <div class="card-title">${m.title}</div>
                    <div class="card-body">${m.body}</div>
                    <div class="card-meta"><span>${m.sender} <span style="color:#94a3b8; font-weight:normal;">→ ${m.target}</span></span><span>${timeStr}</span></div>
                </div>`;
    }).join('');
}

// Start listener after profile loads
setTimeout(startMessagesListener, 2000);

// --- COMPOSE MODAL LOGIC ---
const elCompose = {
    overlay: document.getElementById("composeOverlay"),
    openBtn: document.getElementById("btnOpenCompose"),
    closeBtn: document.getElementById("closeComposeBtn"),
    btnTeachers: document.getElementById("toggleTeachers"),
    btnStudents: document.getElementById("toggleStudents"),
    deptDrop: document.getElementById("composeDept"),
    yearDrop: document.getElementById("composeYear"),
    title: document.getElementById("composeTitle"),
    body: document.getElementById("composeBody"),
    sendBtn: document.getElementById("btnSendMessage"),
    status: document.getElementById("composeStatusText")
};

elCompose.openBtn.addEventListener("click", async () => {
    elCompose.overlay.classList.add("active");
    elCompose.title.value = ""; elCompose.body.value = ""; elCompose.status.innerText = "";
    
    // Fetch Departments if empty
    if (cachedDepartments.length === 0) {
        try {
            const snap = await getDoc(doc(db, "colleges", currentCollegeID)); // Assuming depts are managed, or pull from a subcollection
            // Fallback generic fetch (replicating your C# logic)
            const deptQuery = await getDocs(collection(db, "colleges", currentCollegeID, "departments"));
            cachedDepartments = [];
            deptQuery.forEach(d => cachedDepartments.push({ name: d.data().name || d.id, maxYears: d.data().maxYears || 4 }));
            
            elCompose.deptDrop.innerHTML = '<option value="All">All Departments</option>' + 
                cachedDepartments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
        } catch(e) { console.error("Error fetching depts"); }
    }
});

elCompose.closeBtn.addEventListener("click", () => elCompose.overlay.classList.remove("active"));

// Dynamic Year Dropdown Toggle
elCompose.btnStudents.addEventListener("change", (e) => {
    elCompose.yearDrop.style.display = e.target.checked ? "block" : "none";
});

elCompose.deptDrop.addEventListener("change", (e) => {
    let selectedDept = cachedDepartments.find(d => d.name === e.target.value);
    let maxYears = selectedDept ? selectedDept.maxYears : 4;
    elCompose.yearDrop.innerHTML = '<option value="All">All Years</option>';
    for(let i=1; i<=maxYears; i++) { elCompose.yearDrop.innerHTML += `<option value="${i}">Year ${i}</option>`; }
});

// Send Message Logic (Replicating C# NotificationManager)
elCompose.sendBtn.addEventListener("click", async () => {
    let title = elCompose.title.value.trim();
    let body = elCompose.body.value.trim();
    if (!title || !body) { elCompose.status.innerText = "Title and message are required."; return; }
    if (!elCompose.btnTeachers.checked && !elCompose.btnStudents.checked) { elCompose.status.innerText = "Select Teachers or Students."; return; }

    elCompose.sendBtn.innerText = "Sending...";
    elCompose.sendBtn.disabled = true;

    let targetDept = elCompose.deptDrop.value;
    let targetYear = elCompose.yearDrop.value;
    
    const getSafeTopic = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
    let deptSafe = getSafeTopic(targetDept);
    let yearSafe = getSafeTopic("Year " + targetYear); // Match C# formatting
    let collegeSafe = getSafeTopic(currentCollegeID);

    let topicsToPing = [];
    let targetDescription = "";

    if (elCompose.btnTeachers.checked) {
        topicsToPing.push(`${collegeSafe}_TEACHERS_${deptSafe}`);
        targetDescription += (targetDept === "All") ? "Teachers (All)" : `Teachers (${targetDept})`;
    }

    if (elCompose.btnStudents.checked) {
        topicsToPing.push(`${collegeSafe}_STUDENTS_${deptSafe}_${yearSafe}`);
        if (targetDescription !== "") targetDescription += " & ";
        if (targetDept === "All" && targetYear === "All") targetDescription += "All Students";
        else if (targetDept === "All") targetDescription += `Students (All Depts - Year ${targetYear})`;
        else if (targetYear === "All") targetDescription += `Students (${targetDept} - All Years)`;
        else targetDescription += `Students (${targetDept} - Year ${targetYear})`;
    }

    // 1. Save History to Firestore
    try {
        await addDoc(collection(db, "colleges", currentCollegeID, "sent_messages"), {
            title: title, body: body, targetSummary: targetDescription, timestamp: serverTimestamp(),
            type: "broadcast", status: "sent", senderID: currentUserID, senderRole: "Principal", senderName: myRealName
        });
        
        // 2. Ping Native Topics via Webhook
        const payload = {
            title: `${title} • ${myRealName} (Principal)`,
            body: body,
            image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/4c9dc43b4b3fd2c66679498581de26d690053f61/AdhyoraSplashLogo5.png",
            type: "chat", priority: "high", topics: topicsToPing
        };

        fetch(APPS_SCRIPT_URL, {
            method: "POST", mode: "no-cors",
            body: JSON.stringify(payload)
        }).then(() => {
            elCompose.status.style.color = "var(--text-light-green)";
            elCompose.status.innerText = "Message Sent Successfully!";
            setTimeout(() => {
                elCompose.overlay.classList.remove("active");
                elCompose.sendBtn.innerText = "Send Broadcast";
                elCompose.sendBtn.disabled = false;
            }, 1500);
        }).catch(err => {
            elCompose.status.innerText = "Message logged, but push failed.";
            elCompose.sendBtn.innerText = "Send Broadcast";
            elCompose.sendBtn.disabled = false;
        });

    } catch(e) {
        elCompose.status.innerText = "Network Error. Try again.";
        elCompose.sendBtn.innerText = "Send Broadcast";
        elCompose.sendBtn.disabled = false;
    }
});
