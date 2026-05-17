import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp, onSnapshot, collection, query, where, getDoc, getDocs, orderBy, limit, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage, deleteToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";
// 🚨 PASTE YOUR REAL CONFIG HERE 🚨
const firebaseConfig = {
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521"
};

// 🚨 ALL INITIALIZATIONS HAPPEN HERE IN ORDER 🚨
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app); // <-- MOVED HERE AFTER 'app' EXISTS!

// ==========================================
// 🚨 ZERO-COST RAM CACHES 🚨
// ==========================================

let myCurrentPushToken = ""; // Remembers the token for this session
let collegeID = ""; let studentUID = ""; let currentRollNo = "";
let collegeSemesterType = "Odd"; 
let loadedSemesters = {}; let sortedSemesterKeys = []; let currentSemesterIndex = 0;

let rawDept = ""; let myDepartmentID = ""; let myYearStr = ""; 
let enrolledSubjectsList = [];
let currentStudentEnrolledMap = {}; 
let optimizedSubjectCache = null; 

let currentDailyDate = new Date(); 
let cachedMedicalLeaves = []; 

let dailyAttendanceCache = {}; 
let timetableCache = [];       
let sessionsCache = new Map(); 
let cachedAssignments = [];
let cachedNotifs = [];
let cachedMessages = [];
let isDataListening = false;

let activeMarksUnsubscribe = null;
let activeTimetableUnsubscribe = null;

let calendarMode = "global"; let currentDisplayDate = new Date(); 
let cachedCalYear = ""; let calWorkingDays = new Set(); let calNonWorkingDays = new Map(); let semStarts = new Map(); let semEnds = new Map();

// 🚨 ADDED MISSING GLOBAL DATA FLAG 🚨
let isGlobalDataLoaded = false; 

let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let currentStudentProfileData = null; 

// 🚨 LEAVE PREDICTOR STATES 🚨
let actualProjectedPercent = 0;
let savedStrictPresent = 0;
let savedStrictTotal = 0;
let savedRemainingDays = 0;
let isStrictCollege = true;

// ==========================================
// 🚨 DYNAMIC PHONE STATUS BAR CONTROLLER
// ==========================================
function updateStatusBar() {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) return;

    const loader = document.getElementById("initialAppLoader");
    const paywall = document.getElementById("subscriptionBlockPanel");

    // Check if splash screen or paywall are visible
    const isLoaderActive = loader && !loader.classList.contains("hidden") && loader.style.display !== "none";
    const isPaywallActive = paywall && paywall.classList.contains("active");

    if (isLoaderActive || isPaywallActive) {
        // Keep it Dark Navy for Loading & Paywall
        themeMeta.setAttribute("content", "#0b111e"); 
    } else {
        // We are on the Dashboard! Let the Theme Engine decide (White or Dark Mode)
        const isDark = document.body.classList.contains("dark-mode");
        themeMeta.setAttribute("content", isDark ? "#0f172a" : "#ffffff"); 
    }
}

function hideAppLoader() {
    const loader = document.getElementById("initialAppLoader");
    if (loader && !loader.classList.contains("hidden")) {
        // Add a tiny 800ms delay so the loading screen feels smooth
        setTimeout(() => {
            loader.classList.add("hidden");
            updateStatusBar(); // 🚨 Trigger color change when loader fades!
        }, 800);
    }
}

// ==========================================
// DOM ELEMENTS
// ==========================================
const el = {
    name: document.getElementById("studentName"), roll: document.getElementById("studentRoll"),
    badge: document.getElementById("statusBadge"), semTitle: document.getElementById("semesterTitle"),
    waterFill: document.getElementById("waterFill"), pctText: document.getElementById("overallPercentageText"),
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
    
    mainView: document.getElementById("mainDashboardView"),
    dailyView: document.getElementById("dailyAttendanceView"),
    ttView: document.getElementById("timetableView"),
    assignView: document.getElementById("assignmentsView"),
    actualNotifView: document.getElementById("actualNotifView"),
    msgView: document.getElementById("messagesView"),
    
    dailyDateBtn: document.getElementById("dailyDateBtn"),
    dailyDate: document.getElementById("dailyDateText"), dailyStatus: document.getElementById("dailyStatusText"),
    periodsGrid: document.getElementById("periodsGrid"), detailModal: document.getElementById("periodDetailModal"),
    dSub: document.getElementById("detailSubjectText"), dTeach: document.getElementById("detailTeacherText"), dStat: document.getElementById("detailStatusText"),

    ttDays: document.getElementById("timetableDays"), ttCards: document.getElementById("ttCardsContainer"),
    ttProgress: document.getElementById("ttProgressBar"), ttNodes: document.getElementById("ttNodes"),
    
    assignList: document.getElementById("assignmentsListContainer"),
    actualNotifList: document.getElementById("actualNotifListContainer"),
    msgList: document.getElementById("messagesListContainer"),

    sessionsModal: document.getElementById("sessionsModal"),
    sessionsList: document.getElementById("sessionsListContainer"),
    profileModal: document.getElementById("profileDetailsModal"),
    profileContent: document.getElementById("profileDetailsContent"),
    
    predictorModal: document.getElementById("leavePredictorModal"),
    predictStatusText: document.getElementById("predictStatusText"),
    leaveDaysInput: document.getElementById("leaveDaysInput"),
    predictSubmitBtn: document.getElementById("predictSubmitBtn"),
    predictWaterFill: document.getElementById("predictWaterFill"),
    predictPercentageText: document.getElementById("predictPercentageText")
};

// ==========================================
// INITIALIZATION
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
collegeID = urlParams.get('college'); studentUID = urlParams.get('uid');

