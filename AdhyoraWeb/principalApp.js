// principalApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

el.versionText.innerText = "Version 1.0.0 (Web Admin)";

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

    window.open(`mailto:${SUPPORT_EMAIL}?subject=${escapedSubject}&body=${escapedBody}`, "_blank");
}

// ==========================================
// EVENT LISTENERS
// ==========================================

el.btnSettings.addEventListener("click", () => el.settingsOverlay.classList.add("active"));
el.closeSettingsBtn.addEventListener("click", () => el.settingsOverlay.classList.remove("active"));
el.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === el.settingsOverlay) el.settingsOverlay.classList.remove("active");
});

el.btnContactUs.addEventListener("click", handleContactUs);
el.btnWebsite.addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));
el.btnPrivacy.addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
el.btnTerms.addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));

el.btnSignOut.addEventListener("click", () => {
    if (confirm("Are you sure you want to sign out?")) {
        signOut(auth).then(() => window.location.href = "index.html");
    }
});

document.querySelectorAll(".menu-btn").forEach(btn => {
    if(btn.id === "btnNavRoomcode") return; // Let the View Switcher handle this one
    btn.addEventListener("click", (e) => {
        const text = e.currentTarget.querySelector(".btn-text").innerText;
        alert(`Navigating to ${text}... (View logic to be implemented)`);
    });
});

// ==========================================
// VIEW SWITCHER LOGIC (Mobile & PC Aware)
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"),
    roomcode: document.getElementById("roomcodeView"),
    notifications: document.getElementById("notificationsView"),
    calendar: document.getElementById("calendarView"),
    messages: document.getElementById("messagesView")
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn");

function switchView(targetView, clickedBtn) {
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn) clickedBtn.classList.add("active-nav");

    Object.values(views).forEach(v => {
        if (v) v.classList.add("hidden-view");
    });

    if (targetView === "HOME") {
        sidebar.classList.remove("mobile-hidden");
        mainContent.classList.remove("mobile-active");
        
        if (window.innerWidth > 900) {
            views.welcome.classList.remove("hidden-view");
        }
    } else {
        sidebar.classList.add("mobile-hidden");
        mainContent.classList.add("mobile-active");
        
        if (targetView) {
            targetView.classList.remove("hidden-view");
            targetView.style.opacity = 0;
            setTimeout(() => targetView.style.opacity = 1, 50); 
        }
    }
}

document.getElementById("btnHome").addEventListener("click", (e) => switchView("HOME", e.currentTarget));

document.getElementById("btnNotifications").addEventListener("click", (e) => {
    switchView(views.notifications, e.currentTarget);
    document.querySelector("#btnNotifications .notification-dot").style.display = "none";
});

document.getElementById("btnCalendar").addEventListener("click", (e) => {
    switchView(views.calendar, e.currentTarget);
    if (!calendarLoaded) loadCalendarData();
});

document.getElementById("btnMessages").addEventListener("click", (e) => {
    switchView(views.messages, e.currentTarget);
    document.querySelector("#btnMessages .notification-dot").style.display = "none";
});

// Sidebar binding for Roomcode
document.getElementById("btnNavRoomcode").addEventListener("click", () => {
    switchView(views.roomcode);
    if (!rcLoaded) startRoomcodeListener();
});


// ==========================================
// NOTIFICATIONS INBOX
// ==========================================
let cachedNotifs = [];

