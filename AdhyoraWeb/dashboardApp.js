import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp, onSnapshot, collection, query, where, getDoc, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// ==========================================
// GLOBAL STATE VARIABLES
// ==========================================
let collegeID = ""; let studentUID = ""; let currentRollNo = "";
let collegeSemesterType = "Odd"; 
let loadedSemesters = {}; let sortedSemesterKeys = []; let currentSemesterIndex = 0;

let activeMarksUnsubscribe = null;
let activeTimetableUnsubscribe = null;

let rawDept = ""; let myDepartmentID = ""; let myYearStr = ""; 
let enrolledSubjectsList = [];
let currentStudentEnrolledMap = {}; // 🚨 NEW: Caches the map for UI display
let optimizedSubjectCache = null; // 🚨 NEW: Fast RAM lookup for subjects

let currentDailyDate = new Date(); let cachedMedicalLeaves = []; let dailyData = []; 
let calendarMode = "global"; let currentDisplayDate = new Date(); 
let cachedCalYear = ""; let calWorkingDays = new Set(); let calNonWorkingDays = new Map(); let semStarts = new Map(); let semEnds = new Map();

let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let currentStudentProfileData = null; // 🚨 NEW: Cache profile for the popup

// ==========================================
// DOM ELEMENTS
// ==========================================
const el = {
    name: document.getElementById("studentName"), roll: document.getElementById("studentRoll"),
    badge: document.getElementById("statusBadge"), semTitle: document.getElementById("semesterTitle"),
    circle: document.getElementById("attendanceCircle"), pctText: document.getElementById("overallPercentageText"),
    attClasses: document.getElementById("attendedClassesText"), absClasses: document.getElementById("absentClassesText"),
    totClasses: document.getElementById("totalClassesTakenText"), curPctText: document.getElementById("currentPercentageText"),
    perPres: document.getElementById("totalPeriodsPresentText"), perAbs: document.getElementById("totalPeriodsAbsentText"),
    perTot: document.getElementById("totalPeriodsTakenText"),
    subList: document.getElementById("subjectListContainer"), markList: document.getElementById("marksListContainer"),
    examDrop: document.getElementById("examDropdown"), noMarks: document.getElementById("noMarksData"),
    overlay: document.getElementById("sidebarOverlay"), sidebar: document.getElementById("settingsSidebar"),
    sbName: document.getElementById("sidebarName"), sbSub: document.getElementById("sidebarSubtitle"),
    calModal: document.getElementById("calendarModal"), calTitle: document.getElementById("calMonthYearText"),
    calGrid: document.getElementById("calendarGrid"), upcomingTxt: document.getElementById("upcomingEventText"),
    
    // VIEWS
    mainView: document.getElementById("mainDashboardView"),
    dailyView: document.getElementById("dailyAttendanceView"),
    ttView: document.getElementById("timetableView"),
    assignView: document.getElementById("assignmentsView"),
    actualNotifView: document.getElementById("actualNotifView"),
    msgView: document.getElementById("messagesView"),
    
    // DAILY UI
    dailyDateBtn: document.getElementById("dailyDateBtn"),
    dailyDate: document.getElementById("dailyDateText"), dailyStatus: document.getElementById("dailyStatusText"),
    periodsGrid: document.getElementById("periodsGrid"), detailModal: document.getElementById("periodDetailModal"),
    dSub: document.getElementById("detailSubjectText"), dTeach: document.getElementById("detailTeacherText"), dStat: document.getElementById("detailStatusText"),

    // TIMETABLE UI
    ttDays: document.getElementById("timetableDays"), ttCards: document.getElementById("ttCardsContainer"),
    ttProgress: document.getElementById("ttProgressBar"), ttNodes: document.getElementById("ttNodes"),
    
    // LIST CONTAINERS
    assignList: document.getElementById("assignmentsListContainer"),
    actualNotifList: document.getElementById("actualNotifListContainer"),
    msgList: document.getElementById("messagesListContainer"),

    // SESSIONS & PROFILE
    sessionsModal: document.getElementById("sessionsModal"),
    sessionsList: document.getElementById("sessionsListContainer"),
    profileModal: document.getElementById("profileDetailsModal"),
    profileContent: document.getElementById("profileDetailsContent")
};

// ==========================================
// INITIALIZATION
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
collegeID = urlParams.get('college'); studentUID = urlParams.get('uid');

if (!collegeID || !studentUID) { window.location.href = "index.html"; } 
else {
    onAuthStateChanged(auth, (user) => {
        if (user) syncCollegeAndListen(); else window.location.href = "index.html";
    });
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
    if (navigator.userAgent.indexOf("Android") != -1) osName = "Android Browser";
    if (navigator.userAgent.indexOf("like Mac") != -1) osName = "iOS Browser";

    try {
        const sessionRef = doc(db, "colleges", collegeID, "students", currentRollNo, "sessions", myWebDeviceID);
        await setDoc(sessionRef, { deviceName: osName, loginTime: serverTimestamp() }, {merge: true});
        
        onSnapshot(sessionRef, (docSnap) => {
            if (!docSnap.exists()) signOut(auth).then(() => window.location.href = "index.html");
        });
    } catch(e) {}
}