if (!collegeID || !studentUID) { 
    window.location.href = "index.html"; 
} else {
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
    
    onSnapshot(doc(db, "colleges", collegeID), (colSnap) => {
        if (colSnap.exists()) {
            let data = colSnap.data();
            if (data.currentSemesterType) { collegeSemesterType = data.currentSemesterType; }

            const blockPanel = document.getElementById("subscriptionBlockPanel");
            const dashboardUI = document.querySelector(".dashboard-container"); 
            
            if (!data.subscription) {
                blockPanel.classList.add("active");
                dashboardUI.style.display = "none";
              updateStatusBar();
            } else {
                let expiryTimestamp = data.subscription.expiryDate || 0;
                let hardBlockDate = new Date(expiryTimestamp * 1000);
                hardBlockDate.setDate(hardBlockDate.getDate() + 8); 
                
                if (new Date() > hardBlockDate) {
                    blockPanel.classList.add("active");
                    dashboardUI.style.display = "none"; 
                  updateStatusBar();
                } else {
                    blockPanel.classList.remove("active");
                    dashboardUI.style.display = "flex"; 
                  updateStatusBar();
                }
            }
        }
    });

    const secureUID = auth.currentUser.uid; 
    const q = query(collection(db, "colleges", collegeID, "students"), where("userID", "==", secureUID));

    // 🚨 PREVENTS THE SNAPSHOT CASCADE
    let isFirstBoot = true; 

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) { el.name.innerText = "Profile Not Found"; return; }
        const docSnap = snapshot.docs[0];
        currentRollNo = docSnap.id; 
        
        registerWebSession();

        // 🚨 ONLY FETCH THESE HEAVY ARRAYS ONCE!
        if (isFirstBoot) {
            fetchGlobalCalendarData(); 
            
            try {
                const medSnap = await getDocs(query(collection(db, "colleges", collegeID, "medical_leaves"), where("studentID", "==", currentRollNo)));
                cachedMedicalLeaves = [];
                medSnap.forEach(d => { 
                    let data = d.data(); 
                    if(data.startDate && data.endDate) cachedMedicalLeaves.push({ start: new Date(data.startDate), end: new Date(data.endDate) }); 
                });
            } catch(e) { console.error("Medical Leave Error", e); }
            
            isFirstBoot = false;
        }

        processStudentData(docSnap.data());
        loadDailyAttendance(); 

      // 🚨 ADD THIS LINE RIGHT HERE! 🚨
        hideAppLoader();
        
        if (!isDataListening) {
            isDataListening = true;
            startBackgroundListeners();
            requestPushPermissions();

          updateNotificationToggleUI();
        }

        if (!el.ttView.classList.contains("hidden-view")) {
            let todayName = document.querySelector('.day-btn.active').dataset.day;
            loadTimetableForDay(todayName);
        }
        if (!el.assignView.classList.contains("hidden-view")) loadAssignments();
        if (!el.actualNotifView.classList.contains("hidden-view")) loadActualNotifications();
        if (!el.msgView.classList.contains("hidden-view")) loadMessages();
    });
}

// 🚨 ADDED MISSING GLOBAL CACHE FUNCTION 🚨
async function fetchGlobalCalendarData() {
    let now = new Date();
    let startYear = (now.getMonth() >= 5) ? now.getFullYear() : now.getFullYear() - 1;
    let targetYearStr = `${startYear}-${startYear + 1}`;
    
    try {
        const [semDoc, workDoc, holDoc] = await Promise.all([ 
            getDoc(doc(db, "colleges", collegeID, "semesters", targetYearStr)), 
            getDoc(doc(db, "colleges", collegeID, "workingDays", targetYearStr)), 
            getDoc(doc(db, "colleges", collegeID, "nonWorkingDays", targetYearStr)) 
        ]);
        if (semDoc.exists()) { let d = semDoc.data(); if(d.oddSemester?.startDate) semStarts.set(d.oddSemester.startDate, "Odd"); if(d.oddSemester?.endDate) semEnds.set(d.oddSemester.endDate, "Odd"); if(d.evenSemester?.startDate) semStarts.set(d.evenSemester.startDate, "Even"); if(d.evenSemester?.endDate) semEnds.set(d.evenSemester.endDate, "Even"); }
        if (workDoc.exists()) { Object.keys(workDoc.data()).forEach(k => calWorkingDays.add(k)); }
        if (holDoc.exists()) { Object.entries(holDoc.data()).forEach(([k, v]) => calNonWorkingDays.set(k, v)); }
        
        isGlobalDataLoaded = true;
        
        // Triggers UI reload now that the calendar data is ready!
        if (sortedSemesterKeys.length > 0) updateUIForCurrentSemester();
    } catch(e) { console.error("Error fetching global data", e); }
}

// 🚨 REPLACE YOUR ENTIRE startBackgroundListeners FUNCTION WITH THIS 🚨