function startInboxListener() {
    const safeCol = currentCollegeID ? currentCollegeID.replace(/[^a-zA-Z0-9]/g, '') : "ALL";
    const myTopics = [`${safeCol}_ALL`, `${safeCol}_PRINCIPAL`];

    let inboxCache = [];
    let globalCache = [];

    const updateNotifUI = () => {
        cachedNotifs = [...inboxCache, ...globalCache].sort((a,b) => b.time - a.time);
        renderNotifications();
    };

    onSnapshot(query(collection(db, "colleges", currentCollegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        inboxCache = []; 
        snap.forEach(doc => { 
            let d = doc.data(); 
            inboxCache.push({ title: d.title || "Notice", body: d.body || "", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
        });
        document.querySelector("#btnNotifications .notification-dot").style.display = "block"; 
        updateNotifUI();
    });

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
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";
const myRealName = "Principal"; 

function startMessagesListener() {
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

setTimeout(startMessagesListener, 2000);

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
    
    if (rcCachedDepts.length === 0) {
        try {
            const deptQuery = await getDocs(collection(db, "colleges", currentCollegeID, "departments"));
            rcCachedDepts = [];
            deptQuery.forEach(d => {
                rcCachedDepts.push({ name: d.data().name || d.id, maxYears: d.data().maxYears || 4 });
            });
        } catch(e) { console.error("Error fetching depts:", e); }
    }
    
    elCompose.deptDrop.innerHTML = '<option value="All">All Departments</option>' + 
        rcCachedDepts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    elCompose.deptDrop.dispatchEvent(new Event("change"));
});

elCompose.closeBtn.addEventListener("click", () => elCompose.overlay.classList.remove("active"));
elCompose.btnStudents.addEventListener("change", (e) => elCompose.yearDrop.style.display = e.target.checked ? "block" : "none");

elCompose.deptDrop.addEventListener("change", (e) => {
    let selectedDept = rcCachedDepts.find(d => d.name === e.target.value);
    let maxYears = selectedDept ? selectedDept.maxYears : 4;
    elCompose.yearDrop.innerHTML = '<option value="All">All Years</option>';
    for(let i=1; i<=maxYears; i++) { elCompose.yearDrop.innerHTML += `<option value="${i}">Year ${i}</option>`; }
});

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
    let yearSafe = getSafeTopic("Year " + targetYear); 
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

    try {
        await addDoc(collection(db, "colleges", currentCollegeID, "sent_messages"), {
            title: title, body: body, targetSummary: targetDescription, timestamp: serverTimestamp(),
            type: "broadcast", status: "sent", senderID: currentUserID, senderRole: "Principal", senderName: myRealName
        });
        
        const payload = {
            title: `${title} • ${myRealName} (Principal)`, body: body,
            image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/4c9dc43b4b3fd2c66679498581de26d690053f61/AdhyoraSplashLogo5.png",
            type: "chat", priority: "high", topics: topicsToPing
        };

        fetch(APPS_SCRIPT_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) })
        .then(() => {
            elCompose.status.style.color = "var(--text-light-green)";
            elCompose.status.innerText = "Message Sent Successfully!";
            setTimeout(() => {
                elCompose.overlay.classList.remove("active");
                elCompose.sendBtn.innerText = "Send Broadcast";
                elCompose.sendBtn.disabled = false;
            }, 1500);
        }).catch(err => {
            elCompose.status.innerText = "Logged, but push failed.";
            elCompose.sendBtn.innerText = "Send Broadcast"; elCompose.sendBtn.disabled = false;
        });
    } catch(e) {
        elCompose.status.innerText = "Network Error.";
        elCompose.sendBtn.innerText = "Send Broadcast"; elCompose.sendBtn.disabled = false;
    }
});


// ==========================================
// ROOMCODE MANAGER (REPLICATING C# RoomCodeGenerator)
// ==========================================
let rcLoaded = false;
let rcCachedDepts = [];
let rcCurrentAction = "";
let rcTargetID = "";
let rcTargetName = "";
let rcPendingNewName = "";
let rcIsCreatingNew = false;

// 1. Toast UI
function showRcToast(msg) {
    let t = document.getElementById("rcToast");
    t.innerText = msg;
    t.style.bottom = "30px";
    setTimeout(() => t.style.bottom = "-100px", 3000);
}

// 2. Real-Time Listener
function startRoomcodeListener() {
    rcLoaded = true;
    const listEl = document.getElementById("roomcodeList");

    onSnapshot(collection(db, "colleges", currentCollegeID, "departments"), (snap) => {
        rcCachedDepts = [];
        let idToName = {};
        snap.forEach(d => idToName[d.id] = d.data().name || d.id);

        snap.forEach(doc => {
            let d = doc.data();
            let code = d.roomCode || "";
            // Auto generate if missing
            if(!code) {
               code = String(Math.floor(100000 + Math.random() * 900000));
               RC_SaveCodeToDB(d.name || doc.id, code, d.maxYears || 3, "");
            }
            let linkedName = (d.linkedDepartments && d.linkedDepartments.length > 0) ? idToName[d.linkedDepartments[0]] : null;
            rcCachedDepts.push({ id: doc.id, name: d.name || doc.id, roomCode: code, maxYears: d.maxYears || 3, linkedName: linkedName });
        });
        
        if (rcCachedDepts.length === 0) listEl.innerHTML = `<div class="no-data-text">No Roomcodes Available</div>`;
        else renderRoomcodes();
    });
}

