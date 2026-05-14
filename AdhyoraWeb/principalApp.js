// principalApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

let currentCollegeID = "";
let currentUserID = "";
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

if (!currentCollegeID) { window.location.href = "index.html"; } 
else {
    onAuthStateChanged(auth, (user) => {
        if (user) { currentUserID = user.uid; fetchPrincipalProfile(); } 
        else { window.location.href = "index.html"; }
    });
}
el.versionText.innerText = "Version 1.0.0 (Web Admin)";

async function fetchPrincipalProfile() {
    try {
        const docSnap = await getDoc(doc(db, "colleges", currentCollegeID, "principals", currentUserID));
        if (docSnap.exists()) {
            const data = docSnap.data(); myRealName = data.name || "Principal";
            el.principalName.innerText = myRealName; el.principalEmail.innerText = data.email || "No Email Provided";
        } else {
            el.principalName.innerText = "Profile Not Found"; el.principalEmail.innerText = "";
        }
    } catch (e) {}
}

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

document.querySelectorAll(".menu-btn").forEach(btn => {
    if(btn.id === "btnNavRoomcode" || btn.id === "btnNavTeacherList" || btn.id === "btnNavStudentList") return;
    btn.addEventListener("click", (e) => alert(`Navigating to ${e.currentTarget.querySelector(".btn-text").innerText}... (View logic to be implemented)`));
});