async function syncCollegeAndListen() {
    try {
        const colSnap = await getDoc(doc(db, "colleges", collegeID));
        if (colSnap.exists() && colSnap.data().currentSemesterType) { collegeSemesterType = colSnap.data().currentSemesterType; }
    } catch(e) {}

    const secureUID = auth.currentUser.uid; 
    const q = query(collection(db, "colleges", collegeID, "students"), where("userID", "==", secureUID));

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) { el.name.innerText = "Profile Not Found"; return; }
        const docSnap = snapshot.docs[0];
        currentRollNo = docSnap.id; 
        
        registerWebSession();
        
        try {
            const medSnap = await getDocs(query(collection(db, "colleges", collegeID, "medical_leaves"), where("studentID", "==", currentRollNo)));
            cachedMedicalLeaves = [];
            medSnap.forEach(d => { let data = d.data(); if(data.startDate && data.endDate) cachedMedicalLeaves.push({ start: new Date(data.startDate), end: new Date(data.endDate) }); });
        } catch(e) {}

        processStudentData(docSnap.data());
        loadDailyAttendance(); 
        
        if (!el.ttView.classList.contains("hidden-view")) loadTimetableForDay(document.querySelector('.day-btn.active').dataset.day);
        if (!el.assignView.classList.contains("hidden-view")) loadAssignments();
        if (!el.actualNotifView.classList.contains("hidden-view")) loadActualNotifications();
        if (!el.msgView.classList.contains("hidden-view")) loadMessages();
    });
}

function processStudentData(data) {
    currentStudentProfileData = data; // Cache for profile popup
    
    const sName = data.Name || data.name || "Unknown";
    el.name.innerText = sName; el.roll.innerText = `Roll no: ${data.RollNumber || currentRollNo}`;
    rawDept = data.Department || data.department || "General";
    myDepartmentID = "DEPT_" + rawDept.replace(/\s/g, ''); 
    el.sbName.innerHTML = `${sName} <br><span style="font-size:12px; color:#888;">(${data.RollNumber || currentRollNo})</span>`;
    
    enrolledSubjectsList = [];
    currentStudentEnrolledMap = data.enrolledSubjects || {};
    
    if (data.enrolledSubjects) {
        for (const semObj of Object.values(data.enrolledSubjects)) {
            if (typeof semObj === 'object') {
                for (const subName of Object.values(semObj)) enrolledSubjectsList.push(subName);
            }
        }
    }

    let studentYear = parseInt((data.Year || "1").toString().replace(/\D/g, ''));
    if (isNaN(studentYear) || studentYear <= 0) studentYear = 1;
    myYearStr = `Year ${studentYear}`;

    loadedSemesters = {}; sortedSemesterKeys = [];
    for(let i=1; i<=8; i++) {
        const key = `Semester_${i}`;
        loadedSemesters[key] = { id: key, name: `Semester ${i}`, hasData: false, strictPresent: 0, strictTotal: 0, simplePresent: 0, simpleTotal: 0, subjects: [] };
        sortedSemesterKeys.push(key);
    }

    if (data.attendance_stats) {
        for (const [key, semData] of Object.entries(data.attendance_stats)) {
            const cleanKey = key.replace("semester_", "Semester_");
            if (loadedSemesters[cleanKey]) {
                let semInfo = loadedSemesters[cleanKey]; semInfo.hasData = true;
                if (semData.present !== undefined) semInfo.strictPresent = semData.present;
                if (semData.total !== undefined) semInfo.strictTotal = semData.total;

                let sumPres = 0; let sumTot = 0;
                for (const [subKey, subStats] of Object.entries(semData)) {
                    if (subKey === "present" || subKey === "total") continue;
                    if (subKey === "Strict_Global") { semInfo.strictPresent = subStats.present; semInfo.strictTotal = subStats.total; }
                    else if (typeof subStats === 'object') {
                        let p = subStats.present || 0; let t = subStats.total || 0;
                        semInfo.subjects.push({ name: subKey.replace("-", "/"), present: p, total: t });
                        sumPres += p; sumTot += t;
                    }
                }
                semInfo.simplePresent = sumPres; semInfo.simpleTotal = sumTot;
            }
        }
    }

    let baseSem = (studentYear - 1) * 2;
    currentSemesterIndex = Math.max(0, Math.min(7, ((collegeSemesterType === "Odd") ? baseSem + 1 : baseSem + 2) - 1));
    updateUIForCurrentSemester(rawDept);
}

document.getElementById("prevSemBtn").addEventListener("click", () => { if (currentSemesterIndex > 0) { currentSemesterIndex--; updateUIForCurrentSemester(null); }});
document.getElementById("nextSemBtn").addEventListener("click", () => { if (currentSemesterIndex < 7) { currentSemesterIndex++; updateUIForCurrentSemester(null); }});