function startBackgroundListeners() {
    let cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    onSnapshot(query(collection(db, "colleges", collegeID, "assignments"), where("createdAt", ">=", cutoff), orderBy("createdAt", "desc")), (snap) => {
        cachedAssignments = []; let mySemStr = `Semester ${currentSemesterIndex + 1}`;
        snap.forEach(doc => {
            let d = doc.data(); let sub = d.subject || "Unknown";
            let isExplicitMatch = enrolledSubjectsList.some(s => s.trim().toLowerCase() === sub.trim().toLowerCase());
            let isDepartmentMatch = (d.teacherDeptID || "").trim().toLowerCase() === myDepartmentID.toLowerCase() && (d.semester || "").trim().toLowerCase() === mySemStr.toLowerCase();
            if (isExplicitMatch || isDepartmentMatch || enrolledSubjectsList.length === 0) {
                cachedAssignments.push({ title: `Assignment: ${sub}`, body: d.topic || "No Topic", teach: d.teacherName || "Teacher", due: d.dueDate || "N/A", time: d.createdAt ? d.createdAt.toDate() : new Date() });
            }
        });
        if (!el.assignView.classList.contains("hidden-view")) loadAssignments();
    });

    function getSafeTopic(input) { return (!input || input === "All") ? "ALL" : input.replace(/[^a-zA-Z0-9]/g, ''); }
    let safeCol = getSafeTopic(collegeID); let safeDept = getSafeTopic(rawDept); let safeYear = getSafeTopic(myYearStr);
    let myTopics = [`${safeCol}_ALL`, `${safeCol}_STUDENTS_ALL_ALL`, `${safeCol}_STUDENTS_${safeDept}_ALL`, `${safeCol}_STUDENTS_${safeDept}_${safeYear}`];
    let inboxCache = []; let globalCache = [];
    const updateNotifUI = () => {
        cachedNotifs = [...inboxCache, ...globalCache].sort((a,b) => b.time - a.time);
        if (!el.actualNotifView.classList.contains("hidden-view")) loadActualNotifications();
    };
    onSnapshot(query(collection(db, "colleges", collegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        inboxCache = []; snap.forEach(doc => { let d = doc.data(); inboxCache.push({ title: d.title || "Notice", body: d.body || "", type: "notif", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        updateNotifUI();
    });
    onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        globalCache = []; snap.forEach(doc => { let d = doc.data(); globalCache.push({ title: d.title || "System Update", body: d.body || "", type: "broadcast", time: d.timestamp ? d.timestamp.toDate() : new Date() }); });
        updateNotifUI();
    });

    let broadcastCache = []; let privateChatCache = [];
    const updateMsgUI = () => {
        cachedMessages = [...broadcastCache, ...privateChatCache].sort((a,b) => b.time - a.time);
        if (!el.msgView.classList.contains("hidden-view")) loadMessages();
    };
    onSnapshot(query(collection(db, "colleges", collegeID, "sent_messages"), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        broadcastCache = [];
        snap.forEach(doc => {
            let d = doc.data(); let target = d.targetSummary || ""; let forMe = false;
            if (d.senderID === auth.currentUser.uid) forMe = true;
            else if (target.includes("Everyone") || target.includes("All Students")) forMe = true;
            else { let deptMatch = target.includes("All Depts") || target.includes(rawDept); let yearMatch = target.includes("All Years") || target.includes(myYearStr); if (deptMatch && yearMatch) forMe = true; }
            if (forMe) { 
                let role = d.senderRole || "Principal"; 
                broadcastCache.push({ title: d.title || "Notice", body: d.body || "", sender: d.senderName || d.senderRole || "System", senderRole: role, type: "broadcast", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
            }
        });
        updateMsgUI();
    });

    // 🚨 OPTIMIZED CHAT LISTENER 🚨
    let activeMessageListeners = new Map(); 

    onSnapshot(query(collection(db, "colleges", collegeID, "chats"), where("participants", "array-contains", auth.currentUser.uid)), (snap) => {
        snap.docChanges().forEach(change => {
            let chatID = change.doc.id;

            if (change.type === "added") {
                let unsub = onSnapshot(query(collection(db, "colleges", collegeID, "chats", chatID, "messages"), orderBy("timestamp", "desc"), limit(20)), (msgSnap) => {
                    privateChatCache = privateChatCache.filter(m => m.roomID !== chatID); 
                    msgSnap.forEach(mDoc => { 
                        let d = mDoc.data(); 
                        let role = d.senderRole || "Principal"; 
                        privateChatCache.push({ roomID: chatID, title: d.title || "Message", body: d.body || "", sender: d.senderName || "User", senderRole: role, type: "chat", time: d.timestamp ? d.timestamp.toDate() : new Date() }); 
                    });
                    updateMsgUI();
                });
                activeMessageListeners.set(chatID, unsub);
            }

            if (change.type === "removed") {
                if (activeMessageListeners.has(chatID)) {
                    activeMessageListeners.get(chatID)(); 
                    activeMessageListeners.delete(chatID);
                }
                privateChatCache = privateChatCache.filter(m => m.roomID !== chatID);
                updateMsgUI();
            }
        });
    });

    const updateSessionCache = (snap, parentID) => {
        snap.docChanges().forEach(change => {
            if (change.type === "removed") sessionsCache.delete(change.doc.id);
            else sessionsCache.set(change.doc.id, { id: change.doc.id, parent: parentID, ...change.doc.data() });
        });
        if (el.sessionsModal.classList.contains("active")) loadSessions();
    };
    onSnapshot(query(collection(db, "colleges", collegeID, "students", currentRollNo, "sessions")), snap => updateSessionCache(snap, currentRollNo));
    onSnapshot(query(collection(db, "colleges", collegeID, "students", auth.currentUser.uid, "sessions")), snap => updateSessionCache(snap, auth.currentUser.uid));
}

// (Make sure function processStudentData(data) is right below this!)

function processStudentData(data) {
    currentStudentProfileData = data; 
    
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

    let simplePercent = (semData.simpleTotalHeld > 0) ? (semData.simpleTotalAttended / semData.simpleTotalHeld) * 100 : 0;
    
    let projectedStrictPercent = 0;
    let currentStrictPercent = 0;

    savedStrictPresent = 0;
    savedStrictTotal = 0;
    savedRemainingDays = 0;

    if (isStrictCollege) {
        currentStrictPercent = (semData.strictTotal > 0) ? (semData.strictPresent / semData.strictTotal) * 100 : 0;
        projectedStrictPercent = currentStrictPercent;

        let globalMode = collegeSemesterType || "Odd";
        let semNum = currentSemesterIndex + 1;
        let isCurrentlyActiveSem = (globalMode == "Odd" && semNum % 2 != 0) || (globalMode == "Even" && semNum % 2 == 0);

        if (isGlobalDataLoaded && isCurrentlyActiveSem) {
            
            if (calWorkingDays.size > 0) {
                let remainingDays = 0;
                let iterator = new Date(); iterator.setDate(iterator.getDate() + 1);
                
                calWorkingDays.forEach(dateKey => {
                    let dateObj = new Date(dateKey);
                    if (dateObj >= iterator) remainingDays++;
                });

                if (remainingDays > 0) {
                    savedStrictPresent = semData.strictPresent;
                    savedStrictTotal = semData.strictTotal;
                    savedRemainingDays = remainingDays;

                    let projNum = savedStrictPresent + remainingDays;
                    let projDenom = savedStrictTotal + remainingDays;

                    if (projDenom > 0) projectedStrictPercent = (projNum / projDenom) * 100.0;
                }
            }
        }
    } else {
        projectedStrictPercent = simplePercent;
        currentStrictPercent = simplePercent;
    }

    actualProjectedPercent = projectedStrictPercent;
    let currentOverallPercent = isStrictCollege ? currentStrictPercent : simplePercent;

    // ✅ REPLACE WITH THIS:
    el.pctText.innerText = `${projectedStrictPercent.toFixed(2)}%`;
    el.curPctText.innerText = `Current: ${currentOverallPercent.toFixed(2)}%`;
    el.attClasses.innerText = `Attended: ${semData.strictPresent}`; el.totClasses.innerText = `Total: ${semData.strictTotal}`;
    el.absClasses.innerText = `Absent: ${semData.strictTotal - semData.strictPresent}`;
    el.perPres.innerText = `Periods Present: ${semData.simplePresent}`; el.perTot.innerText = `Total Periods: ${semData.simpleTotal}`;
    el.perAbs.innerText = `Periods Absent: ${semData.simpleTotal - semData.simplePresent}`;

    let ringColor = GetPredictorColor(projectedStrictPercent);
    let hexColor = "#" + ((1 << 24) + (ringColor.r << 16) + (ringColor.g << 8) + ringColor.b).toString(16).slice(1);
    
    el.badge.innerText = projectedStrictPercent >= 85 ? "Excellent" : projectedStrictPercent >= 70 ? "Good" : projectedStrictPercent >= 50 ? "Average" : "Critical";
    el.badge.style.backgroundColor = hexColor;
    
    let textColor = (projectedStrictPercent >= 70 && projectedStrictPercent < 85) ? "#0f172a" : "#ffffff";
    let targetHeight = `calc(${Math.min(100, Math.max(0, currentOverallPercent))}% - 12px)`;

    let existingWater = document.getElementById("animatedRowWater");
    let existingText = document.getElementById("animatedRowText");

    if (!existingWater) {
        el.curPctText.style.position = "relative";
        el.curPctText.style.overflow = "hidden";
        el.curPctText.style.padding = "0"; 
        el.curPctText.style.borderBottom = "none";
        el.curPctText.style.backgroundColor = "transparent"; 

        el.curPctText.innerHTML = `
            <div class="row-water-container" id="animatedRowWater" style="background-color: ${hexColor}; height: 0px;">
                <div class="row-water-wave"></div>
            </div>
            <div id="animatedRowText" style="position: relative; z-index: 2; padding: 8px 12px; font-weight: normal; color: ${textColor}; transition: color 0.5s;">
                Current: ${currentOverallPercent.toFixed(2)}%
            </div>
        `;

        setTimeout(() => {
            let waterEl = document.getElementById("animatedRowWater");
            if(waterEl) waterEl.style.height = targetHeight;
        }, 50);
        
    } else {
        existingWater.style.backgroundColor = hexColor;
        existingWater.style.height = targetHeight;
        
        existingText.style.color = textColor;
        existingText.innerText = `Current: ${currentOverallPercent.toFixed(2)}%`;
    }
    el.waterFill.style.backgroundColor = hexColor;
    el.waterFill.style.top = `${100 - Math.min(100, projectedStrictPercent)}%`;
    el.subList.innerHTML = (!semData.hasData || semData.subjects.length === 0) ? `<div class="no-data-text">No Attendance Data</div>` : semData.subjects.map(sub => {
        const ratio = sub.total > 0 ? (sub.present / sub.total) : 0; const subPct = ratio * 100;
        let barColor = ratio < 0.6 ? "#f44336" : ratio < 0.75 ? "#ff9800" : "#4caf50";
        return `<div class="subject-row"><div class="row-header"><span>${sub.name}</span><span style="color:${barColor}">${subPct.toFixed(0)}% <span style="font-size:9px; color:#888;">(${sub.present}/${sub.total})</span></span></div><div class="progress-track"><div class="progress-fill" style="width: ${subPct}%; background-color: ${barColor};"></div></div></div>`;
    }).join('');

    fetchMarksForSemester(semData.name);
    buildEnrolledSubjectsUI(semData.name); 

    dailyAttendanceCache = {}; 
    startTimetableListener(); 
}

// 🚨 PREDICTOR MATH HELPER 🚨
function GetPredictorColor(percentage) {
    if (percentage >= 85) return {r: 76, g: 175, b: 80};      // Green
    else if (percentage >= 70) return {r: 255, g: 193, b: 7}; // Yellow
    else if (percentage >= 50) return {r: 255, g: 152, b: 0}; // Orange
    else return {r: 244, g: 67, b: 54};                       // Red
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
// ENROLLED SUBJECTS BUILDER
// ==========================================
async function buildEnrolledSubjectsUI(semesterName) {
    let listEl = document.getElementById("enrolledSubjectsListText");
    listEl.innerHTML = "<i>Loading subjects...</i>";
    
    let cleanSemNum = semesterName.replace("Semester", "").replace("_", "").trim();
    let finalSubjects = [];

    let semKey = semesterName.replace(" ", "_"); 
    let enrollMap = currentStudentEnrolledMap[semKey] || currentStudentEnrolledMap[semesterName] || {};
    for (let [cat, sub] of Object.entries(enrollMap)) {
        finalSubjects.push(`<span style="color:#f59e0b; font-weight:bold;">[${cat}]</span> ${sub}`);
    }

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

    let cleanStuDept = rawDept.replace(/\s/g, "").toLowerCase().replace("dept_", "");
    optimizedSubjectCache.forEach(sub => {
        if (sub.semesterArray.includes(cleanSemNum)) {
            let isDeptMatch = (sub.cleanSubDept === cleanStuDept) || (cleanStuDept.includes(sub.cleanSubDept) && sub.cleanSubDept.length > 3) || (sub.cleanSubDept.includes(cleanStuDept) && cleanStuDept.length > 3);
            if ((sub.cleanType.includes("MJD") || sub.cleanType.includes("CORE") || sub.cleanType.includes("TUTORIAL")) && isDeptMatch) {
                let newEntry = `<span style="color:#10b981; font-weight:bold;">[${sub.rawType}]</span> ${sub.displayName}`;
                if (!finalSubjects.some(existing => existing.includes(sub.displayName))) {
                    finalSubjects.unshift(newEntry);
                }
            }
        }
    });

    if (finalSubjects.length === 0) listEl.innerHTML = "<i>No subjects assigned for this semester.</i>";
    else listEl.innerHTML = finalSubjects.join("<br>");
}

// ==========================================
// PROFILE MODAL
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
// 🚨 LEAVE PREDICTOR LOGIC 🚨
// ==========================================
document.getElementById("attendanceWater").addEventListener("click", () => {
    el.predictorModal.classList.add("active");
    el.leaveDaysInput.value = "";
    el.predictStatusText.innerHTML = "Enter the days to know the percentage drop.";
    ResetPredictorVisuals();
});

document.getElementById("closePredictorBtn").addEventListener("click", () => {
    el.predictorModal.classList.remove("active");
});

function ResetPredictorVisuals() {
    let startColor = GetPredictorColor(actualProjectedPercent);
    let hexColor = "#" + ((1 << 24) + (startColor.r << 16) + (startColor.g << 8) + startColor.b).toString(16).slice(1);
    
    el.predictWaterFill.style.backgroundColor = hexColor;
    el.predictWaterFill.style.top = `${100 - Math.min(100, actualProjectedPercent)}%`;
    
    el.predictPercentageText.innerHTML = `<span style="font-size: 13px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Current</span><br><span style="color:${hexColor}">${actualProjectedPercent.toFixed(2)}%</span>`;
}

document.getElementById("predictSubmitBtn").addEventListener("click", () => {
    let inputVal = el.leaveDaysInput.value;
    if (!inputVal) return;
    
    let leaveDays = parseInt(inputVal);
    if (isNaN(leaveDays) || leaveDays < 0) leaveDays = 0;

    if (leaveDays > savedRemainingDays) {
        el.predictStatusText.innerHTML = `<span style="color:#ef4444;">Semester only has ${savedRemainingDays} days remaining. Enter valid days.</span>`;
        ResetPredictorVisuals();
        return;
    }

    el.predictStatusText.innerHTML = `<span style="color:#10b981;">Prediction calculated.</span>`;

    let projNum = savedStrictPresent + (savedRemainingDays - leaveDays);
    let projDenom = savedStrictTotal + savedRemainingDays;
    let predictedPercent = 0;
    
    if (projDenom > 0) predictedPercent = (projNum / projDenom) * 100.0;

    AnimatePrediction(actualProjectedPercent, predictedPercent);
});

function AnimatePrediction(startValue, targetValue) {
    let duration = 800; // ms
    let startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        let progress = (timestamp - startTime) / duration;
        if (progress > 1) progress = 1;
        
        let easeProgress = progress * progress * (3 - 2 * progress);
        let currentVal = startValue + (targetValue - startValue) * easeProgress;
        
        let currentColor = GetPredictorColor(currentVal);
        let hexColor = "#" + ((1 << 24) + (currentColor.r << 16) + (currentColor.g << 8) + currentColor.b).toString(16).slice(1);
        
        el.predictWaterFill.style.backgroundColor = hexColor;
        el.predictWaterFill.style.top = `${100 - Math.min(100, currentVal)}%`;
        el.predictPercentageText.innerHTML = `<span style="font-size: 13px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Predicted</span><br><span style="color:${hexColor}">${currentVal.toFixed(2)}%</span>`;

        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    }
    window.requestAnimationFrame(step);
}

// ==========================================
// 🚨 VIEW TOGGLING 🚨
// ==========================================
const btnNavMain = document.getElementById("btnNavMain");
const btnNavAssign = document.getElementById("btnNavAssign");
const btnNavNotif = document.getElementById("btnNavNotif");
const btnNavMsg = document.getElementById("btnNavMsg");
const btnNavTimetable = document.getElementById("btnNavTimetable");
const btnNavDaily = document.getElementById("btnNavDaily");

// 🚨 ADDED: pushToHistory parameter
function switchView(activeBtn, viewToShow, pushToHistory = true) {
    [btnNavMain, btnNavAssign, btnNavNotif, btnNavMsg, btnNavTimetable, btnNavDaily].forEach(btn => btn.classList.remove("active"));
    [el.mainView, el.assignView, el.actualNotifView, el.msgView, el.ttView, el.dailyView].forEach(view => view.classList.add("hidden-view"));
    activeBtn.classList.add("active");
    viewToShow.classList.remove("hidden-view");

    // Tell the browser we moved to a new tab
    if (pushToHistory) {
        window.history.pushState({ panelId: viewToShow.id }, "", "");
    }
}

btnNavMain.addEventListener("click", () => switchView(btnNavMain, el.mainView));
btnNavAssign.addEventListener("click", () => { switchView(btnNavAssign, el.assignView); loadAssignments(); });
btnNavNotif.addEventListener("click", () => { switchView(btnNavNotif, el.actualNotifView); loadActualNotifications(); });
btnNavMsg.addEventListener("click", () => { switchView(btnNavMsg, el.msgView); loadMessages(); });
btnNavDaily.addEventListener("click", () => { switchView(btnNavDaily, el.dailyView); loadDailyAttendance(); }); 

btnNavTimetable.addEventListener("click", () => { 
    switchView(btnNavTimetable, el.ttView); 
    let todayName = new Date().toLocaleString('en-us', {weekday: 'long'});
    let validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (!validDays.includes(todayName)) todayName = "Monday";
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.toggle("active", btn.dataset.day === todayName));
    
    loadTimetableForDay(todayName);
});

// ==========================================
// 🚨 ZERO-COST RENDER FUNCTIONS 🚨
// ==========================================
function loadAssignments() {
    if (cachedAssignments.length === 0) { el.assignList.innerHTML = `<div class="no-data-text">No Recent Assignments</div>`; return; }
    el.assignList.innerHTML = cachedAssignments.map(n => `<div class="data-card assign"><div class="card-title">${n.title}</div><div class="card-body">${n.body}</div><div class="card-meta"><span>${n.teach}</span><span class="card-due">Due: ${n.due}</span></div></div>`).join('');
}

function loadActualNotifications() {
    if (cachedNotifs.length === 0) { el.actualNotifList.innerHTML = `<div class="no-data-text">No Notifications</div>`; return; }
    el.actualNotifList.innerHTML = cachedNotifs.map(n => {
        let timeStr = n.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        return `<div class="data-card ${n.type}"><div class="card-title">${n.title}</div><div class="card-body">${n.body}</div><div class="card-meta"><span>Adhyora</span><span>${timeStr}</span></div></div>`;
    }).join('');
}

// ❌ Replace your existing loadMessages() function with this:
function loadMessages() {
    if (cachedMessages.length === 0) { el.msgList.innerHTML = `<div class="no-data-text">Inbox is empty</div>`; return; }
    
    el.msgList.innerHTML = cachedMessages.map(m => {
        // Evaluate the sender role and assign the correct CSS class!
        let roleClass = "msg-student"; // Defaults to student (Theme Color)
        let r = (m.senderRole || "").toLowerCase();
        
        if (r.includes("principal") || r.includes("admin")) roleClass = "msg-principal";
        else if (r.includes("teacher")) roleClass = "msg-teacher";

        let timeStr = m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        
        return `<div class="data-card ${roleClass}"><div class="card-title">${m.title}</div><div class="card-body">${m.body}</div><div class="card-meta"><span>${m.sender}</span><span>${timeStr}</span></div></div>`;
    }).join('');
}

// ==========================================
// 🚨 PULL-THROUGH CACHE: DAILY ATTENDANCE
// ==========================================
document.getElementById("btnPrevDay").addEventListener("click", () => { currentDailyDate.setDate(currentDailyDate.getDate() - 1); loadDailyAttendance(); });
document.getElementById("btnNextDay").addEventListener("click", () => { currentDailyDate.setDate(currentDailyDate.getDate() + 1); loadDailyAttendance(); });

el.dailyDateBtn.addEventListener("click", () => {
    calendarMode = "daily"; el.calModal.classList.add("active"); 
    currentDisplayDate = new Date(currentDailyDate); loadCalendarData();
});

async function loadDailyAttendance() {
    el.dailyDate.innerText = currentDailyDate.toLocaleString('default', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    
    let mStr = String(currentDailyDate.getMonth() + 1).padStart(2, '0'); let dStr = String(currentDailyDate.getDate()).padStart(2, '0');
    let dateStr = `${currentDailyDate.getFullYear()}-${mStr}-${dStr}`;
    let activeSemName = sortedSemesterKeys[currentSemesterIndex] ? sortedSemesterKeys[currentSemesterIndex].replace("_", " ") : "Semester 1";

    if (dailyAttendanceCache[dateStr]) {
        renderDailyData(dailyAttendanceCache[dateStr]);
        return; 
    }

    el.dailyStatus.innerText = "Checking..."; 
    el.periodsGrid.innerHTML = ""; 
    
    // 🚨 FIX: Attached to 'window' to prevent strict mode crashes!
    window.dailyData = []; 
    for(let i=0; i<6; i++) { 
        window.dailyData.push({hasData: false}); 
        el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; 
    }

    try {
        const q = query(collection(db, "colleges", collegeID, "attendance"), where("date", "==", dateStr), where("semester", "==", activeSemName));
        const snapshot = await getDocs(q);
        
        let docs = [];
        if(!snapshot.empty) { snapshot.forEach(doc => { if (!doc.id.includes("GLOBAL")) docs.push(doc.data()); }); }
        
        dailyAttendanceCache[dateStr] = docs; 
        renderDailyData(docs);
    } catch(e) { el.dailyStatus.innerText = "Network Error"; }
}

function renderDailyData(docs) {
    window.dailyData = []; // 🚨 FIX
    for(let i=0; i<6; i++) { window.dailyData.push({hasData: false}); }

    if (docs.length === 0) {
        el.dailyStatus.innerText = "No Classes Recorded";
        el.periodsGrid.innerHTML = "";
        for(let i=0; i<6; i++) { el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; }
        return;
    }

    let isMedToday = false; let cDateObj = new Date(currentDailyDate).setHours(0,0,0,0);
    for(let l of cachedMedicalLeaves) { if(cDateObj >= l.start.setHours(0,0,0,0) && cDateObj <= l.end.setHours(0,0,0,0)) { isMedToday = true; break; } }

    let pCount = 0; let tHeld = 0;
    docs.forEach(d => {
        for(let i=1; i<=6; i++) {
            let pK = `period_${i}`;
            if(d[pK] && d[pK].attendance && d[pK].attendance[currentRollNo] !== undefined) {
                let isP = (d[pK].attendance[currentRollNo] == true || d[pK].attendance[currentRollNo] == 1);
                tHeld++; if(isP) pCount++;
                let sub = d[pK].subject || "Unknown";
                if(d[pK].event_details && d[pK].event_details[currentRollNo]) sub = d[pK].event_details[currentRollNo];
                window.dailyData[i-1] = { hasData: true, isPresent: isP, isMedical: isMedToday, subject: sub, teacher: d[pK].markedByTeacherName || "System", time: d[pK].timestamp ? new Date(d[pK].timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "N/A" };
            }
        }
    });

    if(tHeld > 0) el.dailyStatus.innerText = `Present: ${pCount} / ${tHeld}`; else el.dailyStatus.innerText = "No Classes Recorded";
    
    el.periodsGrid.innerHTML = "";
    for(let i=0; i<6; i++) {
        let d = window.dailyData[i]; // 🚨 FIX
        if(!d.hasData) { el.periodsGrid.innerHTML += `<button class="period-btn btn-nodata">${i+1}</button>`; continue; }
        let css = d.isMedical ? "btn-medical" : (d.isPresent ? "btn-present" : "btn-absent");
        let txt = d.isMedical ? "M" : (d.isPresent ? "P" : "A");
        el.periodsGrid.innerHTML += `<button class="period-btn ${css}" onclick="openPeriodDetail(${i})">${txt}</button>`;
    }
}

window.openPeriodDetail = function(index) {
    let d = window.dailyData[index]; // 🚨 FIX
    if(!d.hasData) return;
    el.dSub.innerText = d.subject; el.dTeach.innerText = `${d.teacher} • ${d.time}`;
    el.dStat.innerHTML = d.isMedical ? "<color style='color:#3b82f6'>Medical Leave</color>" : (d.isPresent ? "<color style='color:#4caf50'>Present</color>" : "<color style='color:#f44336'>Absent</color>");
    el.detailModal.classList.add("active");
};
document.getElementById("closeDetailBtn").addEventListener("click", () => el.detailModal.classList.remove("active"));

// ==========================================
// 🚨 TIMETABLE RAM RENDERING 🚨
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

function startTimetableListener() {
    if (activeTimetableUnsubscribe) activeTimetableUnsubscribe();
    let semStr = (currentSemesterIndex + 1).toString();
    const q = query(collection(db, "colleges", collegeID, "timetable_allocations"), where("semester", "==", semStr));

    activeTimetableUnsubscribe = onSnapshot(q, (snapshot) => {
        timetableCache = [];
        snapshot.forEach(d => timetableCache.push(d.data()));
        
        if (!el.ttView.classList.contains("hidden-view")) {
            let activeDay = document.querySelector('.day-btn.active').dataset.day;
            loadTimetableForDay(activeDay);
        }
    });
}

function loadTimetableForDay(selectedDay) {
    el.ttCards.innerHTML = ""; 
    let htmlBuffer = "";
    let semStr = (currentSemesterIndex + 1).toString();

    // 🚨 Extracting directly from RAM 🚨
    let docs = timetableCache.filter(d => d.day === selectedDay);

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
// 🚨 DEVICE SESSIONS & SETTINGS CACHE
// ==========================================
document.getElementById("openSettingsBtn").addEventListener("click", () => { el.sidebar.classList.add("open"); el.overlay.classList.add("active"); });
el.overlay.addEventListener("click", () => { el.sidebar.classList.remove("open"); el.overlay.classList.remove("active"); });
// ==========================================
// 🚨 SMART SIGN OUT (CLEARS TOKENS)
// ==========================================
async function handleSignOut() {
    try {
        // If we have a token in RAM, delete it from the database!
        if (myCurrentPushToken && currentRollNo && collegeID) {
            const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);
            await setDoc(studentRef, {
                webFcmTokens: arrayRemove(myCurrentPushToken)
            }, { merge: true });
            console.log("Push Token cleanly removed from database!");
        }
    } catch(e) { 
        console.error("Error removing token", e); 
    }
    
    // Now log them out!
  // 🚨 SWEEP UP THE BREADCRUMBS!
    localStorage.removeItem("adhyora_role");
    localStorage.removeItem("adhyora_college");
    localStorage.removeItem("adhyora_roll");
  
    signOut(auth).then(() => window.location.href = "index.html");
}

document.getElementById("btnSignOut").addEventListener("click", handleSignOut);
document.getElementById("btnBlockSignOut").addEventListener("click", handleSignOut);
document.getElementById("btnContact").addEventListener("click", () => window.open(`mailto:pixelaks.technologies@gmail.com`, '_blank'));

// --- NATIVE BACK BUTTON TRAP (TAB HISTORY & SIGN OUT WARNING) ---
// 1. Set an invisible "trap" at the very bottom of the history
window.history.replaceState({ panelId: "base_trap" }, "", "");
// 2. Put the main dashboard on top of it as our starting point
window.history.pushState({ panelId: "mainDashboardView" }, "", "");

window.addEventListener("popstate", (e) => {
    if (e.state && e.state.panelId) {
        let pid = e.state.panelId;

        // If they back out of the Main Dashboard, ask to sign out!
        if (pid === "base_trap") {
            if (confirm("Do you want to sign out?")) {
                handleSignOut(); // 🚨 CHANGED TO SMART SIGN-OUT
            } else {
                // They canceled. Put the Main Dashboard back onto the history stack so the trap works again!
                window.history.pushState({ panelId: "mainDashboardView" }, "", "");
            }
        }
        // Otherwise, figure out which tab they went back to, and load it WITHOUT pushing a new state
        else if (pid === "mainDashboardView") { switchView(btnNavMain, el.mainView, false); }
        else if (pid === "assignmentsView") { switchView(btnNavAssign, el.assignView, false); loadAssignments(); }
        else if (pid === "actualNotifView") { switchView(btnNavNotif, el.actualNotifView, false); loadActualNotifications(); }
        else if (pid === "messagesView") { switchView(btnNavMsg, el.msgView, false); loadMessages(); }
        else if (pid === "dailyAttendanceView") { switchView(btnNavDaily, el.dailyView, false); loadDailyAttendance(); }
        else if (pid === "timetableView") { 
            switchView(btnNavTimetable, el.ttView, false); 
            let todayName = new Date().toLocaleString('en-us', {weekday: 'long'});
            let validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
            if (!validDays.includes(todayName)) todayName = "Monday";
            document.querySelectorAll('.day-btn').forEach(btn => btn.classList.toggle("active", btn.dataset.day === todayName));
            loadTimetableForDay(todayName);
        }
    }
});
// --------------------------------------------------

// ==========================================
// SIDEBAR EXTERNAL LINKS
// ==========================================
document.getElementById("btnPrivacy").addEventListener("click", () => {
    window.open("https://pixelaks.in/privacy-adhyora", "_blank");
});

document.getElementById("btnTerms").addEventListener("click", () => {
    window.open("https://pixelaks.in/terms-adhyora", "_blank");
});

document.getElementById("btnCompany").addEventListener("click", () => {
    window.open("https://pixelaks.in", "_blank");
});

document.getElementById("btnDevices").addEventListener("click", () => {
    el.sidebar.classList.remove("open"); el.overlay.classList.remove("active");
    el.sessionsModal.classList.add("active"); loadSessions();
});
document.getElementById("closeSessionsBtn").addEventListener("click", () => el.sessionsModal.classList.remove("active"));

// ==========================================
// 🚨 NOTIFICATION TOGGLE LOGIC
// ==========================================

// 1. Function to update the visual switch
function updateNotificationToggleUI() {
    const toggle = document.getElementById("notifToggleSwitch");
    if (!toggle) return;
    
    // It's considered ON if the browser allows it AND we successfully saved a token in RAM
    if (Notification.permission === "granted" && myCurrentPushToken !== "") {
        toggle.classList.add("active");
    } else {
        toggle.classList.remove("active");
    }
}

// 2. Function to safely destroy the token and unsubscribe
async function unsubscribePushNotifications() {
    try {
        const toggle = document.getElementById("notifToggleSwitch");
        toggle.style.opacity = "0.5"; // Show it's loading

        // A. Tell Google Firebase to delete this browser's notification link
        await deleteToken(messaging);

        // B. Remove the token from your Firestore Database so you don't send to dead devices
        if (myCurrentPushToken && currentRollNo && collegeID) {
            const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);
            await setDoc(studentRef, {
                webFcmTokens: arrayRemove(myCurrentPushToken)
            }, { merge: true });
        }
        
        myCurrentPushToken = ""; // Clear from RAM
        console.log("Successfully unsubscribed from notifications.");
        
        toggle.style.opacity = "1";
        updateNotificationToggleUI();
    } catch (e) {
        console.error("Error unsubscribing:", e);
        alert("Failed to turn off notifications. Please try again.");
    }
}

// 3. The Click Event for the Sidebar Button
document.getElementById("btnToggleNotifications").addEventListener("click", async () => {
    if (Notification.permission === "denied") {
        alert("Notifications are completely blocked by your browser. Please click the lock icon in your address bar to allow them.");
        return;
    }

    const toggle = document.getElementById("notifToggleSwitch");
    
    if (toggle.classList.contains("active")) {
        // Switch is ON -> Turn it OFF
        if (confirm("Are you sure you want to disable notifications for this device?")) {
            await unsubscribePushNotifications();
        }
    } else {
        // Switch is OFF -> Turn it ON (This triggers your existing Firebase permission function)
        toggle.style.opacity = "0.5";
        await requestPushPermissions();
        toggle.style.opacity = "1";
    }
});

function loadSessions() {
    if (sessionsCache.size === 0) { el.sessionsList.innerHTML = `<div class="no-data-text">No active sessions found.</div>`; return; }
    
    let htmlBuffer = "";
    sessionsCache.forEach((d) => {
        let devName = d.deviceName || "Unknown Device";
        let isMe = (d.id === myWebDeviceID);
        if (isMe) devName += " (This Browser)";
        
        let timeStr = "Recently";
        if (d.loginTime) timeStr = d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        let btnHtml = isMe ? `<span style="font-size:10px; color:#10b981; font-weight:bold;">Active</span>` : `<button class="revoke-btn" onclick="revokeSession('${d.id}', '${d.parent}')">Kick</button>`;
        
        htmlBuffer += `
            <div class="session-card">
                <div class="session-info"><h4>${devName}</h4><p>Logged in: ${timeStr}</p></div>
                ${btnHtml}
            </div>`;
    });
    el.sessionsList.innerHTML = htmlBuffer;
}

window.revokeSession = async function(sessionID, parentDocID) {
    if (!confirm("Are you sure you want to log this device out?")) return;
    try {
        await deleteDoc(doc(db, "colleges", collegeID, "students", parentDocID, "sessions", sessionID));
        alert("Session revoked. The device will be logged out shortly.");
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

// ==========================================
// ADHYORA TITLE SANSKRIT GLITCH EFFECT
// ==========================================
const sanskritMap = {
    'A': 'अ', 'B': 'ब', 'C': 'क', 'D': 'ड', 'E': 'ए',
    'F': 'फ', 'G': 'ग', 'H': 'ह', 'I': 'इ', 'J': 'ज',
    'K': 'क', 'L': 'ल', 'M': 'म', 'N': 'न', 'O': 'ओ',
    'P': 'प', 'Q': 'क', 'R': 'र', 'S': 'स', 'T': 'ट',
    'U': 'उ', 'V': 'व', 'W': 'व', 'X': 'श', 'Y': 'य',
    'Z': 'ज'
};

function startTitleGlitch() {
    const titleEl = document.querySelector('.logo-text');
    if (!titleEl) return;
    
    const originalText = "ADHYORA"; 
    let currentText = originalText.split('');
    
    const glitchDuration = 2000; 
    const minInterval = 3000;    
    const maxInterval = 6000;    

    function doGlitch() {
        let rIndex = Math.floor(Math.random() * originalText.length);
        let origChar = originalText[rIndex];
        
        if (sanskritMap[origChar]) {
            currentText[rIndex] = sanskritMap[origChar];
            titleEl.innerText = currentText.join('');
            
            setTimeout(() => {
                currentText[rIndex] = origChar;
                titleEl.innerText = currentText.join('');
                
                let nextWait = Math.floor(Math.random() * (maxInterval - minInterval + 1) + minInterval);
                setTimeout(doGlitch, nextWait);
                
            }, glitchDuration); 
        } else {
            setTimeout(doGlitch, 1000);
        }
    }
    setTimeout(doGlitch, 2000);
}

startTitleGlitch();

// ==========================================
// THEME & APPEARANCE ENGINE
// ==========================================
const themesModal = document.getElementById("themesModal");
const btnThemes = document.getElementById("btnThemes");
const closeThemesBtn = document.getElementById("closeThemesBtn");

const colorPalettes = {
    blue:   { main: '#3b82f6', light: '#e0f2fe', nav: '#bfdbfe' },
    yellow: { main: '#eab308', light: '#fef9c3', nav: '#fde047' }, 
    pink:   { main: '#ec4899', light: '#fce7f3', nav: '#fbcfe8' },
    purple: { main: '#8b5cf6', light: '#ede9fe', nav: '#ddd6fe' },
    orange: { main: '#f97316', light: '#ffedd5', nav: '#fed7aa' }
};

btnThemes.addEventListener("click", () => {
    el.sidebar.classList.remove("open"); 
    el.overlay.classList.remove("active");
    themesModal.classList.add("active");
});
closeThemesBtn.addEventListener("click", () => themesModal.classList.remove("active"));

function applyTheme(colorKey, isDark) {
    const root = document.documentElement;
    const palette = colorPalettes[colorKey] || colorPalettes.blue;

    root.style.setProperty('--theme-main', palette.main);
    root.style.setProperty('--theme-light', palette.light);
    root.style.setProperty('--theme-nav', palette.nav);

    if (isDark) {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }

    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === colorKey);
    });
    document.getElementById("btnDarkMode").classList.toggle("active", isDark);
    document.getElementById("btnLightMode").classList.toggle("active", !isDark);

    localStorage.setItem("adhyora_theme_color", colorKey);
    localStorage.setItem("adhyora_theme_mode", isDark ? "dark" : "light");

  updateStatusBar();
}

document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        let selectedColor = e.target.dataset.theme;
        let isDark = document.body.classList.contains("dark-mode");
        applyTheme(selectedColor, isDark);
    });
});