const views = {
    welcome: document.getElementById("welcomeView"), roomcode: document.getElementById("roomcodeView"),
    teacherList: document.getElementById("teacherListView"), teacherDashboard: document.getElementById("teacherDashboardView"),
    studentList: document.getElementById("studentListView"), studentDashboard: document.getElementById("studentDashboardView"),
    notifications: document.getElementById("notificationsView"), calendar: document.getElementById("calendarView"), messages: document.getElementById("messagesView")
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

document.querySelectorAll(".notification-dot").forEach(dot => dot.style.display = "none");

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

let cachedMessages = [];
function startMessagesListener() {
    onSnapshot(query(collection(db, "colleges", currentCollegeID, "sent_messages"), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        cachedMessages = [];
        snap.forEach(doc => {
            let d = doc.data(); let roleClass = (d.senderRole || "").toLowerCase().includes("teacher") ? "msg-teacher" : "msg-principal";
            cachedMessages.push({ title: d.title || "Notice", body: d.body || "", sender: d.senderName || "System", target: d.targetSummary || "", roleClass: roleClass, time: d.timestamp ? d.timestamp.toDate() : new Date() });
        });
        document.querySelector("#btnMessages .notification-dot").style.display = "block"; renderMessages();
    });
}
function renderMessages() {
    const listEl = document.getElementById("messagesList");
    if (cachedMessages.length === 0) { listEl.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
    listEl.innerHTML = cachedMessages.map(m => {
        return `<div class="data-card ${m.roleClass}"><div class="card-title">${m.title}</div><div class="card-body">${m.body}</div><div class="card-meta"><span>${m.sender} <span style="color:#94a3b8; font-weight:normal;">→ ${m.target}</span></span><span>${m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span></div></div>`;
    }).join('');
}
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
document.getElementById("btnVerifyPin").addEventListener("click", async () => {
    let pin = document.getElementById("pinInput").value.trim(); if(!pin) return;
    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "metadata", "security"));
        let correctPin = (snap.exists() && snap.data().adminPin) ? snap.data().adminPin : "1234";
        if (pin === correctPin) { document.getElementById("pinOverlay").classList.remove("active"); RC_ExecuteAction(); } 
        else showRcToast("Incorrect PIN.");
    } catch(e) { showRcToast("Error verifying PIN."); }
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
    tlLoaded = true;
    onSnapshot(collection(db, "colleges", currentCollegeID, "teachers"), (snap) => {
        cachedTeachers = []; snap.forEach(doc => { cachedTeachers.push({ id: doc.id, ...doc.data() }); });
        document.getElementById("tlTotalTeachers").innerText = `Total: ${cachedTeachers.length}`; renderTeacherList();
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
document.getElementById("tlSearchInput").addEventListener("input", (e) => renderTeacherList(e.target.value.trim()));

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
// STUDENT LIST MANAGER
// ==========================================
let slLoaded = false; let cachedStudents = [];
function startStudentListListener() {
    slLoaded = true;
    onSnapshot(collection(db, "colleges", currentCollegeID, "students"), (snap) => {
        cachedStudents = []; snap.forEach(doc => { cachedStudents.push({ id: doc.id, ...doc.data() }); });
        document.getElementById("slTotalStudents").innerText = `Total: ${cachedStudents.length}`; renderStudentList();
    });
}
function renderStudentList(searchTerm = "") {
    const listEl = document.getElementById("studentListContainer"); const noData = document.getElementById("slNoDataText");
    let filtered = cachedStudents;
    if (searchTerm) { let terms = searchTerm.toLowerCase().split(':').map(t => t.trim()); filtered = cachedStudents.filter(s => { let sStr = `${s.Name || ""} ${s.RollNumber || ""} ${s.Department || ""} year ${s.Year || ""}`.toLowerCase(); return terms.every(term => sStr.includes(term)); }).slice(0, 50); }
    if (filtered.length === 0) { noData.style.display = "block"; noData.innerText = searchTerm ? `No student matching "${searchTerm}"` : "No students found."; listEl.innerHTML = ""; listEl.appendChild(noData); return; }
    noData.style.display = "none";
    
    listEl.innerHTML = filtered.map(s => {
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
                <button class="action-icon-btn" title="Manage Status" onclick="window.SL_OpenAdmin('${s.id}', '${s.Name}', '${status}')"><i class="fas fa-user-shield"></i></button>
                <button class="action-icon-btn" title="Message" onclick="window.OpenCompose(true, '${s.Name || ""}', ${tokensJson})"><i class="fas fa-comment-dots"></i></button>
            </div>
        </div>`;
    }).join('');
    listEl.appendChild(noData); 
}
document.getElementById("slSearchInput").addEventListener("input", (e) => renderStudentList(e.target.value.trim()));

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
            let yearStr = (sdStudentData.Year || "1").toString().replace(/[^0-9]/g, ''); let studentYear = parseInt(yearStr) || 1; let currentMonth = new Date().getMonth() + 1; let isEvenSem = (currentMonth >= 1 && currentMonth <= 5); let currentSemNum = (studentYear * 2) - (isEvenSem ? 0 : 1);
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

    // 1. ENROLLED SUBJECTS
    await fetchGlobalSubjects(); 
    let cleanSemNum = semKey.replace(/[^0-9]/g, '');
    let cleanStuDept = (sdStudentData.Department || sdStudentData.department || "").toLowerCase().replace(/\s+/g, '').replace("dept_", "");
    let finalSubjects = [];

    // 🚨 Explicitly Enrolled Subjects Map check (handling both Semester_2 and Semester 2)
    let enrollMap = {};
    if (sdStudentData.enrolledSubjects) {
        enrollMap = sdStudentData.enrolledSubjects[semKey] || sdStudentData.enrolledSubjects[semDisplay] || {};
    }

    Object.entries(enrollMap).forEach(([k,v]) => {
        finalSubjects.push(`<div style="padding:10px 0; border-bottom:1px dashed #e2e8f0; display:flex; align-items:center; gap:8px;"><b style="color:#f59e0b; font-size:12px;">[${k}]</b> <span style="font-size:13px; color:#475569;">${v}</span></div>`);
    });

    // 🚨 Implicit Core/MJD/TUTORIAL Subjects 
    sdCachedGlobalSubjects.forEach(sub => {
        let semMatch = sub.semesterArray.split(',').map(s=>s.trim()).includes(cleanSemNum);
        if (semMatch) {
            let isDeptMatch = (sub.cleanSubDept === cleanStuDept) || (cleanStuDept.includes(sub.cleanSubDept) && sub.cleanSubDept.length > 3) || (sub.cleanSubDept.includes(cleanStuDept) && cleanStuDept.length > 3);
            if ((sub.cleanType.includes("MJD") || sub.cleanType.includes("CORE") || sub.cleanType.includes("TUTORIAL")) && isDeptMatch) {
                // Duplicate check
                let isAlreadyEnrolled = finalSubjects.some(existing => existing.includes(sub.displayName));
                if (!isAlreadyEnrolled) {
                    finalSubjects.unshift(`<div style="padding:10px 0; border-bottom:1px dashed #e2e8f0; display:flex; align-items:center; gap:8px;"><b style="color:var(--brand-green); font-size:12px;">[${sub.rawType}]</b> <span style="font-size:13px; color:#475569;">${sub.displayName}</span></div>`);
                }
            }
        }
    });

    document.getElementById("sdEnrolledList").innerHTML = finalSubjects.length === 0 ? "<i>No subjects assigned for this semester.</i>" : finalSubjects.join('');
    SD_FetchMarks(semDisplay);

    // 2. ATTENDANCE PARSING
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

// 🚨 UPDATED FLUID WAVE CSS MATH
function SD_UpdateWaveUI(percentage) {
    let col = percentage >= 75 ? "var(--brand-green)" : (percentage >= 60 ? "#f59e0b" : "#ef4444");
    let txt = percentage.toFixed(2) + "%";

    // CSS Wave heights mapped to ensure waves are always visible
    // Circle: 105% is hidden, roughly -5% is full. We map 0-100 to 105-15.
    let circleTop = 105 - (percentage * 0.9); 
    // Row: We map 0-100 to 0-85% height
    let rowPercent = percentage * 0.85;

    let circleFill = document.getElementById("sdCircleWave");
    circleFill.style.setProperty('--wave-color', col);
    circleFill.style.top = `${circleTop}%`; 
    
    document.getElementById("sdCircleText").innerHTML = `<span style="font-size: 11px; display: block; line-height: 1; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Projected</span><span id="sdCirclePercentVal" style="font-size: 26px;">${txt}</span>`;

    let rowFill = document.getElementById("sdWavyFill");
    rowFill.style.setProperty('--wave-color', col);
    rowFill.style.setProperty('--wave-percent', `${rowPercent}%`);
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