function updateUIForCurrentSemester(optionalDept) {
    const semData = loadedSemesters[sortedSemesterKeys[currentSemesterIndex]];
    el.semTitle.innerText = semData.name;
    if (optionalDept) el.sbSub.innerHTML = `${optionalDept} &nbsp; <span class="sem-text">${semData.name}</span>`;
    else el.sbSub.innerHTML = el.sbSub.innerHTML.split("&nbsp;")[0] + `&nbsp; <span class="sem-text">${semData.name}</span>`;

    let percent = (semData.strictTotal > 0) ? (semData.strictPresent / semData.strictTotal) * 100 : 0;
    el.pctText.innerText = `${percent.toFixed(2)}%`; el.curPctText.innerText = `Current: ${percent.toFixed(2)}%`;
    el.attClasses.innerText = `Attended: ${semData.strictPresent}`; el.totClasses.innerText = `Total: ${semData.strictTotal}`;
    el.absClasses.innerText = `Absent: ${semData.strictTotal - semData.strictPresent}`;
    el.perPres.innerText = `Periods Present: ${semData.simplePresent}`; el.perTot.innerText = `Total Periods: ${semData.simpleTotal}`;
    el.perAbs.innerText = `Periods Absent: ${semData.simpleTotal - semData.simplePresent}`;

    let ringColor = percent >= 85 ? "#4caf50" : percent >= 70 ? "#ffc107" : percent >= 50 ? "#ff9800" : "#f44336";
    el.badge.innerText = percent >= 85 ? "Excellent" : percent >= 70 ? "Good" : percent >= 50 ? "Average" : "Critical";
    el.badge.style.backgroundColor = ringColor;
    el.circle.style.background = `conic-gradient(${ringColor} ${(percent/100)*360}deg, #e0e0e0 ${(percent/100)*360}deg)`;

    el.subList.innerHTML = (!semData.hasData || semData.subjects.length === 0) ? `<div class="no-data-text">No Attendance Data</div>` : semData.subjects.map(sub => {
        const ratio = sub.total > 0 ? (sub.present / sub.total) : 0; const subPct = ratio * 100;
        let barColor = ratio < 0.6 ? "#f44336" : ratio < 0.75 ? "#ff9800" : "#4caf50";
        return `<div class="subject-row"><div class="row-header"><span>${sub.name}</span><span style="color:${barColor}">${subPct.toFixed(0)}% <span style="font-size:9px; color:#888;">(${sub.present}/${sub.total})</span></span></div><div class="progress-track"><div class="progress-fill" style="width: ${subPct}%; background-color: ${barColor};"></div></div></div>`;
    }).join('');

    fetchMarksForSemester(semData.name);
    buildEnrolledSubjectsUI(semData.name); // 🚨 Builds the new Curriculum List
}

function fetchMarksForSemester(semName) {
    if (activeMarksUnsubscribe) activeMarksUnsubscribe();
    el.markList.innerHTML = ""; el.examDrop.innerHTML = '<option value="">Loading...</option>'; el.noMarks.style.display = "block";
    activeMarksUnsubscribe = onSnapshot(doc(db, "colleges", collegeID, "students", currentRollNo, "nep_marks", semName), (docSnap) => {
        if (!docSnap.exists()) { el.examDrop.innerHTML = '<option value="">No Exams Data</option>'; return; }
        const data = docSnap.data(); let examMap = {};
        for (const [subjectName, exams] of Object.entries(data)) {
            if (typeof exams !== 'object') continue;
            for (const [examName, stats] of Object.entries(exams)) {
                if (!examMap[examName]) examMap[examName] = [];
                let t = stats.test || 0; let a = stats.assign || 0; let att = stats.att || 0; let max = stats.max || 50;
                examMap[examName].push({ name: subjectName, obtained: stats.total || (t+a+att), max: max });
            }
        }
        const examKeys = Object.keys(examMap).sort();
        if (examKeys.length === 0) { el.examDrop.innerHTML = '<option value="">No Exams Data</option>'; return; }
        el.examDrop.innerHTML = examKeys.map(ex => `<option value="${ex}">${ex}</option>`).join('');
        el.examDrop.onchange = () => drawMarksUI(examMap[el.examDrop.value]);
        drawMarksUI(examMap[examKeys[0]]);
    });
}

function drawMarksUI(marksArray) {
    el.markList.innerHTML = (!marksArray || marksArray.length === 0) ? "" : marksArray.map(m => {
        const pct = m.max > 0 ? (m.obtained / m.max) * 100 : 0;
        return `<div class="subject-row"><div class="row-header"><span>${m.name}</span><span>${m.obtained}/${m.max} <span style="font-size:9px; color:#888;">(${pct.toFixed(0)}%)</span></span></div><div class="progress-track"><div class="progress-fill" style="width: ${pct}%; background-color: #3b82f6;"></div></div></div>`;
    }).join('');
    el.noMarks.style.display = (!marksArray || marksArray.length === 0) ? "block" : "none";
}

// ==========================================
// 🚨 NEW: ENROLLED SUBJECTS BUILDER 🚨
// ==========================================
async function buildEnrolledSubjectsUI(semesterName) {
    let listEl = document.getElementById("enrolledSubjectsListText");
    listEl.innerHTML = "<i>Loading subjects...</i>";
    
    let cleanSemNum = semesterName.replace("Semester", "").replace("_", "").trim();
    let finalSubjects = [];

    // 1. Explicitly enrolled (VAC, SEC, Minor)
    let semKey = semesterName.replace(" ", "_"); 
    let enrollMap = currentStudentEnrolledMap[semKey] || currentStudentEnrolledMap[semesterName] || {};
    for (let [cat, sub] of Object.entries(enrollMap)) {
        finalSubjects.push(`<span style="color:#f59e0b; font-weight:bold;">[${cat}]</span> ${sub}`);
    }

    // 2. Fetch Master Subjects if not cached
    if (!optimizedSubjectCache) {
        optimizedSubjectCache = [];
        try {
            const subSnap = await getDocs(collection(db, "colleges", collegeID, "subjects"));
            subSnap.forEach(doc => {
                let d = doc.data();
                optimizedSubjectCache.push({
                    cleanType: (d.Type || d.type || "").toUpperCase().replace(/\s/g, ""),
                    cleanSubDept: (d.Department || d.department || d.departmentID || "").replace(/\s/g, "").toLowerCase().replace("dept_", ""),
                    semesterArray: (d.Semester || d.semester || "1").toString().split(",").map(s => s.trim()),
                    displayName: d.Name || d.name || d.subjectName || "Unnamed",
                    rawType: d.Type || d.type || ""
                });
            });
        } catch(e) { console.error("Error fetching subjects", e); }
    }

    // 3. Match Core/MJD Subjects
    let cleanStuDept = rawDept.replace(/\s/g, "").toLowerCase().replace("dept_", "");
    optimizedSubjectCache.forEach(sub => {
        if (sub.semesterArray.includes(cleanSemNum)) {
            let isDeptMatch = (sub.cleanSubDept === cleanStuDept) || (cleanStuDept.includes(sub.cleanSubDept) && sub.cleanSubDept.length > 3) || (sub.cleanSubDept.includes(cleanStuDept) && cleanStuDept.length > 3);
            if ((sub.cleanType.includes("MJD") || sub.cleanType.includes("CORE") || sub.cleanType.includes("TUTORIAL")) && isDeptMatch) {
                let newEntry = `<span style="color:#10b981; font-weight:bold;">[${sub.rawType}]</span> ${sub.displayName}`;
                if (!finalSubjects.some(existing => existing.includes(sub.displayName))) {
                    finalSubjects.unshift(newEntry); // Add to top
                }
            }
        }
    });

    if (finalSubjects.length === 0) listEl.innerHTML = "<i>No subjects assigned for this semester.</i>";
    else listEl.innerHTML = finalSubjects.join("<br>");
}