document.getElementById("btnDarkMode").addEventListener("click", () => {
    let currentColor = localStorage.getItem("adhyora_theme_color") || "blue";
    applyTheme(currentColor, true);
});
document.getElementById("btnLightMode").addEventListener("click", () => {
    let currentColor = localStorage.getItem("adhyora_theme_color") || "blue";
    applyTheme(currentColor, false);
});

async function requestPushPermissions() {
    try {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            // 1. Register the Service Worker
            const swRegistration = await navigator.serviceWorker.register('/AdhyoraWeb/firebase-messaging-sw.js');
            
            // 2. Generate the Web Push Token
            const currentToken = await getToken(messaging, { 
                vapidKey: "BNO8RVA-R1iOy19P2rbVYPBzlCSnptpq13ybtqqO0IgHhDOXhkauOXEWm2hGN6yIUz2_fHL-Iv7IG9cpRZv2YkU",
                serviceWorkerRegistration: swRegistration 
            });

            if (currentToken) {
                console.log("Web Push Token Generated!");
                myCurrentPushToken = currentToken; 

                // 🚨 ZERO-COST READ: Pull the array straight from RAM!
                let activeTokens = [];
                if (currentStudentProfileData && currentStudentProfileData.webFcmTokens) {
                    activeTokens = currentStudentProfileData.webFcmTokens;
                }

                // Remove old duplicate, add new token
                activeTokens = activeTokens.filter(t => t !== currentToken);
                activeTokens.push(currentToken);

                // The 3-Device PC Cache limit (safely protects Android tokens)
                if (activeTokens.length > 3) {
                    activeTokens = activeTokens.slice(activeTokens.length - 3);
                }

                const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);
                await setDoc(studentRef, { 
                    webFcmTokens: activeTokens,
                    lastWebLogin: serverTimestamp()
                }, { merge: true });
                
                console.log("Token saved and array cleaned safely.");

                // 4. THE LOOPHOLE: Force-Subscribe the Web Browser to Native Topics
                const getSafe = (str) => (!str || str === "All") ? "ALL" : str.replace(/[^a-zA-Z0-9]/g, '');
                
                let safeCol = getSafe(collegeID);
                let safeDept = getSafe(rawDept);
                let safeYear = getSafe(myYearStr);

                let topicsToJoin = [
                    `${safeCol}_ALL`, 
                    `${safeCol}_STUDENTS_ALL_ALL`, 
                    `${safeCol}_STUDENTS_${safeDept}_ALL`, 
                    `${safeCol}_STUDENTS_${safeDept}_${safeYear}`,
                    `ADHYORA_GLOBAL_USERS`
                ];

                const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";

                fetch(APPS_SCRIPT_URL, {
                    method: "POST",
                    mode: "no-cors",
                    body: JSON.stringify({
                        action: "subscribe",
                        token: currentToken,
                        topics: topicsToJoin
                    })
                }).then(() => {
                    console.log("✅ Loophole Complete: Web Browser synced with Native Topics!");

                  updateNotificationToggleUI(); // Automatically turn the switch green!
                  
                }).catch(err => console.log("Subscription Fetch Error:", err));

            }
        } else {
            console.log('Unable to get permission to notify.');
        }
    } catch (error) {
        console.error('Error getting push token:', error);
    }
}
function loadSavedTheme() {
    let savedColor = localStorage.getItem("adhyora_theme_color") || "blue";
    let savedMode = localStorage.getItem("adhyora_theme_mode") || "light";
    applyTheme(savedColor, savedMode === "dark");
}