function renderRoomcodes() {
    const listEl = document.getElementById("roomcodeList");
    listEl.innerHTML = rcCachedDepts.map(d => {
        let linkUI = d.linkedName ? `<span style="color:#eab308; font-size:12px; margin-left:8px;" title="Linked to ${d.linkedName}"><i class="fas fa-link"></i> ${d.linkedName}</span>` : "";
        return `
        <div class="data-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">
            <div>
                <div class="card-title">${d.name} ${linkUI}</div>
                <div class="card-body" style="margin-bottom:0;">Code: <strong style="font-size:16px; color:var(--brand-green); letter-spacing:1px;">${d.roomCode}</strong> (${d.maxYears} Yrs)</div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="action-icon-btn" title="Share" onclick="window.RC_Share('${d.name}', '${d.roomCode}')"><i class="fas fa-share-alt"></i></button>
                <button class="action-icon-btn" title="Edit Duration" onclick="window.RC_EditDuration('${d.id}', '${d.name}', ${d.maxYears})"><i class="fas fa-pen"></i></button>
                <button class="action-icon-btn" title="Regenerate" onclick="window.RC_RegenSingle('${d.id}', '${d.name}')"><i class="fas fa-sync-alt"></i></button>
                <button class="action-icon-btn" title="Delete" style="color:#ef4444;" onclick="window.RC_Delete('${d.id}', '${d.name}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// 3. Row Actions (Exposed to window for HTML onClick)
window.RC_Share = (name, code) => {
    let shareText = `Room Code for ${name}: ${code}`;
    if (navigator.share) { navigator.share({ title: 'Adhyora Room Code', text: shareText }); } 
    else { navigator.clipboard.writeText(shareText); showRcToast("Room code copied to clipboard!"); }
};

window.RC_EditDuration = (id, name, years) => {
    rcIsCreatingNew = false; rcTargetID = id; rcTargetName = name;
    document.getElementById("durationTitle").innerHTML = `<i class="fas fa-clock"></i> Edit: ${name}`;
    document.getElementById("durationSelect").value = years;
    document.getElementById("durationOverlay").classList.add("active");
};

window.RC_RegenSingle = (id, name) => {
    rcCurrentAction = "REGEN_SINGLE"; rcTargetName = name;
    document.getElementById("confirmText").innerHTML = `Regenerate code for <b>${name}</b>?<br>(Teacher will be logged out)`;
    document.getElementById("confirmOverlay").classList.add("active");
};

window.RC_Delete = (id, name) => {
    rcCurrentAction = "DELETE"; rcTargetName = name;
    document.getElementById("confirmText").innerHTML = `Delete <b>${name}</b>?<br>(All data will be lost)`;
    document.getElementById("confirmOverlay").classList.add("active");
};

// 4. Header Actions
document.getElementById("btnRegenAll").addEventListener("click", () => {
    if(rcCachedDepts.length === 0) return;
    rcCurrentAction = "REGEN_ALL";
    document.getElementById("confirmText").innerHTML = `Regenerate <b>ALL</b> Room Codes?`;
    document.getElementById("confirmOverlay").classList.add("active");
});

document.getElementById("btnOpenAddDept").addEventListener("click", () => {
    document.getElementById("addDeptInput").value = "";
    document.getElementById("addDeptOverlay").classList.add("active");
});

document.getElementById("btnOpenCombine").addEventListener("click", () => {
    if(rcCachedDepts.length < 2) { showRcToast("Need at least 2 departments to combine!"); return; }
    let options = rcCachedDepts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    document.getElementById("combineSelect1").innerHTML = options;
    document.getElementById("combineSelect2").innerHTML = options;
    document.getElementById("combineSelect2").selectedIndex = 1;
    document.getElementById("combineOverlay").classList.add("active");
});

// 5. State Machine Flows
document.getElementById("btnAddDeptNext").addEventListener("click", () => {
    rcPendingNewName = document.getElementById("addDeptInput").value.trim();
    if(!rcPendingNewName) { showRcToast("Enter a name!"); return; }
    rcCurrentAction = "ADD";
    document.getElementById("addDeptOverlay").classList.remove("active");
    document.getElementById("confirmText").innerHTML = `Create new department:<br><b>${rcPendingNewName}</b>?`;
    document.getElementById("confirmOverlay").classList.add("active");
});

document.getElementById("btnConfirmYes").addEventListener("click", () => {
    document.getElementById("confirmOverlay").classList.remove("active");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinOverlay").classList.add("active");
});

document.getElementById("btnSubmitCombine").addEventListener("click", () => {
    let name1 = document.getElementById("combineSelect1").value;
    let name2 = document.getElementById("combineSelect2").value;
    if(name1 === name2) { showRcToast("Cannot combine with itself!"); return; }
    rcCurrentAction = "COMBINE";
    document.getElementById("combineOverlay").classList.remove("active");
    document.getElementById("pinInput").value = "";
    document.getElementById("pinOverlay").classList.add("active");
});

document.getElementById("btnVerifyPin").addEventListener("click", async () => {
    let pin = document.getElementById("pinInput").value.trim();
    if(!pin) return;
    
    // Check PIN in DB
    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "metadata", "security"));
        let correctPin = (snap.exists() && snap.data().adminPin) ? snap.data().adminPin : "1234";
        
        if (pin === correctPin) {
            document.getElementById("pinOverlay").classList.remove("active");
            RC_ExecuteAction();
        } else {
            showRcToast("Incorrect PIN.");
        }
    } catch(e) { showRcToast("Error verifying PIN."); }
});

document.getElementById("btnSaveDuration").addEventListener("click", () => {
    document.getElementById("durationOverlay").classList.remove("active");
    let yrs = parseInt(document.getElementById("durationSelect").value);
    
    if (rcIsCreatingNew) {
        let code = String(Math.floor(100000 + Math.random() * 900000));
        RC_SaveCodeToDB(rcPendingNewName, code, yrs, "");
        showRcToast(`Added ${rcPendingNewName}!`);
    } else {
        updateDoc(doc(db, "colleges", currentCollegeID, "departments", "DEPT_" + rcTargetName.replace(/\s+/g, '')), { maxYears: yrs });
        showRcToast("Duration Updated!");
    }
});

// 6. DB Execution Methods
function RC_ExecuteAction() {
    if (rcCurrentAction === "ADD") {
        rcIsCreatingNew = true;
        document.getElementById("durationTitle").innerHTML = `<i class="fas fa-clock"></i> Set Duration`;
        document.getElementById("durationSelect").value = 3;
        document.getElementById("durationOverlay").classList.add("active");
    }
    else if (rcCurrentAction === "REGEN_SINGLE") {
        let newCode = String(Math.floor(100000 + Math.random() * 900000));
        let oldCode = rcCachedDepts.find(d => d.name === rcTargetName)?.roomCode || "";
        RC_SaveCodeToDB(rcTargetName, newCode, 3, oldCode);
        RC_KickTeachers(rcTargetName);
        showRcToast(`New Code Generated`);
    }
    else if (rcCurrentAction === "REGEN_ALL") {
        rcCachedDepts.forEach(d => {
            let newCode = String(Math.floor(100000 + Math.random() * 900000));
            RC_SaveCodeToDB(d.name, newCode, d.maxYears, d.roomCode);
            RC_KickTeachers(d.name);
        });
        showRcToast(`All Codes Regenerated`);
    }
    else if (rcCurrentAction === "DELETE") {
        let deptID = "DEPT_" + rcTargetName.replace(/\s+/g, '');
        deleteDoc(doc(db, "colleges", currentCollegeID, "departments", deptID));
        RC_KickTeachers(rcTargetName);
        showRcToast(`Deleted ${rcTargetName}`);
    }
    else if (rcCurrentAction === "COMBINE") {
        let name1 = document.getElementById("combineSelect1").value;
        let name2 = document.getElementById("combineSelect2").value;
        let deptID1 = "DEPT_" + name1.replace(/\s+/g, '');
        let deptID2 = "DEPT_" + name2.replace(/\s+/g, '');
        
        const batch = writeBatch(db);
        batch.set(doc(db, "colleges", currentCollegeID, "departments", deptID1), { linkedDepartments: [deptID2] }, { merge: true });
        batch.set(doc(db, "colleges", currentCollegeID, "departments", deptID2), { linkedDepartments: [deptID1] }, { merge: true });
        batch.commit().then(() => showRcToast("Departments Combined!"));
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
        const batch = writeBatch(db);
        snap.forEach(docSnap => batch.update(docSnap.ref, { status: "Pending" }));
        batch.commit();
    });
}