// ==========================================
// 🚨 NEW: STUDENT PROFILE POPUP 🚨
// ==========================================
document.getElementById("btnProfileDetails").addEventListener("click", () => {
    let d = currentStudentProfileData;
    if(!d) return;
    
    let html = `
        <b>Name:</b> ${d.Name || d.name || "N/A"}<br>
        <b>Roll Number:</b> ${d.RollNumber || currentRollNo}<br>
        <b>Course:</b> ${d.courseType || d.CourseType || "N/A"}<br>
        <b>Department:</b> ${d.Department || d.department || "N/A"}<br>
        <b>Current Year:</b> ${d.Year || d.year || "N/A"}<br>
        <b>Status:</b> ${d.authStatus || "N/A"}<br>
        <b>Email:</b> ${d.email || "N/A"}<br>
        <b>Legal Consent:</b> ${d.hasAgreedToDisclaimer ? "Agreed" : "Pending"}<br><br>
        <b>User ID:</b> <span style="font-size:10px; color:#888;">${auth.currentUser.uid}</span>
    `;
    el.profileContent.innerHTML = html;
    el.profileModal.classList.add("active");
});
document.getElementById("closeProfileBtn").addEventListener("click", () => el.profileModal.classList.remove("active"));

// ==========================================
// 🚨 VIEW TOGGLING (USING HIDDEN-VIEW) 🚨
// ==========================================
const btnNavMain = document.getElementById("btnNavMain");
const btnNavAssign = document.getElementById("btnNavAssign");
const btnNavNotif = document.getElementById("btnNavNotif");
const btnNavMsg = document.getElementById("btnNavMsg");
const btnNavTimetable = document.getElementById("btnNavTimetable");
const btnNavDaily = document.getElementById("btnNavDaily");

function switchView(activeBtn, viewToShow) {
    [btnNavMain, btnNavAssign, btnNavNotif, btnNavMsg, btnNavTimetable, btnNavDaily].forEach(btn => btn.classList.remove("active"));
    [el.mainView, el.assignView, el.actualNotifView, el.msgView, el.ttView, el.dailyView].forEach(view => view.classList.add("hidden-view"));
    activeBtn.classList.add("active");
    viewToShow.classList.remove("hidden-view");
}

btnNavMain.addEventListener("click", () => switchView(btnNavMain, el.mainView));
btnNavDaily.addEventListener("click", () => { switchView(btnNavDaily, el.dailyView); loadDailyAttendance(); });
btnNavTimetable.addEventListener("click", () => { 
    switchView(btnNavTimetable, el.ttView); 
    let todayName = new Date().toLocaleString('en-us', {weekday: 'long'});
    let validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (!validDays.includes(todayName)) todayName = "Monday";
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.toggle("active", btn.dataset.day === todayName));
    loadTimetableForDay(todayName);
});

btnNavAssign.addEventListener("click", () => { switchView(btnNavAssign, el.assignView); loadAssignments(); });
btnNavNotif.addEventListener("click", () => { switchView(btnNavNotif, el.actualNotifView); loadActualNotifications(); });
btnNavMsg.addEventListener("click", () => { switchView(btnNavMsg, el.msgView); loadMessages(); });