loadSavedTheme();

// ==========================================
// 🚨 NOTIFICATION CLICK HANDLERS 🚨
// ==========================================

// 1. If the app was already open in the background:
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'openMessages') {
        const btn = document.getElementById("btnNavMsg");
        if (btn) btn.click();
    } 
    else if (event.data && event.data.action === 'openNotifications') {
        const btn = document.getElementById("btnNavNotif");
        if (btn) btn.click();
    }
    // 🚨 NEW: Handle background assignment click
    else if (event.data && event.data.action === 'openAssignments') {
        const btn = document.getElementById("btnNavAssign");
        if (btn) btn.click();
    }
});

// 2. If the app was completely closed:
window.addEventListener('load', () => {
    // Check for Inbox requests
    if (window.location.hash === "#inbox" || localStorage.getItem("pendingInboxOpen") === "true") {
        localStorage.removeItem("pendingInboxOpen");
        setTimeout(() => {
            const btn = document.getElementById("btnNavMsg");
            if (btn) btn.click();
        }, 1500); 
    }
    // Check for Admin Notification requests
    if (window.location.hash === "#notifications" || localStorage.getItem("pendingNotifOpen") === "true") {
        localStorage.removeItem("pendingNotifOpen");
        setTimeout(() => {
            const btn = document.getElementById("btnNavNotif");
            if (btn) btn.click();
        }, 1500); 
    }
    // 🚨 NEW: Check for Assignment requests
    if (window.location.hash === "#assignments" || localStorage.getItem("pendingAssignOpen") === "true") {
        localStorage.removeItem("pendingAssignOpen");
        setTimeout(() => {
            const btn = document.getElementById("btnNavAssign");
            if (btn) btn.click();
        }, 1500); 
    }
});