// ==========================================
// 1. ASSIGNMENTS
// ==========================================
async function loadAssignments() {
    el.assignList.innerHTML = `<div class="no-data-text">Checking for assignments...</div>`;
    try {
        let cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
        const q = query(collection(db, "colleges", collegeID, "assignments"), where("createdAt", ">=", cutoff), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        let notifs = []; let mySemStr = `Semester ${currentSemesterIndex + 1}`;
        snapshot.forEach(doc => {
            let d = doc.data(); let sub = d.subject || "Unknown";
            let isExplicitMatch = enrolledSubjectsList.some(s => s.trim().toLowerCase() === sub.trim().toLowerCase());
            let isDepartmentMatch = (d.teacherDeptID || "").trim().toLowerCase() === myDepartmentID.toLowerCase() && (d.semester || "").trim().toLowerCase() === mySemStr.toLowerCase();

            if (isExplicitMatch || isDepartmentMatch || enrolledSubjectsList.length === 0) {
                notifs.push({ title: `Assignment: ${sub}`, body: d.topic || "No Topic", teach: d.teacherName || "Teacher", due: d.dueDate || "N/A", time: d.createdAt ? d.createdAt.toDate() : new Date() });
            }
        });
        
        if (notifs.length === 0) { el.assignList.innerHTML = `<div class="no-data-text">No Recent Assignments</div>`; return; }
        el.assignList.innerHTML = notifs.map(n => `<div class="data-card assign"><div class="card-title">${n.title}</div><div class="card-body">${n.body}</div><div class="card-meta"><span>${n.teach}</span><span class="card-due">Due: ${n.due}</span></div></div>`).join('');
    } catch(e) { el.assignList.innerHTML = `<div class="no-data-text" style="color:#ef4444;">Error: ${e.message}</div>`; }
}

// ==========================================
// 2. ACTUAL NOTIFICATIONS
// ==========================================
function getSafeTopic(input) { return (!input || input === "All") ? "ALL" : input.replace(/[^a-zA-Z0-9]/g, ''); }

async function loadActualNotifications() {
    el.actualNotifList.innerHTML = `<div class="no-data-text">Loading notifications...</div>`;
    try {
        let safeCol = getSafeTopic(collegeID); let safeDept = getSafeTopic(rawDept); let safeYear = getSafeTopic(myYearStr);
        let myTopics = [`${safeCol}_ALL`, `${safeCol}_STUDENTS_ALL_ALL`, `${safeCol}_STUDENTS_${safeDept}_ALL`, `${safeCol}_STUDENTS_${safeDept}_${safeYear}`];

        const [inboxSnap, globalSnap] = await Promise.all([
            getDocs(query(collection(db, "colleges", collegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30))),
            getDocs(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)))
        ]);

        let notifs = [];
        inboxSnap.forEach(doc => { let d = doc.data(); notifs.push({ title: d.title || "Notice", body: d.body || "", type: "notif", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        globalSnap.forEach(doc => { let d = doc.data(); notifs.push({ title: d.title || "System Update", body: d.body || "", type: "broadcast", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });

        notifs.sort((a,b) => b.time - a.time);
        if (notifs.length === 0) { el.actualNotifList.innerHTML = `<div class="no-data-text">No Notifications</div>`; return; }
        
        el.actualNotifList.innerHTML = notifs.map(n => {
            let timeStr = n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
            return `<div class="data-card ${n.type}"><div class="card-title">${n.title}</div><div class="card-body">${n.body}</div><div class="card-meta"><span>Adhyora</span><span>${timeStr}</span></div></div>`;
        }).join('');
    } catch(e) { el.actualNotifList.innerHTML = `<div class="no-data-text" style="color:#ef4444;">Error: ${e.message}</div>`; }
}

// ==========================================
// 3. MESSAGES
// ==========================================
async function loadMessages() {
    el.msgList.innerHTML = `<div class="no-data-text">Loading inbox...</div>`;
    let msgs = [];
    try {
        const broadcastSnap = await getDocs(query(collection(db, "colleges", collegeID, "sent_messages"), orderBy("timestamp", "desc"), limit(30)));
        broadcastSnap.forEach(doc => {
            let d = doc.data(); let target = d.targetSummary || "";
            let forMe = false;
            if (d.senderID === auth.currentUser.uid) forMe = true;
            else if (target.includes("Everyone") || target.includes("All Students")) forMe = true;
            else { let deptMatch = target.includes("All Depts") || target.includes(rawDept); let yearMatch = target.includes("All Years") || target.includes(myYearStr); if (deptMatch && yearMatch) forMe = true; }
            if (forMe) { msgs.push({ title: d.title || "Notice", body: d.body || "", sender: d.senderName || d.senderRole || "System", type: "broadcast", time: d.timestamp ? d.timestamp.toDate() : new Date() }); }
        });

        const chatSnap = await getDocs(query(collection(db, "colleges", collegeID, "chats"), where("participants", "array-contains", auth.currentUser.uid)));
        for (let chatDoc of chatSnap.docs) {
            const msgSnap = await getDocs(query(collection(db, "colleges", collegeID, "chats", chatDoc.id, "messages"), orderBy("timestamp", "desc"), limit(20)));
            msgSnap.forEach(mDoc => { let d = mDoc.data(); msgs.push({ title: d.title || "Message", body: d.body || "", sender: d.senderName || "User", type: "chat", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        }

        msgs.sort((a,b) => b.time - a.time);
        if (msgs.length === 0) { el.msgList.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
        el.msgList.innerHTML = msgs.map(m => {
            let css = m.type === "broadcast" ? "broadcast" : "";
            let timeStr = m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
            return `<div class="data-card ${css}"><div class="card-title">${m.title}</div><div class="card-body">${m.body}</div><div class="card-meta"><span>${m.sender}</span><span>${timeStr}</span></div></div>`;
        }).join('');
    } catch(e) { el.msgList.innerHTML = `<div class="no-data-text" style="color:#ef4444;">Error: ${e.message}</div>`; }
}


// ==========================================
// DAILY ATTENDANCE MANAGER
// ==========================================
document.getElementById("btnPrevDay").addEventListener("click", () => { currentDailyDate.setDate(currentDailyDate.getDate() - 1); loadDailyAttendance(); });
document.getElementById("btnNextDay").addEventListener("click", () => { currentDailyDate.setDate(currentDailyDate.getDate() + 1); loadDailyAttendance(); });

el.dailyDateBtn.addEventListener("click", () => {
    calendarMode = "daily"; el.calModal.classList.add("active"); 
    currentDisplayDate = new Date(currentDailyDate); loadCalendarData();
});

async function loadDailyAttendance() {
    el.dailyDate.innerText = currentDailyDate.toLocaleString('default', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    el.dailyStatus.innerText = "Checking..."; el.periodsGrid.innerHTML = ""; dailyData = [];
    for(let i=0; i<6; i++) { dailyData.push({hasData: false}); el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; }

    let mStr = String(currentDailyDate.getMonth() + 1).padStart(2, '0'); let dStr = String(currentDailyDate.getDate()).padStart(2, '0');
    let dateStr = `${currentDailyDate.getFullYear()}-${mStr}-${dStr}`;
    let activeSemName = sortedSemesterKeys[currentSemesterIndex] ? sortedSemesterKeys[currentSemesterIndex].replace("_", " ") : "Semester 1";

    try {
        const q = query(collection(db, "colleges", collegeID, "attendance"), where("date", "==", dateStr), where("semester", "==", activeSemName));
        const snapshot = await getDocs(q);
        if(snapshot.empty) { el.dailyStatus.innerText = "No Classes Recorded"; return; }
        
        let isMedToday = false; let cDateObj = new Date(currentDailyDate).setHours(0,0,0,0);
        for(let l of cachedMedicalLeaves) { if(cDateObj >= l.start.setHours(0,0,0,0) && cDateObj <= l.end.setHours(0,0,0,0)) { isMedToday = true; break; } }

        let pCount = 0; let tHeld = 0;
        snapshot.forEach(doc => {
            if(doc.id.includes("GLOBAL")) return; let d = doc.data();
            for(let i=1; i<=6; i++) {
                let pK = `period_${i}`;
                if(d[pK] && d[pK].attendance && d[pK].attendance[currentRollNo] !== undefined) {
                    let isP = (d[pK].attendance[currentRollNo] == true || d[pK].attendance[currentRollNo] == 1);
                    tHeld++; if(isP) pCount++;
                    let sub = d[pK].subject || "Unknown";
                    if(d[pK].event_details && d[pK].event_details[currentRollNo]) sub = d[pK].event_details[currentRollNo];
                    dailyData[i-1] = { hasData: true, isPresent: isP, isMedical: isMedToday, subject: sub, teacher: d[pK].markedByTeacherName || "System", time: d[pK].timestamp ? new Date(d[pK].timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "N/A" };
                }
            }
        });
        if(tHeld > 0) el.dailyStatus.innerText = `Present: ${pCount} / ${tHeld}`; else el.dailyStatus.innerText = "No Classes Recorded";
        
        el.periodsGrid.innerHTML = "";
        for(let i=0; i<6; i++) {
            let d = dailyData[i];
            if(!d.hasData) { el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; continue; }
            let css = d.isMedical ? "btn-medical" : (d.isPresent ? "btn-present" : "btn-absent");
            let txt = d.isMedical ? "M" : (d.isPresent ? "P" : "A");
            el.periodsGrid.innerHTML += `<button class="period-btn ${css}" onclick="openPeriodDetail(${i})">${txt}</button>`;
        }
    } catch(e) { el.dailyStatus.innerText = "Network Error"; }
}

window.openPeriodDetail = function(index) {
    let d = dailyData[index]; if(!d.hasData) return;
    el.dSub.innerText = d.subject; el.dTeach.innerText = `${d.teacher} • ${d.time}`;
    el.dStat.innerHTML = d.isMedical ? "<color style='color:#3b82f6'>Medical Leave</color>" : (d.isPresent ? "<color style='color:#4caf50'>Present</color>" : "<color style='color:#f44336'>Absent</color>");
    el.detailModal.classList.add("active");
};
document.getElementById("closeDetailBtn").addEventListener("click", () => el.detailModal.classList.remove("active"));

// ==========================================
// TIMETABLE
// ==========================================
document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove("active"));
        e.target.classList.add("active"); loadTimetableForDay(e.target.dataset.day);
    });
});

function getMyBatchIndexForSubject(targetSubjectName) {
    for (const enrolledSub of enrolledSubjectsList) {
        if (enrolledSub.startsWith(targetSubjectName)) {
            if (enrolledSub.includes("-")) {
                let parts = enrolledSub.split('-');
                if (parts.length > 1) { let batchNum = parseInt(parts[1].trim()); if (!isNaN(batchNum)) return batchNum - 1; }
            }
            return 0; 
        }
    }
    return -1; 
}

function loadTimetableForDay(selectedDay) {
    el.ttCards.innerHTML = ""; if (activeTimetableUnsubscribe) activeTimetableUnsubscribe();
    let semStr = (currentSemesterIndex + 1).toString();
    const q = query(collection(db, "colleges", collegeID, "timetable_allocations"), where("semester", "==", semStr), where("day", "==", selectedDay));

    activeTimetableUnsubscribe = onSnapshot(q, (snapshot) => {
        el.ttCards.innerHTML = ""; let docs = []; snapshot.forEach(d => docs.push(d.data()));
        let htmlBuffer = "";

        for (let i = 0; i < 6; i++) {
            let pStr = (i + 1).toString(); let periodDocs = docs.filter(d => d.period === pStr); let finalMatch = null;
            finalMatch = periodDocs.find(d => d.category === "Break" || d.category === "Lunch");

            if (!finalMatch) {
                for (let d of periodDocs) {
                    let sName = d.subjectName ? d.subjectName.trim() : ""; let myBatchIdx = getMyBatchIndexForSubject(sName);
                    if (myBatchIdx !== -1) {
                        let isComm = d.isCommon === true; let dBatchIdx = d.splitIndex ? parseInt(d.splitIndex) : 0;
                        if (isComm || dBatchIdx === myBatchIdx) { finalMatch = d; break; }
                    }
                }
            }

            if (!finalMatch && myDepartmentID) {
                for (let d of periodDocs) {
                    let dDept = d.departmentID || ""; let dCat = (d.category || "").toUpperCase();
                    if (dDept === myDepartmentID && (dCat.includes("MJD") || dCat.includes("CORE"))) { finalMatch = d; break; }
                }
            }

            if (finalMatch) {
                let cat = finalMatch.category || "-"; let subj = finalMatch.subjectName || "Unknown"; let room = finalMatch.room || "TBD";
                let isComm = finalMatch.isCommon === true;
                if (!isComm && finalMatch.splitIndex) { let bIdx = parseInt(finalMatch.splitIndex); subj += ` <span style="font-size:10px; color:#eab308;">(Batch ${bIdx + 1})</span>`; }
                let cardClass = "tt-card"; if (cat === "Break" || cat === "Lunch") { cardClass += " break"; subj = cat; cat = "-"; }
                
                htmlBuffer += `<div class="${cardClass}"><div class="tt-pill-row"><div class="tt-pill cat-pill">${cat}</div><div class="tt-pill sub-pill">${subj}</div></div><div class="tt-pill-row"><div class="tt-pill sem-pill">Semester ${semStr}</div><div class="tt-pill room-pill">${room}</div></div></div>`;
            } else {
                htmlBuffer += `<div class="tt-card free"><div class="tt-pill-row"><div class="tt-pill cat-pill" style="color:#94a3b8">-</div><div class="tt-pill sub-pill" style="color:#64748b">Free Period</div></div><div class="tt-pill-row"><div class="tt-pill sem-pill" style="color:#94a3b8">-</div><div class="tt-pill room-pill" style="color:#94a3b8">-</div></div></div>`;
            }
        }
        el.ttCards.innerHTML = htmlBuffer; updateTimelineVisuals();
    });
}

function updateTimelineVisuals() {
    if (el.ttView.classList.contains("hidden-view")) return;
    let now = new Date(); let currentHour = now.getHours() + (now.getMinutes() / 60);
    let pStart = 9.5; let pEnd = 16.5; let progress = Math.max(0, Math.min(1, (currentHour - pStart) / (pEnd - pStart)));
    el.ttProgress.style.height = `${progress * 100}%`;

    let endTimes = [10.5, 11.5, 12.5, 14.5, 15.5, 16.5]; let nodesHTML = "";
    for (let i = 0; i < 6; i++) {
        let nodeStart = (i === 0) ? 9.5 : endTimes[i - 1]; if (i === 3) nodeStart = 13.5; 
        let nClass = "tt-node";
        if (currentHour >= nodeStart && currentHour < endTimes[i]) nClass += " active"; else if (currentHour >= endTimes[i]) nClass += " completed";
        nodesHTML += `<div class="${nClass}">${i+1}</div>`;
    }
    el.ttNodes.innerHTML = nodesHTML;
}
setInterval(updateTimelineVisuals, 60000); 

// ==========================================
// DEVICE SESSIONS & SETTINGS
// ==========================================
document.getElementById("openSettingsBtn").addEventListener("click", () => { el.sidebar.classList.add("open"); el.overlay.classList.add("active"); });
el.overlay.addEventListener("click", () => { el.sidebar.classList.remove("open"); el.overlay.classList.remove("active"); });
document.getElementById("btnSignOut").addEventListener("click", () => { signOut(auth).then(() => window.location.href = "index.html"); });
document.getElementById("btnContact").addEventListener("click", () => window.open(`mailto:pixelaks.technologies@gmail.com`, '_blank'));

document.getElementById("btnDevices").addEventListener("click", () => {
    el.sidebar.classList.remove("open"); el.overlay.classList.remove("active");
    el.sessionsModal.classList.add("active"); loadSessions();
});
document.getElementById("closeSessionsBtn").addEventListener("click", () => el.sessionsModal.classList.remove("active"));

async function loadSessions() {
    el.sessionsList.innerHTML = `<div class="no-data-text">Loading active devices...</div>`;
    try {
        const q1 = query(collection(db, "colleges", collegeID, "students", currentRollNo, "sessions"));
        const q2 = query(collection(db, "colleges", collegeID, "students", auth.currentUser.uid, "sessions"));
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        let htmlBuffer = ""; let addedDocs = new Set();
        
        const processDoc = (doc) => {
            if (addedDocs.has(doc.id)) return;
            addedDocs.add(doc.id);
            
            let d = doc.data(); let devName = d.deviceName || "Unknown Device";
            let isMe = (doc.id === myWebDeviceID);
            if (isMe) devName += " (This Browser)";
            
            let timeStr = "Recently";
            if (d.loginTime) timeStr = d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

            let btnHtml = isMe ? `<span style="font-size:10px; color:#10b981; font-weight:bold;">Active</span>` : `<button class="revoke-btn" onclick="revokeSession('${doc.id}', '${doc.ref.parent.parent.id}')">Kick</button>`;
            
            htmlBuffer += `
                <div class="session-card">
                    <div class="session-info"><h4>${devName}</h4><p>Logged in: ${timeStr}</p></div>
                    ${btnHtml}
                </div>`;
        };
        
        snap1.forEach(processDoc); snap2.forEach(processDoc);
        
        if (addedDocs.size === 0) { el.sessionsList.innerHTML = `<div class="no-data-text">No active sessions found.</div>`; return; }
        el.sessionsList.innerHTML = htmlBuffer;
    } catch(e) { el.sessionsList.innerHTML = `<div class="no-data-text" style="color:#ef4444;">Error loading sessions</div>`; }
}

window.revokeSession = async function(sessionID, parentDocID) {
    if (!confirm("Are you sure you want to log this device out?")) return;
    try {
        await deleteDoc(doc(db, "colleges", collegeID, "students", parentDocID, "sessions", sessionID));
        alert("Session revoked. The device will be logged out shortly.");
        loadSessions();
    } catch(e) { alert("Error revoking session."); }
};

// ==========================================
// CALENDAR
// ==========================================
document.getElementById("btnCalendar").addEventListener("click", () => { 
    calendarMode = "global"; el.calModal.classList.add("active"); 
    let d = new Date(); currentDisplayDate = new Date(d.getFullYear(), d.getMonth(), 1); 
    loadCalendarData(); 
});
document.getElementById("closeCalendarBtn").addEventListener("click", () => el.calModal.classList.remove("active"));
document.getElementById("calPrevMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1); loadCalendarData(); });
document.getElementById("calNextMonth").addEventListener("click", () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1); loadCalendarData(); });

async function loadCalendarData() {
    el.calTitle.innerText = currentDisplayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    el.calGrid.innerHTML = ""; el.upcomingTxt.innerHTML = "Loading...";
    let displayYear = currentDisplayDate.getFullYear(); let displayMonth = currentDisplayDate.getMonth() + 1; 
    let targetYearStr = (displayMonth >= 6) ? `${displayYear}-${displayYear + 1}` : `${displayYear - 1}-${displayYear}`;
    
    if (cachedCalYear !== targetYearStr) {
        cachedCalYear = targetYearStr; calWorkingDays.clear(); calNonWorkingDays.clear(); semStarts.clear(); semEnds.clear();
        try {
            const [semDoc, workDoc, holDoc] = await Promise.all([ getDoc(doc(db, "colleges", collegeID, "semesters", targetYearStr)), getDoc(doc(db, "colleges", collegeID, "workingDays", targetYearStr)), getDoc(doc(db, "colleges", collegeID, "nonWorkingDays", targetYearStr)) ]);
            if (semDoc.exists()) { let d = semDoc.data(); if(d.oddSemester?.startDate) semStarts.set(d.oddSemester.startDate, "Odd"); if(d.oddSemester?.endDate) semEnds.set(d.oddSemester.endDate, "Odd"); if(d.evenSemester?.startDate) semStarts.set(d.evenSemester.startDate, "Even"); if(d.evenSemester?.endDate) semEnds.set(d.evenSemester.endDate, "Even"); }
            if (workDoc.exists()) { Object.keys(workDoc.data()).forEach(k => calWorkingDays.add(k)); }
            if (holDoc.exists()) { Object.entries(holDoc.data()).forEach(([k, v]) => calNonWorkingDays.set(k, v)); }
        } catch(e) {}
    }
    renderCalendarGrid(); updateUpcomingEvent();
}

function renderCalendarGrid() {
    el.calGrid.innerHTML = ""; const year = currentDisplayDate.getFullYear(); const month = currentDisplayDate.getMonth(); const today = new Date();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { el.calGrid.innerHTML += `<div class="cal-cell empty"></div>`; }
    for (let day = 1; day <= daysInMonth; day++) {
        let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let cellClass = "cal-cell normal"; let subText = ""; let popupText = "";
        
        if (semStarts.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>Start</span>"; popupText = `${semStarts.get(dateStr)} Semester Starts`; } 
        else if (semEnds.has(dateStr)) { cellClass = "cal-cell semester"; subText = "<br><span class='cal-subtitle'>End</span>"; popupText = `${semEnds.get(dateStr)} Semester Ends`; }
        else { if (!calWorkingDays.has(dateStr)) { if (calNonWorkingDays.has(dateStr)) { cellClass = "cal-cell holiday"; popupText = calNonWorkingDays.get(dateStr); } else { let dWeek = new Date(year, month, day).getDay(); if (dWeek === 0 || dWeek === 6) { cellClass = "cal-cell holiday"; } } } }
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) { cellClass += " today"; }
        
        let clickEvent = "";
        if (calendarMode === "daily") clickEvent = `onclick="selectDateAndLoadDaily('${dateStr}')"`;
        else clickEvent = popupText ? `onclick="alert('${popupText}')"` : "";
        
        el.calGrid.innerHTML += `<div class="${cellClass}" ${clickEvent}>${day}${subText}</div>`;
    }
}

window.selectDateAndLoadDaily = function(dateStr) {
    el.calModal.classList.remove("active");
    let parts = dateStr.split('-'); currentDailyDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    loadDailyAttendance();
};

function updateUpcomingEvent() {
    let checkDate = new Date(); let found = false;
    for (let i = 0; i < 60; i++) {
        let fDate = new Date(checkDate); fDate.setDate(checkDate.getDate() + i);
        let dateStr = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}-${String(fDate.getDate()).padStart(2, '0')}`;
        if (calNonWorkingDays.has(dateStr)) { let reason = calNonWorkingDays.get(dateStr); if (reason === "Holiday/Weekend") reason = "Holiday"; el.upcomingTxt.innerHTML = `<span style="font-size:10px; color:#666;">upcoming</span><br><b>${fDate.getDate()} | ${fDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</b><br><span style="font-size:12px;">${reason}</span>`; found = true; break; }
        let dWeek = fDate.getDay(); if ((dWeek === 0 || dWeek === 6) && !calWorkingDays.has(dateStr)) { el.upcomingTxt.innerHTML = `<span style="font-size:10px; color:#666;">upcoming</span><br><b>${fDate.getDate()} | ${fDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</b><br><span style="font-size:12px;">Weekend</span>`; found = true; break; }
    }
    if (!found) el.upcomingTxt.innerHTML = "No upcoming holidays";
}
