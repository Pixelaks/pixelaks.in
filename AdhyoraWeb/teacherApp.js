import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// 🚨 ADDED: initializeFirestore, persistentLocalCache, persistentMultipleTabManager
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit, writeBatch, increment, serverTimestamp, deleteField, updateDoc, addDoc, setDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage, deleteToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// 🚀 OPTIMIZATION: Debounce Function to stop UI lag when searching
function debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ==========================================
// 🚨 GLOBAL VARIABLES
// ==========================================
let currentCollegeID = "";
let currentUserID = "";
let currentTeacherName = "Unknown";
let isHOD = false;
let profileListener = null;
let teacherDeptRaw = ""; 
let currentDeptName = "Unknown Dept"; 
let hasStartedInbox = false;

// Notification Variables
let allMessagesMap = new Map();
let allNotifsMap = new Map();
let globalListenerUnsub = null;
let inboxListenerUnsub = null;

// ==========================================
// 🚨 FIREBASE CONFIGURATION & CACHE SHIELD
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

// 🚨 COST OPTIMIZATION: Native RAM Caching Enabled!
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

const messaging = getMessaging(app);

let myCurrentPushToken = ""; // Tracks active session

const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            
            // 🚨 1. Setup Biometric Variables first
            InitBiometricUI(); 
            
            // 🚨 2. Start the Lock Screen Sequence
            CheckSecurityPin();
            
            // 🚨 3. Load Profile in the background (hidden behind lock screen)
            ListenToProfile(); 
            
        } else { 
            window.location.href = "index.html"; 
        }
    });
}

// ==========================================
// 🚨 DYNAMIC PHONE STATUS & NAV BAR CONTROLLER
// ==========================================
function updateStatusBar() {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    
    // Grab our full-screen dark overlays (checking both paywall ID names just to be safe)
    const loader = document.getElementById("initialAppLoader");
    const lockScreen = document.getElementById("appLockScreen");
    const paywall = document.getElementById("subBlockPanel") || document.getElementById("subscriptionBlockPanel");

    // Check if any of them are currently visible
    const isLoaderActive = loader && !loader.classList.contains("hidden") && loader.style.display !== "none";
    const isLockActive = lockScreen && lockScreen.style.display === "flex";
    const isPaywallActive = paywall && (paywall.style.display === "flex" || paywall.classList.contains("active"));

    if (isLoaderActive || isLockActive || isPaywallActive) {
        // 1. TOP STATUS BAR: Force Dark Navy
        if (themeMeta) themeMeta.setAttribute("content", "#0b111e"); 
        
        // 2. BOTTOM NAV BAR: Force Dark Navy background
        document.body.style.backgroundColor = "#0b111e";
    } else {
        const isDark = document.body.classList.contains("dark-mode");
        
        // 1. TOP STATUS BAR: Match the Dashboard Theme
        if (themeMeta) themeMeta.setAttribute("content", isDark ? "#0f172a" : "#ffffff"); 
        
        // 2. BOTTOM NAV BAR: Remove the inline override so your style.css 
        //    light/dark mode variables naturally color the bottom of the phone!
        document.body.style.backgroundColor = "";
    }
}

function hideAppLoader() {
    const loader = document.getElementById("initialAppLoader");
    if (loader && !loader.classList.contains("hidden")) {
        setTimeout(() => {
            loader.classList.add("hidden");
            updateStatusBar(); // 🚨 Trigger color change!
        }, 800);
    }
}
// ==========================================
// 🚨 PROFILE ENGINE
// ==========================================
function ListenToProfile() {
    if (profileListener) profileListener(); 
    const teacherDocRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);

    profileListener = onSnapshot(teacherDocRef, async (snapshot) => {
        if (!snapshot.exists()) {
            document.getElementById("teacherInfoName").innerText = "Profile Not Found";
            return;
        }

        registerTeacherWebSession();

        const data = snapshot.data();
        isHOD = data.isHOD || false;
        currentTeacherName = data.name || "Unknown";
        const email = auth.currentUser ? auth.currentUser.email : data.email;
        let deptName = "Unknown Dept";

        // 🚨 FIX: Prioritize departmentID like C# to prevent Security Rule rejection!
        if (data.departmentID) {
            teacherDeptRaw = data.departmentID; 
            try {
                const deptSnap = await getDoc(doc(db, "colleges", currentCollegeID, "departments", data.departmentID));
                if (deptSnap.exists()) {
                    deptName = deptSnap.data().name || data.departmentID;
                } else {
                    deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
                }
            } catch (e) {
                deptName = data.departmentID;
            }
            currentDeptName = deptName; // Save globally
        } else if (data.department) {
            deptName = data.department;
            currentDeptName = deptName; // Save globally
            teacherDeptRaw = "DEPT_" + deptName.replace(/ /g, ""); 
        }
        finalizeProfileUI(currentTeacherName, email, deptName);
    });
}

async function finalizeProfileUI(rawName, email, deptName) {
    let hodBadgeText = isHOD ? " <span style='color:#f59e0b; font-size:14px;'>(HOD)</span>" : "";
    let nameEl = document.getElementById("teacherInfoName");
    if(nameEl) nameEl.innerHTML = `${rawName}${hodBadgeText}`;
    
    let emailEl = document.getElementById("teacherInfoEmail");
    if(emailEl) emailEl.innerText = email;
    
    let deptEl = document.getElementById("teacherInfoDept");
    if(deptEl) deptEl.innerText = deptName;

    // let loader = document.getElementById("initialAppLoader");
    // if(loader) loader.style.display = "none";

    hideAppLoader();

    // 🚨 FIX: Force the profile loop to ensure teacherDeptRaw is ready before proceeding
    if (!hasStartedInbox && teacherDeptRaw !== "") {
        hasStartedInbox = true;
        
        startInboxListener();
        await syncSemesterWithDatabase();

        initAttendanceEngine(); 
        initSubjectDeclarationEngine(); 
        initCalendarEngine(); 
        initAssignmentsEngine(); 
        if (isHOD) setupExportEngine();
        
        // 🚨 CRITICAL ORDER CHANGE: Run permission verification AFTER all background engines load
        await requestPushPermissions(); 
        updateNotificationToggleUI(); 
    }
}

// ==========================================
// 🚨 NOTIFICATIONS & UNIVERSAL MESSAGES
// ==========================================
function getSafeTopic(str) {
    if (!str || str === "All") return "ALL";
    return str.replace(/[^a-zA-Z0-9]/g, '');
}

function startInboxListener() {
    const sentMessagesRef = collection(db, "colleges", currentCollegeID, "sent_messages");
    onSnapshot(query(sentMessagesRef, orderBy("timestamp", "desc"), limit(30)), (snap) => {
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
                    sender: d.senderName || "Adhyora Team", role: d.senderRole || "system", type: d.type || "broadcast", source: targetText, isMe: senderID === currentUserID
                });
            }
        });
        let dot = document.querySelector("#btnMessages .notification-dot");
        if (dot && snap.docs.length > 0) dot.style.display = "block";
        renderMessages();
    });

    const chatsRef = collection(db, "colleges", currentCollegeID, "chats");
    onSnapshot(query(chatsRef, where("participants", "array-contains", currentUserID), orderBy("lastUpdated", "desc"), limit(10)), (snap) => {
        snap.forEach(roomDoc => {
            onSnapshot(query(collection(db, "colleges", currentCollegeID, "chats", roomDoc.id, "messages"), orderBy("timestamp", "desc"), limit(20)), (msgSnap) => {
                msgSnap.docChanges().forEach(change => {
                    const msgDoc = change.doc;
                    if (change.type === "removed") { allMessagesMap.delete(msgDoc.id); return; }
                    const md = msgDoc.data();
                    if ((md.senderID || "") === currentUserID) return; 
                    allMessagesMap.set(msgDoc.id, {
                        id: msgDoc.id, title: md.title || "Private Message", body: md.body || "",
                        time: md.timestamp ? md.timestamp.toDate() : new Date(),
                        sender: md.senderName || "User", role: md.senderRole || "Student", type: "incoming", isMe: false
                    });
                });
                renderMessages();
            });
        });
    });

    let safeColID = getSafeTopic(currentCollegeID);
    let safeDept = getSafeTopic(teacherDeptRaw);
    let myTopics = [ `${safeColID}_ALL`, `${safeColID}_TEACHERS_ALL`, `${safeColID}_TEACHERS_${safeDept}` ];

    inboxListenerUnsub = onSnapshot(query(collection(db, "colleges", currentCollegeID, "inbox_messages"), where("targetTopic", "in", myTopics), orderBy("timestamp", "desc"), limit(30)), (snap) => {
        snap.docChanges().forEach(change => {
            const doc = change.doc;
            if (change.type === "removed") { allNotifsMap.delete(doc.id); return; }
            let d = doc.data();
            allNotifsMap.set(doc.id, {
                id: doc.id, title: d.title || "Message", body: d.body || "",
                time: d.timestamp ? d.timestamp.toDate() : new Date(),
                sender: d.senderName || "Adhyora Team", role: (d.senderRole || "system").toLowerCase(), isGlobal: false
            });
        });
        let dot = document.querySelector("#btnNotifications .notification-dot");
        if (dot && snap.docs.length > 0) dot.style.display = "block";
        renderNotifications();
    });

    globalListenerUnsub = onSnapshot(query(collection(db, "adhyora_global_updates"), orderBy("timestamp", "desc"), limit(10)), (snap) => {
        snap.docChanges().forEach(change => {
            const doc = change.doc;
            if (change.type === "removed") { allNotifsMap.delete(doc.id); return; }
            let d = doc.data();
            allNotifsMap.set(doc.id, {
                id: doc.id, title: d.title || "System Update", body: d.body || "",
                time: d.timestamp ? d.timestamp.toDate() : new Date(),
                sender: "Adhyora Team", role: "system", isGlobal: true
            });
        });
        let dot = document.querySelector("#btnNotifications .notification-dot");
        if (dot && snap.docs.length > 0) dot.style.display = "block";
        renderNotifications();
    });
}

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
    if (sortedMessages.length === 0) { listEl.innerHTML = `<div class="no-data-text" style="text-align: center; color: #94a3b8; margin-top: 20px;">Inbox is empty</div>`; return; }
    listEl.innerHTML = sortedMessages.map(m => {
        let borderColor = "var(--brand-red)"; let roleLabel = m.role; let icon = m.type === 'incoming' ? 'fa-comment' : 'fa-bullhorn';
        if (m.role.toLowerCase().includes("system") || m.sender === "Adhyora Team") { borderColor = "#8b5cf6"; icon = "fa-satellite-dish"; roleLabel = "Developer"; } 
        else if (m.role.toLowerCase().includes("principal") || m.role.toLowerCase().includes("admin")) { borderColor = "#10b981"; } 
        else if (m.role.toLowerCase().includes("student")) { borderColor = "#3b82f6"; }
        let headerTxt = m.isMe ? `Sent to: ${m.source}` : `From: ${m.sender} <span style="font-weight:normal; opacity:0.7;">(${roleLabel})</span>`;
        if (m.type === "incoming") headerTxt = `From: ${m.sender} <span style="font-weight:normal; opacity:0.7;">• Private Chat</span>`;
        return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; box-shadow:0 2px 5px rgba(0,0,0,0.02); border-left: 4px solid ${borderColor};">
            <div style="font-weight:bold; color:var(--text-dark); font-size:15px; margin-bottom:5px;">${m.title}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">${m.body}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-light); font-weight:600;">
                <span><i class="fas ${icon}" style="margin-right:4px; color:${borderColor};"></i> ${headerTxt}</span>
                <span>${m.time.toLocaleString('en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
        </div>`;
    }).join('');
}

function renderNotifications() {
    const listEl = document.getElementById("notificationsList");
    if (!listEl) return;
    let sortedNotifs = Array.from(allNotifsMap.values()).sort((a, b) => b.time - a.time);
    if (sortedNotifs.length === 0) { listEl.innerHTML = `<div class="no-data-text" style="text-align: center; color: #94a3b8; margin-top: 20px;">No new notifications.</div>`; return; }
    listEl.innerHTML = sortedNotifs.map(n => {
        let borderColor = "var(--brand-red)"; let icon = "fa-bell";
        if (n.isGlobal || n.role.includes("system") || n.sender === "Adhyora Team") { borderColor = "#8b5cf6"; icon = "fa-satellite-dish"; } 
        else if (n.role.includes("principal") || n.role.includes("admin")) { borderColor = "#10b981"; } 
        else if (n.role.includes("student")) { borderColor = "#3b82f6"; }
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
// 🚨 SEMESTER MANAGER
// ==========================================
let currentSemesterType = "Odd";
let isSemesterInitialized = false;

async function syncSemesterWithDatabase() {
    if (isSemesterInitialized) return;
    try {
        const collegeSnap = await getDoc(doc(db, "colleges", currentCollegeID));
        if (collegeSnap.exists() && collegeSnap.data().currentSemesterType) {
            currentSemesterType = collegeSnap.data().currentSemesterType;
        }
        isSemesterInitialized = true;
    } catch (e) {
        console.error("Semester Sync Error:", e);
    }
}

// ==========================================
// 🚨 NEP ATTENDANCE ENGINE (C# PORT WITH PERFECT ACCORDION)
// ==========================================
let attCurrentDate = new Date();
let attTeacherSubjects = [];
let attSubjectCategories = new Map();
let attCachedStudentsByYear = new Map();
let attMedicalLeavesCache = new Set();
let attLastMedicalFetchDate = null;

let attCurrentPeriodClaims = new Map();
let attCurrentPeriodEvents = new Map();
let attMainActiveRows = []; // 🚨 Tracks your direct class
let attSubActiveRows = [];  // 🚨 Tracks substitute accordion classes
let attCurrentSessionBatchIndex = -1;
let attIsMainClassLocked = false;
let attIsSubstitutePanelOpen = false;

let attPendingSubBatchIndex = 0;
let attPendingSubBatchName = "";
let attPendingSubTeacherID = "";
let attPendingSubTeacherName = "";
let attPendingSubCardId = ""; 

// 🚨 ADD THESE 4 CACHE VARIABLES HERE
let attCurrentStudentsCache = [];
let attCurrentExistingData = null;
let attCurrentBatchMap = null;
let attCurrentContainer = null;

let attSubjectListenerUnsub = null;
let attStudentRosterUnsub = null;
let attSessionListenerUnsub = null;
let attMainEventListenerUnsub = null;
let attActiveRosterYear = "";
let attCurrentLoadTicket = 0;

async function initAttendanceEngine() {
    await syncSemesterWithDatabase();

    setupJumpDateModals();
    document.getElementById("attDateBtn").addEventListener("click", () => document.getElementById("jumpDateModal").classList.add("active"));
    
    document.getElementById("attSemDropdown").addEventListener("change", filterSubjectsBySemester);
    document.getElementById("attPeriodDropdown").addEventListener("change", loadSessionData);
    document.getElementById("attSubjDropdown").addEventListener("change", loadSessionData);
    
    document.getElementById("attSaveBtn").addEventListener("click", saveAttendance);

    document.getElementById("subConfirmNoBtn").addEventListener("click", () => document.getElementById("subConfirmModal").classList.remove("active"));
    document.getElementById("subConfirmYesBtn").addEventListener("click", confirmSubstituteLoad);

    resetDateToToday();
    fetchTeacherSubjects();
}

function resetDateToToday() {
    attCurrentDate = new Date();
    updateDateUI();
    const subDrop = document.getElementById("attSubjDropdown");
    if (subDrop.options.length > 0 && !subDrop.value.includes("Loading") && subDrop.value !== "Select Subject") {
        loadSessionData();
    }
}

function updateDateUI() {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const yyyy = attCurrentDate.getFullYear();
    const mm = String(attCurrentDate.getMonth() + 1).padStart(2, '0');
    const dd = String(attCurrentDate.getDate()).padStart(2, '0');
    document.getElementById("attDateText").innerHTML = `${days[attCurrentDate.getDay()]}<br>${yyyy}-${mm}-${dd}`;
}

function setupJumpDateModals() {
    const dDrop = document.getElementById("jumpDayDropdown");
    const mDrop = document.getElementById("jumpMonthDropdown");
    const yDrop = document.getElementById("jumpYearDropdown");
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    mDrop.innerHTML = months.map((m,i) => `<option value="${i}">${m}</option>`).join('');
    
    const curYear = new Date().getFullYear();
    yDrop.innerHTML = [-2,-1,0,1,2].map(i => `<option value="${curYear+i}">${curYear+i}</option>`).join('');
    
    const updateDays = () => {
        let currentDayVal = parseInt(dDrop.value) || 1;
        let daysInMonth = new Date(parseInt(yDrop.value), parseInt(mDrop.value) + 1, 0).getDate();
        dDrop.innerHTML = Array.from({length: daysInMonth}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('');
        dDrop.value = Math.min(currentDayVal, daysInMonth);
    };
    
    mDrop.addEventListener("change", updateDays);
    yDrop.addEventListener("change", updateDays);
    
    document.getElementById("jumpCloseBtn").addEventListener("click", () => document.getElementById("jumpDateModal").classList.remove("active"));
    document.getElementById("jumpSubmitBtn").addEventListener("click", () => {
        attCurrentDate = new Date(parseInt(yDrop.value), parseInt(mDrop.value), parseInt(dDrop.value));
        updateDateUI();
        document.getElementById("jumpDateModal").classList.remove("active");
        loadSessionData();
    });

    yDrop.value = curYear; mDrop.value = new Date().getMonth(); updateDays(); dDrop.value = new Date().getDate();
}

function fetchTeacherSubjects() {
    if (attSubjectListenerUnsub) attSubjectListenerUnsub();
    document.getElementById("attSubjDropdown").innerHTML = `<option>Loading...</option>`;
    
    attSubjectListenerUnsub = onSnapshot(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), where("teacherID", "==", currentUserID)), async (snap) => {
        attTeacherSubjects = [{ name: "Tutorial", category: "TUTORIAL", semester: "1,2,3,4,5,6,7,8" }];
        
        let autoHealPromises = [];
        snap.forEach(docSnap => {
            let data = docSnap.data();
            if(!data.subjectName) return;
            
            let sCat = data.subjectCategory || data.category || data.type || "UNKNOWN";
            if(data.subjectCode) {
                let code = data.subjectCode.toUpperCase();
                if(code.startsWith("AEC")) sCat = "AECC";
                else if(code.startsWith("VAC")) sCat = "VAC";
                else if(code.startsWith("SEC")) sCat = "SEC";
            }
            
            let subObj = { name: data.subjectName, category: sCat, semester: data.semester ? String(data.semester) : "1", docRef: docSnap.ref };
            attTeacherSubjects.push(subObj);
            
            if(sCat === "UNKNOWN") {
                autoHealPromises.push(getDocs(query(collection(db, "colleges", currentCollegeID, "subjects"), where("name", "==", data.subjectName))).then(async masterSnap => {
                    if(!masterSnap.empty) {
                        let mData = masterSnap.docs[0].data();
                        let trueCat = mData.type || mData.category || "UNKNOWN";
                        if(trueCat !== "UNKNOWN") {
                            subObj.category = trueCat;
                        }
                    }
                }));
            }
        });
        
        await Promise.all(autoHealPromises);
        
        let semDrop = document.getElementById("attSemDropdown");
        if(currentSemesterType === "Odd") {
            semDrop.innerHTML = `<option value="1">Semester 1</option><option value="3">Semester 3</option><option value="5">Semester 5</option><option value="7">Semester 7</option>`;
        } else {
            semDrop.innerHTML = `<option value="2">Semester 2</option><option value="4">Semester 4</option><option value="6">Semester 6</option><option value="8">Semester 8</option>`;
        }
        
        filterSubjectsBySemester();
    });
}

function filterSubjectsBySemester() {
    let semText = document.getElementById("attSemDropdown").options[document.getElementById("attSemDropdown").selectedIndex].text;
    let currentSem = semText.replace("Semester ", "").trim();
    
    attSubjectCategories.clear();
    let filteredNames = [];
    
    attTeacherSubjects.forEach(sub => {
        if(sub.semester.split(',').map(s=>s.trim()).includes(currentSem)) {
            if(!filteredNames.includes(sub.name)) {
                filteredNames.push(sub.name);
                attSubjectCategories.set(sub.name, sub.category);
            }
        }
    });
    
    let subDrop = document.getElementById("attSubjDropdown");
    if(filteredNames.length > 0) {
        subDrop.innerHTML = `<option value="Select Subject">Select Subject</option>` + filteredNames.map(n => `<option value="${n}">${n}</option>`).join('');
        subDrop.value = "Select Subject";
        loadSessionData();
    } else {
        subDrop.innerHTML = `<option value="No Subjects">No Subjects</option>`;
        showAttCenterMessage(`No subjects allocated for<br>${semText}`);
    }
}

function showAttCenterMessage(msg) {
    document.getElementById("attListContainer").innerHTML = `
        <div id="attCenterMessagePanel" style="display:flex; height:100%; align-items:center; justify-content:center; text-align:center;">
            <p id="attCenterMessageText" style="color:var(--text-muted); font-size:16px; font-weight:600; line-height:1.5;">${msg}</p>
        </div>`;
    document.getElementById("attTotalStudentsText").innerText = "";
    document.getElementById("attLockStatusText").innerText = "";
    attMainActiveRows = []; // 🚨 Clear main rows on reset
    updateMainButtonState(); 
}

function updateMainButtonState() {
    let btn = document.getElementById("attSaveBtn");
    // 🚨 Disable if Sub Panel is open, if Main is Locked, or if NO students exist in Main
    if (attIsSubstitutePanelOpen || attIsMainClassLocked || attMainActiveRows.length === 0) {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
    } else {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
    }
}

// 🚨 NEW HELPER: Loads YOUR class directly onto the main screen
function loadMyClassDirectly(docSnap, ticket, targetSubCategory, dateStr, selectedSem, selectedSubject) {
    let d = docSnap.data();
    
    let container = document.getElementById("attDirectArea");
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px;">
                <div style="width:40px; height:40px; border:3px solid rgba(220,38,38,0.2); border-top-color:var(--brand-red); border-radius:50%; animation:spin 1s linear infinite; margin:0 auto;"></div>
                <p style="color:#64748b; margin-top:15px; font-weight:bold;">Loading Your Class...</p>
            </div>`;
    }
    
    if (d.isCommon) {
        attCurrentSessionBatchIndex = -1;
        loadAttendanceRegister(null, ticket, targetSubCategory, dateStr);
    } else if (d.studentIDs) {
        // Safe check for subject_batches document
        let bIndex = docSnap.id.lastIndexOf("Batch") !== -1 ? parseInt(docSnap.id.substring(docSnap.id.lastIndexOf("Batch")+5))-1 : 0;
        attCurrentSessionBatchIndex = bIndex;
        loadAttendanceRegister(d.studentIDs, ticket, targetSubCategory, dateStr);
    } else {
        // Safe check for timetable_allocations document
        let bIndex = parseInt(d.splitIndex || "0");
        attCurrentSessionBatchIndex = bIndex;
        let cleanSub = selectedSubject.replace(/ /g, "").replace(/\//g, "");
        let batchDocID = `BATCH_Sem${selectedSem}_${cleanSub}_Batch${bIndex + 1}`;
        
        getDoc(doc(db, "colleges", currentCollegeID, "subject_batches", batchDocID)).then(snap => {
            if (snap.exists() && snap.data().studentIDs) {
                loadAttendanceRegister(snap.data().studentIDs, ticket, targetSubCategory, dateStr);
            } else {
                if (container) container.innerHTML = "<div style='text-align:center; color:red; padding:20px; font-weight:bold;'>Batch Document Not Found.<br>(Ask Principal to Resplit)</div>";
            }
        });
    }
}

// ==========================================
// 🚨 LOAD SESSION DATA (THE CORE ENGINE)
// ==========================================
async function loadSessionData() {
    attCurrentLoadTicket++;
    let myTicket = attCurrentLoadTicket;

    attIsSubstitutePanelOpen = false;
    attIsMainClassLocked = false;
    updateMainButtonState();

    let subDrop = document.getElementById("attSubjDropdown");
    if(subDrop.options.length === 0 || subDrop.value.includes("Loading") || subDrop.value.includes("No Subjects")) {
        showAttCenterMessage("No Subjects Available."); return;
    }
    if(subDrop.value === "Select Subject") {
        showAttCenterMessage("Please select a subject<br>to mark attendance."); return;
    }

    showAttCenterMessage("Loading Database...");
    
    // YYYY-MM-DD format strictly matching C# backend
    const dateStr = `${attCurrentDate.getFullYear()}-${String(attCurrentDate.getMonth()+1).padStart(2,'0')}-${String(attCurrentDate.getDate()).padStart(2,'0')}`;

    if(!attLastMedicalFetchDate || attLastMedicalFetchDate !== dateStr) {
        attMedicalLeavesCache.clear();
        try {
            const medSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "medical_leaves"), where("endDate", ">=", dateStr)));
            medSnap.forEach(doc => {
                let data = doc.data();
                // 🚨 TIMEZONE FIX: Compare strings directly to avoid JS Date shifting to the previous day!
                if(data.startDate && data.startDate <= dateStr) {
                    attMedicalLeavesCache.add(data.studentID);
                }
            });
            attLastMedicalFetchDate = dateStr;
        } catch(e) { console.error("Medical Fetch Error", e); }
    }
    if(myTicket !== attCurrentLoadTicket) return;

    checkTimetableAllocation(myTicket, dateStr);
}

async function checkTimetableAllocation(ticket, dateStr) {
    if(ticket !== attCurrentLoadTicket) return;

    const selectedSem = document.getElementById("attSemDropdown").value;
    const selectedSubject = document.getElementById("attSubjDropdown").value;
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][attCurrentDate.getDay()];
    const pIndex = parseInt(document.getElementById("attPeriodDropdown").value) + 1;
    const semKey = `Sem${selectedSem}`;
    const globalDocID = `${dateStr}_Semester${selectedSem}_GLOBAL`;

    try {
        const globalSnap = await getDoc(doc(db, "colleges", currentCollegeID, "attendance", globalDocID));
        if(globalSnap.exists()) {
            const data = globalSnap.data();
            if(data.teacher_locks) {
                let lockedSubj = data.teacher_locks[`p${pIndex}_${currentUserID}`];
                if(lockedSubj && lockedSubj !== selectedSubject) {
                    showAttCenterMessage(`Double Booking Prevented:<br>You already marked '${lockedSubj}' for Period ${pIndex}.`); return;
                }
            }
            if(data.dept_locks) {
                let dLock = data.dept_locks[`p${pIndex}_${teacherDeptRaw}`];
                if(dLock && dLock.subject !== selectedSubject) {
                    if(dLock.teacherID !== currentUserID) {
                        showAttCenterMessage(`Period ${pIndex} is locked for your department.<br>Already marked for '${dLock.subject}' by ${dLock.teacherName || "another teacher"}.`); return;
                    }
                }
            }
        }

        const structSnap = await getDoc(doc(db, "colleges", currentCollegeID, "timetable_structure", `${semKey}_${dayName}`));
        let isStructurallyStrict = false;
        let structuralCategoryName = "";
        let isMySelectedSubjectStrict = false;
        let targetSubCategory = attSubjectCategories.get(selectedSubject) || "UNKNOWN";

        if(targetSubCategory.includes("AECC") || targetSubCategory.includes("VAC") || targetSubCategory.includes("MLD") || targetSubCategory.includes("MDC")) isMySelectedSubjectStrict = true;

        if(structSnap.exists() && structSnap.data().slots) {
            let slotKey = `P${pIndex}`;
            if(structSnap.data().slots[slotKey]) {
                structuralCategoryName = String(structSnap.data().slots[slotKey]).toUpperCase();
                if(structuralCategoryName.includes("AECC") || structuralCategoryName.includes("VAC") || structuralCategoryName.includes("MLD") || structuralCategoryName.includes("MDC")) {
                    isStructurallyStrict = true;
                }
            }
        }

        // 🚨 BULLETPROOF QUERY: Safely checks for both "2" and "Semester 2"
        let allocSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", selectedSem), where("day", "==", dayName), where("period", "==", String(pIndex))));
        if(allocSnap.empty) {
            allocSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", `Semester ${selectedSem}`), where("day", "==", dayName), where("period", "==", String(pIndex))));
        }

        if(ticket !== attCurrentLoadTicket) return;

        let isTargetSubjectScheduled = false;
        let myAllocations = [];
        let substituteAllocations = [];

        allocSnap.forEach(docSnap => {
            let data = docSnap.data();
            let sCat = (data.subjectCategory || data.category || data.type || "UNKNOWN").toUpperCase();
            if(data.subjectName === selectedSubject) {
                isTargetSubjectScheduled = true;
                let isStrictDeptSubject = sCat.includes("MJD") || sCat.includes("CORE") || sCat.includes("TUTORIAL");
                if(isStrictDeptSubject && data.departmentID !== `DEPT_${teacherDeptRaw.replace(/ /g, '')}`) return;

                if((data.teacherID || "").trim() === currentUserID) myAllocations.push(docSnap);
                else substituteAllocations.push(docSnap);
            }
        });

        if(isStructurallyStrict && !isMySelectedSubjectStrict) {
            showAttCenterMessage(`Master Timetable Lock:<br>This period is strictly reserved for <b>${structuralCategoryName}</b>.<br><br>You cannot mark '${selectedSubject}' here.`); return;
        }

        // Create Layout Zones
        const listContainer = document.getElementById("attListContainer");
        listContainer.innerHTML = `
            <div id="attSubCardsArea"></div>
            <div id="attDirectArea"></div>
        `;

        if(isTargetSubjectScheduled) {
            if (substituteAllocations.length > 0) {
                spawnSubstituteCards(substituteAllocations, selectedSem, selectedSubject);
            }
            if (myAllocations.length > 0) {
                loadMyClassDirectly(myAllocations[0], ticket, targetSubCategory, dateStr, selectedSem, selectedSubject);
            } else {
                document.getElementById("attDirectArea").innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:bold;">Not assigned to you.<br>(Substitute options above)</div>`;
            }
        } else {
            let isFreeRoam = targetSubCategory.includes("MJD") || targetSubCategory.includes("MID") || targetSubCategory.includes("SEC") || targetSubCategory.includes("TUTORIAL") || targetSubCategory.includes("CORE");
            if(isFreeRoam) {
                // 🚨 BULLETPROOF QUERY
                let bSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", selectedSem), where("subjectName", "==", selectedSubject)));
                if(bSnap.empty) {
                    bSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", `Semester ${selectedSem}`), where("subjectName", "==", selectedSubject)));
                }

                if(ticket !== attCurrentLoadTicket) return;
                
                if(!bSnap.empty) {
                    let myBatch = bSnap.docs.find(d => d.data().teacherID === currentUserID);
                    let subBatches = bSnap.docs.filter(d => d.data().teacherID !== currentUserID && d.data().teacherID);
                    
                    if (subBatches.length > 0) {
                        spawnManualBatchCards(subBatches, selectedSem, selectedSubject);
                    }
                    if (myBatch) {
                        loadMyClassDirectly(myBatch, ticket, targetSubCategory, dateStr, selectedSem, selectedSubject);
                    } else if (subBatches.length > 0) {
                        document.getElementById("attDirectArea").innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:bold;">Not assigned to you.<br>(Substitute options above)</div>`;
                    } else {
                        document.getElementById("attDirectArea").innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:bold;">No teachers assigned to these batches yet.</div>`;
                    }
                } else {
                    attCurrentSessionBatchIndex = -1;
                    loadAttendanceRegister(null, ticket, targetSubCategory, dateStr);
                }
            } else {
                showAttCenterMessage("No class scheduled for this subject.");
            }
        }
    } catch(e) { console.error("Timetable Engine Error", e); showAttCenterMessage("Connection Error."); }
}

function spawnSubstituteCards(subDocs, sem, subj) {
    const targetArea = document.getElementById("attSubCardsArea");
    if (!targetArea) return;

    const createCardHTML = (docSnap) => {
        let d = docSnap.data();
        let bIndex = parseInt(d.splitIndex || "0");
        let bName = d.isCommon ? "Entire Class" : `Batch ${bIndex + 1}`;
        let id = docSnap.id;
        
        return `
        <div style="background:#fee2e2; border:1px solid #fca5a5; border-radius:30px; margin-bottom:15px; overflow:hidden; transition:0.3s;">
            <button id="subCardBtn_${id}" style="width:100%; padding:20px; background:transparent; border:none; text-align:center; cursor:pointer; display:flex; justify-content:center; align-items:center; position:relative;">
                <div id="subCardTitle_${id}" style="font-weight:bold; color:#991b1b; font-size:16px;">
                    ${bName} <span style="font-size:12px; color:#991b1b; font-weight:normal;">(Assigned: ${d.teacherName || "Unknown"})</span>
                </div>
                <i class="fas fa-chevron-down" id="subCardIcon_${id}" style="position:absolute; right:20px; color:#991b1b; transition: 0.3s;"></i>
            </button>
            <div id="subCardBody_${id}" style="display:none; padding:15px; border-top:1px solid #fca5a5; background: #fff5f5;">
                <div id="subCardStatus_${id}" style="font-size:12px; font-weight:bold; margin-bottom:10px; text-align:center;"></div>
                <div id="subCardStudents_${id}" style="max-height: 400px; overflow-y: auto; margin-bottom:15px; padding-right:5px;"></div>
                <button id="subCardSaveBtn_${id}" style="width:100%; background:var(--brand-red); color:white; padding:15px; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Save Attendance</button>
            </div>
        </div>`;
    };

    let fullHTML = "";
    subDocs.sort((a,b)=>parseInt(a.data().splitIndex||0)-parseInt(b.data().splitIndex||0)).forEach(d => fullHTML += createCardHTML(d));
    
    targetArea.innerHTML = fullHTML;
    subDocs.forEach(d => attachSubCardListener(d, sem, subj));
}

function spawnManualBatchCards(subDocs, sem, subj) {
    const targetArea = document.getElementById("attSubCardsArea");
    if (!targetArea) return;

    let validBatches = subDocs.filter(d => d.data().teacherID && d.data().teacherName);
    if(validBatches.length === 0) return;

    validBatches.sort((a,b) => {
        let ai = a.id.lastIndexOf("Batch") !== -1 ? parseInt(a.id.substring(a.id.lastIndexOf("Batch")+5))-1 : 0;
        let bi = b.id.lastIndexOf("Batch") !== -1 ? parseInt(b.id.substring(b.id.lastIndexOf("Batch")+5))-1 : 0;
        return ai - bi;
    });

    let fullHTML = "";
    validBatches.forEach(d => {
        let bIndex = d.id.lastIndexOf("Batch") !== -1 ? parseInt(d.id.substring(d.id.lastIndexOf("Batch")+5))-1 : 0;
        let bName = `Batch ${bIndex + 1}`;
        let id = d.id;

        fullHTML += `
        <div style="background:#fee2e2; border:1px solid #fca5a5; border-radius:30px; margin-bottom:15px; overflow:hidden; transition:0.3s;">
            <button id="subCardBtn_${id}" style="width:100%; padding:20px; background:transparent; border:none; text-align:center; cursor:pointer; display:flex; justify-content:center; align-items:center; position:relative;">
                <div id="subCardTitle_${id}" style="font-weight:bold; color:#991b1b; font-size:16px;">
                    ${bName} <span style="font-size:12px; color:#991b1b; font-weight:normal;">(Assigned: ${d.data().teacherName})</span>
                </div>
                <i class="fas fa-chevron-down" id="subCardIcon_${id}" style="position:absolute; right:20px; color:#991b1b; transition: 0.3s;"></i>
            </button>
            <div id="subCardBody_${id}" style="display:none; padding:15px; border-top:1px solid #fca5a5; background: #fff5f5;">
                <div id="subCardStatus_${id}" style="font-size:12px; font-weight:bold; margin-bottom:10px; text-align:center;"></div>
                <div id="subCardStudents_${id}" style="max-height: 400px; overflow-y: auto; margin-bottom:15px; padding-right:5px;"></div>
                <button id="subCardSaveBtn_${id}" style="width:100%; background:var(--brand-red); color:white; padding:15px; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">Save Attendance</button>
            </div>
        </div>`;
    });
    
    targetArea.innerHTML = fullHTML;
    
    validBatches.forEach(d => {
        let bIndex = d.id.lastIndexOf("Batch") !== -1 ? parseInt(d.id.substring(d.id.lastIndexOf("Batch")+5))-1 : 0;
        let bName = `Batch ${bIndex + 1}`;
        let id = d.id;

        fetchAndDisplayBatchCount(id, sem, subj, false, bIndex);

        document.getElementById(`subCardBtn_${id}`).addEventListener("click", () => {
            let body = document.getElementById(`subCardBody_${id}`);
            if (body.style.display === "block") {
                body.style.display = "none";
                document.getElementById(`subCardIcon_${id}`).style.transform = "rotate(0deg)";
                attIsSubstitutePanelOpen = false;
                updateMainButtonState();
            } else {
                attPendingSubBatchName = bName;
                attPendingSubBatchIndex = bIndex;
                attPendingSubTeacherID = d.data().teacherID;
                attPendingSubTeacherName = d.data().teacherName;
                attPendingSubCardId = id; 
                showSubstituteConfirmModal(bName);
            }
        });

        document.getElementById(`subCardSaveBtn_${id}`).addEventListener("click", saveAttendance);
    });
}

function attachSubCardListener(docSnap, sem, subj) {
    let d = docSnap.data();
    let bIndex = parseInt(d.splitIndex || "0");
    let bName = d.isCommon ? "Entire Class" : `Batch ${bIndex + 1}`;
    let id = docSnap.id;

    fetchAndDisplayBatchCount(id, sem, subj, d.isCommon, bIndex);

    document.getElementById(`subCardBtn_${id}`).addEventListener("click", () => {
        let body = document.getElementById(`subCardBody_${id}`);
        if (body.style.display === "block") {
            body.style.display = "none";
            document.getElementById(`subCardIcon_${id}`).style.transform = "rotate(0deg)";
            attIsSubstitutePanelOpen = false;
            updateMainButtonState();
        } else {
            attPendingSubBatchName = bName;
            attPendingSubBatchIndex = bIndex;
            attPendingSubTeacherID = d.teacherID || "";
            attPendingSubTeacherName = d.teacherName || "Unknown";
            attPendingSubCardId = id; 
            showSubstituteConfirmModal(bName);
        }
    });

    document.getElementById(`subCardSaveBtn_${id}`).addEventListener("click", saveAttendance);
}

async function fetchAndDisplayBatchCount(id, sem, subj, isCommon, bIndex) {
    try {
        if (isCommon) {
            let semInt = parseInt(sem);
            let yearStr = "1";
            if(semInt <= 2) yearStr = "1"; else if(semInt <= 4) yearStr = "2"; else if(semInt <= 6) yearStr = "3"; else yearStr = "4";
            
            let count = 0;
            let cUp = (attSubjectCategories.get(subj) || "").toUpperCase();
            
            let studentsRef = collection(db, "colleges", currentCollegeID, "students");
            let q = query(studentsRef, where("Year", "==", yearStr));
            let snap = await getDocs(q);
            
            snap.forEach(docSnap => {
                let data = docSnap.data();
                let isEnrolled = false;
                if(cUp.includes("MJD") || cUp.includes("CORE") || cUp.includes("TUTORIAL")) {
                    let sDept = "DEPT_" + String(data.Department || data.department || "").replace(/ /g, "");
                    if(sDept === teacherDeptRaw || (data.Department||data.department) === teacherDeptRaw) isEnrolled = true;
                } else if(data.enrolledSubjects) {
                    let es = data.enrolledSubjects;
                    let sMap = es[`Semester ${sem}`] || es[sem];
                    if(sMap) { for(let k in sMap) { if(sMap[k] === subj) { isEnrolled = true; break; } } }
                }
                if(isEnrolled) count++;
            });
            let titleEl = document.getElementById(`subCardTitle_${id}`);
            if(titleEl) titleEl.innerHTML += ` <span style='font-size:13px; color:#991b1b; font-weight:normal;'>(${count} Students)</span>`;
        } else {
            let cleanSub = subj.replace(/ /g, "").replace(/\//g, "");
            let batchDocID = `BATCH_Sem${sem}_${cleanSub}_Batch${bIndex + 1}`;
            let docSnap = await getDoc(doc(db, "colleges", currentCollegeID, "subject_batches", batchDocID));
            if(docSnap.exists() && docSnap.data().studentIDs) {
                let count = docSnap.data().studentIDs.length;
                let titleEl = document.getElementById(`subCardTitle_${id}`);
                if(titleEl) titleEl.innerHTML += ` <span style='font-size:13px; color:#991b1b; font-weight:normal;'>(${count} Students)</span>`;
            }
        }
    } catch(e) { console.error("Count Error", e); }
}

function showSubstituteConfirmModal(displayName) {
    let t = document.getElementById("subConfirmText");
    t.innerHTML = `<b>Substitute Mode</b><br>Mark attendance for ${displayName}?`;
    document.getElementById("subConfirmModal").classList.add("active");
}

function confirmSubstituteLoad() {
    document.getElementById("subConfirmModal").classList.remove("active");
    
    document.getElementById(`subCardBody_${attPendingSubCardId}`).style.display = "block";
    document.getElementById(`subCardIcon_${attPendingSubCardId}`).style.transform = "rotate(180deg)";
    document.getElementById(`subCardStatus_${attPendingSubCardId}`).innerHTML = "<span style='color:#64748b;'>Loading Register...</span>";
    document.getElementById(`subCardStudents_${attPendingSubCardId}`).innerHTML = `<div style="text-align:center; padding:20px;"><div style="width:30px; height:30px; border:2px solid rgba(220,38,38,0.2); border-top-color:var(--brand-red); border-radius:50%; animation:spin 1s linear infinite; margin:0 auto;"></div></div>`;
    
    attIsSubstitutePanelOpen = true; 
    updateMainButtonState();

    const dateStr = `${attCurrentDate.getFullYear()}-${String(attCurrentDate.getMonth()+1).padStart(2,'0')}-${String(attCurrentDate.getDate()).padStart(2,'0')}`;
    const selectedSem = document.getElementById("attSemDropdown").value;
    const selectedSubject = document.getElementById("attSubjDropdown").value;

    if(attPendingSubBatchName === "Entire Class") {
        attCurrentSessionBatchIndex = -1;
        loadAttendanceRegister(null, attCurrentLoadTicket, attSubjectCategories.get(selectedSubject), dateStr);
    } else {
        const cleanSub = selectedSubject.replace(/ /g, "").replace(/\//g, "");
        const batchDocID = `BATCH_Sem${selectedSem}_${cleanSub}_${attPendingSubBatchName.replace(/ /g, "")}`;
        
        getDoc(doc(db, "colleges", currentCollegeID, "subject_batches", batchDocID)).then(snap => {
            if(snap.exists() && snap.data().studentIDs) {
                attCurrentSessionBatchIndex = attPendingSubBatchIndex;
                loadAttendanceRegister(snap.data().studentIDs, attCurrentLoadTicket, attSubjectCategories.get(selectedSubject), dateStr);
            } else {
                document.getElementById(`subCardStatus_${attPendingSubCardId}`).innerHTML = "<span style='color:red;'>Batch Error. Ask Principal to resplit.</span>";
                document.getElementById(`subCardStudents_${attPendingSubCardId}`).innerHTML = "";
            }
        });
    }
}

// ==========================================
// 🚨 REGISTER LOADER & CACHE SYNC
// ==========================================
async function loadAttendanceRegister(filterStudentIDs, ticket, trueCategory, dateStr) {
    if(ticket !== attCurrentLoadTicket) return;
    
    const selectedSem = document.getElementById("attSemDropdown").value;
    const selectedSubject = document.getElementById("attSubjDropdown").value;
    const semName = `Semester${selectedSem}`;
    const cleanSubjectID = selectedSubject.replace(/ /g, "").replace(/\//g, "-").replace(/\./g, "");
    const dailyDocID = `${dateStr}_${semName}_${cleanSubjectID}`;
    const pIndex = parseInt(document.getElementById("attPeriodDropdown").value) + 1;
    const periodKey = `period_${pIndex}`;
    const globalDocID = `${dateStr}_${semName}_GLOBAL`;
    const eventDocID = `${dateStr}_${semName}_EVENTS`;

    if(attSessionListenerUnsub) attSessionListenerUnsub();
    if(attMainEventListenerUnsub) attMainEventListenerUnsub();

    attCurrentPeriodClaims.clear();
    attCurrentPeriodEvents.clear();

    try {
        const gSnap = await getDoc(doc(db, "colleges", currentCollegeID, "attendance", globalDocID));
        if(gSnap.exists() && gSnap.data().student_claims) {
            let claims = gSnap.data().student_claims;
            let prefix = `p${pIndex}_`;
            for(let key in claims) {
                if(key.startsWith(prefix)) attCurrentPeriodClaims.set(key.substring(prefix.length), claims[key]);
            }
        }

        attMainEventListenerUnsub = onSnapshot(doc(db, "colleges", currentCollegeID, "attendance", eventDocID), (eSnap) => {
            if(ticket !== attCurrentLoadTicket) return;
            attCurrentPeriodEvents.clear();
            if(eSnap.exists() && eSnap.data()[periodKey] && eSnap.data()[periodKey].event_details) {
                let evts = eSnap.data()[periodKey].event_details;
                for(let key in evts) attCurrentPeriodEvents.set(key, String(evts[key]));
            }
            
            // 🚨 THE FIX: We removed the cached container variable at the end
            if((attMainActiveRows.length > 0 || attSubActiveRows.length > 0) && attCurrentStudentsCache.length > 0) {
                renderStudentRows(attCurrentStudentsCache, attCurrentExistingData, attCurrentBatchMap, ticket);
            }
        });

        attSessionListenerUnsub = onSnapshot(doc(db, "colleges", currentCollegeID, "attendance", dailyDocID), (snap) => {
            if(ticket !== attCurrentLoadTicket) return;
            let existingRegister = null;
            let batchTeachersMap = null;
            if(snap.exists() && snap.data()[periodKey]) {
                let pData = snap.data()[periodKey];
                if(pData.subject === selectedSubject) {
                    existingRegister = pData.attendance;
                    batchTeachersMap = pData.batch_teachers;
                }
            }
            fetchStudentsAndPopulate(selectedSem, trueCategory, selectedSubject, existingRegister, batchTeachersMap, filterStudentIDs, ticket);
        });

    } catch(e) { console.error("Register Load Error", e); }
}

function fetchStudentsAndPopulate(semNum, category, subjName, existingData, batchTeachersMap, filterIDs, ticket) {
    let semInt = parseInt(semNum);
    let yearStr = "1";
    if(semInt <= 2) yearStr = "1"; else if(semInt <= 4) yearStr = "2"; else if(semInt <= 6) yearStr = "3"; else yearStr = "4";

    if(attActiveRosterYear !== yearStr) {
        if(attStudentRosterUnsub) attStudentRosterUnsub();
        attActiveRosterYear = yearStr;
        attStudentRosterUnsub = onSnapshot(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", yearStr)), (snap) => {
            attCachedStudentsByYear.set(yearStr, snap.docs);
            if(ticket === attCurrentLoadTicket) filterAndSpawn(snap.docs, category, subjName, semNum, existingData, batchTeachersMap, filterIDs, ticket);
        });
    } else if(attCachedStudentsByYear.has(yearStr)) {
        filterAndSpawn(attCachedStudentsByYear.get(yearStr), category, subjName, semNum, existingData, batchTeachersMap, filterIDs, ticket);
    }
}

function filterAndSpawn(allStudents, category, subjName, semNum, existingData, batchTeachersMap, filterIDs, ticket) {
    if(ticket !== attCurrentLoadTicket) return;

    let matchingStudents = [];
    allStudents.forEach(docSnap => {
        let id = docSnap.id;
        let data = docSnap.data();
        let roll = data.RollNumber || data.rollNumber || "";

        let inPastRegister = existingData && (existingData[id] !== undefined || existingData[roll] !== undefined);
        let isCurrentlyEnrolled = false;
        
        let cUp = (category || "").toUpperCase();
        if(cUp.includes("MJD") || cUp.includes("CORE") || cUp.includes("TUTORIAL")) {
            let sDept = "DEPT_" + String(data.Department || data.department || "").replace(/ /g, "");
            if(sDept === teacherDeptRaw || (data.Department||data.department) === teacherDeptRaw) isCurrentlyEnrolled = true;
        } else if(data.enrolledSubjects) {
            let es = data.enrolledSubjects;
            let sMap = es[`Semester ${semNum}`] || es[semNum];
            if(sMap) { for(let k in sMap) { if(sMap[k] === subjName) { isCurrentlyEnrolled = true; break; } } }
        }

        let inBatch = true;
        let isBatchedClass = filterIDs !== null;
        if(isBatchedClass && !filterIDs.includes(id) && !filterIDs.includes(data.userID)) inBatch = false;

        if(isBatchedClass) { if(inBatch) matchingStudents.push(docSnap); }
        else { if(inPastRegister || isCurrentlyEnrolled) matchingStudents.push(docSnap); }
    });

    let targetContainer = attIsSubstitutePanelOpen ? document.getElementById(`subCardStudents_${attPendingSubCardId}`) : document.getElementById("attDirectArea");
    if (!targetContainer) targetContainer = document.getElementById("attListContainer");

    if(matchingStudents.length === 0) { 
        targetContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:bold;">No students found for '${subjName}'</div>`;
        if(attIsSubstitutePanelOpen) document.getElementById(`subCardStatus_${attPendingSubCardId}`).innerHTML = "";
        return; 
    }

    if (!attIsSubstitutePanelOpen) {
        document.getElementById("attTotalStudentsText").innerText = `${matchingStudents.length} Students`;
    }
    
    matchingStudents.sort((a,b) => {
        let r1 = a.data().RollNumber || a.data().rollNumber || "0";
        let r2 = b.data().RollNumber || b.data().rollNumber || "0";
        return r1.localeCompare(r2, undefined, {numeric:true});
    });

    // 🚨 THE FIX: We cache the data, but let renderStudentRows fetch the live container!
    attCurrentStudentsCache = matchingStudents;
    attCurrentExistingData = existingData;
    attCurrentBatchMap = batchTeachersMap;

    renderStudentRows(matchingStudents, existingData, batchTeachersMap, ticket);
}

function renderStudentRows(students, existingData, batchTeachersMap, ticket) {
    let targetContainer = attIsSubstitutePanelOpen ? document.getElementById(`subCardStudents_${attPendingSubCardId}`) : document.getElementById("attDirectArea");
    if (!targetContainer) targetContainer = document.getElementById("attListContainer");

    let isThisBatchLocked = false; 
    let lockerName = "";
    let myKey = attCurrentSessionBatchIndex === -1 ? "common" : String(attCurrentSessionBatchIndex);
    const selectedSubject = document.getElementById("attSubjDropdown").value;

    if(batchTeachersMap && batchTeachersMap[myKey]) {
        let bInfo = batchTeachersMap[myKey];
        if(bInfo.id && bInfo.id !== currentUserID) {
            isThisBatchLocked = true;
            lockerName = bInfo.name || "another teacher";
        }
    }

    let claimedCount = 0; let conflictSubject = "";
    students.forEach(s => {
        if(attCurrentPeriodClaims.has(s.id) && attCurrentPeriodClaims.get(s.id) !== selectedSubject) {
            claimedCount++; conflictSubject = attCurrentPeriodClaims.get(s.id);
        }
    });

    if(claimedCount > 0) { isThisBatchLocked = true; lockerName = conflictSubject; }
    
    let lockText = claimedCount > 0 ? `Locked by ${conflictSubject}` : `View Only (Marked by ${lockerName})`;
    
    if (attIsSubstitutePanelOpen) {
        let statusEl = document.getElementById(`subCardStatus_${attPendingSubCardId}`);
        let saveBtn = document.getElementById(`subCardSaveBtn_${attPendingSubCardId}`);
        
        if (isThisBatchLocked) {
            statusEl.innerHTML = `<span style='color:red;'>${lockText}</span>`;
            saveBtn.style.opacity = "0.5";
            saveBtn.style.pointerEvents = "none";
        } else {
            statusEl.innerHTML = `<span style='color:#10b981;'>Ready to Mark (${students.length} Students)</span>`;
            saveBtn.style.opacity = "1";
            saveBtn.style.pointerEvents = "auto";
        }
    } else {
        attIsMainClassLocked = isThisBatchLocked; 
        document.getElementById("attLockStatusText").innerText = attIsMainClassLocked ? lockText : "";
    }

    let fullHTML = "";
    let targetArray = attIsSubstitutePanelOpen ? attSubActiveRows : attMainActiveRows;
    let prefix = attIsSubstitutePanelOpen ? "sub_" : "main_";
    
    targetArray.length = 0;

    students.forEach(docSnap => {
        let d = docSnap.data();
        let id = docSnap.id;
        let name = d.Name || d.studentName || "Unknown";
        let roll = d.RollNumber || d.rollNumber || "";
        let sDept = d.Department || d.department || "";

        let isPresent = true; let isNewEntry = true;
        if(existingData) {
            if(existingData[id] !== undefined) { isPresent = !!existingData[id]; isNewEntry = false; }
            else if(existingData[roll] !== undefined) { isPresent = !!existingData[roll]; isNewEntry = false; }
        }

        let isMedical = attMedicalLeavesCache.has(id);
        let isAtEvent = attCurrentPeriodEvents.has(id);
        let isClaimed = attCurrentPeriodClaims.has(id) && attCurrentPeriodClaims.get(id) !== selectedSubject;

        let rowLocked = isThisBatchLocked || isAtEvent || isClaimed || isMedical;
        
        // 🚨 OVERRIDE LOGIC EXACTLY MATCHING C#
        if(isAtEvent) isPresent = true; 
        else if(isClaimed) isPresent = false; 
        else if(isMedical) isPresent = true;

        let uiText = `<b>${name}</b> (${roll})`;
        
        // 🚨 EXACT C# TEXT FORMATTING & COLORS
        if(isAtEvent) {
            uiText += ` - <span style="color:#10b981; font-weight:bold;">${attCurrentPeriodEvents.get(id).toUpperCase()}</span>`;
        } else if(isClaimed) {
            uiText += ` - <span style="color:#f59e0b; font-weight:bold;">IN ${attCurrentPeriodClaims.get(id).toUpperCase()}</span>`;
        } else if(isMedical) {
            uiText += ` - <span style="color:#3b82f6; font-weight:bold;">MEDICAL</span>`;
        }

        uiText += `<br><span style="font-size:11px; color:#94a3b8;">${sDept}</span>`;

        let toggleClass = `attd-toggle ${isPresent ? 'active' : ''} ${rowLocked ? 'locked' : ''}`;
        let padding = attIsSubstitutePanelOpen ? "10px" : "15px";
        let bgCol = attIsSubstitutePanelOpen ? "white" : "var(--bg-base, #ffffff)";
        let cursorStyle = rowLocked ? "not-allowed" : "pointer";
        let opacityStyle = rowLocked ? "0.6" : "1.0"; // 🚨 VISUAL LOCK (Gray out row)
        
        fullHTML += `
        <div id="row_${prefix}${id}" style="background:${bgCol}; opacity:${opacityStyle}; border:1px solid var(--border-color); border-radius:12px; margin-bottom:10px; padding:${padding}; display:flex; justify-content:space-between; align-items:center; cursor:${cursorStyle}; transition: background 0.2s;">
            <div style="font-size:14px; font-weight:600; color:var(--text-dark); pointer-events:none; line-height:1.4;">${uiText}</div>
            <div id="tog_${prefix}${id}" class="${toggleClass}" data-id="${id}" data-state="${isPresent}" data-locked="${rowLocked}" data-new="${isNewEntry}" data-init="${isPresent}" style="pointer-events:none;"></div>
        </div>`;

        targetArray.push(id);
    });

    targetContainer.innerHTML = fullHTML;

    targetArray.forEach(id => {
        let rowEl = document.getElementById(`row_${prefix}${id}`);
        let togEl = document.getElementById(`tog_${prefix}${id}`);
        
        rowEl.addEventListener("click", () => {
            if(togEl.dataset.locked === "true") return; // 🚨 Blocks click if locked
            
            let currentState = togEl.dataset.state === "true";
            let newState = !currentState;
            
            togEl.dataset.state = newState.toString();
            if(newState) togEl.classList.add("active"); 
            else togEl.classList.remove("active");
        });
    });

    if (!attIsSubstitutePanelOpen) {
        updateMainButtonState();
    }
}

// ==========================================
// 🚨 SAVE ATTENDANCE ENGINE
// ==========================================
async function saveAttendance() {
    let activeRows = attIsSubstitutePanelOpen ? attSubActiveRows : attMainActiveRows;
    let prefix = attIsSubstitutePanelOpen ? "sub_" : "main_";

    if(activeRows.length === 0) return;
    
    document.getElementById("updateProgressModal").classList.add("active");
    document.getElementById("updateProgressFill").style.width = "0%";
    document.getElementById("updateStatusText").innerText = "Saving Attendance...";
    
    if (attIsSubstitutePanelOpen) {
        document.getElementById(`subCardSaveBtn_${attPendingSubCardId}`).style.pointerEvents = "none";
    } else {
        document.getElementById("attSaveBtn").style.pointerEvents = "none";
    }

    const dateStr = `${attCurrentDate.getFullYear()}-${String(attCurrentDate.getMonth()+1).padStart(2,'0')}-${String(attCurrentDate.getDate()).padStart(2,'0')}`;
    const selectedSem = document.getElementById("attSemDropdown").value;
    const selectedSubject = document.getElementById("attSubjDropdown").value;
    const semName = `Semester${selectedSem}`;
    const semKey = `Semester_${selectedSem}`;
    const cleanSubjectID = selectedSubject.replace(/ /g, "").replace(/\//g, "-").replace(/\./g, "");
    const dailyDocID = `${dateStr}_${semName}_${cleanSubjectID}`;
    const globalDocID = `${dateStr}_${semName}_GLOBAL`;
    const pIndex = parseInt(document.getElementById("attPeriodDropdown").value) + 1;
    const periodKey = `period_${pIndex}`;

    const targetTeacherID = attIsSubstitutePanelOpen ? attPendingSubTeacherID : currentUserID;
    const targetTeacherName = attIsSubstitutePanelOpen ? attPendingSubTeacherName : currentTeacherName;
    const myKey = attCurrentSessionBatchIndex === -1 ? "common" : String(attCurrentSessionBatchIndex);

    try {
        const globalRef = doc(db, "colleges", currentCollegeID, "attendance", globalDocID);
        const subjectRef = doc(db, "colleges", currentCollegeID, "attendance", dailyDocID);
        
        const [gSnap, sSnap] = await Promise.all([getDoc(globalRef), getDoc(subjectRef)]);

        document.getElementById("updateProgressFill").style.width = "30%";

        let gData = gSnap.exists() ? gSnap.data() : {};
        let sData = sSnap.exists() ? sSnap.data() : {};

        if(gData.teacher_locks) {
            let tLock = gData.teacher_locks[`p${pIndex}_${currentUserID}`];
            if(tLock && tLock !== selectedSubject) {
                alert(`Double Booking: You already marked '${tLock}' for Period ${pIndex}!`); document.getElementById("updateProgressModal").classList.remove("active"); updateMainButtonState(); return;
            }
        }

        let pData = sData[periodKey] || {};
        let batchTeachers = pData.batch_teachers || {};
        let isFirstTimeMarking = !batchTeachers[myKey];

        if(batchTeachers[myKey] && batchTeachers[myKey].id !== currentUserID) {
            alert(`LOCKED: Batch already marked by ${batchTeachers[myKey].name}`); document.getElementById("updateProgressModal").classList.remove("active"); updateMainButtonState(); return;
        }

        let attendanceMap = pData.attendance || {};
        let myBatchPresent = 0; let myBatchTotal = 0;

        // 🚨 Using the correct array and prefix to grab toggles
        activeRows.forEach(id => {
            let el = document.getElementById(`tog_${prefix}${id}`);
            if(attCurrentPeriodEvents.has(id)) {
                // 🚨 FIRESTORE MERGE FIX: Deleting from a JS object doesn't delete it from the database during a merge. 
                // We MUST use deleteField() to match C#'s FieldValue.Delete!
                attendanceMap[id] = deleteField(); 
            } else {
                let isPresent = el.dataset.state === "true";
                attendanceMap[id] = isPresent;
                if(isPresent) myBatchPresent++;
                myBatchTotal++;
            }
        });

        let myBatchAbsent = myBatchTotal - myBatchPresent;
        let globalTotal = Object.keys(attendanceMap).length;
        let globalPresent = Object.values(attendanceMap).filter(v => v===true).length;
        let globalAbsent = globalTotal - globalPresent;

        let displayMarkerName = currentTeacherName;
        if(targetTeacherID !== currentUserID) displayMarkerName += " (Sub)";

        batchTeachers[myKey] = { name: displayMarkerName, id: currentUserID, timestamp: serverTimestamp() };

        let periodPayload = {
            subject: selectedSubject, category: attSubjectCategories.get(selectedSubject) || "UNKNOWN",
            markedByTeacherID: currentUserID, markedByTeacherName: displayMarkerName,
            batch_teachers: batchTeachers, timestamp: serverTimestamp(),
            stats: { totalStudents: globalTotal, presentCount: globalPresent, absentCount: globalAbsent },
            attendance: attendanceMap
        };

        if((periodPayload.category.includes("MJD") || periodPayload.category.includes("CORE")) && !attIsSubstitutePanelOpen) periodPayload.departmentID = teacherDeptRaw;
        sData[periodKey] = periodPayload;
        sData.date = dateStr; sData.semester = `Semester ${selectedSem}`;

        let allStudentPeriods = gData.student_periods || {};
        let oldStrictScores = gData.strict_scores_cache || {};
        let newStrictScoresCache = {...oldStrictScores};
        let studentClaims = gData.student_claims || {};

        document.getElementById("updateProgressFill").style.width = "60%";

        let batch = writeBatch(db);
        let batchPromises = [];
        let opCount = 0;

        if(isFirstTimeMarking) {
            const tRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
            batch.update(tRef, { 
                "total_hours_taught": increment(1), 
                [`semester_hours.${semKey}.total`]: increment(1),
                [`semester_hours.${semKey}.subjects.${selectedSubject}`]: increment(1)
            });
            opCount++;
        }

        // 🚨 THE FIX: Changed 'attActiveRows' to 'activeRows' here!
        for(let id of activeRows) {
            if(attCurrentPeriodClaims.has(id) && attCurrentPeriodClaims.get(id) !== selectedSubject) {
                alert("Save aborted. Students locked by another subject."); document.getElementById("updateProgressModal").classList.remove("active"); updateMainButtonState(); return;
            }
            if(attCurrentPeriodEvents.has(id)) continue;

            studentClaims[`p${pIndex}_${id}`] = selectedSubject;
            
            let el = document.getElementById(`tog_${prefix}${id}`);
            let isPresent = el.dataset.state === "true";
            let initPresent = el.dataset.init === "true";
            let isNew = el.dataset.new === "true";

            let simpleChange = 0; let totalChange = isNew ? 1 : 0;
            if(isNew) { simpleChange = isPresent ? 1 : 0; } 
            else { if(!initPresent && isPresent) simpleChange = 1; else if(initPresent && !isPresent) simpleChange = -1; }

            let stuRef = doc(db, "colleges", currentCollegeID, "students", id);
            let updates = {};

            if(simpleChange !== 0) updates[`attendance_stats.${semKey}.${cleanSubjectID}.present`] = increment(simpleChange);
            if(totalChange !== 0) updates[`attendance_stats.${semKey}.${cleanSubjectID}.total`] = increment(totalChange);

            let myPeriods = allStudentPeriods[id] || {};
            myPeriods[`p${pIndex}`] = isPresent;
            allStudentPeriods[id] = myPeriods;

            let mLoss = false; let eLoss = false;
            [1,2,3].forEach(p => { if(myPeriods[`p${p}`] === false) mLoss = true; });
            [4,5,6].forEach(p => { if(myPeriods[`p${p}`] === false) eLoss = true; });
            let newStrict = 0; if(!mLoss) newStrict += 0.5; if(!eLoss) newStrict += 0.5;

            newStrictScoresCache[id] = newStrict;
            let isNewDay = oldStrictScores[id] === undefined;
            let oldStrict = isNewDay ? 0 : parseFloat(oldStrictScores[id]);
            let strictDelta = newStrict - oldStrict;

            if(strictDelta !== 0) updates[`attendance_stats.${semKey}.Strict_Global.present`] = increment(strictDelta);
            if(isNewDay) updates[`attendance_stats.${semKey}.Strict_Global.total`] = increment(1);

            if(Object.keys(updates).length > 0) {
                batch.update(stuRef, updates);
                opCount++;
                if(opCount >= 400) { batchPromises.push(batch.commit()); batch = writeBatch(db); opCount = 0; }
            }
        }

        batch.set(subjectRef, sData, {merge:true});
        
        let tLocks = gData.teacher_locks || {};
        tLocks[`p${pIndex}_${currentUserID}`] = selectedSubject;
        
        let gUpdateObj = { student_periods: allStudentPeriods, strict_scores_cache: newStrictScoresCache, student_claims: studentClaims, teacher_locks: tLocks };

        if(attCurrentSessionBatchIndex === -1 && !attIsSubstitutePanelOpen) {
            let dLocks = gData.dept_locks || {};
            dLocks[`p${pIndex}_${teacherDeptRaw}`] = { subject: selectedSubject, teacherName: currentTeacherName, teacherID: currentUserID };
            gUpdateObj.dept_locks = dLocks;
        }

        batch.set(globalRef, gUpdateObj, {merge:true});
        batchPromises.push(batch.commit());

        document.getElementById("updateProgressFill").style.width = "90%";
        await Promise.all(batchPromises);
        
        document.getElementById("updateProgressFill").style.width = "100%";
        document.getElementById("updateStatusText").innerHTML = `Attendance Saved!<br><span style="font-size:14px; color:#10b981;">(P: ${myBatchPresent}, A: ${myBatchAbsent})</span>`;
        
        setTimeout(() => {
            document.getElementById("updateProgressModal").classList.remove("active");
            if(attIsSubstitutePanelOpen) {
                document.getElementById(`subCardBody_${attPendingSubCardId}`).style.display = "none";
                document.getElementById(`subCardIcon_${attPendingSubCardId}`).style.transform = "rotate(0deg)";
                document.getElementById(`subCardSaveBtn_${attPendingSubCardId}`).style.pointerEvents = "auto";
                attIsSubstitutePanelOpen = false;
                updateMainButtonState(); // Re-enables the main button automatically!
            } else {
                document.getElementById("attSaveBtn").style.pointerEvents = "auto";
                loadSessionData(); 
            }
        }, 1500);

    } catch(e) {
        console.error("Save Crash", e);
        document.getElementById("updateStatusText").innerText = "Save Failed!";
        setTimeout(() => { 
            document.getElementById("updateProgressModal").classList.remove("active");
            if(attIsSubstitutePanelOpen) document.getElementById(`subCardSaveBtn_${attPendingSubCardId}`).style.pointerEvents = "auto";
            else document.getElementById("attSaveBtn").style.pointerEvents = "auto";
            updateMainButtonState(); 
        }, 1500);
    }
}

// ==========================================
// 🚨 BANK-GRADE ANTI-SNOOPING SHIELD 
// ==========================================
if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    console.log = function() {}; console.warn = function() {}; console.error = function() {};
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.onkeydown = function(e) {
        if (e.keyCode === 123) return false; // F12
        if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false; // Ctrl+Shift+I/J/C
        if (e.ctrlKey && e.keyCode === 85) return false; // Ctrl+U
    };
}

// 🚨 SECURE HASHING ALGORITHM (SHA-256)
async function hashText(text) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// 🚨 MASTER SECURITY PIN & BIOMETRIC ENGINE (IIFE & DOM VAULT)
// ==========================================
(function SecureEngine() {
    const elLock = {
        screen: document.getElementById("appLockScreen"), title: document.getElementById("lockTitle"), status: document.getElementById("lockStatus"),
        input: document.getElementById("lockPinInput"), btnSubmit: document.getElementById("btnLockSubmit"), btnForgot: document.getElementById("btnLockForgot"),
        reAuthOverlay: document.getElementById("reAuthOverlay"), reAuthPass: document.getElementById("reAuthPasswordInput"), 
        reAuthStatus: document.getElementById("reAuthStatus"), btnReAuth: document.getElementById("btnReAuthSubmit"),
        btnBio: document.getElementById("btnLockBiometrics"), toggleBio: document.getElementById("bioToggleSwitch"), btnToggleWrap: document.getElementById("btnToggleBiometrics")
    };

    // 🚨 1. DOM VAULT VARIABLES (Invisible to DevTools Console!)
    let secureDOMVault = null;
    const navElement = document.querySelector(".icon-nav-container");
    const dashElement = document.querySelector(".dashboard-wrapper");

    const isBiometricSupported = window.PublicKeyCredential !== undefined;
    let isBioEnabledLocally = false; 
    let cachedTeacherPinHash = ""; 
    let lockMode = "LOGIN"; 
    let setupTempPin = "";
    let failedPinAttempts = 0;
    let securityListener = null;
    let isFirstSecurityLoad = true;
    let isBiometricPromptActive = false;
    let isFirstUnlock = true;

    // 🚨 2. DOM VAULTING FUNCTIONS
    function VaultDashboard() {
        if (secureDOMVault) return; // Already vaulted
        secureDOMVault = document.createDocumentFragment();
        if (navElement && navElement.parentNode) secureDOMVault.appendChild(navElement);
        if (dashElement && dashElement.parentNode) secureDOMVault.appendChild(dashElement);
        document.getElementById("initialAppLoader").style.display = "none"; 
        elLock.screen.style.display = "flex";
    }

    function RestoreDashboard() {
        if (secureDOMVault) {
            document.body.appendChild(secureDOMVault);
            secureDOMVault = null; 
        }
        elLock.screen.style.display = "none";
    }

    // 1. Initialization
    window.InitBiometricUI = function() {
        isBioEnabledLocally = localStorage.getItem(`adhyora_bio_teacher_${currentUserID}`) === "true";
        if (!isBiometricSupported) {
            if(elLock.btnToggleWrap) {
                elLock.btnToggleWrap.style.opacity = "0.5";
                elLock.btnToggleWrap.title = "Not supported on this device/browser.";
            }
        } else if (isBioEnabledLocally) {
            if(elLock.toggleBio) elLock.toggleBio.classList.add("active");
        }
    };

    window.CheckSecurityPin = function() {
        VaultDashboard(); // 🚨 VAULT IMMEDIATELY ON BOOT

        if (securityListener) securityListener(); 

        securityListener = onSnapshot(doc(db, "colleges", currentCollegeID, "teachers", currentUserID), async (snap) => {
            if (snap.exists() && snap.data().securityPin) {
                // 🚨 The database now gives us the hash directly!
                const hashedLivePin = snap.data().securityPin;
                
                if (!isFirstSecurityLoad && cachedTeacherPinHash && cachedTeacherPinHash !== hashedLivePin) {
                    isBioEnabledLocally = false;
                    localStorage.setItem(`adhyora_bio_teacher_${currentUserID}`, "false");
                    localStorage.removeItem(`adhyora_bio_id_teacher_${currentUserID}`);
                    localStorage.removeItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`);
                    if (elLock.toggleBio) elLock.toggleBio.classList.remove("active");
                    
                    VaultDashboard(); // 🚨 VAULT IF CHANGED REMOTELY
                    showRcToast("Security PIN was changed. Biometrics reset.");
                    SetLockMode("LOGIN");
                }

                cachedTeacherPinHash = hashedLivePin;

                if (isFirstSecurityLoad) {
                    const linkedPin = localStorage.getItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`);
                    if (isBioEnabledLocally && linkedPin && linkedPin !== hashedLivePin) {
                        isBioEnabledLocally = false;
                        localStorage.setItem(`adhyora_bio_teacher_${currentUserID}`, "false");
                        localStorage.removeItem(`adhyora_bio_id_teacher_${currentUserID}`);
                        localStorage.removeItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`);
                        if (elLock.toggleBio) elLock.toggleBio.classList.remove("active");
                    }
                    SetLockMode("LOGIN");
                    isFirstSecurityLoad = false;
                }
            } else {
                if (isFirstSecurityLoad) {
                    SetLockMode("SETUP_1");
                    isFirstSecurityLoad = false;
                }
            }
        }, (error) => {
            elLock.status.innerText = "Network error syncing security.";
            elLock.status.style.color = "#ef4444";
        });
    };

    // 2. Settings Menu Biometric Toggle
    if(elLock.btnToggleWrap) {
        elLock.btnToggleWrap.addEventListener("click", async () => {
            if (!isBiometricSupported) return;

            if (isBioEnabledLocally) {
                isBioEnabledLocally = false;
                localStorage.setItem(`adhyora_bio_teacher_${currentUserID}`, "false");
                localStorage.removeItem(`adhyora_bio_id_teacher_${currentUserID}`); 
                localStorage.removeItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`);
                elLock.toggleBio.classList.remove("active");
                showRcToast("Biometrics disabled for this device.");
            } else {
                try {
                    const challenge = window.crypto.getRandomValues(new Uint8Array(32));
                    const userIDBuffer = new TextEncoder().encode(currentUserID);

                    const credential = await navigator.credentials.create({
                        publicKey: {
                            challenge: challenge,
                            rp: { name: "Adhyora AMS", id: window.location.hostname },
                            user: { id: userIDBuffer, name: currentTeacherName, displayName: currentTeacherName },
                            pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                            authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                            timeout: 60000
                        }
                    });

                    const credIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
                    localStorage.setItem(`adhyora_bio_id_teacher_${currentUserID}`, credIdBase64);
                    localStorage.setItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`, cachedTeacherPinHash); 
                    
                    localStorage.setItem(`adhyora_bio_teacher_${currentUserID}`, "true");
                    isBioEnabledLocally = true;
                    if(elLock.toggleBio) elLock.toggleBio.classList.add("active");
                    showRcToast("✅ Biometrics Linked Successfully!");
                } catch (err) {
                    showRcToast("❌ Failed to link Biometrics.");
                }
            }
        });
    }

    // 3. Lock Screen Biometric Prompt
    if(elLock.btnBio) {
        elLock.btnBio.addEventListener("click", async () => {
            elLock.btnBio.innerText = "Scanning...";
            isBiometricPromptActive = true; 
            
            const savedCredIdBase64 = localStorage.getItem(`adhyora_bio_id_teacher_${currentUserID}`);
            if (!savedCredIdBase64) {
                elLock.status.innerText = "Biometric data lost. Please set up again.";
                elLock.status.style.color = "#ef4444";
                isBiometricPromptActive = false;
                return;
            }

            try {
                const challenge = window.crypto.getRandomValues(new Uint8Array(32));
                const binary = atob(savedCredIdBase64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

                await navigator.credentials.get({
                    publicKey: {
                        challenge: challenge,
                        rpId: window.location.hostname,
                        allowCredentials: [{ type: "public-key", id: bytes.buffer }],
                        userVerification: "required",
                        timeout: 60000
                    }
                });

                isBiometricPromptActive = false;
                elLock.btnBio.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';
                setTimeout(() => { UnlockSecurityWall(); }, 500);
            } catch (err) {
                isBiometricPromptActive = false;
                elLock.btnBio.innerHTML = '<i class="fas fa-fingerprint" style="margin-right:8px;"></i> Try Again';
                elLock.status.innerText = "Biometric scan failed or cancelled.";
                elLock.status.style.color = "#ef4444";
            }
        });
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
            elLock.status.innerText = "Set a 4-digit PIN to secure your dashboard.";
            elLock.status.style.color = "var(--brand-red)";
            elLock.btnSubmit.innerText = "Next Step";
            elLock.btnBio.style.display = "none";
        }
        else if (mode === "SETUP_2" || mode === "RESET_NEW_2") {
            elLock.title.innerText = "CONFIRM NEW PIN";
            elLock.status.innerText = "Please re-enter the PIN to confirm.";
            elLock.status.style.color = "#f59e0b";
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
            if (hashedInput === cachedTeacherPinHash) {
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
                    // 🚨 1. Hash the PIN immediately on the device
                    let hashedPinToSave = await hashText(val);
                    
                    // 🚨 2. Send ONLY the hash to Firebase. The plain text never leaves the computer!
                    await setDoc(doc(db, "colleges", currentCollegeID, "teachers", currentUserID), { securityPin: hashedPinToSave }, { merge: true });
                    
                    cachedTeacherPinHash = hashedPinToSave;
                    
                    isBioEnabledLocally = false;
                    localStorage.setItem(`adhyora_bio_teacher_${currentUserID}`, "false");
                    localStorage.removeItem(`adhyora_bio_id_teacher_${currentUserID}`);
                    localStorage.removeItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`);
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
                        user: { id: userIDBuffer, name: currentTeacherName, displayName: currentTeacherName },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                        timeout: 60000
                    }
                });

                const credIdBase64 = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
                localStorage.setItem(`adhyora_bio_id_teacher_${currentUserID}`, credIdBase64);
                localStorage.setItem(`adhyora_bio_linked_pin_teacher_${currentUserID}`, cachedTeacherPinHash); 
                
                localStorage.setItem(`adhyora_bio_teacher_${currentUserID}`, "true");
                isBioEnabledLocally = true;
                if(elLock.toggleBio) elLock.toggleBio.classList.add("active");

                elLock.btnSubmit.innerHTML = '<i class="fas fa-check-circle"></i> Linked!';
                setTimeout(() => { UnlockSecurityWall(); }, 800);

            } catch (err) {
                elLock.status.innerText = "Scan failed or cancelled. You can enable it later in settings.";
                elLock.status.style.color = "#ef4444";
                elLock.btnSubmit.innerText = "Try Again";
            }
        }
    });

    function UnlockSecurityWall() {
        RestoreDashboard(); // 🚨 BRING UI OUT OF VAULT
        failedPinAttempts = 0;
        updateStatusBar();
        
        if (isFirstUnlock) {
            const currentHash = window.location.hash.replace("#", "");
            if (currentHash && currentHash !== "HOME" && views[currentHash]) {
                setTimeout(() => {
                    let btnId = "btnNav" + currentHash.charAt(0).toUpperCase() + currentHash.slice(1);
                    let targetBtn = document.getElementById(btnId);
                    if(typeof switchView === "function") switchView(views[currentHash], targetBtn || null, true);
                }, 500); 
            }
            isFirstUnlock = false;
        }
    }

    // 4. Reset & Password Fallbacks
    elLock.btnForgot.addEventListener("click", () => {
        if (lockMode === "SETUP_BIO") {
            UnlockSecurityWall();
            return;
        }
        elLock.reAuthPass.value = "";
        elLock.reAuthStatus.innerText = "";
        elLock.reAuthOverlay.classList.add("active");
    });

    document.getElementById("btnResetPinSettings")?.addEventListener("click", () => {
        document.getElementById("settingsOverlay").classList.remove("active");
        elLock.reAuthPass.value = "";
        elLock.reAuthStatus.innerText = "";
        elLock.reAuthOverlay.classList.add("active");
    });

    elLock.btnReAuth.addEventListener("click", async () => {
        let pass = elLock.reAuthPass.value.trim();
        if (!pass) return;

        if (!auth.currentUser || !auth.currentUser.email) {
            elLock.reAuthStatus.innerText = "Session lost. Please refresh the page.";
            return;
        }

        elLock.btnReAuth.innerText = "Verifying...";
        elLock.btnReAuth.disabled = true;
        
        try {
            const credential = EmailAuthProvider.credential(auth.currentUser.email, pass);
            await reauthenticateWithCredential(auth.currentUser, credential);
            
            elLock.reAuthOverlay.classList.remove("active");
            elLock.reAuthPass.value = "";
            
            VaultDashboard(); // 🚨 VAULT DOM
            SetLockMode("RESET_NEW_1");
            
        } catch(e) {
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
                elLock.reAuthStatus.innerText = "Incorrect Password.";
            } else if (e.code === 'auth/too-many-requests') {
                elLock.reAuthStatus.innerText = "Too many attempts. Try again later.";
            } else {
                elLock.reAuthStatus.innerText = "Error: " + (e.code || e.message); 
            }
        }
        elLock.btnReAuth.innerText = "Verify";
        elLock.btnReAuth.disabled = false;
    });

    document.getElementById("btnResetPassSettings")?.addEventListener("click", async () => {
        if (!auth.currentUser || !auth.currentUser.email) {
            showRcToast("Error: No active user session found.");
            return;
        }
        if (confirm(`Send a password reset link to ${auth.currentUser.email}?`)) {
            try {
                await sendPasswordResetEmail(auth, auth.currentUser.email);
                showRcToast("✅ Password reset link sent!");
                document.getElementById("settingsOverlay").classList.remove("active");
            } catch(e) {
                showRcToast("❌ Failed: " + (e.code || "Unknown Error"));
            }
        }
    });

    // 5. App Background Visibility Lock
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            const isLocked = elLock.screen.style.display === "flex";
            if (!isLocked && !isBiometricPromptActive && cachedTeacherPinHash !== "") {
                
                // Close modals
                document.querySelectorAll('.modal-overlay.active, .settings-drawer.active').forEach(modal => {
                    modal.classList.remove('active');
                });
                
                if (elLock.reAuthPass) elLock.reAuthPass.value = "";
                if (elLock.reAuthStatus) elLock.reAuthStatus.innerText = "";
                
                VaultDashboard(); // 🚨 VAULT DOM
                SetLockMode("LOGIN");

                updateStatusBar();
            }
        }
    });
})();
// ==========================================
// 🚨 UI NAVIGATION ROUTER (WITH BACK BUTTON SUPPORT)
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"), 
    attendance: document.getElementById("attendanceView"), 
    timetable: document.getElementById("timetableView"),
    assign: document.getElementById("assignView"), 
    internalMarks: document.getElementById("internalMarksView"), 
    subjects: document.getElementById("subjectsView"), 
    calendar: document.getElementById("calendarView"),
    assignments: document.getElementById("assignmentsView"), 
    studentList: document.getElementById("studentListView"), 
    studentDashboard: document.getElementById("studentDashboardView"), 
    subjectAssign: document.getElementById("subjectAssignView"),
    batch: document.getElementById("batchView"), 
    eventAttendance: document.getElementById("eventAttendanceView"), 
    notifications: document.getElementById("notificationsView"),
    messages: document.getElementById("messagesView")
};

let lastPushedView = "HOME"; // Tracker to prevent duplicate history entries

document.getElementById("btnNavStudentList")?.addEventListener("click", () => {
    switchView(views.studentList, document.getElementById("btnNavStudentList"));
    if (!slLoaded) startStudentListListener();
});

document.getElementById("btnBackToStudents")?.addEventListener("click", () => {
    switchView(views.studentList, document.getElementById("btnNavStudentList"));
});

document.getElementById("btnNavSubjectAssign")?.addEventListener("click", () => {
    switchView(views.subjectAssign, document.getElementById("btnNavSubjectAssign"));
    initSubjectAssignEngine(); 
});

document.getElementById("btnNavBatch")?.addEventListener("click", () => {
    switchView(views.batch, document.getElementById("btnNavBatch"));
    initBatchEngine(); 
});

document.getElementById("btnNavEventAttendance")?.addEventListener("click", () => {
    switchView(views.eventAttendance, document.getElementById("btnNavEventAttendance"));
    initEventAttendanceEngine(); 
});

document.getElementById("btnNavInternalMarks")?.addEventListener("click", () => {
    switchView(views.internalMarks, document.getElementById("btnNavInternalMarks"));
    initInternalMarksEngine(); 
});

document.getElementById("btnNavTimetable")?.addEventListener("click", () => {
    switchView(views.timetable, document.getElementById("btnNavTimetable"));
    initTimetableEngine();
});

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn, .nav-btn, .menu-btn");

function cleanupAttendanceView() {
    if (attSessionListenerUnsub) { attSessionListenerUnsub(); attSessionListenerUnsub = null; }
    if (attMainEventListenerUnsub) { attMainEventListenerUnsub(); attMainEventListenerUnsub = null; }
    
    if (typeof showAttCenterMessage === "function") {
        showAttCenterMessage("Please select a subject<br>to mark attendance.");
        let subDrop = document.getElementById("attSubjDropdown");
        if(subDrop) subDrop.value = "Select Subject";
    }

    let mainScr = document.getElementById("attMainScreen");
    let histScr = document.getElementById("attHistoryScreen");
    let recScr = document.getElementById("attRecordScreen");
    if (mainScr) mainScr.style.display = "flex";
    if (histScr) histScr.style.display = "none";
    if (recScr) recScr.style.display = "none";
}

// 🚨 OPTIMIZATION: Stripped out history tracking. Navigation is now a pure SPA state.
function switchView(targetView, clickedBtn) {
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn && (clickedBtn.classList.contains('nav-icon-btn') || clickedBtn.classList.contains('nav-btn') || clickedBtn.classList.contains('menu-btn'))) clickedBtn.classList.add("active-nav");
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });
    
    if (targetView !== views.attendance) cleanupAttendanceView();
    if (targetView !== views.subjects) subjPurgeUnsavedPending(); 

    if (targetView === views.assignments && typeof asnIsInit !== 'undefined' && asnIsInit) {
        asnRenderList(asnCachedData);
    }

    if (targetView === views.timetable) {
        initTimetableEngine();
    }

    const sidebar = document.getElementById("mainSidebar");
    const mainContent = document.querySelector(".main-content");

    if (targetView === "HOME") {
        if(sidebar) sidebar.classList.remove("mobile-hidden");
        if(mainContent) mainContent.classList.remove("mobile-active");
        if (views.welcome && window.innerWidth > 900) views.welcome.classList.remove("hidden-view");
    } else {
        if(sidebar) sidebar.classList.add("mobile-hidden");
        if(mainContent) mainContent.classList.add("mobile-active");
        if (targetView) { targetView.classList.remove("hidden-view"); targetView.style.opacity = 0; setTimeout(() => targetView.style.opacity = 1, 50); } 
        else showRcToast("This module is under construction.");
    }
}

// 🚨 THIS WAS CAUSING THE ERROR! It is now declared exactly ONCE here.
function attachSafeClick(elementId, action) { let el = document.getElementById(elementId); if (el) el.addEventListener("click", action); }

attachSafeClick("btnHome", (e) => switchView("HOME", e.currentTarget));
attachSafeClick("btnMessages", (e) => { switchView(views.messages, e.currentTarget); document.querySelectorAll("#btnMessages .notification-dot").forEach(dot => dot.style.display = "none"); });
attachSafeClick("btnNotifications", (e) => { switchView(views.notifications, e.currentTarget); document.querySelectorAll("#btnNotifications .notification-dot").forEach(dot => dot.style.display = "none"); });
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
// 🚨 HARDWARE BACK BUTTON / ROUTING MANAGER
// ==========================================
let exitPressTimer = 0; // Tracks back button presses for exiting

// Push an initial state to trap the back button the moment the app loads
history.pushState(null, null, location.href);

window.addEventListener('popstate', () => {

    // 1. Security Check (Block back button if locked)
    if (elLock.screen && elLock.screen.style.display === "flex") {
        history.pushState(null, null, location.href); // Re-trap
        return;
    }

    // 2. Modals & Overlays (Close the top-most active popup)
    const closableOverlays = [
        "updateProgressModal", "subConfirmModal", "jumpDateModal", "hodNotificationPanel", 
        "settingsOverlay", "themesModal", "subjConfirmDeleteModal", "saConfirmModal", 
        "evtSearchModal", "imMarksModal", "deptSplitOverlay", "exportDataModal", 
        "composeMessageModal", "sessionsModal", "createAssignmentModal", "reAuthOverlay"
    ];
    
    for (let id of closableOverlays) {
        let el = document.getElementById(id);
        if (el && el.classList.contains("active")) {
            el.classList.remove("active");
            
            if(id === "reAuthOverlay") {
                elLock.reAuthPass.value = "";
                elLock.reAuthStatus.innerText = "";
            }
            
            history.pushState(null, null, location.href); // Re-trap after closing modal
            return;
        }
    }

    // 3. Deep Sub-Views (Attendance Screens)
    let mainScr = document.getElementById("attMainScreen");
    let histScr = document.getElementById("attHistoryScreen");
    let recScr = document.getElementById("attRecordScreen");

    // If viewing a specific record -> Go back to History list
    if (recScr && recScr.style.display === "flex") {
        recScr.style.display = "none";
        if (histScr) histScr.style.display = "flex";
        history.pushState(null, null, location.href); // Re-trap
        return;
    }
    // If viewing History list -> Go back to Main Attendance Panel
    if (histScr && histScr.style.display === "flex") {
        histScr.style.display = "none";
        if (mainScr) mainScr.style.display = "flex";
        history.pushState(null, null, location.href); // Re-trap
        return;
    }

    // 4. Are we on the Home Screen?
    let isHome = false;
    if (window.innerWidth > 900) {
        isHome = views.welcome && !views.welcome.classList.contains("hidden-view");
    } else {
        isHome = document.getElementById("mainSidebar") && !document.getElementById("mainSidebar").classList.contains("mobile-hidden") && !document.querySelector(".main-content").classList.contains("mobile-active");
    }

    if (!isHome) {
        // We are inside a sidebar menu item. Go back to HOME.
        switchView("HOME", document.getElementById("btnHome"));
        history.pushState(null, null, location.href); // Re-trap on home screen
        return;
    }

    // 5. 🚨 THE NEW DOUBLE-TAP TO EXIT LOGIC
    let now = Date.now();
    if (now - exitPressTimer < 2000) {
        // Double tap confirmed. Let the OS close the PWA!
        history.back(); 
    } else {
        // First tap: Arm the timer and show toast
        exitPressTimer = now;
        showRcToast("Press back again to exit");
        history.pushState(null, null, location.href); 
    }
});

// ==========================================
// 🚨 SETTINGS DRAWER ACTIONS
// ==========================================
window.showRcToast = function(msg) { let t = document.getElementById("rcToast"); if(t) { t.innerText = msg; t.style.bottom = "30px"; setTimeout(() => t.style.bottom = "-100px", 3000); } };
attachSafeClick("btnSettings", () => { let s = document.getElementById("settingsOverlay"); if(s) s.classList.add("active"); });
attachSafeClick("closeSettingsBtn", () => { let s = document.getElementById("settingsOverlay"); if(s) s.classList.remove("active"); });
const elSettings = document.getElementById("settingsOverlay");
if(elSettings) { elSettings.addEventListener("click", (e) => { if (e.target === elSettings) elSettings.classList.remove("active"); }); }

attachSafeClick("btnContactUs", () => {
    const SUPPORT_EMAIL = "pixelaks.technologies@gmail.com"; let role = isHOD ? "Teacher (HOD)" : "Teacher"; let deviceInfo = `\n========================\nBrowser/OS: ${navigator.userAgent}\nCollege ID: ${currentCollegeID}\nRole: ${role}\n========================`;
    window.open(`mailto:${SUPPORT_EMAIL}?subject=Support Request - Teacher App&body=Please describe your issue here:\n\n\n${encodeURIComponent(deviceInfo)}`, "_blank");
});
attachSafeClick("btnWebsite", () => window.open("https://pixelaks.in/", "_blank"));
attachSafeClick("btnPrivacy", () => window.open("https://pixelaks.in/privacy", "_blank"));
attachSafeClick("btnTerms", () => window.open("https://pixelaks.in/terms", "_blank"));
// ==========================================
// 🚨 SMART SIGN OUT (CLEARS TOKENS)
// ==========================================
async function handleSignOut() {
    try {
        // If we have a token in RAM, delete it from the database!
        if (myCurrentPushToken && currentUserID && currentCollegeID) {
            const teacherRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
            await setDoc(teacherRef, {
                webFcmTokens: arrayRemove(myCurrentPushToken)
            }, { merge: true });
            console.log("Push Token cleanly removed from database!");
        }
    } catch(e) { 
        console.error("Error removing token", e); 
    }
    
    // Now log them out!
    signOut(auth).then(() => window.location.href = "index.html");
}

attachSafeClick("btnSignOut", () => {
    if (confirm("Sign out of Adhyora?")) handleSignOut();
});

// ==========================================
// 🚨 THEME MANAGER
// ==========================================
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add("dark-mode");
        let dBtn = document.getElementById("btnDarkMode"); let lBtn = document.getElementById("btnLightMode");
        if(dBtn) dBtn.style.border = "2px solid var(--brand-red)"; if(lBtn) lBtn.style.border = "1px solid #475569";
    } else {
        document.body.classList.remove("dark-mode");
        let dBtn = document.getElementById("btnDarkMode"); let lBtn = document.getElementById("btnLightMode");
        if(lBtn) lBtn.style.border = "2px solid var(--brand-red)"; if(dBtn) dBtn.style.border = "1px solid #cbd5e1";
    }
    localStorage.setItem("adhyora_teacher_theme", isDark ? "dark" : "light");

    updateStatusBar();
}
attachSafeClick("btnThemes", () => { let s = document.getElementById("settingsOverlay"); let t = document.getElementById("themesModal"); if(s) s.classList.remove("active"); if(t) t.classList.add("active"); });
attachSafeClick("btnDarkMode", () => applyTheme(true));
attachSafeClick("btnLightMode", () => applyTheme(false));
applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");

// ==========================================
// 🚨 ATTENDANCE HISTORY (RECORDS) ENGINE
// ==========================================
let histCurrentDate = new Date();
let histDailyPeriodCache = new Map();
let histStudentNameCache = new Map();
let histLastFetchedYearStr = "";

// Bind HTML Buttons
document.getElementById("btnOpenHistory")?.addEventListener("click", openHistoryPanel);

// 🚨 Navigate back to Main Screen
document.getElementById("backFromHistoryBtn")?.addEventListener("click", () => {
    document.getElementById("attHistoryScreen").style.display = "none";
    document.getElementById("attMainScreen").style.display = "flex";
});

// 🚨 Navigate back to History Screen
document.getElementById("backFromRecordBtn")?.addEventListener("click", () => {
    document.getElementById("attRecordScreen").style.display = "none";
    document.getElementById("attHistoryScreen").style.display = "flex";
});

document.getElementById("histSemDropdown")?.addEventListener("change", onHistSemesterChanged);
document.getElementById("histDateJumpBtn")?.addEventListener("click", () => {
    document.getElementById("jumpDateModal").classList.add("active");
    let submitBtn = document.getElementById("jumpSubmitBtn");
    let newSubmit = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
    newSubmit.addEventListener("click", () => {
        let d = parseInt(document.getElementById("jumpDayDropdown").value);
        let m = parseInt(document.getElementById("jumpMonthDropdown").value);
        let y = parseInt(document.getElementById("jumpYearDropdown").value);
        histCurrentDate = new Date(y, m, d);
        document.getElementById("jumpDateModal").classList.remove("active");
        histUpdateDateUI();
        histFetchDailyHistory();
        setupJumpDateModals(); 
    });
});

function openHistoryPanel() {
    // Swap screens instantly inside the panel!
    document.getElementById("attMainScreen").style.display = "none";
    document.getElementById("attHistoryScreen").style.display = "flex";
    
    let semDrop = document.getElementById("histSemDropdown");
    if(currentSemesterType === "Odd") {
        semDrop.innerHTML = `<option value="1">Semester 1</option><option value="3">Semester 3</option><option value="5">Semester 5</option><option value="7">Semester 7</option>`;
    } else {
        semDrop.innerHTML = `<option value="2">Semester 2</option><option value="4">Semester 4</option><option value="6">Semester 6</option><option value="8">Semester 8</option>`;
    }

    histCurrentDate = new Date();
    
    // 🚨 WEEKEND FALLBACK FIX: If today is Saturday (6) or Sunday (0), shift to Friday!
    if (histCurrentDate.getDay() === 6) {
        histCurrentDate.setDate(histCurrentDate.getDate() - 1);
    } else if (histCurrentDate.getDay() === 0) {
        histCurrentDate.setDate(histCurrentDate.getDate() - 2);
    }

    histUpdateDateUI();
    onHistSemesterChanged();
}

function histUpdateDateUI() {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // 🚨 STYLING FIX: Formats the date neatly to match the dropdown height
    let dStr = `<span style="font-size:14px;">${days[histCurrentDate.getDay()]}</span><span style="font-size:11px; opacity:0.8; margin-top:2px;">${histCurrentDate.getFullYear()}-${String(histCurrentDate.getMonth()+1).padStart(2,'0')}-${String(histCurrentDate.getDate()).padStart(2,'0')}</span>`;
    document.getElementById("histDateJumpBtn").innerHTML = dStr;
    histUpdateQuickDays();
}

function histUpdateQuickDays() {
    let container = document.getElementById("histDaysContainer");
    let dayIndex = histCurrentDate.getDay() === 0 ? 6 : histCurrentDate.getDay() - 1; // Mon=0, Sun=6
    
    let html = "";
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    for(let i=0; i<5; i++) {
        let isSelected = i === dayIndex;
        // 🚨 STYLING FIX: Enforces the clean White/Red aesthetics for the unselected buttons
        let bg = isSelected ? "var(--brand-red)" : "white"; 
        let col = isSelected ? "white" : "var(--brand-red)";
        let border = isSelected ? "none" : "1px solid rgba(220, 38, 38, 0.3)";
        html += `<button id="quickDayBtn_${i}" style="flex:1; padding:12px 0; border-radius:8px; background:${bg}; color:${col}; border:${border}; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">${labels[i]}</button>`;
    }
    container.innerHTML = html;

    for(let i=0; i<5; i++) {
        document.getElementById(`quickDayBtn_${i}`).addEventListener("click", () => histQuickJumpDay(i));
    }
}
function histQuickJumpDay(targetDayIndex) {
    let d = new Date(histCurrentDate);
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
    let monday = new Date(d.setDate(diff));
    
    histCurrentDate = new Date(monday.setDate(monday.getDate() + targetDayIndex));
    histUpdateDateUI();
    histFetchDailyHistory();
}

function onHistSemesterChanged() {
    let semText = document.getElementById("histSemDropdown").value;
    histPreloadStudentNames(semText);
    histFetchDailyHistory();
}

async function histPreloadStudentNames(semNum) {
    let semInt = parseInt(semNum);
    let yearStr = "1";
    if(semInt <= 2) yearStr = "1"; else if(semInt <= 4) yearStr = "2"; else if(semInt <= 6) yearStr = "3"; else yearStr = "4";

    if (histLastFetchedYearStr === yearStr) return;
    histLastFetchedYearStr = yearStr;

    try {
        let snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", yearStr)));
        histStudentNameCache.clear();
        snap.forEach(doc => {
            let d = doc.data();
            let name = d.Name || d.studentName || "Unknown";
            let roll = d.RollNumber || d.rollNumber || doc.id;
            histStudentNameCache.set(doc.id, name);
            histStudentNameCache.set(roll, name);
        });
    } catch(e) { console.error("History Name Preload Error:", e); }
}

async function histFetchDailyHistory() {
    let centerMsg = document.getElementById("histCenterMsg");
    document.getElementById("histListContainer").innerHTML = "";
    document.getElementById("histListContainer").appendChild(centerMsg);
    
    centerMsg.style.display = "block";
    centerMsg.innerHTML = "Fetching Records...";

    let dateStr = `${histCurrentDate.getFullYear()}-${String(histCurrentDate.getMonth()+1).padStart(2,'0')}-${String(histCurrentDate.getDate()).padStart(2,'0')}`;
    let semDrop = document.getElementById("histSemDropdown");
    let selectedSem = semDrop.options[semDrop.selectedIndex].text;
    let semName = selectedSem.replace(/ /g, "");
    
    // 🚨 THE CRASH-PROOF PREFIX QUERY
    let docPrefix = `${dateStr}_${semName}_`;

    try {
        let snap = await getDocs(query(
            collection(db, "colleges", currentCollegeID, "attendance"),
            where(documentId(), ">=", docPrefix),
            where(documentId(), "<=", docPrefix + "\uf8ff")
        ));

        if (snap.empty) {
            centerMsg.innerHTML = "No attendance marked for this day.";
            histDailyPeriodCache.clear();
            return;
        }

        histProcessDailyData(snap, selectedSem);
    } catch(e) {
        centerMsg.innerHTML = "Network Error.";
        console.error("History Fetch Error:", e);
    }
}

function histProcessDailyData(snapshot, targetSemester) {
    histDailyPeriodCache.clear();
    let validRecordsFound = 0;

    snapshot.forEach(docSnap => {
        if (docSnap.id.endsWith("_GLOBAL") || docSnap.id.endsWith("_EVENTS")) return;

        let dayData = docSnap.data();
        for (let i = 1; i <= 6; i++) {
            let pKey = `period_${i}`;
            if (dayData[pKey]) {
                let periodData = dayData[pKey];
                let deptID = periodData.departmentID || "";
                let category = (periodData.category || "").toUpperCase();
                let markedByMe = false;

                // 🚨 C# Logic: Safely check inside batches
                if (periodData.batch_teachers) {
                    let allTeacherNames = [];
                    for (let [bKey, bInfo] of Object.entries(periodData.batch_teachers)) {
                        if (bInfo.id === currentUserID) markedByMe = true;
                        if (bInfo.name) {
                            let tName = bInfo.name;
                            let batchLabel = "";
                            if (bKey !== "common" && !isNaN(bKey)) {
                                batchLabel = ` (Batch ${parseInt(bKey) + 1})`;
                            }
                            allTeacherNames.push(tName + batchLabel);
                        }
                    }
                    if (allTeacherNames.length > 0) {
                        periodData.markedByTeacherName = allTeacherNames.join(", ");
                    }
                } else if (periodData.markedByTeacherID === currentUserID) {
                    markedByMe = true;
                }

                let isMyDept = (deptID === teacherDeptRaw && teacherDeptRaw !== "");
                let isCommonSubject = category.includes("AECC") || category.includes("VAC") || category.includes("SEC") || category.includes("MID");

                if (isMyDept || isCommonSubject || markedByMe) {
                    if (!histDailyPeriodCache.has(i)) histDailyPeriodCache.set(i, []);
                    periodData.periodNumber = i;
                    histDailyPeriodCache.get(i).push(periodData);
                    validRecordsFound++;
                }
            }
        }
    });

    if (validRecordsFound === 0) {
        document.getElementById("histCenterMsg").innerHTML = `No records found for ${targetSemester}<br>in your department.`;
    } else {
        document.getElementById("histCenterMsg").style.display = "none";
        histBuildPeriodUI();
    }
}

function histBuildPeriodUI() {
    let container = document.getElementById("histListContainer");
    
    let sortedPeriods = Array.from(histDailyPeriodCache.keys()).sort((a,b) => a - b);
    
    sortedPeriods.forEach(pNum => {
        let pDataList = histDailyPeriodCache.get(pNum);
        
        let periodCard = document.createElement("div");
        periodCard.style.cssText = "background:white; border:1px solid var(--border-color); border-radius:12px; margin-bottom:15px; overflow:hidden;";
        
        // Header
        let headerBtn = document.createElement("button");
        headerBtn.style.cssText = "width:100%; padding:20px; background:transparent; border:none; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;";
        headerBtn.innerHTML = `<span style="font-weight:bold; font-size:16px;">Period ${pNum}</span> <i class="fas fa-chevron-down" style="color:var(--text-muted); transition:0.3s;"></i>`;
        
        // Body (Hidden initially)
        let bodyDiv = document.createElement("div");
        bodyDiv.style.cssText = "display:none; padding:15px; border-top:1px solid var(--border-color); background:var(--bg-surface);";
        
        // Spawn Subjects (Like NepHistorySubjectRow)
        pDataList.forEach(data => {
            let sName = data.subject || "Unknown Subject";
            let tName = data.markedByTeacherName || "Unknown";
            
            let subBtn = document.createElement("button");
            subBtn.style.cssText = "width:100%; background:white; border:1px solid var(--border-color); border-radius:8px; padding:15px; margin-bottom:10px; text-align:left; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.02); transition:0.2s;";
            subBtn.innerHTML = `<div style="font-weight:bold; font-size:15px; color:var(--text-dark); margin-bottom:5px;">${sName}</div>
                                <div style="font-size:12px; color:var(--text-muted);">Marked by: ${tName}</div>`;
                                
            subBtn.addEventListener("click", () => histOpenRecordViewer(data));
            bodyDiv.appendChild(subBtn);
        });

        // Toggle Logic (NepHistoryPeriodRow logic)
        headerBtn.addEventListener("click", () => {
            let isExpanded = bodyDiv.style.display === "block";
            bodyDiv.style.display = isExpanded ? "none" : "block";
            headerBtn.querySelector("i").style.transform = isExpanded ? "rotate(0deg)" : "rotate(180deg)";
        });

        periodCard.appendChild(headerBtn);
        periodCard.appendChild(bodyDiv);
        container.appendChild(periodCard);
    });
}

function histOpenRecordViewer(data) {
    // 🚨 Swap to Record Viewer Panel!
    document.getElementById("attHistoryScreen").style.display = "none";
    document.getElementById("attRecordScreen").style.display = "flex";
    
    let subjectName = data.subject || "Unknown Subject";
    let teacherName = data.markedByTeacherName || "Unknown";
    
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let prettyDate = `${histCurrentDate.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][histCurrentDate.getMonth()]} ${histCurrentDate.getFullYear()}`;
    
    document.getElementById("recordTitleText").innerHTML = `<b>${subjectName}</b><br><span style="font-size:12px; color:var(--text-muted); font-weight:normal;">${prettyDate} | Marked by: ${teacherName}</span>`;

    if (data.stats) {
        let tot = data.stats.totalStudents || "0";
        let pres = data.stats.presentCount || "0";
        let abs = data.stats.absentCount || "0";
        document.getElementById("recordStatsText").innerHTML = `Total: ${tot} | Present: <span style="color:#10b981;">${pres}</span> | Absent: <span style="color:var(--brand-red);">${abs}</span>`;
    }

    let container = document.getElementById("recordListContainer");
    container.innerHTML = "";

    if (data.attendance) {
        // Sort IDs to ensure neat layout
        let sortedIDs = Object.keys(data.attendance).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
        
        sortedIDs.forEach(key => {
            let isPresent = data.attendance[key];
            if (typeof isPresent === "boolean") {
                let sName = histStudentNameCache.get(key) || "Unknown Student";
                
                let row = document.createElement("div");
                row.style.cssText = "background:white; border:1px solid var(--border-color); border-radius:10px; margin-bottom:10px; padding:15px; display:flex; justify-content:space-between; align-items:center;";
                
                let statusBadge = isPresent 
                    ? `<div style="background:#d1fae5; color:#047857; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">P</div>`
                    : `<div style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">A</div>`;

                row.innerHTML = `<div style="font-size:14px; font-weight:600; color:var(--text-dark);">${sName} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${key})</span></div>
                                 ${statusBadge}`;
                
                container.appendChild(row);
            }
        });
    }
}

// ==========================================
// 🚨 TEACHER SUBJECT DECLARATION ENGINE
// ==========================================
let subjMasterList = new Map();
let subjActiveLinks = new Map();

let subjPendingDeleteCode = "";
let subjPendingDeleteItem = null;

let subjCachedTeacherID = "";
let subjIsFirstTimeCheckDone = false;
let subjIsFirstTimeSetupStatic = false;
let subjIsMasterLoaded = false;
let subjAllSubjectsCache = [];
let subjCachedMySubjectsBySem = new Map();

document.getElementById("subjSemDropdown")?.addEventListener("change", () => subjLoadMasterSubjects());
document.getElementById("subjMasterDropdown")?.addEventListener("change", subjOnDropdownSelected);
document.getElementById("subjSaveBtn")?.addEventListener("click", subjSaveNewSelections);
document.getElementById("subjConfirmNoBtn")?.addEventListener("click", subjCancelDelete);
document.getElementById("subjConfirmYesBtn")?.addEventListener("click", subjExecuteDelete);

async function initSubjectDeclarationEngine() {
    // 🚨 SECURITY WIPE: If a different teacher logs in, clear the RAM!
    if (currentUserID !== subjCachedTeacherID) {
        subjIsFirstTimeCheckDone = false;
        subjIsFirstTimeSetupStatic = false;
        subjIsMasterLoaded = false;
        subjAllSubjectsCache = [];
        subjCachedMySubjectsBySem.clear();
        subjCachedTeacherID = currentUserID;
    }

    // Because we awaited syncSemesterWithDatabase() in the profile UI, 
    // currentSemesterType is now guaranteed to be accurate here!
    subjSetupSemesterDropdown();
    subjUpdateNoSubjectsText();
    await subjCheckIfFirstTimeSetup();
}

function subjSetupSemesterDropdown() {
    let semDrop = document.getElementById("subjSemDropdown");
    semDrop.innerHTML = "";
    if(currentSemesterType === "Odd") {
        semDrop.innerHTML = `<option value="1">Semester 1</option><option value="3">Semester 3</option><option value="5">Semester 5</option><option value="7">Semester 7</option>`;
    } else {
        semDrop.innerHTML = `<option value="2">Semester 2</option><option value="4">Semester 4</option><option value="6">Semester 6</option><option value="8">Semester 8</option>`;
    }
}

async function subjCheckIfFirstTimeSetup() {
    // ZERO COST TRAP
    if (subjIsFirstTimeCheckDone) {
        if (subjIsFirstTimeSetupStatic) forceOpenSubjectPanel();
        subjLoadMasterSubjects();
        return;
    }

    try {
        let snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), 
            where("teacherID", "==", currentUserID), 
            where("isActive", "==", true), 
            limit(1)
        ));
        
        subjIsFirstTimeSetupStatic = snap.empty;
        subjIsFirstTimeCheckDone = true;

        if (subjIsFirstTimeSetupStatic) {
            forceOpenSubjectPanel();
        }
        subjLoadMasterSubjects();
    } catch(e) { console.error("First time setup check failed:", e); }
}

function forceOpenSubjectPanel() {
    // Force the router to open the Subjects view securely
    switchView(views.subjects, document.getElementById('btnNavSubjects'));
    showRcToast("Please declare your subjects to continue.");
}

async function subjLoadMasterSubjects() {
    let semDrop = document.getElementById("subjSemDropdown");
    let sem = semDrop.options[semDrop.selectedIndex].text.replace("Semester ", "").trim();
    let masterDrop = document.getElementById("subjMasterDropdown");
    masterDrop.innerHTML = "<option>Loading Subjects...</option>";

    if (subjIsMasterLoaded) {
        subjBuildDropdownForSemester(sem);
        return;
    }

    try {
        let snap = await getDocs(collection(db, "colleges", currentCollegeID, "subjects"));
        subjAllSubjectsCache = [];
        snap.forEach(doc => {
            let d = doc.data();
            let code = d.code || doc.id;
            let name = d.Name || d.name || "Unknown";
            let sems = d.semester !== undefined ? String(d.semester) : (d.Semester !== undefined ? String(d.Semester) : "");
            subjAllSubjectsCache.push({ code: code, name: name, semesters: sems });
        });

        subjIsMasterLoaded = true;
        subjBuildDropdownForSemester(sem);
    } catch(e) { console.error("Master subjects load failed:", e); }
}

function subjBuildDropdownForSemester(sem) {
    let freshSubjects = new Map();

    subjAllSubjectsCache.forEach(sub => {
        let match = false;
        let semArray = sub.semesters.split(',');
        semArray.forEach(s => { if (s.trim() === sem) match = true; });

        if (match && !freshSubjects.has(sub.code)) {
            freshSubjects.set(sub.code, sub.name);
        }
    });

    subjMasterList = freshSubjects;
    subjLoadMyExistingLinks(sem);
}

async function subjLoadMyExistingLinks(sem) {
    // 🚨 ZERO COST TRAP: If they already clicked this semester today, use RAM!
    if (subjCachedMySubjectsBySem.has(sem)) {
        subjRenderMyLinksFromCache(sem);
        return;
    }

    try {
        let snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"),
            where("teacherID", "==", currentUserID),
            where("semester", "==", sem),
            where("isActive", "==", true)
        ));

        let fetchedLinks = new Map();
        snap.forEach(doc => {
            fetchedLinks.set(doc.data().subjectCode, doc.id);
        });

        // Save to RAM for free switching!
        subjCachedMySubjectsBySem.set(sem, fetchedLinks);
        subjRenderMyLinksFromCache(sem);
    } catch(e) { console.error("Failed to load existing links:", e); }
}

function subjRenderMyLinksFromCache(sem) {
    subjActiveLinks.clear();
    document.getElementById("subjActiveItemsArea").innerHTML = "";

    let cachedMap = subjCachedMySubjectsBySem.get(sem);
    cachedMap.forEach((docId, code) => {
        subjActiveLinks.set(code, docId);
        let name = subjMasterList.has(code) ? subjMasterList.get(code) : "Unknown";
        subjSpawnSubjectHTML(code, name);
    });

    subjRefreshDropdown();
    subjUpdateNoSubjectsText();
}

function subjRefreshDropdown() {
    let masterDrop = document.getElementById("subjMasterDropdown");
    let optionsHTML = `<option value="NONE">Select Subject to Add...</option>`;

    subjMasterList.forEach((name, code) => {
        if (!subjActiveLinks.has(code)) {
            optionsHTML += `<option value="${code}">${name} (${code})</option>`;
        }
    });

    masterDrop.innerHTML = optionsHTML;
    masterDrop.value = "NONE";
}

function subjOnDropdownSelected(e) {
    let code = e.target.value;
    if (code === "NONE") return;

    let name = subjMasterList.get(code);
    subjActiveLinks.set(code, "PENDING");
    subjSpawnSubjectHTML(code, name);
    
    subjRefreshDropdown();
    subjUpdateNoSubjectsText();
}

function subjSpawnSubjectHTML(code, name) {
    let container = document.getElementById("subjActiveItemsArea");
    let isPending = subjActiveLinks.get(code) === "PENDING";
    let statusBadge = isPending ? `<span style="font-size:10px; background:#fef3c7; color:#d97706; padding:3px 8px; border-radius:8px; font-weight:bold; margin-left:10px;">UNSAVED</span>` : "";

    let div = document.createElement("div");
    div.id = `subjItem_${code}`;
    div.style.cssText = "background:white; border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 5px rgba(0,0,0,0.02);";
    
    div.innerHTML = `
        <div style="font-weight:600; font-size:14px; color:var(--text-dark); flex:1;">${name} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${code})</span>${statusBadge}</div>
        <button id="subjDelBtn_${code}" style="background:#fee2e2; border:none; color:var(--brand-red); width:35px; height:35px; border-radius:8px; cursor:pointer; transition:0.2s;"><i class="fas fa-trash-alt"></i></button>
    `;

    container.appendChild(div);
    document.getElementById(`subjDelBtn_${code}`).addEventListener("click", () => subjPromptDeleteSubject(code, div));
}

function subjUpdateNoSubjectsText() {
    let msgObj = document.getElementById("subjEmptyMessage");
    if(msgObj) msgObj.style.display = subjActiveLinks.size === 0 ? "block" : "none";
}

// ==========================================
// 🚨 DELETE & GARBAGE COLLECTION
// ==========================================
function subjPromptDeleteSubject(code, itemDiv) {
    subjPendingDeleteCode = code;
    subjPendingDeleteItem = itemDiv;

    // UX FIX: If PENDING (not saved yet), delete instantly!
    if (subjActiveLinks.get(code) === "PENDING") {
        subjExecuteDelete();
        return;
    }

    let name = subjMasterList.has(code) ? subjMasterList.get(code) : code;
    document.getElementById("subjConfirmDeleteText").innerHTML = `Are you sure you want to remove<br><b>${name}</b>?`;
    document.getElementById("subjConfirmDeleteModal").classList.add("active");
}

function subjCancelDelete() {
    subjPendingDeleteCode = "";
    subjPendingDeleteItem = null;
    document.getElementById("subjConfirmDeleteModal").classList.remove("active");
}

async function subjExecuteDelete() {
    if (!subjPendingDeleteCode) return;

    let stateOrDocID = subjActiveLinks.get(subjPendingDeleteCode);

    // 1. If it's real, delete from Firebase
    if (stateOrDocID !== "PENDING") {
        showRcToast("Removing subject...");
        try {
            // 🚨 THE FIX: Use the modular updateDoc function!
            let docRef = doc(db, "colleges", currentCollegeID, "faculty_subjects", stateOrDocID);
            await updateDoc(docRef, { isActive: false });
            
            showRcToast("Subject Removed!");
        } catch(e) {
            console.error("Failed to remove subject", e);
            showRcToast("Database Error. Try again.");
            subjCancelDelete();
            return;
        }
    }

    // 2. Remove locally
    subjActiveLinks.delete(subjPendingDeleteCode);

    // 🚨 RAM CACHE FIX
    let semDrop = document.getElementById("subjSemDropdown");
    let sem = semDrop.options[semDrop.selectedIndex].text.replace("Semester ", "").trim();
    if (subjCachedMySubjectsBySem.has(sem)) {
        subjCachedMySubjectsBySem.get(sem).delete(subjPendingDeleteCode);
    }

    if (subjPendingDeleteItem) {
        subjPendingDeleteItem.remove();
    }

    subjRefreshDropdown();
    subjUpdateNoSubjectsText();
    subjCancelDelete();
}

// 🚨 UX FIX: Instantly wipes unsaved subjects from the screen when closing panel
function subjPurgeUnsavedPending() {
    let hasPending = false;
    for (let [code, status] of subjActiveLinks.entries()) {
        if (status === "PENDING") {
            subjActiveLinks.delete(code);
            hasPending = true;
        }
    }

    if (hasPending) {
        let semDrop = document.getElementById("subjSemDropdown");
        if(semDrop && semDrop.options.length > 0) {
            let sem = semDrop.options[semDrop.selectedIndex].text.replace("Semester ", "").trim();
            subjRenderMyLinksFromCache(sem); // Automatically rebuilds UI clean
        }
    }
}

// ==========================================
// 🚨 SAVE ENGINE
// ==========================================
async function subjSaveNewSelections() {
    let semDrop = document.getElementById("subjSemDropdown");
    let sem = semDrop.options[semDrop.selectedIndex].text.replace("Semester ", "").trim();
    
    let batch = writeBatch(db);
    let changes = 0;

    subjActiveLinks.forEach((status, code) => {
        if (status === "PENDING") {
            let docID = `Link_${currentUserID}_${code}_S${sem}`;
            let docRef = doc(db, "colleges", currentCollegeID, "faculty_subjects", docID);
            
            batch.set(docRef, {
                teacherID: currentUserID,
                teacherName: currentTeacherName,
                subjectCode: code,
                subjectName: subjMasterList.get(code),
                semester: sem,
                isActive: true,
                timestamp: serverTimestamp()
            });
            changes++;
        }
    });

    if (changes === 0) {
        showRcToast("No new subjects to save.");
        return;
    }

    let saveBtn = document.getElementById("subjSaveBtn");
    saveBtn.innerText = "Saving...";
    saveBtn.style.pointerEvents = "none";

    try {
        await batch.commit();
        subjIsFirstTimeSetupStatic = false; // Turn off forced-open flag
        showRcToast("Subjects saved successfully!");
        
        // 🚨 RAM CACHE FIX: Wipe cache for this sem to force 1 fresh read
        subjCachedMySubjectsBySem.delete(sem);
        await subjLoadMyExistingLinks(sem); // Refresh to turn "PENDING" into real IDs

    } catch(e) {
        console.error("Save Subjects Error", e);
        showRcToast("Error saving subjects.");
    } finally {
        saveBtn.innerText = "Save Selections";
        saveBtn.style.pointerEvents = "auto";
    }
}

// ==========================================
// 🚨 ACADEMIC CALENDAR ENGINE (Principal Layout)
// ==========================================
let calDisplayDate = new Date();
let calTodayDate = new Date();
let calCachedAcademicYear = "";
let calIsInit = false;

// The Static Caches
let calCachedCollegeID = "";
let calVersionListenerUnsub = null;
let calCachedVersion = "";

let calWorkingDays = new Set();
let calNonWorkingDays = new Map();
let calSemStartDates = new Map();
let calSemEndDates = new Map();
let calAvailableYears = [];

let calPopupTimeout = null;

document.getElementById("calPrevMonthBtn")?.addEventListener("click", () => {
    calDisplayDate.setMonth(calDisplayDate.getMonth() - 1);
    calFetchDataForMonth();
});

document.getElementById("calNextMonthBtn")?.addEventListener("click", () => {
    calDisplayDate.setMonth(calDisplayDate.getMonth() + 1);
    calFetchDataForMonth();
});

async function initCalendarEngine() {
    if (calIsInit && calCachedCollegeID === currentCollegeID) return;
    
    calTodayDate = new Date();
    calDisplayDate = new Date();
    calCachedCollegeID = currentCollegeID;
    
    document.getElementById("calMonthYearText").innerText = "Loading...";
    
    calStartVersionListener();
    await calFetchAvailableYears();
    await calFetchDataForMonth();
    
    calIsInit = true;
}

function calStartVersionListener() {
    if (calVersionListenerUnsub) return;
    
    const versionRef = doc(db, "colleges", currentCollegeID, "system_flags", "calendar_version");
    
    // 🚨 BUG FIX: Added an error handler so if Teachers don't have permission to read this flag, it doesn't crash the app!
    calVersionListenerUnsub = onSnapshot(versionRef, (snapshot) => {
        if (snapshot.exists() && snapshot.data().updatedAt) {
            let latestVersion = snapshot.data().updatedAt.toString();
            if (calCachedVersion === "") {
                calCachedVersion = latestVersion;
            } else if (calCachedVersion !== latestVersion) {
                calCachedVersion = latestVersion;
                calWorkingDays.clear();
                calNonWorkingDays.clear();
                calSemStartDates.clear();
                calSemEndDates.clear();
                calAvailableYears = [];
                calCachedAcademicYear = "";
                if (document.getElementById("calendarView").classList.contains("active")) {
                    calFetchAvailableYears().then(calFetchDataForMonth);
                }
            }
        }
    }, (error) => {
        console.warn("Calendar Version tracker skipped (Permission Denied). Falling back to static cache.", error);
    });
}

async function calFetchAvailableYears() {
    try {
        let snap = await getDocs(collection(db, "colleges", currentCollegeID, "semesters"));
        calAvailableYears = [];
        snap.forEach(docSnap => {
            let parts = docSnap.id.split('-');
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                calAvailableYears.push({ startYear: parseInt(parts[0]), endYear: parseInt(parts[1]) });
            }
        });
        calAvailableYears.sort((a, b) => b.startYear - a.startYear);
    } catch(e) { console.error("Error fetching available years:", e); }
}

async function calFetchDataForMonth() {
    let targetYearStr = "";
    let dYear = calDisplayDate.getFullYear();
    let dMonth = calDisplayDate.getMonth() + 1; // 1-12

    for (let yr of calAvailableYears) {
        if (dYear === yr.startYear && dMonth >= 6) { targetYearStr = `${yr.startYear}-${yr.endYear}`; break; }
        if (dYear === yr.endYear && dMonth <= 5) { targetYearStr = `${yr.startYear}-${yr.endYear}`; break; }
    }

    if (!targetYearStr) {
        let fallbackStart = dMonth >= 6 ? dYear : dYear - 1;
        targetYearStr = `${fallbackStart}-${fallbackStart + 1}`;
    }

    // 🚨 BUG FIX: Fixed the typo!
    if (calCachedAcademicYear !== targetYearStr) {
        calCachedAcademicYear = targetYearStr; 
        await calFetchYearData(targetYearStr);
    }

    calGenerateGrid();
    calUpdateUpcomingEvent();
}

async function calFetchYearData(yearID) {
    calSemStartDates.clear();
    calSemEndDates.clear();
    calWorkingDays.clear();
    calNonWorkingDays.clear();

    try {
        const [semSnap, workSnap, holSnap] = await Promise.all([
            getDoc(doc(db, "colleges", currentCollegeID, "semesters", yearID)),
            getDoc(doc(db, "colleges", currentCollegeID, "workingDays", yearID)),
            getDoc(doc(db, "colleges", currentCollegeID, "nonWorkingDays", yearID))
        ]);

        if (semSnap.exists()) {
            let data = semSnap.data();
            let parseSem = (key, name) => {
                if (data[key]) {
                    if (data[key].startDate) calSemStartDates.set(name, data[key].startDate);
                    if (data[key].endDate) calSemEndDates.set(name, data[key].endDate);
                }
            };
            parseSem("oddSemester", "Odd");
            parseSem("evenSemester", "Even");
        }

        if (workSnap.exists()) {
            Object.keys(workSnap.data()).forEach(k => calWorkingDays.add(k));
        }

        if (holSnap.exists()) {
            let data = holSnap.data();
            Object.keys(data).forEach(k => calNonWorkingDays.set(k, String(data[k])));
        }
    } catch(e) { console.error("Error fetching year data:", e); }
}

function calGenerateGrid() {
    const grid = document.getElementById("calGridContainer");
    grid.innerHTML = "";

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById("calMonthYearText").innerText = `${monthNames[calDisplayDate.getMonth()]} ${calDisplayDate.getFullYear()}`;

    let y = calDisplayDate.getFullYear();
    let m = calDisplayDate.getMonth();
    
    let firstDayIndex = new Date(y, m, 1).getDay();
    let daysInMonth = new Date(y, m + 1, 0).getDate();
    let mStr = String(m + 1).padStart(2, '0');

    // Empty slots before 1st of month
    for (let i = 0; i < firstDayIndex; i++) {
        let emptyCell = document.createElement("div");
        grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        let dStr = String(day).padStart(2, '0');
        let dateKey = `${y}-${mStr}-${dStr}`;
        let dateObj = new Date(y, m, day);
        let dayOfWeek = dateObj.getDay();

        let isToday = (calTodayDate.getFullYear() === y && calTodayDate.getMonth() === m && calTodayDate.getDate() === day);

        let cell = document.createElement("button");
        // 🚨 STYLING UPDATE: Replaced aspect-ratio with 100% height to fit inside the parent grid without stretching!
        cell.style.cssText = `
            width: 100%; height: 100%; min-height: 0; border: none; border-radius: 12px; cursor: pointer;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-size: 15px; font-weight: 800; background: transparent; color: var(--text-dark);
            transition: 0.2s; padding: 0; box-sizing: border-box;
        `;

        let subText = "";
        let reasonToPopup = "";
        
        let bgColor = "transparent";
        let textColor = "#334155";

        let startSem = [...calSemStartDates].find(([k, v]) => v === dateKey)?.[0];
        let endSem = [...calSemEndDates].find(([k, v]) => v === dateKey)?.[0];

        if (startSem) {
            bgColor = "#eff6ff"; textColor = "#3b82f6"; subText = "Start"; reasonToPopup = `${startSem} Semester Starts`;
        } else if (endSem) {
            bgColor = "#eff6ff"; textColor = "#3b82f6"; subText = "End"; reasonToPopup = `${endSem} Semester Ends`;
        } else {
            if (calWorkingDays.has(dateKey)) {
                bgColor = "transparent"; textColor = "#334155";
            } else if (calNonWorkingDays.has(dateKey)) {
                bgColor = "#fef2f2"; textColor = "#ef4444"; reasonToPopup = calNonWorkingDays.get(dateKey);
            } else if (dayOfWeek === 0 || dayOfWeek === 6) {
                bgColor = "#fef2f2"; textColor = "#ef4444";
            }
        }

        if (isToday) {
            bgColor = "#22c55e"; // Bright Green from your image
            textColor = "white";
            cell.style.boxShadow = "0 4px 10px rgba(34, 197, 94, 0.4)";
        }

        cell.style.background = bgColor;
        cell.style.color = textColor;

        cell.innerHTML = `<span>${day}</span>`;
        if (subText) {
            cell.innerHTML += `<span style="font-size:9px; font-weight:bold; margin-top:2px;">${subText}</span>`;
        }

        if (reasonToPopup) {
            cell.addEventListener("click", () => calShowPopup(reasonToPopup));
        }

        grid.appendChild(cell);
    }
}

function calUpdateUpcomingEvent() {
    let checkDate = new Date();
    let foundReason = "";
    let foundDateStr = "";
    let found = false;

    for (let i = 0; i < 60; i++) {
        let futureDate = new Date(checkDate);
        futureDate.setDate(checkDate.getDate() + i);
        
        let y = futureDate.getFullYear();
        let m = String(futureDate.getMonth() + 1).padStart(2, '0');
        let d = String(futureDate.getDate()).padStart(2, '0');
        let dateKey = `${y}-${m}-${d}`;
        let dayOfWeek = futureDate.getDay();

        if (calNonWorkingDays.has(dateKey)) {
            foundReason = calNonWorkingDays.get(dateKey);
            if (foundReason === "Holiday/Weekend") foundReason = "Holiday";
            foundDateStr = `${futureDate.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][futureDate.getMonth()]}`;
            found = true;
            break;
        }

        if ((dayOfWeek === 0 || dayOfWeek === 6) && !calWorkingDays.has(dateKey)) {
            foundReason = "Weekend";
            foundDateStr = `${futureDate.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][futureDate.getMonth()]}`;
            found = true;
            break;
        }
    }

    let banner = document.getElementById("calUpcomingEventBanner");
    if (found) {
        banner.innerHTML = `Upcoming: ${foundDateStr} - ${foundReason}`;
    } else {
        banner.innerHTML = `No upcoming holidays`;
    }
}

function calShowPopup(reason) {
    let popup = document.getElementById("calHolidayPopup");
    document.getElementById("calHolidayReasonText").innerText = reason;
    
    popup.style.bottom = "120px";
    popup.style.opacity = "1";
    
    if (calPopupTimeout) clearTimeout(calPopupTimeout);
    calPopupTimeout = setTimeout(() => {
        popup.style.bottom = "80px";
        popup.style.opacity = "0";
    }, 2000);
}

// ==========================================
// 🚨 ASSIGNMENTS ENGINE
// ==========================================
let asnCachedTeacherID = "";
let asnListenerUnsub = null;
let asnCachedData = [];
let asnIsInit = false;

async function initAssignmentsEngine() {
    // 🚨 SECURITY WIPE: If a different teacher logs in, clear the RAM!
    if (currentUserID !== asnCachedTeacherID) {
        if (asnListenerUnsub) { asnListenerUnsub(); asnListenerUnsub = null; }
        asnCachedData = [];
        asnIsInit = false;
        asnCachedTeacherID = currentUserID;
    }

    if (asnIsInit) {
        // Zero Cost Trap: Already listening in the background
        if (document.getElementById("assignmentsView").classList.contains("active")) {
            asnRenderList(asnCachedData);
        }
        return;
    }

    let emptyMsg = document.getElementById("asnEmptyMessage");
    if (emptyMsg) {
        emptyMsg.innerText = "Loading Assignments...";
        emptyMsg.style.display = "block";
    }
    document.getElementById("asnItemsArea").innerHTML = "";

    document.getElementById("btnPostAssignment").onclick = executeCreateAssignment;

    try {
        const q = query(
            collection(db, "colleges", currentCollegeID, "assignments"),
            where("teacherID", "==", currentUserID),
            orderBy("createdAt", "desc"),
            limit(50)
        );

        asnListenerUnsub = onSnapshot(q, (snapshot) => {
            asnCachedData = [];
            snapshot.forEach(doc => {
                let d = doc.data();
                d.id = doc.id;
                asnCachedData.push(d);
            });
            
            asnIsInit = true;

            // Only redraw the UI if the panel is actively on the screen
            if (document.getElementById("assignmentsView").classList.contains("active")) {
                asnRenderList(asnCachedData);
            }
        }, (error) => {
            console.error("Error fetching assignments:", error);
            if (emptyMsg) emptyMsg.innerText = "Error loading assignments.";
        });
    } catch(e) { console.error("Failed to start assignment listener", e); }
}

function asnRenderList(dataList) {
    let listArea = document.getElementById("asnItemsArea");
    let emptyMsg = document.getElementById("asnEmptyMessage");

    if (dataList.length === 0) {
        emptyMsg.innerText = "No assignments found.";
        emptyMsg.style.display = "block";
        listArea.innerHTML = "";
        return;
    }

    emptyMsg.style.display = "none";
    let html = "";
    let now = new Date();

    dataList.forEach(d => {
        let topic = d.topic || "Unknown Topic";
        let subject = d.subject || "Unknown Subject";
        let semester = d.semester || "";
        let desc = d.description || "";
        let dateStr = d.dueDate || d.dueDateISO || "";

        let dateColor = "var(--text-dark)";
        let dateSuffix = "";

        // 🚨 Exact C# Logic translation for Expiry & Urgency
        if (d.dueDateISO) {
            let parsedDate = new Date(d.dueDateISO);
            if (!isNaN(parsedDate.getTime())) {
                // Set to exactly 23:59:59 of that day
                parsedDate.setHours(23, 59, 59, 999);
                
                let timeDiff = parsedDate.getTime() - now.getTime();
                let daysDiff = timeDiff / (1000 * 3600 * 24);

                if (timeDiff < 0) {
                    // 🔴 EXPIRED
                    dateColor = "#ef4444"; // Red
                    dateSuffix = " (Closed)";
                } else if (daysDiff <= 2) {
                    // 🟡 URGENT
                    dateColor = "#d97706"; // Amber
                }
            }
        }

        html += `
            <div style="background: white; border: 1px solid var(--border-color); border-radius: 16px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); transition: 0.2s;">
                <div style="font-size: 18px; font-weight: 800; color: var(--text-dark); margin-bottom: 4px;">${topic}</div>
                <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 15px; letter-spacing: 0.5px;">${subject} | ${semester}</div>
                <div style="font-size: 14px; color: var(--text-dark); line-height: 1.6; margin-bottom: 20px; white-space: pre-wrap;">${desc}</div>
                <div style="text-align: right; font-size: 13px; font-weight: bold; color: ${dateColor};">Due: ${dateStr}${dateSuffix}</div>
            </div>
        `;
    });

    listArea.innerHTML = html;
}

// ==========================================
// 🚨 STUDENT LIST & DASHBOARD ENGINE
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
    
    // 🚀 RAM SCROLL: Slice the array based on the current limit
    let renderBatch = filtered.slice(0, studentRenderLimit);
    
    // 🚨 EXACT PRINCIPAL SCRIPT TRICK: Remember scroll position before rebuilding DOM
    let oldScroll = listEl.scrollTop;

    listEl.innerHTML = renderBatch.map(s => {
        let cleanDept = (s.Department || "Unknown").replace("DEPT_", ""); 
        let status = s.status || "Approved";
        
        let statusLabel = status === "Approved" ? "Active" : status;
        let statusColor = status === "Approved" ? "var(--brand-red)" : "var(--text-muted)";
        
        let tokensArr = []; 
        if (s.fcmTokens) tokensArr = s.fcmTokens; 
        else if (s.fcmToken) tokensArr = [s.fcmToken];
        let tokensJson = JSON.stringify(tokensArr).replace(/"/g, '&quot;');
        
        // 🚨 THE FIX: Restored explicit background, margins, padding, and shadows to create floating cards!
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; background:var(--bg-base); border-left: 6px solid ${statusColor}; border-radius: 14px; margin-bottom: 12px; cursor:pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.03); transition: transform 0.2s;" onclick="window.SL_OpenDashboard('${s.id}')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="flex:1;">
                <div style="margin-bottom:4px;">
                    <span style="font-weight:800; font-size:15px; color:var(--text-dark);">${s.Name || "Unknown"}</span> 
                    <span style="font-size:12px; color:var(--text-muted); margin-left:4px;">(${s.RollNumber || "N/A"})</span>
                </div>
                <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:4px;">${cleanDept} - Year ${s.Year || "1"}</div>
            </div>
            <div style="display:flex; gap:15px; align-items:center;">
                <span style="font-size:12px; font-weight:800; color:${statusColor};">${statusLabel}</span>
                <button title="Message" onclick="event.stopPropagation(); window.OpenCompose(true, '${s.Name || ""}', ${tokensJson}, '${s.id}')" ...>
                    <i class="fas fa-comment-dots"></i>
                </button>
            </div>
        </div>`;
    }).join('');
    
    listEl.appendChild(noData); 
    
    // Restore scroll instantly so it doesn't snap to top
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
    // If user scrolls within 100px of the bottom
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 100) {
        let searchTerm = document.getElementById("slSearchInput").value.trim();
        let totalCurrentMatches = cachedStudents.length; // Simplified length check
        
        // If we haven't rendered all the students yet, increase limit by 50 and render
        if (studentRenderLimit < totalCurrentMatches) {
            studentRenderLimit += 50;
            renderStudentList(searchTerm);
        }
    }
});


// ==========================================
// STUDENT DASHBOARD DETAILS
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
    switchView(views.studentDashboard, document.getElementById('btnNavStudentList'));
    
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
            
            // Uses global currentSemesterType from teacherApp.js
            let currentSemNum = (currentSemesterType === "Odd") ? (studentYear * 2) - 1 : (studentYear * 2);
            
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
        finalSubjects.push(`<div style="padding:10px 0; border-bottom:1px dashed var(--border-color); display:flex; align-items:center; gap:8px;"><b style="color:var(--brand-red); font-size:12px;">[${k}]</b> <span style="font-size:13px; color:var(--text-dark);">${v}</span></div>`);
    });

    sdCachedGlobalSubjects.forEach(sub => {
        let semMatch = sub.semesterArray.split(',').map(s=>s.trim()).includes(cleanSemNum);
        if (semMatch) {
            let isDeptMatch = (sub.cleanSubDept === cleanStuDept) || (cleanStuDept.includes(sub.cleanSubDept) && sub.cleanSubDept.length > 3) || (sub.cleanSubDept.includes(cleanStuDept) && cleanStuDept.length > 3);
            if ((sub.cleanType.includes("MJD") || sub.cleanType.includes("CORE") || sub.cleanType.includes("TUTORIAL")) && isDeptMatch) {
                let isAlreadyEnrolled = finalSubjects.some(existing => existing.includes(sub.displayName));
                if (!isAlreadyEnrolled) {
                    finalSubjects.unshift(`<div style="padding:10px 0; border-bottom:1px dashed var(--border-color); display:flex; align-items:center; gap:8px;"><b style="color:var(--brand-red); font-size:12px;">[${sub.rawType}]</b> <span style="font-size:13px; color:var(--text-dark);">${sub.displayName}</span></div>`);
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
            let p = data.p, t = data.t, per = t>0 ? (p/t)*100 : 0; let col = per >= 75 ? "#10b981" : (per >= 60 ? "#f59e0b" : "var(--brand-red)");
            return `<div style="background:white; border:1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span style="font-weight:bold; font-size:13px; color:var(--text-dark);">${name}</span> <span style="font-size:12px; font-weight:bold; color:${col};">${per.toFixed(0)}% (${p}/${t})</span></div>
                <div style="background:var(--bg-surface); height:6px; border-radius:3px; overflow:hidden;"><div style="height:100%; background:${col}; width:${per}%;"></div></div>
            </div>`;
        }).join('');
    } else {
        SD_FetchDailyAttendance(specificDate, semDisplay);
    }
}

function SD_UpdateWaveUI(percentage) {
    let col = percentage >= 75 ? "#10b981" : (percentage >= 60 ? "#f59e0b" : "var(--brand-red)");
    let txt = percentage.toFixed(2) + "%";
    let visualPercent = 10 + (percentage * 0.75); 

    let circleFill = document.getElementById("sdCircleWave");
    circleFill.style.setProperty('--wave-color', col);
    circleFill.style.top = `${105 - visualPercent}%`; 
    
    document.getElementById("sdCircleText").innerHTML = `<span style="font-size: 11px; display: block; line-height: 1; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Projected</span><span id="sdCirclePercentVal" style="font-size: 26px;">${txt}</span>`;

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
                        let subName = pData.subject || "Unknown Subject"; let col = isPres ? "#10b981" : "var(--brand-red)";
                        html += `<div style="background:white; border:1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span style="font-weight:bold; font-size:13px; color:var(--text-dark);">${subName}</span> <span style="font-size:12px; font-weight:bold; color:white; background:${col}; padding:3px 8px; border-radius:6px;">${isPres ? 'Present' : 'Absent'}</span></div>`;
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
        let barHtml = m.max ? `<div style="background:var(--bg-surface); height:6px; border-radius:3px; overflow:hidden;"><div style="height:100%; background:var(--brand-red); width:${ratio*100}%;"></div></div>` : "";
        return `<div style="background:white; border:1px solid var(--border-color); border-radius:10px; padding:12px;"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span style="font-weight:bold; font-size:13px; color:var(--text-dark);">${m.sub}</span><span style="font-size:13px; font-weight:bold; color:var(--text-dark);">${m.obt}/${maxText} <span style="font-size:10px; color:var(--text-muted);">${per}</span></span></div>${barHtml}</div>`;
    }).join('');
}

// ==========================================
// 🚨 SUBJECT ASSIGNMENT ENGINE
// ==========================================
let saLoaded = false;
let saCurrentSem = "1";
let saCachedSubjects = [];
let saCachedStudents = [];
let saSelectedUnassigned = new Set();
let saSelectedAssigned = new Set();
let saTargetRemoveGroup = ""; // Tracks which group we are trying to remove from

function initSubjectAssignEngine() {
    if (saLoaded) return;
    saLoaded = true;

    // 1. Setup Semester Dropdown
    let dropSem = document.getElementById("saSemDrop"); 
    let optionsHtml = "";
    let activeValue = "";
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((currentSemesterType === "Odd" && isOdd) || (currentSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); 
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    saCurrentSem = activeValue;
    dropSem.value = saCurrentSem;
    
    dropSem.addEventListener("change", (e) => { saCurrentSem = e.target.value; saRefreshCategories(); });
    document.getElementById("saCatDrop").addEventListener("change", saRefreshSubjects);
    document.getElementById("saSubDrop").addEventListener("change", () => saUpdateActionButton());
    document.getElementById("btnSaAction").addEventListener("click", saOpenConfirmModal);
    document.getElementById("saConfirmYesBtn").addEventListener("click", saExecuteAction);

    // 2. Fetch Master Subjects
    if (saCachedSubjects.length === 0) {
        getDocs(collection(db, "colleges", currentCollegeID, "subjects")).then(snap => {
            snap.forEach(doc => {
                let d = doc.data();
                saCachedSubjects.push({ 
                    id: doc.id, name: d.Name || d.name || "", 
                    type: d.Type || d.type || "", semesters: (d.Semester || d.semester || "1").toString() 
                });
            });
            saRefreshCategories();
        }).catch(e => console.error(e));
    } else { saRefreshCategories(); }
}

function saRefreshCategories() {
    let types = new Set();
    saCachedSubjects.forEach(sub => { 
        let sems = sub.semesters.split(',').map(s=>s.trim()); 
        // 🚨 Filter out MJD and TUTORIAL just like C# script!
        if (sems.includes(saCurrentSem) && sub.type && !sub.type.toUpperCase().startsWith("MJD") && !sub.type.toUpperCase().includes("TUTORIAL")) {
            types.add(sub.type.trim()); 
        }
    });
    
    let catDrop = document.getElementById("saCatDrop");
    if (types.size === 0) catDrop.innerHTML = `<option value="">No Categories</option>`;
    else {
        let arr = Array.from(types).sort(); 
        catDrop.innerHTML = `<option value="">Select Category</option>` + arr.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    saRefreshSubjects();
}

function saRefreshSubjects() {
    let cat = document.getElementById("saCatDrop").value; 
    let subDrop = document.getElementById("saSubDrop");
    
    if (!cat) { 
        subDrop.innerHTML = `<option value="">Select Subject</option>`; 
        saShowEmpty("Select a Category to view students."); 
        return; 
    }
    
    let subs = saCachedSubjects.filter(s => s.semesters.split(',').map(x=>x.trim()).includes(saCurrentSem) && s.type.trim() === cat);
    if (subs.length === 0) { 
        subDrop.innerHTML = `<option value="">No Subjects</option>`; 
    } else { 
        subDrop.innerHTML = `<option value="">Select Subject</option>` + subs.sort((a,b)=>a.name.localeCompare(b.name)).map(s => `<option value="${s.name}">${s.name}</option>`).join(''); 
    }
    
    saLoadStudents();
}

function saShowEmpty(msg) { 
    document.getElementById("saGroupsContainer").innerHTML = "";
    document.getElementById("saUnassignedContainer").innerHTML = "";
    document.getElementById("saUnassignedHeader").style.display = "none";
    document.getElementById("saEmptyMsg").innerText = msg;
    document.getElementById("saEmptyMsg").style.display = "block";
    saSelectedUnassigned.clear();
    saSelectedAssigned.clear();
    saUpdateActionButton();
}

async function saLoadStudents() {
    let cat = document.getElementById("saCatDrop").value;
    if (!cat) return;
    saShowEmpty(`Loading students...`);

    let targetYear = Math.ceil(parseInt(saCurrentSem) / 2).toString();
    
    try {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", targetYear)));
        saCachedStudents = [];
        
        snap.forEach(doc => {
            let d = doc.data();
            
            // 🚨 THE FIX: Strictly filter by the Teacher's Department!
            let rawDept = d.Department || d.department || "";
            let formattedDept = "DEPT_" + String(rawDept).replace(/ /g, "");
            
            // If the student's department matches the teacher's department, add them!
            if (formattedDept === teacherDeptRaw || rawDept === teacherDeptRaw) {
                saCachedStudents.push({ id: doc.id, ...d });
            }
        });

        if (saCachedStudents.length === 0) {
            saShowEmpty("No students found in your department for this year.");
            return;
        }

        saRenderLayout(cat);
    } catch (e) {
        saShowEmpty("Error loading students.");
        console.error(e);
    }
}

function saRenderLayout(cat) {
    document.getElementById("saEmptyMsg").style.display = "none";
    saSelectedUnassigned.clear();
    saSelectedAssigned.clear();
    
    let groupedData = {}; // Tracks Assigned Groups
    let unassignedHTML = "";
    let semKey = `Semester_${saCurrentSem}`;
    let semSpace = `Semester ${saCurrentSem}`;

    // 1. Sort students alphabetically by name
    saCachedStudents.sort((a,b) => (a.Name || "").localeCompare(b.Name || ""));

    saCachedStudents.forEach(s => {
        let isEnrolledInCat = false;
        let enrolledSubject = "";
        let enrolledMap = s.enrolledSubjects ? (s.enrolledSubjects[semKey] || s.enrolledSubjects[semSpace] || s.enrolledSubjects[saCurrentSem]) : null;

        if (enrolledMap && enrolledMap[cat]) {
            isEnrolledInCat = true;
            enrolledSubject = enrolledMap[cat];
        }

        let isEditable = false;
        if (isEnrolledInCat) {
            let assignedByMap = s.assigned_by ? (s.assigned_by[semKey] || s.assigned_by[semSpace] || s.assigned_by[saCurrentSem]) : null;
            let timeMap = s.assignment_timestamps ? (s.assignment_timestamps[semKey] || s.assignment_timestamps[semSpace] || s.assignment_timestamps[saCurrentSem]) : null;
            
            // 🚨 1. PRINCIPAL OVERRIDE LOCK
            if (assignedByMap && assignedByMap[cat] === "Principal") {
                isEditable = false;
            } 
            else {
                // 🚨 2. STRICT 24-HOUR RULE
                if (!timeMap || !timeMap[cat]) {
                    isEditable = true; // Legacy pass
                } else {
                    let assignedTime = timeMap[cat].toDate();
                    let hoursPassed = (new Date() - assignedTime) / (1000 * 60 * 60);
                    if (hoursPassed < 24) isEditable = true;
                }
            }
        }

        // Build the HTML Card
        let cleanDept = (s.Department || "Unknown").replace("DEPT_", "");
        let cardId = `sa_card_${s.id}`;
        let chkId = `sa_chk_${s.id}`;
        
        let cardHTML = ``;
        
        if (isEnrolledInCat && !isEditable) {
            // LOCKED CARD
            cardHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; background:var(--bg-surface); border:1px solid #cbd5e1; border-radius:12px; margin-bottom:8px; opacity:0.6; cursor:not-allowed;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-lock" style="color:#94a3b8; width:18px; text-align:center;"></i>
                    <div>
                        <div style="font-size:14px; font-weight:bold; color:var(--text-dark);">${s.Name || "Unknown"} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${s.RollNumber || "N/A"})</span></div>
                        <div style="font-size:11px; color:var(--text-muted);">${cleanDept}</div>
                    </div>
                </div>
            </div>`;
        } else {
            // UNLOCKED CARD (Clickable)
            let clickGroup = isEnrolledInCat ? `'${enrolledSubject}'` : `null`;
            cardHTML = `
            <div id="${cardId}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; background:white; border:1px solid var(--border-color); border-radius:12px; margin-bottom:8px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.02); transition:0.2s;" onclick="saToggleStudent('${s.id}', ${isEnrolledInCat}, ${clickGroup})">
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" id="${chkId}" style="width:16px; height:16px; accent-color:var(--brand-red); pointer-events:none;">
                    <div>
                        <div style="font-size:14px; font-weight:bold; color:var(--text-dark);">${s.Name || "Unknown"} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${s.RollNumber || "N/A"})</span></div>
                        <div style="font-size:11px; color:var(--text-muted);">${cleanDept}</div>
                    </div>
                </div>
            </div>`;
        }

        if (isEnrolledInCat) {
            if (!groupedData[enrolledSubject]) groupedData[enrolledSubject] = [];
            groupedData[enrolledSubject].push(cardHTML);
        } else {
            unassignedHTML += cardHTML;
        }
    });

    // Render Assigned Groups (Accordions)
    let groupHTML = "";
    Object.keys(groupedData).sort().forEach((subName, idx) => {
        let count = groupedData[subName].length;
        let bodyId = `sa_group_body_${idx}`;
        let iconId = `sa_group_icon_${idx}`;
        
        groupHTML += `
        <div style="background:white; border:1px solid var(--border-color); border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
            <div style="background:var(--bg-grid-color); padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="document.getElementById('${bodyId}').style.display = document.getElementById('${bodyId}').style.display === 'none' ? 'block' : 'none'; document.getElementById('${iconId}').style.transform = document.getElementById('${bodyId}').style.display === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';">
                <div style="font-weight:bold; color:var(--brand-red); font-size:14px;">${cat} : ${subName} <span style="font-size:12px; font-weight:normal; background:white; padding:2px 8px; border-radius:10px; margin-left:10px; color:var(--brand-red); border: 1px solid var(--border-color);">${count}</span></div>
                <i id="${iconId}" class="fas fa-chevron-right" style="color:var(--text-muted); transition:0.2s; transform:rotate(90deg);"></i>
            </div>
            <div id="${bodyId}" style="padding:10px 10px 2px 10px; display:block;">
                ${groupedData[subName].join('')}
            </div>
        </div>`;
    });

    document.getElementById("saGroupsContainer").innerHTML = groupHTML;

    // Render Unassigned
    let uHead = document.getElementById("saUnassignedHeader");
    let uCont = document.getElementById("saUnassignedContainer");
    if (unassignedHTML) {
        uHead.style.display = "block";
        uCont.innerHTML = unassignedHTML;
    } else {
        uHead.style.display = "none";
        uCont.innerHTML = "";
    }

    saUpdateActionButton();
}

window.saToggleStudent = (sid, isAssigned, groupName) => {
    let chk = document.getElementById(`sa_chk_${sid}`);
    let card = document.getElementById(`sa_card_${sid}`);
    
    chk.checked = !chk.checked; 

    if (chk.checked) {
        card.style.backgroundColor = "rgba(220, 38, 38, 0.05)"; // Red tint
        if (isAssigned) {
            saSelectedAssigned.add(sid);
            saTargetRemoveGroup = groupName; // Track which group we are removing from
        } else {
            saSelectedUnassigned.add(sid);
        }
    } else {
        card.style.backgroundColor = "white";
        if (isAssigned) saSelectedAssigned.delete(sid);
        else saSelectedUnassigned.delete(sid);
    }

    saUpdateActionButton();
};

function saUpdateActionButton() {
    let btn = document.getElementById("btnSaAction");
    let unassignedCount = saSelectedUnassigned.size;
    let assignedCount = saSelectedAssigned.size;

    if (unassignedCount > 0 && assignedCount == 0) {
        btn.innerText = "Assign";
        btn.disabled = false;
        btn.style.opacity = "1";
    } 
    else if (assignedCount > 0 && unassignedCount == 0) {
        btn.innerText = "Remove";
        btn.disabled = false;
        btn.style.opacity = "1";
    } 
    else if (unassignedCount > 0 && assignedCount > 0) {
        btn.innerText = "Conflict";
        btn.disabled = true;
        btn.style.opacity = "0.5";
    } 
    else {
        btn.innerText = "Assign";
        btn.disabled = true;
        btn.style.opacity = "0.5";
    }
}

function saOpenConfirmModal() {
    let unassignedCount = saSelectedUnassigned.size;
    let assignedCount = saSelectedAssigned.size;
    let txt = document.getElementById("saConfirmText");
    let btnYes = document.getElementById("saConfirmYesBtn");

    if (unassignedCount > 0) {
        let sub = document.getElementById("saSubDrop").value;
        if (!sub) { showRcToast("Select Subject First!"); return; }
        
        saIsRemoveMode = false;
        txt.innerHTML = `Assign ${unassignedCount} students to<br><b>${sub}</b>?`;
        btnYes.innerText = "Assign";
    } 
    else if (assignedCount > 0) {
        saIsRemoveMode = true;
        txt.innerHTML = `<span style="color:var(--brand-red);">Remove</span> ${assignedCount} students from<br><b>${saTargetRemoveGroup}</b>?`;
        btnYes.innerText = "Remove";
    }
    
    document.getElementById("saConfirmModal").classList.add("active");
}

let saIsRemoveMode = false;

async function saExecuteAction() {
    document.getElementById("saConfirmModal").classList.remove("active");
    let btn = document.getElementById("btnSaAction");
    btn.innerText = "Saving..."; btn.disabled = true;

    let cat = document.getElementById("saCatDrop").value;
    let sub = document.getElementById("saSubDrop").value;
    let semKey = `Semester_${saCurrentSem}`;

    let studentsToProcess = saIsRemoveMode ? Array.from(saSelectedAssigned) : Array.from(saSelectedUnassigned);
    let wb = writeBatch(db);
    let ops = 0;

    for (let i = 0; i < studentsToProcess.length; i++) {
        let sid = studentsToProcess[i];
        let stuRef = doc(db, "colleges", currentCollegeID, "students", sid);
        let updates = {};

        if (saIsRemoveMode) {
            updates[`enrolledSubjects.${semKey}.${cat}`] = deleteField();
            updates[`assignment_timestamps.${semKey}.${cat}`] = deleteField();
            updates[`assigned_by.${semKey}.${cat}`] = deleteField();
        } else {
            updates[`enrolledSubjects.${semKey}.${cat}`] = sub;
            updates[`assignment_timestamps.${semKey}.${cat}`] = serverTimestamp();
            updates[`assigned_by.${semKey}.${cat}`] = "HOD";
        }

        wb.update(stuRef, updates);
        ops++;

        if (ops >= 450) {
            await wb.commit();
            wb = writeBatch(db); ops = 0;
        }
    }

    if (ops > 0) await wb.commit();

    showRcToast(saIsRemoveMode ? `Removed ${studentsToProcess.length} students!` : `Assigned ${studentsToProcess.length} students!`);
    
    // Refresh the UI!
    saLoadStudents();
}

// ==========================================
// 🚨 HOD BATCH VIEWER ENGINE
// ==========================================
let bchLoaded = false;
let bchCurrentSem = "1";
let bchTeacherSubjects = [];
let bchStudentCache = {}; // Cache to prevent re-fetching student profiles

function initBatchEngine() {
    if (bchLoaded) return;
    bchLoaded = true;

    let warning = document.getElementById("bchHodWarning");
    let controls = document.getElementById("bchControls");
    
    // 🚨 HOD SECURITY CHECK
    if (!isHOD) {
        warning.style.display = "block";
        controls.style.pointerEvents = "none";
        controls.style.opacity = "0.5";
        bchShowEmpty("You do not have HOD privileges to view batches.");
        return;
    } else {
        warning.style.display = "none";
        controls.style.pointerEvents = "auto";
        controls.style.opacity = "1";
    }

    // 1. Setup Semester Dropdown dynamically based on Odd/Even cycle
    let dropSem = document.getElementById("bchSemDrop"); 
    let optionsHtml = "";
    let activeValue = "";
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((currentSemesterType === "Odd" && isOdd) || (currentSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); 
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    bchCurrentSem = activeValue;
    dropSem.value = bchCurrentSem;
    
    dropSem.addEventListener("change", (e) => { bchCurrentSem = e.target.value; bchFilterSubjects(); });
    document.getElementById("bchSubDrop").addEventListener("change", bchOnSubjectSelected);

    bchFetchTeacherSubjects();
}

async function bchFetchTeacherSubjects() {
    let subDrop = document.getElementById("bchSubDrop");
    subDrop.innerHTML = `<option value="">Loading...</option>`;
    
    try {
        // Fetch subjects assigned ONLY to this specific teacher
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), where("teacherID", "==", currentUserID)));
        bchTeacherSubjects = [];
        
        snap.forEach(doc => {
            let d = doc.data();
            if (d.subjectName) {
                let cat = "MJD"; // Fallback
                if (d.subjectCategory) cat = d.subjectCategory;
                else if (d.category) cat = d.category;
                else if (d.subjectCode) {
                    if (d.subjectCode.startsWith("AEC")) cat = "AECC";
                    else if (d.subjectCode.startsWith("VAC")) cat = "VAC";
                    else if (d.subjectCode.startsWith("SEC")) cat = "SEC";
                }
                
                let sems = d.semester !== undefined ? d.semester.toString() : "1";
                bchTeacherSubjects.push({ name: d.subjectName, type: cat, semesters: sems });
            }
        });
        
        bchFilterSubjects();
    } catch(e) {
        subDrop.innerHTML = `<option value="">Error Loading</option>`;
        console.error(e);
    }
}

function bchFilterSubjects() {
    let subDrop = document.getElementById("bchSubDrop");
    let validSubs = bchTeacherSubjects.filter(s => s.semesters.split(',').map(x=>x.trim()).includes(bchCurrentSem));
    
    // Remove duplicates by name in case of overlapping configurations
    let uniqueNames = new Set();
    let filteredSubs = [];
    validSubs.forEach(s => {
        if (!uniqueNames.has(s.name)) {
            uniqueNames.add(s.name);
            filteredSubs.push(s);
        }
    });

    if (filteredSubs.length === 0) {
        subDrop.innerHTML = `<option value="">No Subjects Found</option>`;
        bchShowEmpty("You have no subjects assigned for this semester.");
        document.getElementById("bchCategoryText").innerText = "Category: --";
    } else {
        subDrop.innerHTML = `<option value="">Select Subject</option>` + filteredSubs.sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.name}" data-cat="${s.type}">${s.name}</option>`).join('');
        bchShowEmpty("Select a subject from the dropdown to view its batches.");
        document.getElementById("bchCategoryText").innerText = "Category: --";
    }
}

function bchOnSubjectSelected() {
    let subDrop = document.getElementById("bchSubDrop");
    let subjectName = subDrop.value;
    let catText = document.getElementById("bchCategoryText");
    
    if (!subjectName) {
        catText.innerText = "Category: --";
        bchShowEmpty("Select a subject from the dropdown to view its batches.");
        return;
    }

    let selectedOption = subDrop.options[subDrop.selectedIndex];
    catText.innerText = `Category: ${selectedOption.getAttribute("data-cat")}`;
    
    bchFetchBatches(subjectName);
}

function bchShowEmpty(msg) {
    document.getElementById("bchGroupsContainer").innerHTML = "";
    let emptyMsg = document.getElementById("bchEmptyMsg");
    emptyMsg.innerText = msg;
    emptyMsg.style.display = "block";
}

async function bchFetchBatches(subjectName) {
    bchShowEmpty(`Loading batches for ${subjectName}...`);
    
    try {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", bchCurrentSem), where("subjectName", "==", subjectName)));
        if (snap.empty) {
            bchShowEmpty(`No batches found for ${subjectName}.\n(This is a common class)`);
            return;
        }
        
        document.getElementById("bchEmptyMsg").style.display = "none";
        let container = document.getElementById("bchGroupsContainer");
        
        let batches = [];
        snap.forEach(doc => batches.push({ id: doc.id, ...doc.data() }));
        batches.sort((a, b) => (a.batchName || "").localeCompare(b.batchName || ""));
        
        let html = "";
        batches.forEach((b, idx) => {
            let tName = b.teacherName || "Unassigned"; 
            let room = b.room || "TBD"; 
            let sList = b.studentIDs || [];
            let sidsJson = JSON.stringify(sList).replace(/"/g, '&quot;');
            
            let bodyId = `bch_group_body_${idx}`;
            let iconId = `bch_group_icon_${idx}`;
            
            html += `
            <div style="background:white; border:1px solid var(--border-color); border-radius:12px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
                <div style="background:var(--bg-grid-color); padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="bchToggleGroup('${bodyId}', '${iconId}', ${sidsJson})">
                    <div>
                        <div style="font-weight:bold; color:var(--brand-red); font-size:14px; margin-bottom: 4px;">${b.batchName} <span style="font-size:12px; font-weight:normal; background:white; padding:2px 8px; border-radius:10px; margin-left:10px; color:var(--brand-red); border: 1px solid var(--border-color);">${sList.length} Students</span></div>
                        <div style="color:var(--text-muted); font-size:12px; font-weight: 600;"><i class="fas fa-chalkboard-teacher"></i> ${tName} &nbsp;|&nbsp; <i class="fas fa-door-open"></i> ${room}</div>
                    </div>
                    <i id="${iconId}" class="fas fa-chevron-right" style="color:var(--text-muted); transition:0.2s; transform:rotate(0deg);"></i>
                </div>
                <div id="${bodyId}" style="padding:10px 10px 2px 10px; display:none;">
                    <div style="text-align:center; padding: 15px; color: var(--text-muted); font-size: 13px;"><i>Loading students...</i></div>
                </div>
            </div>`;
        });
        
        container.innerHTML = html;
        
    } catch(e) {
        bchShowEmpty("Error loading batches.");
        console.error(e);
    }
}

// Lazy Load Students (Matches Unity Coroutine/Batching Logic)
window.bchToggleGroup = async (bodyId, iconId, sids) => {
    let body = document.getElementById(bodyId);
    let icon = document.getElementById(iconId);
    
    let isOpening = body.style.display === "none";
    
    if (isOpening) {
        body.style.display = "block";
        icon.style.transform = "rotate(90deg)";
        
        // If it's already loaded, skip fetching!
        if (body.innerHTML.includes("Loading students")) {
            if (sids.length === 0) {
                body.innerHTML = `<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:12px; font-weight:bold;">No students in this batch</div>`;
                return;
            }
            
            let fetchedStudents = [];
            let missingSids = [];
            
            // 🚨 Use RAM Cache just like the C# Script
            sids.forEach(sid => {
                if (bchStudentCache[sid]) fetchedStudents.push(bchStudentCache[sid]);
                else missingSids.push(sid);
            });
            
            // 🚨 Use WhereIn with 30-item chunks just like Unity!
            if (missingSids.length > 0) {
                for (let i = 0; i < missingSids.length; i += 30) {
                    let chunk = missingSids.slice(i, i + 30);
                    try {
                        const sSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("__name__", "in", chunk)));
                        sSnap.forEach(d => {
                            let data = d.data();
                            let stuObj = {
                                id: d.id,
                                name: data.Name || data.studentName || "Unknown",
                                roll: data.RollNumber || data.rollNumber || "No Roll",
                                dept: (data.Department || data.department || "Unknown Dept").replace("DEPT_", "")
                            };
                            bchStudentCache[d.id] = stuObj;
                            fetchedStudents.push(stuObj);
                        });
                    } catch(e) { console.error(e); }
                }
            }
            
            fetchedStudents.sort((a,b) => a.name.localeCompare(b.name));
            
            let stuHtml = "";
            fetchedStudents.forEach(s => {
                stuHtml += `
                <div class="data-card" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-left: 4px solid var(--brand-red); border-radius: 10px; margin-bottom: 8px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.02); cursor: default;">
                    <div style="flex:1;">
                        <div style="margin-bottom:2px;">
                            <span style="font-weight:800; font-size:14px; color:var(--text-dark);">${s.name}</span> 
                            <span style="font-size:11px; color:var(--text-muted); margin-left:4px;">(${s.roll})</span>
                        </div>
                        <div style="font-size:11px; font-weight:600; color:var(--text-muted);">${s.dept}</div>
                    </div>
                    <i class="fas fa-lock" style="color:#cbd5e1; font-size:14px;"></i>
                </div>`;
            });
            body.innerHTML = stuHtml;
        }
    } else {
        body.style.display = "none";
        icon.style.transform = "rotate(0deg)";
    }
};

// ==========================================
// 🚨 EVENT ATTENDANCE ENGINE
// ==========================================
let evtLoaded = false;
let evtCurrentDate = new Date();
let evtAllCollegeStudentsCache = [];
let evtIsCacheLoaded = false;
let evtCachedTeacherID = "";

let evtCartStudents = new Map(); // K: studentID, V: student data
let evtPendingStudentIDs = new Set();
let evtCurrentRequestID = "";
let evtIsLocked = false;
let evtListenerUnsub = null;

function initEventAttendanceEngine() {
    if (evtLoaded) return;
    evtLoaded = true;

    document.getElementById("evtDateBtn").addEventListener("click", () => {
        // Recycle the same Jump Date modal from the Attendance engine!
        document.getElementById("jumpDateModal").classList.add("active");
        document.getElementById("jumpSubmitBtn").onclick = () => {
            let d = parseInt(document.getElementById("jumpDayDropdown").value) + 1;
            let m = parseInt(document.getElementById("jumpMonthDropdown").value);
            let y = parseInt(document.getElementById("jumpYearDropdown").value);
            evtCurrentDate = new Date(y, m, d);
            evtUpdateDateUI();
            evtLoadDataForPeriod();
            document.getElementById("jumpDateModal").classList.remove("active");
        };
    });

    document.getElementById("evtPeriodDrop").addEventListener("change", evtLoadDataForPeriod);
    document.getElementById("btnEvtOpenSearch").addEventListener("click", evtOpenSearchPanel);
    document.getElementById("evtSearchInput").addEventListener("input", debounce((e) => evtOnSearchTyped(e.target.value), 250));
    document.getElementById("btnEvtAddSelected").addEventListener("click", evtAddSelectedToCart);
    document.getElementById("btnEvtSave").addEventListener("click", evtSaveEventAttendance);

    evtUpdateDateUI();
    evtLoadAllStudentsIntoRAM();
}

function evtUpdateDateUI() {
    let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let dName = days[evtCurrentDate.getDay()];
    let yyyy = evtCurrentDate.getFullYear();
    let mm = String(evtCurrentDate.getMonth() + 1).padStart(2, '0');
    let dd = String(evtCurrentDate.getDate()).padStart(2, '0');
    document.getElementById("evtDateText").innerHTML = `${dName}<br>${yyyy}-${mm}-${dd}`;
}

async function evtLoadAllStudentsIntoRAM() {
    if (currentUserID !== evtCachedTeacherID) {
        evtAllCollegeStudentsCache = [];
        evtIsCacheLoaded = false;
        evtCachedTeacherID = currentUserID;
    }

    if (evtIsCacheLoaded && evtAllCollegeStudentsCache.length > 0) {
        evtLoadDataForPeriod();
        return;
    }

    showRcToast("Syncing College Database...");
    try {
        const snap = await getDocs(collection(db, "colleges", currentCollegeID, "students"));
        evtAllCollegeStudentsCache = [];
        snap.forEach(doc => evtAllCollegeStudentsCache.push({ id: doc.id, ...doc.data() }));
        
        evtIsCacheLoaded = true;
        evtLoadDataForPeriod();
    } catch(e) {
        console.error("Failed to load students cache", e);
        showRcToast("Error syncing students.");
    }
}

function evtLoadDataForPeriod() {
    if (evtListenerUnsub) { evtListenerUnsub(); evtListenerUnsub = null; }

    evtCartStudents.clear();
    evtCurrentRequestID = "";
    evtIsLocked = false;
    
    let nameInput = document.getElementById("evtNameInput");
    let searchBtn = document.getElementById("btnEvtOpenSearch");
    let saveBtn = document.getElementById("btnEvtSave");
    let lockText = document.getElementById("evtLockStatusText");

    nameInput.value = "";
    nameInput.disabled = false;
    searchBtn.style.display = "block";
    saveBtn.style.display = "block";
    saveBtn.innerText = "Send to Principal";
    lockText.innerText = "";
    
    evtRebuildCartUI();

    let dateStr = `${evtCurrentDate.getFullYear()}-${String(evtCurrentDate.getMonth() + 1).padStart(2, '0')}-${String(evtCurrentDate.getDate()).padStart(2, '0')}`;
    let pIndex = document.getElementById("evtPeriodDrop").value;

    const q = query(
        collection(db, "colleges", currentCollegeID, "event_requests"),
        where("teacherID", "==", currentUserID),
        where("date", "==", dateStr),
        where("period", "==", pIndex)
    );

    evtListenerUnsub = onSnapshot(q, (snapshot) => {
        evtCartStudents.clear();
        
        if (!snapshot.empty) {
            let docSnap = snapshot.docs[0];
            let data = docSnap.data();
            evtCurrentRequestID = docSnap.id;

            nameInput.value = data.eventName || "";
            let status = data.status || "Pending";
            evtIsLocked = (status === "Accepted");

            // 🚨 24-HOUR LOCK SHIELD
            if (!evtIsLocked && data.submittedAt) {
                let submittedTime = data.submittedAt.toDate ? data.submittedAt.toDate() : new Date();
                let hoursPassed = (new Date() - submittedTime) / (1000 * 60 * 60);
                if (hoursPassed >= 24) evtIsLocked = true;
            }

            if (data.studentIDs && Array.isArray(data.studentIDs)) {
                data.studentIDs.forEach(sid => {
                    let sDoc = evtAllCollegeStudentsCache.find(s => s.id === sid);
                    if (sDoc) {
                        evtCartStudents.set(sid, {
                            id: sid,
                            name: sDoc.Name || sDoc.studentName || "Unknown",
                            roll: sDoc.RollNumber || sDoc.rollNumber || "",
                            dept: (sDoc.Department || sDoc.department || "").replace("DEPT_", ""),
                            year: sDoc.Year || "1"
                        });
                    }
                });
            }
        }

        nameInput.disabled = evtIsLocked;
        searchBtn.style.display = evtIsLocked ? "none" : "block";
        saveBtn.style.display = evtIsLocked ? "none" : "block";
        lockText.innerText = evtIsLocked ? "Locked (Cannot be edited)" : "";
        
        evtRebuildCartUI();
    });
}

function evtRebuildCartUI() {
    let container = document.getElementById("evtCartContainer");
    let emptyMsg = document.getElementById("evtEmptyCartMsg");

    if (evtCartStudents.size === 0) {
        emptyMsg.style.display = "block";
        container.innerHTML = "";
    } else {
        emptyMsg.style.display = "none";
        let html = "";
        
        evtCartStudents.forEach((s) => {
            html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; border:1px solid var(--border-color); border-radius:12px; padding:15px; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
                <div>
                    <div style="font-size:14px; font-weight:bold; color:var(--text-dark); margin-bottom:2px;">${s.name}</div>
                    <div style="font-size:11px; color:var(--text-muted); font-weight:600;">${s.roll} - ${s.dept} - Year ${s.year}</div>
                </div>
                ${!evtIsLocked ? `<button onclick="evtRemoveFromCart('${s.id}')" style="background:#fef2f2; color:var(--brand-red); border:none; width:34px; height:34px; border-radius:8px; cursor:pointer; transition:0.2s;"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
        });
        
        container.innerHTML = html;
    }
}

window.evtRemoveFromCart = (id) => {
    if (evtIsLocked) { showRcToast("Cannot edit a locked request!"); return; }
    evtCartStudents.delete(id);
    evtRebuildCartUI();
};

function evtOpenSearchPanel() {
    if (!evtIsCacheLoaded) { showRcToast("Still loading students..."); return; }
    
    document.getElementById("evtSearchInput").value = "";
    evtPendingStudentIDs.clear();
    document.getElementById("evtSearchResultContainer").innerHTML = "";
    
    document.getElementById("evtSearchMsg").style.display = "block";
    document.getElementById("evtSearchMsg").innerText = "Type a name or roll number to search...";
    
    document.getElementById("evtSearchModal").classList.add("active");
}

function evtOnSearchTyped(queryStr) {
    let container = document.getElementById("evtSearchResultContainer");
    let msgObj = document.getElementById("evtSearchMsg");

    if (!queryStr || queryStr.length < 2) {
        container.innerHTML = "";
        msgObj.style.display = "block";
        msgObj.innerText = "Type a name or roll number to search...";
        return;
    }

    let cleanQuery = queryStr.trim().toLowerCase();
    let matches = evtAllCollegeStudentsCache.filter(s => {
        let n = (s.Name || "").toLowerCase();
        let r = (s.RollNumber || "").toLowerCase();
        return n.includes(cleanQuery) || r.includes(cleanQuery);
    });

    if (matches.length === 0) {
        container.innerHTML = "";
        msgObj.style.display = "block";
        msgObj.innerText = `No students found matching '${queryStr}'!`;
        return;
    }

    msgObj.style.display = "none";
    let html = "";
    
    // Hard limit for smooth UI
    let renderBatch = matches.slice(0, 20);

    renderBatch.forEach(s => {
        let name = s.Name || s.studentName || "Unknown";
        let roll = s.RollNumber || s.rollNumber || "";
        let dept = (s.Department || s.department || "").replace("DEPT_", "");
        let year = s.Year || "1";
        
        let isAlreadyInCart = evtCartStudents.has(s.id);
        let isPending = evtPendingStudentIDs.has(s.id);

        let chkHtml = "";
        let clickAction = "";
        let cursorStyle = "";
        let bgStyle = isPending ? "rgba(220, 38, 38, 0.05)" : "var(--bg-surface)";
        let borderStyle = isPending ? "var(--brand-red)" : "var(--border-color)";

        if (isAlreadyInCart) {
            // Locked State
            chkHtml = `<input type="checkbox" checked disabled style="width:18px; height:18px; accent-color:var(--text-muted); pointer-events:none;">`;
            cursorStyle = "cursor:not-allowed; opacity:0.6;";
            bgStyle = "var(--bg-base)";
        } else {
            // Interactive State
            chkHtml = `<input type="checkbox" id="pend_chk_${s.id}" ${isPending ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--brand-red); pointer-events:none;">`;
            cursorStyle = "cursor:pointer;";
            clickAction = `onclick="evtTogglePendingCard('${s.id}')"`;
        }

        html += `
        <div id="evt_search_card_${s.id}" style="display:flex; justify-content:space-between; align-items:center; background:${bgStyle}; border:1px solid ${borderStyle}; border-radius:10px; padding:12px; margin-bottom:5px; ${cursorStyle} transition: 0.2s;" ${clickAction}>
            <div>
                <div style="font-size:13px; font-weight:bold; color:var(--text-dark); margin-bottom:2px;">${name}</div>
                <div style="font-size:11px; color:var(--text-muted); font-weight:600;">${roll} - ${dept} - Year ${year}</div>
            </div>
            ${chkHtml}
        </div>`;
    });

    container.innerHTML = html;
}

// 🚨 NEW: This handles the entire card click!
window.evtTogglePendingCard = (id) => {
    let chk = document.getElementById(`pend_chk_${id}`);
    let card = document.getElementById(`evt_search_card_${id}`);
    if (!chk || !card) return;

    // Flip the checkbox state
    chk.checked = !chk.checked; 

    // Update RAM Cache and Visuals instantly
    if (chk.checked) {
        evtPendingStudentIDs.add(id);
        card.style.backgroundColor = "rgba(220, 38, 38, 0.05)"; // Red tint
        card.style.borderColor = "var(--brand-red)";
    } else {
        evtPendingStudentIDs.delete(id);
        card.style.backgroundColor = "var(--bg-surface)";
        card.style.borderColor = "var(--border-color)";
    }
};

function evtAddSelectedToCart() {
    let added = 0;
    evtPendingStudentIDs.forEach(id => {
        if (!evtCartStudents.has(id)) {
            let sDoc = evtAllCollegeStudentsCache.find(s => s.id === id);
            if (sDoc) {
                evtCartStudents.set(id, {
                    id: id,
                    name: sDoc.Name || sDoc.studentName || "Unknown",
                    roll: sDoc.RollNumber || sDoc.rollNumber || "",
                    dept: (sDoc.Department || sDoc.department || "").replace("DEPT_", ""),
                    year: sDoc.Year || "1"
                });
                added++;
            }
        }
    });

    if (added > 0) showRcToast(`Added ${added} students to cart!`);
    evtPendingStudentIDs.clear();
    evtRebuildCartUI();
    document.getElementById("evtSearchModal").classList.remove("active");
}

async function evtSaveEventAttendance() {
    if (evtIsLocked) return;

    let eventName = document.getElementById("evtNameInput").value.trim();
    if (!eventName) { showRcToast("Please enter the Event Name!"); return; }
    if (evtCartStudents.size === 0) { showRcToast("Cart is empty!"); return; }

    let saveBtn = document.getElementById("btnEvtSave");
    saveBtn.innerText = "Sending..."; saveBtn.disabled = true;

    let dateStr = `${evtCurrentDate.getFullYear()}-${String(evtCurrentDate.getMonth() + 1).padStart(2, '0')}-${String(evtCurrentDate.getDate()).padStart(2, '0')}`;
    let pStr = document.getElementById("evtPeriodDrop").value;
    let sids = Array.from(evtCartStudents.keys());

    let involvedSemesters = new Set();
    evtCartStudents.forEach(s => {
        // Use SemesterManager logic
        let yearNum = parseInt(s.year.replace(/\D/g, '')) || 1;
        let semNum = (currentSemesterType === "Odd") ? (yearNum * 2) - 1 : (yearNum * 2);
        involvedSemesters.add(semNum.toString());
    });

    let payload = {
        teacherID: currentUserID,
        teacherName: currentTeacherName,
        eventName: eventName,
        date: dateStr,
        period: pStr,
        semester: Array.from(involvedSemesters).join(", "),
        studentIDs: sids,
        status: "Pending"
    };

    try {
        let docRef;
        if (evtCurrentRequestID) {
            docRef = doc(db, "colleges", currentCollegeID, "event_requests", evtCurrentRequestID);
            await setDoc(docRef, payload, { merge: true });
        } else {
            payload.submittedAt = serverTimestamp();
            docRef = await addDoc(collection(db, "colleges", currentCollegeID, "event_requests"), payload);
            evtCurrentRequestID = docRef.id;
        }

        showRcToast("Event sent to Principal!");
        
        // 🚨 WEBOOK: Blast notification to Principal safely via Google Script
        const safeCol = currentCollegeID.replace(/[^a-zA-Z0-9]/g, '');
        fetch("https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec", {
            method: "POST", mode: "no-cors",
            body: JSON.stringify({
                title: "New Event Request 📅",
                body: `${currentTeacherName} has requested attendance approval for '${eventName}'.`,
                image: "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/4c9dc43b4b3fd2c66679498581de26d690053f61/AdhyoraSplashLogo5.png",
                type: "event_request",
                priority: "high",
                topics: [`${safeCol}_PRINCIPAL`]
            })
        });

    } catch (e) {
        console.error(e);
        showRcToast("Failed to Send!");
    } finally {
        saveBtn.innerText = "Send to Principal"; saveBtn.disabled = false;
    }
}

// ==========================================
// 🚨 INTERNAL MARKS ENGINE
// ==========================================
let imLoaded = false;
let imExamTypesList = [];
let imTeacherSubjectsMap = {}; // K: Semester X, V: List of subjects
let imMjdSubjectsCache = new Set();
let imCachedStudentsByYear = {};
let imSessionMaxMarks = {}; // K: cacheKey, V: maxMark

let imCurrentStudent = null;
let imCurrentAutoAttMark = "";
let imCurrentBatchName = "Common";

function initInternalMarksEngine() {
    if (imLoaded) return;
    imLoaded = true;

    document.getElementById("imYearDrop").addEventListener("change", imOnYearChanged);
    document.getElementById("imSemDrop").addEventListener("change", imOnSemesterChanged);
    document.getElementById("imSubDrop").addEventListener("change", imLoadStudents);
    document.getElementById("btnImAddExam").addEventListener("click", imOnAddExamClicked);

    imFetchExamConfig();
    imFetchTeacherSubjectsAndStart();
}

async function imFetchExamConfig() {
    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "settings", "exam_config"));
        if (snap.exists() && snap.data().exams) {
            imExamTypesList = snap.data().exams;
        }
        if (imExamTypesList.length === 0) imExamTypesList = ["1st Internal", "2nd Internal"];
    } catch (e) {
        imExamTypesList = ["1st Internal", "2nd Internal"];
    }
}

async function imFetchTeacherSubjectsAndStart() {
    try {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), where("teacherID", "==", currentUserID), where("isActive", "==", true)));
        
        imTeacherSubjectsMap = {};
        imMjdSubjectsCache.clear();

        snap.forEach(docSnap => {
            let d = docSnap.data();
            let sName = d.subjectName;
            if (!sName) return;

            let sCode = d.subjectCode || "";
            if (sCode.toUpperCase().includes("MJD")) imMjdSubjectsCache.add(sName);

            let sSemStr = d.semester !== undefined ? d.semester.toString() : "1";
            let semArray = sSemStr.split(',');

            semArray.forEach(s => {
                let cleanSemNum = s.trim();
                if (!cleanSemNum) return;
                let semKey = `Semester ${cleanSemNum}`;
                
                if (!imTeacherSubjectsMap[semKey]) imTeacherSubjectsMap[semKey] = new Set();
                imTeacherSubjectsMap[semKey].add(sName);
            });
        });

        imSetupYearDropdown();
    } catch(e) { console.error(e); }
}

function imSetupYearDropdown() {
    let yearDrop = document.getElementById("imYearDrop");
    yearDrop.innerHTML = `<option value="1">1st Year</option><option value="2">2nd Year</option><option value="3">3rd Year</option><option value="4">4th Year</option>`;
    imOnYearChanged();
}

function imOnYearChanged() {
    let yearDrop = document.getElementById("imYearDrop");
    let selectedYear = parseInt(yearDrop.value);
    
    // Use the global semester type to find current sem for this year
    let activeSem = (currentSemesterType === "Odd") ? (selectedYear * 2) - 1 : (selectedYear * 2);
    
    let semDrop = document.getElementById("imSemDrop");
    semDrop.innerHTML = `<option value="${activeSem}">Semester ${activeSem}</option>`;
    
    imOnSemesterChanged();
}

function imOnSemesterChanged() {
    let semDrop = document.getElementById("imSemDrop");
    let selectedSemText = semDrop.options[semDrop.selectedIndex].text;
    
    let subDrop = document.getElementById("imSubDrop");
    subDrop.innerHTML = "";

    if (imTeacherSubjectsMap[selectedSemText] && imTeacherSubjectsMap[selectedSemText].size > 0) {
        let subs = Array.from(imTeacherSubjectsMap[selectedSemText]).sort();
        subDrop.innerHTML = `<option value="">Select Subject</option>` + subs.map(s => `<option value="${s}">${s}</option>`).join('');
        subDrop.disabled = false;
        imShowEmpty("Select a subject to view students.");
    } else {
        subDrop.innerHTML = `<option value="">No Subjects</option>`;
        subDrop.disabled = true;
        imShowEmpty(`You have no subjects assigned for ${selectedSemText}.`);
    }
}

function imShowEmpty(msg) {
    document.getElementById("imListContainer").innerHTML = "";
    document.getElementById("imEmptyMsg").innerText = msg;
    document.getElementById("imEmptyMsg").style.display = "block";
    document.getElementById("imTotalCount").style.display = "none";
}

async function imLoadStudents() {
    let subDrop = document.getElementById("imSubDrop");
    let selectedSubject = subDrop.value;
    
    if (!selectedSubject) {
        imShowEmpty("Select a subject to view students.");
        return;
    }

    let year = parseInt(document.getElementById("imYearDrop").value);
    let semDrop = document.getElementById("imSemDrop");
    let selectedSemText = semDrop.options[semDrop.selectedIndex].text;
    let semNum = selectedSemText.replace("Semester ", "").trim();

    imShowEmpty("Checking Batches...");

    try {
        // 1. Check if batched
        const batchSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", semNum), where("subjectName", "==", selectedSubject)));
        let batches = [];
        if (!batchSnap.empty) {
            batchSnap.forEach(d => batches.push({ id: d.id, ...d.data() }));
        }

        // 2. Fetch Students (with caching)
        if (!imCachedStudentsByYear[year]) {
            imShowEmpty("Syncing Class Data...");
            const stuSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", year.toString())));
            imCachedStudentsByYear[year] = [];
            stuSnap.forEach(d => imCachedStudentsByYear[year].push({ id: d.id, ...d.data() }));
        }

        imProcessAndSpawnStudents(imCachedStudentsByYear[year], selectedSemText, selectedSubject, batches);

    } catch (e) {
        console.error(e);
        imShowEmpty("Error loading data.");
    }
}

function imProcessAndSpawnStudents(studentsDocList, selectedSemText, selectedSubject, batches) {
    document.getElementById("imEmptyMsg").style.display = "none";
    let container = document.getElementById("imListContainer");
    let html = "";
    let activeCount = 0;
    
    // 🚨 NEW: Keep track of who is actually on the screen so we can fetch their marks!
    let renderedStudentIDs = []; 

    // A. BATCHED SUBJECT
    if (batches && batches.length > 0) {
        batches.sort((a,b) => a.id.localeCompare(b.id));
        let fallbackCounter = 1;

        batches.forEach(bDoc => {
            let bName = bDoc.batchName || `Batch ${fallbackCounter}`;
            fallbackCounter++;
            let tName = bDoc.teacherName || "Unknown";
            let sIDs = bDoc.studentIDs || [];
            
            let stuHtml = "";
            sIDs.forEach(sid => {
                let stuDoc = studentsDocList.find(s => s.id === sid);
                if (stuDoc) {
                    stuHtml += imGenerateStudentRow(stuDoc, selectedSemText, selectedSubject, bName);
                    activeCount++;
                    renderedStudentIDs.push(sid); // 🚨 Track ID
                }
            });

            if (stuHtml === "") stuHtml = `<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:12px;">Empty Batch</div>`;

            let bodyId = `im_batch_body_${bDoc.id}`;
            let iconId = `im_batch_icon_${bDoc.id}`;

            html += `
            <div style="background:white; border:1px solid var(--border-color); border-radius:12px; overflow:hidden; margin-bottom:15px; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
                <div style="background:var(--bg-grid-color); padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="document.getElementById('${bodyId}').style.display = document.getElementById('${bodyId}').style.display === 'none' ? 'block' : 'none'; document.getElementById('${iconId}').style.transform = document.getElementById('${bodyId}').style.display === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';">
                    <div>
                        <div style="font-weight:bold; color:var(--brand-red); font-size:14px; margin-bottom:4px;">${bName} <span style="font-size:12px; font-weight:normal; background:white; padding:2px 8px; border-radius:10px; margin-left:10px; color:var(--brand-red); border:1px solid var(--border-color);">${sIDs.length} Students</span></div>
                        <div style="color:var(--text-muted); font-size:12px;">Assigned: ${tName}</div>
                    </div>
                    <i id="${iconId}" class="fas fa-chevron-right" style="color:var(--text-muted); transition:0.2s; transform:rotate(0deg);"></i>
                </div>
                <div id="${bodyId}" style="padding:10px; display:none;">
                    ${stuHtml}
                </div>
            </div>`;
        });
        document.getElementById("imTotalCount").style.display = "none";
    } 
    // B. COMMON SUBJECT
    else {
        let cleanSemNum = selectedSemText.replace("Semester ", "").trim();
        
        studentsDocList.forEach(stuDoc => {
            let isEnrolled = false;
            
            if (imMjdSubjectsCache.has(selectedSubject)) {
                let stuDept = (stuDoc.Department || stuDoc.department || "");
                let formattedDept = "DEPT_" + stuDept.replace(/ /g, "");
                if (formattedDept === teacherDeptRaw || stuDept === teacherDeptRaw || !teacherDeptRaw) {
                    isEnrolled = true;
                }
            } else {
                let eMap = stuDoc.enrolledSubjects;
                if (eMap) {
                    let semMap = eMap[`Semester_${cleanSemNum}`] || eMap[selectedSemText] || eMap[cleanSemNum];
                    if (semMap) {
                        Object.values(semMap).forEach(v => {
                            if (v.toString().trim().toLowerCase() === selectedSubject.trim().toLowerCase()) {
                                isEnrolled = true;
                            }
                        });
                    }
                }
            }

            if (isEnrolled) {
                html += imGenerateStudentRow(stuDoc, selectedSemText, selectedSubject, "Common");
                activeCount++;
                renderedStudentIDs.push(stuDoc.id); // 🚨 Track ID
            }
        });
        
        let tCount = document.getElementById("imTotalCount");
        tCount.innerText = `Total: ${activeCount}`;
        tCount.style.display = "block";
    }

    if (activeCount === 0) {
        imShowEmpty(`No students found enrolled in '${selectedSubject}'.`);
    } else {
        container.innerHTML = html;
        
        // 🚨 NEW: Fetch the marks for everyone visible on the screen!
        renderedStudentIDs.forEach(sid => imPopulateMarksPreview(sid, selectedSemText, selectedSubject));
    }
}

function imGenerateStudentRow(stuDoc, selectedSem, selectedSubject, batchName) {
    let name = stuDoc.Name || stuDoc.studentName || "Unknown";
    let roll = stuDoc.RollNumber || stuDoc.rollNumber || "No Roll";
    let dept = (stuDoc.Department || stuDoc.department || "").replace("DEPT_", "");

    let autoAttendanceMark = "";
    let semKeyStrict = `Semester_${selectedSem.replace("Semester ", "").trim()}`;
    let semKeySpace = selectedSem;
    let semKeyNum = selectedSem.replace("Semester ", "").trim();
    let possibleSemKeys = [semKeyStrict, semKeySpace, semKeyNum];
    
    let subKeyPlain = selectedSubject;
    let subKeyClean = selectedSubject.replace(/ /g, "").replace(/\//g, "-").replace(/\./g, "");
    let possibleSubKeys = [subKeyPlain, subKeyClean];

    if (stuDoc.attendance_stats) {
        let semStats = null;
        for (let sk of possibleSemKeys) {
            if (stuDoc.attendance_stats[sk]) { semStats = stuDoc.attendance_stats[sk]; break; }
        }

        if (semStats) {
            let subStats = null;
            for (let subK of possibleSubKeys) {
                if (semStats[subK]) { subStats = semStats[subK]; break; }
            }

            if (subStats) {
                let p = parseFloat(subStats.present) || 0;
                let t = parseFloat(subStats.total) || 0;
                if (t > 0) {
                    let percentage = (p / t) * 100;
                    if (percentage >= 80) autoAttendanceMark = "5";
                    else if (percentage >= 70) autoAttendanceMark = "4";
                    else autoAttendanceMark = "3";
                }
            }
        }
    }

    let payloadStr = encodeURIComponent(JSON.stringify({ id: stuDoc.id, name: name, rollNumber: roll, department: dept }));
    let autoAttEnc = encodeURIComponent(autoAttendanceMark);
    let batchEnc = encodeURIComponent(batchName);

    // 🚨 UI UPDATE: Added the im_preview div to hold the marks!
    return `
    <div style="background:white; border:1px solid var(--border-color); border-radius:10px; padding:12px 15px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.02); transition:0.2s;" onclick="imOpenMarksPanel('${payloadStr}', '${autoAttEnc}', '${batchEnc}')" onmouseover="this.style.borderColor='var(--brand-red)'; this.style.transform='translateY(-1px)';" onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)';">
        <div style="flex: 1;">
            <div style="font-size:14px; font-weight:bold; color:var(--text-dark); margin-bottom:2px;">${name}</div>
            <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">${roll} • ${dept}</div>
            <div id="im_preview_${stuDoc.id}" style="display:flex; flex-wrap:wrap; gap:5px;"><span style="font-size:10px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Checking records...</span></div>
        </div>
        <i class="fas fa-edit" style="color:var(--brand-red); font-size:14px; margin-left:10px;"></i>
    </div>`;
}

// 🚨 NEW FUNCTION: Fetches and displays the badges on the student card!
async function imPopulateMarksPreview(sid, semester, subject) {
    let previewEl = document.getElementById(`im_preview_${sid}`);
    if (!previewEl) return;

    try {
        let snap = await getDoc(doc(db, "colleges", currentCollegeID, "students", sid, "nep_marks", semester));
        if (snap.exists() && snap.data()[subject]) {
            let exams = snap.data()[subject];
            let html = Object.keys(exams).sort().map(examName => {
                let total = exams[examName].total || 0;
                let max = exams[examName].max || 0;
                return `<span style="background:var(--bg-surface); color:var(--brand-red); padding:3px 8px; border-radius:10px; font-size:10px; font-weight:800; border:1px solid var(--border-color);">${examName}: ${total}${max > 0 ? `/${max}` : ''}</span>`;
            }).join('');
            
            previewEl.innerHTML = html || "<span style='font-size:10px; color:var(--text-muted); font-weight:600;'><i class='fas fa-info-circle'></i> No marks entered</span>";
        } else {
            previewEl.innerHTML = "<span style='font-size:10px; color:var(--text-muted); font-weight:600;'><i class='fas fa-info-circle'></i> No marks entered</span>";
        }
    } catch(e) {
        if (previewEl) previewEl.innerHTML = "<span style='font-size:10px; color:#ef4444;'>Error loading</span>";
    }
}

// ==========================================
// MARKS MODAL LOGIC
// ==========================================

window.imOpenMarksPanel = (stuPayloadEnc, autoAttEnc, batchEnc) => {
    imCurrentStudent = JSON.parse(decodeURIComponent(stuPayloadEnc));
    imCurrentAutoAttMark = decodeURIComponent(autoAttEnc);
    imCurrentBatchName = decodeURIComponent(batchEnc);

    document.getElementById("imStudentNameText").innerText = imCurrentStudent.name;
    document.getElementById("imSubjectSubtitle").innerText = document.getElementById("imSubDrop").value;

    imExamTypesList.sort();
    imRenderAccordions();
    document.getElementById("imMarksModal").classList.add("active");
};

function imOnAddExamClicked() {
    let count = imExamTypesList.length + 1;
    let newName = `${count}th Internal`;
    
    if (!imExamTypesList.includes(newName)) {
        imExamTypesList.push(newName);
        setDoc(doc(db, "colleges", currentCollegeID, "settings", "exam_config"), { exams: imExamTypesList }, { merge: true });
        imRenderAccordions();
    }
}

function imRenderAccordions() {
    let container = document.getElementById("imAccordionsContainer");
    let html = "";
    
    let semText = document.getElementById("imSemDrop");
    let semester = semText.options[semText.selectedIndex].text;
    let subject = document.getElementById("imSubDrop").value;
    
    // Create an instance-specific session string for Reactivity protection
    let mySession = Date.now().toString();

    imExamTypesList.forEach((examName, idx) => {
        let bodyId = `im_acc_body_${idx}`;
        let iconId = `im_acc_icon_${idx}`;
        let headerId = `im_acc_head_${idx}`;
        
        let inTestId = `im_in_test_${idx}`;
        let inAttId = `im_in_att_${idx}`;
        let inAsgnId = `im_in_asgn_${idx}`;
        let inMaxId = `im_in_max_${idx}`;
        let btnSaveId = `im_btn_save_${idx}`;

        html += `
        <div style="background:white; border:1px solid var(--border-color); border-radius:12px; overflow:hidden; box-shadow:0 2px 5px rgba(0,0,0,0.02); flex-shrink: 0;">
            <div style="background:var(--bg-surface); padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="imToggleAccordion('${bodyId}', '${iconId}', '${examName}', '${mySession}', ${idx})">
                <div id="${headerId}" style="font-weight:bold; color:var(--text-dark); font-size:14px;">${examName} <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">(Loading...)</span></div>
                <i id="${iconId}" class="fas fa-chevron-right" style="color:var(--text-muted); transition:0.2s; transform:rotate(0deg);"></i>
            </div>
            
            <div id="${bodyId}" style="padding:15px; display:none; background:white; border-top:1px solid var(--border-color);">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div><label style="font-size:11px; font-weight:bold; color:var(--text-muted);">Test Marks</label><input type="number" id="${inTestId}" class="filter-select" style="width:100%; margin-top:5px;"></div>
                    
                    <div><label style="font-size:11px; font-weight:bold; color:var(--text-muted);">Attendance <i class="fas fa-lock" style="font-size:9px; color:var(--brand-red);"></i></label><input type="number" id="${inAttId}" class="filter-select" style="width:100%; margin-top:5px; background:rgba(0,0,0,0.03); cursor:not-allowed;" value="${imCurrentAutoAttMark}" disabled></div>
                    
                    <div><label style="font-size:11px; font-weight:bold; color:var(--text-muted);">Assignment</label><input type="number" id="${inAsgnId}" class="filter-select" style="width:100%; margin-top:5px;"></div>
                    <div><label style="font-size:11px; font-weight:bold; color:var(--brand-red);">Max Marks</label><input type="number" id="${inMaxId}" class="filter-select" style="width:100%; margin-top:5px; border-color:var(--brand-red);"></div>
                </div>
                <button id="${btnSaveId}" onclick="imSaveMarks('${examName}', ${idx})" style="width:100%; background:var(--brand-red); color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; box-shadow:0 4px 10px rgba(220,38,38,0.2);">Save Marks</button>
            </div>
        </div>`;
        
        // Auto-Load data silently for header injection
        imLoadSingleExamData(semester, subject, examName, idx, mySession, false);
    });

    container.innerHTML = html;
}

window.imToggleAccordion = (bodyId, iconId, examName, sessionStr, idx) => {
    let body = document.getElementById(bodyId);
    let icon = document.getElementById(iconId);
    let isOpen = body.style.display === "block";
    
    if (isOpen) {
        body.style.display = "none";
        icon.style.transform = "rotate(0deg)";
    } else {
        body.style.display = "block";
        icon.style.transform = "rotate(90deg)";
        let semText = document.getElementById("imSemDrop");
        let semester = semText.options[semText.selectedIndex].text;
        let subject = document.getElementById("imSubDrop").value;
        imLoadSingleExamData(semester, subject, examName, idx, sessionStr, true);
    }
};

async function imLoadSingleExamData(semester, subject, examName, idx, sessionStr, updateInputs) {
    let cacheKey = `${currentCollegeID}_${semester}_${subject}_${imCurrentBatchName}_${examName}`;
    let examExists = false;
    let t = "", a = imCurrentAutoAttMark, asgn = "", m = "";

    try {
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "students", imCurrentStudent.id, "nep_marks", semester));
        if (snap.exists()) {
            let data = snap.data();
            if (data[subject] && data[subject][examName]) {
                let examData = data[subject][examName];
                examExists = true;
                
                t = examData.test !== undefined ? examData.test.toString() : "";
                if (!a) a = examData.att !== undefined ? examData.att.toString() : "";
                asgn = examData.assign !== undefined ? examData.assign.toString() : "";
                m = examData.max !== undefined ? examData.max.toString() : "";
            }
        }
    } catch(e) {}

    // Apply Cached Max Mark if empty
    if (imSessionMaxMarks[cacheKey]) m = imSessionMaxMarks[cacheKey];
    else if (m) imSessionMaxMarks[cacheKey] = m;

    // Update Header
    let head = document.getElementById(`im_acc_head_${idx}`);
    if (head) {
        if (!examExists) head.innerHTML = `${examName} <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">(Not Entered)</span>`;
        else {
            let total = (parseFloat(t)||0) + (parseFloat(a)||0) + (parseFloat(asgn)||0);
            head.innerHTML = `${examName} <span style="color:var(--brand-red); font-weight:800;">(${total}${m ? ` / ${m}` : ''})</span>`;
        }
    }

    // Update Inputs if panel was opened
    if (updateInputs) {
        let elT = document.getElementById(`im_in_test_${idx}`); if(elT && t) elT.value = t;
        let elA = document.getElementById(`im_in_att_${idx}`); if(elA && a) elA.value = a;
        let elAsgn = document.getElementById(`im_in_asgn_${idx}`); if(elAsgn && asgn) elAsgn.value = asgn;
        let elM = document.getElementById(`im_in_max_${idx}`); if(elM && m) elM.value = m;
    }
}

window.imSaveMarks = async (examName, idx) => {
    let btn = document.getElementById(`im_btn_save_${idx}`);
    btn.innerText = "Saving..."; btn.disabled = true;

    let tVal = document.getElementById(`im_in_test_${idx}`).value;
    let aVal = document.getElementById(`im_in_att_${idx}`).value;
    let asgnVal = document.getElementById(`im_in_asgn_${idx}`).value;
    let mVal = document.getElementById(`im_in_max_${idx}`).value;

    if (!aVal && imCurrentAutoAttMark) aVal = imCurrentAutoAttMark;

    let test = parseFloat(tVal) || 0;
    let att = parseFloat(aVal) || 0;
    let assign = parseFloat(asgnVal) || 0;
    let maxMark = parseFloat(mVal) || 0;
    let total = test + att + assign;

    let semText = document.getElementById("imSemDrop");
    let semester = semText.options[semText.selectedIndex].text;
    let subject = document.getElementById("imSubDrop").value;
    let cacheKey = `${currentCollegeID}_${semester}_${subject}_${imCurrentBatchName}_${examName}`;

    if (mVal) imSessionMaxMarks[cacheKey] = mVal;

    let payload = {
        test: test, att: att, assign: assign, max: maxMark, total: total, timestamp: serverTimestamp()
    };

    let docRef = doc(db, "colleges", currentCollegeID, "students", imCurrentStudent.id, "nep_marks", semester);
    let updateData = {};
    updateData[`${subject}.${examName}`] = payload;

    try {
        await updateDoc(docRef, updateData);
    } catch(e) {
        // Document doesn't exist yet, Set it!
        let initialData = {};
        initialData[subject] = {};
        initialData[subject][examName] = payload;
        await setDoc(docRef, initialData, { merge: true });
    }

    showRcToast("Marks Saved Successfully!");
    btn.innerText = "Save Marks"; btn.disabled = false;

    // Instantly update header visually
    let head = document.getElementById(`im_acc_head_${idx}`);
    if (head) {
        head.innerHTML = `${examName} <span style="color:var(--brand-red); font-weight:800;">(${total}${maxMark > 0 ? ` / ${maxMark}` : ''})</span>`;
    }
    
    // 🚨 THE FIX: Instantly refresh the badge on the background card!
    imPopulateMarksPreview(imCurrentStudent.id, semester, subject);
};

// ==========================================
// 🚨 MY TIMETABLE ENGINE (VIEWER)
// ==========================================
let ttLoaded = false;
let ttSelectedDay = "Monday";
let ttListenerUnsub = null;
let ttTimelineInterval = null;
const ttPeriodEndTimes = [10.5, 11.5, 12.5, 14.5, 15.5, 16.5];

function initTimetableEngine() {
    if (ttLoaded) return;
    ttLoaded = true;

    // Show Assign button ONLY if HOD
    document.getElementById("btnOpenHodAssign").style.display = isHOD ? "block" : "none";
    document.getElementById("btnOpenHodAssign").addEventListener("click", () => {
        switchView(views.assign);
        initAssignEngine();
    });

    let dayBtns = document.querySelectorAll("#ttMyDaysContainer .tt-day-btn");
    dayBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            ttSelectedDay = e.target.dataset.day;
            dayBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            ttLoadTimetable();
        });
    });

    let todayIdx = new Date().getDay() - 1;
    if (todayIdx >= 0 && todayIdx <= 4) {
        dayBtns[todayIdx].click();
    } else {
        dayBtns[0].click();
    }

    if (ttTimelineInterval) clearInterval(ttTimelineInterval);
    ttTimelineInterval = setInterval(() => {
        if (document.getElementById("timetableView").classList.contains("active")) {
            ttUpdateVisuals();
        }
    }, 60000);
}

function ttLoadTimetable() {
    if (ttListenerUnsub) { ttListenerUnsub(); ttListenerUnsub = null; }
    
    document.getElementById("ttMyWrapper").innerHTML = `<div class="no-data-text">Loading Timetable...</div>`;

    const q = query(
        collection(db, "colleges", currentCollegeID, "timetable_allocations"),
        where("teacherID", "==", currentUserID),
        where("day", "==", ttSelectedDay)
    );

    ttListenerUnsub = onSnapshot(q, (snap) => {
        let periodData = {};
        snap.forEach(doc => {
            let d = doc.data();
            let pStr = d.period;
            if (!pStr) return;
            let pIndex = parseInt(pStr) - 1;
            
            let semNum = 1;
            if (d.semester) semNum = parseInt(d.semester);
            let isOddSem = (semNum % 2 !== 0);
            let matchesCycle = (currentSemesterType === "Odd" && isOddSem) || (currentSemesterType === "Even" && !isOddSem);

            if (matchesCycle) {
                let sub = d.subjectName || "Unknown";
                if (!d.isCommon && d.splitIndex) sub += ` (Batch ${parseInt(d.splitIndex) + 1})`;
                
                periodData[pIndex] = {
                    category: d.category || "Class",
                    subject: sub,
                    semester: `Sem ${d.semester}`,
                    room: d.room || "TBA"
                };
            }
        });

        ttRenderDay(periodData);
    });
}

function ttRenderDay(periodData) {
    let wrapper = document.getElementById("ttMyWrapper");
    let html = "";

    for (let i = 0; i < 6; i++) {
        let hasClass = periodData[i] !== undefined;
        let pNum = i + 1;
        let idBase = `my_tt_${i}`;
        
        let catText = hasClass ? periodData[i].category : "-";
        let subText = hasClass ? periodData[i].subject : "Free Period";
        let semText = hasClass ? periodData[i].semester : "-";
        let roomText = hasClass ? periodData[i].room : "-";
        
        // Exact Match to Reference UI: Dashed for empty, solid red + tinted bg for active
        let borderStyle = hasClass ? "1px solid var(--brand-red)" : "1px dashed var(--border-color)";
        let bgStyle = hasClass ? "var(--bg-grid-color)" : "transparent"; 

        html += `
        <div class="tt-row" id="row_${idBase}">
            <div class="tt-timeline-col">
                <div class="tt-node" id="node_${idBase}" data-has-class="${hasClass}" style="border-color:${hasClass ? 'var(--brand-red)' : '#cbd5e1'}; color:${hasClass ? 'white' : '#94a3b8'}; background:${hasClass ? 'var(--brand-red)' : 'var(--bg-base)'};">${pNum}</div>
                ${i < 5 ? `<div class="tt-line-bg" style="background:var(--border-color);"><div class="tt-line-fill" id="fill_${idBase}" style="background:var(--brand-red);"></div></div>` : ''}
            </div>
            
            <div class="tt-card" style="background:${bgStyle}; border:${borderStyle};">
                <div class="tt-pill-grid">
                    <div class="tt-pill primary">${catText}</div>
                    <div class="tt-pill">${subText}</div>
                </div>
                <div class="tt-pill-grid">
                    <div class="tt-pill">${semText}</div>
                    <div class="tt-pill">${roomText}</div>
                </div>
            </div>
        </div>`;
    }

    wrapper.innerHTML = html;
    ttUpdateVisuals();
}

function ttUpdateVisuals() {
    let now = new Date();
    let currentHour = now.getHours() + (now.getMinutes() / 60.0);
    
    for (let i = 0; i < 6; i++) {
        let idBase = `my_tt_${i}`;
        let nodeEl = document.getElementById(`node_${idBase}`);
        let fillEl = document.getElementById(`fill_${idBase}`);
        
        let endTime = ttPeriodEndTimes[i];
        let startTime = endTime - 1.0;
        
        if (nodeEl) {
            let hasClass = nodeEl.getAttribute("data-has-class") === "true";
            
            if (currentHour >= endTime) { 
                // Passed: Gray out
                nodeEl.style.background = "var(--border-color)"; 
                nodeEl.style.borderColor = "var(--border-color)";
                nodeEl.style.color = "white"; 
                nodeEl.style.boxShadow = "none";
            }
            else if (currentHour >= startTime && currentHour < endTime) { 
                // Active: Glow Red
                nodeEl.style.background = "var(--brand-red)"; 
                nodeEl.style.borderColor = "var(--brand-red)";
                nodeEl.style.color = "white"; 
                nodeEl.style.boxShadow = "0 0 10px rgba(220,38,38,0.4)";
            }
            else { 
                // Upcoming
                if (hasClass) {
                    nodeEl.style.background = "var(--brand-red)"; 
                    nodeEl.style.borderColor = "var(--brand-red)";
                    nodeEl.style.color = "white"; 
                } else {
                    nodeEl.style.background = "var(--bg-base)"; 
                    nodeEl.style.borderColor = "var(--border-color)";
                    nodeEl.style.color = "var(--text-muted)"; 
                }
                nodeEl.style.boxShadow = "none";
            }
        }
        
        if (fillEl && i < 5) {
            let fillAmount = (currentHour >= endTime) ? 100 : (currentHour <= startTime) ? 0 : ((currentHour - startTime) / (endTime - startTime)) * 100;
            fillEl.style.height = `${fillAmount}%`;
        }
    }
}

// ==========================================
// 🚨 HOD EDITOR ENGINE (ASSIGN CLASSES)
// ==========================================
let asnLoaded = false;
let asnSelectedDay = "Monday";
let asnCurrentSem = "1";
let asnActiveRows = [];
let asnCachedTeachers = [];
let asnCachedYearStudents = [];
let asnPendSplitRow = null;

function initAssignEngine() {
    if (asnLoaded) return;
    asnLoaded = true;

    document.getElementById("btnBackFromAssign").addEventListener("click", () => switchView(views.timetable));
    document.getElementById("btnAsnSave").addEventListener("click", asnSaveTimetable);

    // Setup Semester Dropdown
    let dropSem = document.getElementById("asnSemDrop"); 
    let optionsHtml = "";
    let activeValue = "";
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        if ((currentSemesterType === "Odd" && isOdd) || (currentSemesterType === "Even" && !isOdd)) {
            if (!activeValue) activeValue = i.toString(); 
            optionsHtml += `<option value="${i}">Semester ${i}</option>`; 
        }
    }
    dropSem.innerHTML = optionsHtml; 
    asnCurrentSem = activeValue;
    dropSem.value = asnCurrentSem;
    dropSem.addEventListener("change", (e) => { asnCurrentSem = e.target.value; asnLoadData(); });

    let dayBtns = document.querySelectorAll("#asnDaysContainer .asn-day-btn");
    dayBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            asnSelectedDay = e.target.dataset.day;
            dayBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            asnLoadData();
        });
    });

    // Fetch all teachers once for caching
    getDocs(collection(db, "colleges", currentCollegeID, "teachers")).then(snap => {
        asnCachedTeachers = [];
        snap.forEach(d => asnCachedTeachers.push({ id: d.id, name: d.data().name || d.data().teacherName || "Unknown", dept: d.data().departmentID || "" }));
        
        let todayIdx = new Date().getDay() - 1;
        if (todayIdx >= 0 && todayIdx <= 4) dayBtns[todayIdx].click();
        else dayBtns[0].click();
    });
}

async function asnLoadData() {
    document.getElementById("asnListContainer").innerHTML = `<div class="no-data-text">Loading Assign Panel...</div>`;

    // 1. Fetch Structure to know Categories
    let docID = `Sem${asnCurrentSem}_${asnSelectedDay}`;
    const structSnap = await getDoc(doc(db, "colleges", currentCollegeID, "timetable_structure", docID));
    
    if (!structSnap.exists() || !structSnap.data().slots) {
        document.getElementById("asnListContainer").innerHTML = `<div class="no-data-text">No structure set for this day by Principal.</div>`;
        return;
    }

    let slots = structSnap.data().slots;
    let validPeriods = [];
    let pCats = {};
    for (let i = 1; i <= 6; i++) {
        if (slots[`P${i}`]) {
            let cat = slots[`P${i}`].trim();
            if (cat !== "Break" && cat !== "Lunch" && cat !== "Select Category") {
                validPeriods.push(i);
                pCats[i] = cat;
            }
        }
    }

    if (validPeriods.length === 0) {
        document.getElementById("asnListContainer").innerHTML = `<div class="no-data-text">No classes scheduled today.</div>`;
        return;
    }

    // 2. Fetch Existing Allocations for HOD's Dept
    let safeHodDept = `DEPT_${teacherDeptRaw.replace(/\s+/g,"")}`;
    const allocSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", asnCurrentSem), where("day", "==", asnSelectedDay), where("departmentID", "==", safeHodDept)));
    
    let allocsByPeriod = {};
    allocSnap.forEach(d => {
        let p = parseInt(d.data().period);
        if (!allocsByPeriod[p]) allocsByPeriod[p] = [];
        allocsByPeriod[p].push(d.data());
    });

    asnActiveRows = [];
    validPeriods.forEach(p => {
        let cat = pCats[p];
        if (allocsByPeriod[p]) {
            let docs = allocsByPeriod[p].sort((a,b) => (parseInt(a.splitIndex)||0) - (parseInt(b.splitIndex)||0));
            docs.forEach((d, idx) => {
                let actualCat = d.category ? d.category : cat; // Support tutorial overrides
                asnActiveRows.push({ id: `r_${p}_${idx}`, period: p, splitIndex: parseInt(d.splitIndex)||0, isSplit: (parseInt(d.splitIndex)||0) > 0 || !d.isCommon, category: actualCat, subject: d.subjectName || "", teacher: d.teacherName || "", teacherID: d.teacherID || "", room: d.room || "" });
            });
        } else {
            asnActiveRows.push({ id: `r_${p}_0`, period: p, splitIndex: 0, isSplit: false, category: cat, subject: "", teacher: "", teacherID: "", room: "" });
        }
    });

    // 3. Cache Students for Splitting Logic
    let yearStr = Math.ceil(parseInt(asnCurrentSem) / 2).toString();
    const stuSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", yearStr)));
    asnCachedYearStudents = [];
    stuSnap.forEach(d => asnCachedYearStudents.push({ id: d.id, ...d.data() }));

    asnRenderLayout();
}

function asnRenderLayout() {
    let container = document.getElementById("asnListContainer");
    let groupedRows = {};
    
    asnActiveRows.forEach(r => {
        if (!groupedRows[r.period]) groupedRows[r.period] = [];
        groupedRows[r.period].push(r);
    });

    // 🚨 FIX 1: Wrapping everything in your 'asn-periods-grid' CSS class
    let html = `<div class="asn-periods-grid">`;
    
    Object.keys(groupedRows).sort((a,b) => a - b).forEach(p => {
        let rows = groupedRows[p].sort((a,b) => a.splitIndex - b.splitIndex);
        
        // 🚨 FIX 2: Relying purely on 'asn-period-wrapper' and 'asn-period-header'
        html += `<div class="asn-period-wrapper">`;
        html += `<div class="asn-period-header">Period ${p}</div>`;
        
        rows.forEach((row, idx) => {
            let isMjdOrTut = row.category.toUpperCase().includes("MJD") || row.category.toUpperCase().includes("MID") || row.category.toUpperCase().includes("SEC") || row.category.toUpperCase().includes("TUTORIAL");
            
            let catOptions = "";
            if (isMjdOrTut) {
                let mjd = row.category.replace("MID", "MJD").replace("SEC", "MJD");
                let mid = row.category.replace("MJD", "MID").replace("SEC", "MID");
                let sec = row.category.replace("MJD", "SEC").replace("MID", "SEC");
                catOptions += `<option value="${mjd}" ${row.category === mjd ? 'selected' : ''}>${mjd}</option>`;
                catOptions += `<option value="${mid}" ${row.category === mid ? 'selected' : ''}>${mid}</option>`;
                catOptions += `<option value="${sec}" ${row.category === sec ? 'selected' : ''}>${sec}</option>`;
                catOptions += `<option value="Tutorial" ${row.category === "Tutorial" ? 'selected' : ''}>Tutorial</option>`;
            } else {
                catOptions = `<option value="${row.category}">${row.category}</option>`;
            }

            let catLocked = row.isSplit || !isMjdOrTut ? "disabled" : "";
            let subLocked = row.isSplit ? "disabled" : "";

            let isDel = row.isSplit; 
            let btnClass = isDel ? "asn-split-btn del" : "asn-split-btn"; 
            let btnIcon = isDel ? '<i class="fas fa-trash"></i> Delete Batch' : '<i class="fas fa-cut"></i> Split';
            let cardClass = isDel ? "asn-card split" : "asn-card";

            let badgeHtml = "";
            if (rows.length > 1) {
                badgeHtml = `<div class="asn-batch-badge" style="background:var(--brand-red); color:white;">Batch ${idx + 1}</div>`;
            }

            // 🚨 FIX 3: Using 'asn-card' and 'asn-grid' with 'asn-input' cleanly
            html += `
            <div class="${cardClass}" id="card_${row.id}">
                ${badgeHtml}
                <div class="asn-grid">
                    <select class="asn-input select" id="cat_${row.id}" ${catLocked} onchange="asnOnCatChange('${row.id}', this.value)">${catOptions}</select>
                    <select class="asn-input select" id="sub_${row.id}" ${subLocked} onchange="asnOnSubChange('${row.id}', this.value)">
                        <option value="">${row.subject ? row.subject : 'Loading...'}</option>
                    </select>
                    <select class="asn-input select" id="tea_${row.id}" onchange="asnOnTeacherChange('${row.id}', this.value)">
                        <option value="">${row.teacher ? row.teacher : 'Loading...'}</option>
                    </select>
                    <input type="text" class="asn-input" id="rm_${row.id}" value="${row.room}" placeholder="Room TBD" onchange="asnOnRoomChange('${row.id}', this.value)">
                </div>
                <button class="${btnClass}" onclick="asnRequestSplit('${row.id}')">${btnIcon}</button>
            </div>`;
        });
        html += `</div>`;
    });
    html += `</div>`; // Close grid

    container.innerHTML = html;
    
    asnActiveRows.forEach(row => {
        asnPopulateSubjects(row);
    });
}

async function asnPopulateSubjects(row) {
    let subDrop = document.getElementById(`sub_${row.id}`);
    if (!subDrop) return;

    if (row.category.toLowerCase().includes("tutorial")) {
        subDrop.innerHTML = `<option value="Tutorial" selected>Tutorial</option>`;
        subDrop.disabled = true;
        asnPopulateTeachers(row);
        return;
    }

    subDrop.innerHTML = `<option value="">Loading...</option>`;
    let cleanRowSubject = (row.subject || "").trim().toLowerCase();

    try {
        const snap = await getDocs(collection(db, "colleges", currentCollegeID, "subjects"));
        let subList = [];
        let safeHodDept = teacherDeptRaw.replace("DEPT_", "").replace(/\s+/g, "").toLowerCase();

        snap.forEach(d => {
            let data = d.data();
            let docSem = (data.semester || data.Semester || "").toString();
            
            if (docSem.split(',').some(s => s.trim() == asnCurrentSem)) {
                let docType = (data.type || data.Type || "").trim();
                if (docType === row.category) {
                    let subDept = (data.department || data.Department || "").replace("DEPT_", "").replace(/\s+/g, "").toLowerCase();
                    
                    if (subDept === safeHodDept || safeHodDept.includes(subDept) || subDept.includes(safeHodDept) || subDept === "general" || subDept === "all") {
                        subList.push(data.name || data.Name);
                    }
                }
            }
        });

        if (subList.length === 0) {
            subDrop.innerHTML = `<option value="">No Subjects</option>`;
            asnPopulateTeachers(row);
        } else {
            subList.sort();
            subList = [...new Set(subList)]; 
            
            // Build the selected attribute directly into the HTML!
            let opts = `<option value="" ${cleanRowSubject ? '' : 'selected'}>Select Subject</option>`;
            subList.forEach(s => {
                let isMatch = cleanRowSubject === s.trim().toLowerCase();
                opts += `<option value="${s}" ${isMatch ? 'selected' : ''}>${s}</option>`;
            });
            subDrop.innerHTML = opts;
            asnPopulateTeachers(row);
        }
    } catch(e) {
        console.error(e);
        subDrop.innerHTML = `<option value="">Error</option>`;
        asnPopulateTeachers(row); 
    }
}

async function asnPopulateTeachers(row) {
    let teaDrop = document.getElementById(`tea_${row.id}`);
    if (!teaDrop) return;
    
    if (!row.subject || row.subject === "Select Subject" || row.subject === "No Subjects" || row.subject === "Loading..." || row.subject === "Error") {
        teaDrop.innerHTML = `<option value="">Unassigned</option>`;
        return;
    }

    let isTutorial = row.subject.toLowerCase() === "tutorial" || row.category.toLowerCase().includes("tutorial");
    let cleanRowTeacher = (row.teacher || "").trim().toLowerCase();
    
    if (isTutorial) {
        let safeHodDept = teacherDeptRaw.replace("DEPT_", "").replace(/\s+/g, "").toLowerCase();
        let opts = `<option value="" ${cleanRowTeacher ? '' : 'selected'}>Unassigned</option>`;
        
        asnCachedTeachers.forEach(t => {
            let tDept = (t.dept || "").replace("DEPT_", "").replace(/\s+/g, "").toLowerCase();
            if (tDept === safeHodDept || safeHodDept.includes(tDept)) {
                let isMatch = cleanRowTeacher === t.name.trim().toLowerCase();
                opts += `<option value="${t.id}|${t.name}" ${isMatch ? 'selected' : ''}>${t.name}</option>`;
            }
        });
        teaDrop.innerHTML = opts;
    } else {
        try {
            const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), where("subjectName", "==", row.subject), where("isActive", "==", true)));
            let opts = `<option value="" ${cleanRowTeacher ? '' : 'selected'}>Unassigned</option>`;
            let foundNames = new Set();
            
            snap.forEach(d => {
                let data = d.data();
                let tName = data.teacherName || "Unknown";
                let tID = data.teacherID || "";
                if (!foundNames.has(tName)) {
                    foundNames.add(tName);
                    let isMatch = cleanRowTeacher === tName.trim().toLowerCase();
                    opts += `<option value="${tID}|${tName}" ${isMatch ? 'selected' : ''}>${tName}</option>`;
                }
            });
            
            if (foundNames.size === 0) opts += `<option value="">No faculty assigned</option>`;
            teaDrop.innerHTML = opts;
        } catch(e) {
            console.error(e);
            teaDrop.innerHTML = `<option value="">Error</option>`;
        }
    }
}

window.asnOnCatChange = (rowId, val) => {
    let row = asnActiveRows.find(r => r.id === rowId); if(!row) return;
    row.category = val; row.subject = ""; row.teacher = ""; row.teacherID = ""; row.room = "";
    asnActiveRows = asnActiveRows.filter(r => !(r.period === row.period && r.isSplit)); // Wipe old splits
    asnRenderLayout();
};
window.asnOnSubChange = (rowId, val) => {
    let row = asnActiveRows.find(r => r.id === rowId); if(!row) return;
    row.subject = val; row.teacher = ""; row.teacherID = ""; row.room = "";
    asnActiveRows = asnActiveRows.filter(r => !(r.period === row.period && r.isSplit)); 
    
    if (val) {
        // Query ALL allocations for this period/subject to capture splits
        getDocs(query(
            collection(db, "colleges", currentCollegeID, "timetable_allocations"),
            where("semester", "==", asnCurrentSem),
            where("day", "==", asnSelectedDay),
            where("period", "==", row.period.toString()),
            where("subjectName", "==", val)
        )).then(snap => {
            if (!snap.empty) {
                let allocs = [];
                snap.forEach(d => allocs.push(d.data()));
                
                // Sort by split index securely
                allocs.sort((a,b) => (parseInt(a.splitIndex)||0) - (parseInt(b.splitIndex)||0));
                
                // Restore the main row (Batch 1 / Common)
                let mainAlloc = allocs[0];
                row.teacher = mainAlloc.teacherName || "";
                row.teacherID = mainAlloc.teacherID || "";
                row.room = mainAlloc.room || "";

                // Check if batched
                getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", val))).then(bSnap => {
                    if (bSnap.size > 1) {
                        let bDocs = []; bSnap.forEach(d => bDocs.push(d.data())); bDocs.sort((a,b) => a.batchName.localeCompare(b.batchName));
                        for(let i=1; i<bDocs.length; i++) {
                            
                            // 🚨 Safely pull the corresponding teacher for this specific batch
                            let matchAlloc = allocs.find(a => parseInt(a.splitIndex) === i);
                            let tName = matchAlloc ? matchAlloc.teacherName : "";
                            let tID = matchAlloc ? matchAlloc.teacherID : "";
                            let tRoom = matchAlloc ? matchAlloc.room : "";

                            asnActiveRows.push({ 
                                id: `r_${row.period}_${i}_${Date.now()}`, 
                                period: row.period, 
                                splitIndex: i, 
                                isSplit: true, 
                                category: row.category, 
                                subject: val, 
                                teacher: tName, 
                                teacherID: tID, 
                                room: tRoom 
                            });
                        }
                    }
                    asnRenderLayout();
                });
            } else {
                asnRenderLayout();
            }
        });
    } else {
        asnRenderLayout();
    }
};
window.asnOnTeacherChange = (rowId, val) => { let row = asnActiveRows.find(r => r.id === rowId); if(!row) return; if(val){ let parts = val.split('|'); row.teacherID = parts[0]; row.teacher = parts[1]; } else { row.teacherID = ""; row.teacher = ""; } };
window.asnOnRoomChange = (rowId, val) => { let row = asnActiveRows.find(r => r.id === rowId); if(!row) return; row.room = val; };

// 1. DYNAMIC MODAL GENERATOR 
// (Creates the UI popup safely without touching your HTML file)
function getAsnConfirmModal() {
    let modal = document.getElementById("asnConfirmModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.id = "asnConfirmModal";
        modal.innerHTML = `
        <div class="compose-modal" style="background: white; width: 90%; max-width: 350px; margin: auto; border-radius: 20px; padding: 30px; text-align: center; border: 1px solid var(--border-color); box-shadow: 0 20px 50px rgba(0,0,0,0.1);">
            <i id="asnConfirmIcon" class="fas fa-exclamation-triangle" style="font-size: 40px; margin-bottom: 15px;"></i>
            <h4 id="asnConfirmText" style="color: var(--text-dark); margin-bottom: 20px; line-height: 1.5; font-size:15px;">Confirm?</h4>
            <div style="display:flex; gap:10px;">
                <button onclick="document.getElementById('asnConfirmModal').classList.remove('active')" style="flex:1; padding:12px; border-radius:10px; border:1px solid #cbd5e1; background:white; color:#64748b; font-weight:bold; cursor:pointer;">Cancel</button>
                <button id="asnConfirmYesBtn" style="flex:1; padding:12px; border-radius:10px; border:none; background:var(--brand-red); color:white; font-weight:bold; cursor:pointer;">Confirm</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    return modal;
}

// 2. THE TRAFFIC COP (Matches C# Warning Logic)
let asnPendRowId = "";

window.asnRequestSplit = (rowId) => {
    let row = asnActiveRows.find(r => r.id === rowId); 
    if(!row) return;

    // Strict detection for Department-Level Splits (Matches Unity)
    let cleanCat = row.category.toUpperCase().replace(/\s+/g,"");
    let cleanSubj = row.subject ? row.subject.toUpperCase().replace(/\s+/g,"") : "";
    
    let isDeptSplit = cleanCat.includes("AECC") || cleanSubj.includes("AECC") ||
                      cleanCat.includes("MLD")  || cleanSubj.includes("MLD") ||
                      cleanCat.includes("VAC")  || cleanSubj.includes("VAC") ||
                      cleanCat.includes("MID")  || cleanSubj.includes("MID");

    asnPendRowId = rowId;
    
    let modal = getAsnConfirmModal();
    let txt = document.getElementById("asnConfirmText");
    let btnYes = document.getElementById("asnConfirmYesBtn");
    let icon = document.getElementById("asnConfirmIcon");

    if (row.isSplit) {
        icon.className = "fas fa-trash-alt";
        icon.style.color = "var(--brand-red)";
        btnYes.style.background = "var(--brand-red)";
        
        if (isDeptSplit) {
            txt.innerHTML = `Remove a batch for <b>${row.subject}</b>?<br><span style="font-size:12px; color:var(--text-muted); font-weight:normal;">You will need to reassign the departments in the next menu.</span>`;
        } else {
            txt.innerHTML = `Delete this batch for <b>${row.subject}</b>?<br><span style="font-size:12px; color:var(--text-muted); font-weight:normal;">Students will be intelligently re-distributed into the remaining batches.</span>`;
        }
        btnYes.innerText = "Delete Batch";
    } else {
        if (!row.subject || row.subject === "Select Subject" || row.subject === "Loading...") { 
            showRcToast("Select a subject first!"); 
            return; 
        }
        icon.className = "fas fa-cut";
        icon.style.color = "#f59e0b";
        btnYes.style.background = "#f59e0b";
        
        txt.innerHTML = `Divide students for <b>${row.subject}</b><br>into a new batch?`;
        btnYes.innerText = "Split Class";
    }
    
    btnYes.onclick = () => {
        modal.classList.remove("active");
        asnExecuteSplitAction();
    };
    
    modal.classList.add("active");
};

// 3. THE SPLIT/DELETE EXECUTOR
function asnExecuteSplitAction() {
    let row = asnActiveRows.find(r => r.id === asnPendRowId); 
    if(!row) return;

    let cleanCat = row.category.toUpperCase().replace(/\s+/g,"");
    let cleanSubj = row.subject ? row.subject.toUpperCase().replace(/\s+/g,"") : "";
    let isDeptSplit = cleanCat.includes("AECC") || cleanSubj.includes("AECC") ||
                      cleanCat.includes("MLD")  || cleanSubj.includes("MLD") ||
                      cleanCat.includes("VAC")  || cleanSubj.includes("VAC") ||
                      cleanCat.includes("MID")  || cleanSubj.includes("MID");

    if (row.isSplit) {
        // DELETE LOGIC
        asnActiveRows = asnActiveRows.filter(r => r.id !== row.id);
        let remRows = asnActiveRows.filter(r => r.period === row.period).sort((a,b) => a.splitIndex - b.splitIndex);
        remRows.forEach((r, idx) => { r.splitIndex = idx; if(idx === 0) r.isSplit = false; });
        asnRenderLayout();
        
        if (row.subject) {
            let newBatches = remRows.length;
            if (newBatches === 1) {
                showRcToast("Reverted to a single class.");
                getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", row.subject))).then(snap => {
                    let wb = writeBatch(db); // Safer fallback for DB deletion
                    snap.forEach(d => wb.delete(d.ref));
                    wb.commit();
                });
            } else {
                if (isDeptSplit) asnOpenDeptSplit(remRows[0], true);
                else {
                    showRcToast(`Re-balancing into ${newBatches} batches...`);
                    getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", row.subject))).then(snap => {
                        const wb = writeBatch(db); 
                        snap.forEach(d => wb.delete(d.ref)); 
                        wb.commit().then(() => asnExecuteDivideEvenly(row.subject, newBatches));
                    });
                }
            }
        }
    } else {
        // ADD LOGIC
        if (isDeptSplit) asnOpenDeptSplit(row, false); 
        else {
            let newIdx = asnActiveRows.filter(r => r.period === row.period && r.isSplit).length + 1; 
            asnActiveRows.push({ id: `r_${row.period}_${newIdx}_${Date.now()}`, period: row.period, splitIndex: newIdx, isSplit: true, category: row.category, subject: row.subject, teacher: "", teacherID: "", room: "" }); 
            asnRenderLayout(); 
            asnExecuteDivideEvenly(row.subject, newIdx + 1);
        }
    }
}

async function asnExecuteDivideEvenly(subject, totalBatches) {
    let allStudents = asnCachedYearStudents.map(s => s.id);
    let baseSize = Math.floor(allStudents.length / totalBatches); let remainder = allStudents.length % totalBatches;
    const wb = writeBatch(db); let cleanSub = subject.replace(/\s+/g, '').replace(/\//g, ''); let offset = 0;
    for(let i=0; i<totalBatches; i++){
        let size = baseSize + (i < remainder ? 1 : 0); let bStudents = allStudents.slice(offset, offset + size); offset += size; let bName = `Batch ${i+1}`; let docID = `BATCH_Sem${asnCurrentSem}_${cleanSub}_${bName.replace(/\s+/g,'')}`;
        wb.set(doc(db, "colleges", currentCollegeID, "subject_batches", docID), { batchName: bName, subjectName: subject, semester: asnCurrentSem, studentIDs: bStudents }, {merge: true});
    }
    await wb.commit();
    showRcToast(`Split Class evenly!`);
}

function asnOpenDeptSplit(row, isDeleting) {
    asnPendSplitRow = row; let sub = row.subject; 
    let students = asnCachedYearStudents; let uniqueDepts = new Set(); let studentToDept = {};
    
    students.forEach(s => {
        let isEnrolled = false;
        if(s.enrolledSubjects) { let semKey = "Semester_" + asnCurrentSem; let semSpace = "Semester " + asnCurrentSem; let map = s.enrolledSubjects[semKey] || s.enrolledSubjects[semSpace] || s.enrolledSubjects[asnCurrentSem]; if(map) { Object.values(map).forEach(v => { if(v.toString().trim() === sub.trim()) isEnrolled = true; }); } }
        if (isEnrolled) { let d = (s.Department || s.department || "Unknown").trim(); uniqueDepts.add(d); studentToDept[s.id] = d; }
    });
    
    if (uniqueDepts.size === 0) { showRcToast("No students enrolled in this subject."); return; }

    getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", sub))).then(snap => {
        let existingMap = {}; let existCount = snap.size;
        snap.forEach(d => { let bName = d.data().batchName; (d.data().studentIDs || []).forEach(sid => { if(studentToDept[sid]) existingMap[studentToDept[sid]] = bName; }); });
        
        let drop = document.getElementById("dsBatchCount"); 
        drop.innerHTML = `<option value="1">1 Batch (Unified)</option><option value="2">2 Batches</option><option value="3">3 Batches</option><option value="4">4 Batches</option><option value="5">5 Batches</option><option value="6">6 Batches</option>`;
        let targetCount = existCount > 0 ? existCount : 2; if(isDeleting && targetCount > 1) targetCount--; drop.value = targetCount;

        const renderDepts = () => {
            let count = parseInt(drop.value); let html = "";
            Array.from(uniqueDepts).forEach(d => {
                let opts = count === 1 ? `<option>Unified Class</option>` : Array.from({length:count}, (_,i)=>`<option value="Batch ${i+1}">Batch ${i+1}</option>`).join('') + `<option value="Exclude">Exclude</option>`;
                html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface); padding:10px 15px; border-radius:10px; border:1px solid var(--border-color);">
                    <span style="font-weight:bold; color:var(--text-dark); font-size:13px;">${d.replace('DEPT_','')}</span>
                    <select class="ds-dept-select" data-dept="${d}" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border-color); outline:none; font-family:'Poppins'; font-size:12px; font-weight:bold; color:var(--brand-red); background:white;" ${count===1?'disabled':''}>${opts}</select>
                </div>`;
            });
            document.getElementById("dsDeptList").innerHTML = html;
            if(count > 1) { document.querySelectorAll(".ds-dept-select").forEach(s => { let d = s.dataset.dept; if(existingMap[d]) { let idx = Array.from(s.options).findIndex(o=>o.value===existingMap[d]); if(idx>=0) s.selectedIndex = idx; } }); }
        };
        drop.onchange = renderDepts; renderDepts();
        document.getElementById("btnConfirmDeptSplit").onclick = () => asnConfirmDeptSplit(sub, uniqueDepts, studentToDept);
        document.getElementById("deptSplitOverlay").classList.add("active");
    });
}

async function asnConfirmDeptSplit(subject, uniqueDepts, studentToDept) {
    let totalBatches = parseInt(document.getElementById("dsBatchCount").value); 
    let cleanSub = subject.replace(/\s+/g, '').replace(/\//g, '');
    
    if (totalBatches > 1) {
        let selectedBatches = new Set();
        document.querySelectorAll(".ds-dept-select").forEach(s => { if (s.value !== "Exclude") selectedBatches.add(s.value); });
        for (let i = 1; i <= totalBatches; i++) {
            if (!selectedBatches.has(`Batch ${i}`)) { showRcToast(`⚠️ Please assign at least one department to Batch ${i}!`); return; }
        }
    }

    document.getElementById("deptSplitOverlay").classList.remove("active"); 
    showRcToast("Saving configurations...");
    
    if (totalBatches === 1) {
        const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", subject)));
        const wb = writeBatch(db); snap.forEach(d => wb.delete(d.ref)); await wb.commit();
        asnActiveRows = asnActiveRows.filter(r => !(r.period === asnPendSplitRow.period && r.isSplit)); let mRow = asnActiveRows.find(r => r.period === asnPendSplitRow.period); if(mRow) { mRow.isSplit = false; mRow.splitIndex = 0; }
        asnRenderLayout(); return;
    }

    let batchMap = {}; for(let i=1; i<=totalBatches; i++) batchMap[`Batch ${i}`] = [];
    document.querySelectorAll(".ds-dept-select").forEach(s => { let val = s.value; if(val !== "Exclude") { Object.keys(studentToDept).forEach(sid => { if(studentToDept[sid] === s.dataset.dept) batchMap[val].push(sid); }); } });

    const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", asnCurrentSem), where("subjectName", "==", subject)));
    const wb = writeBatch(db); snap.forEach(d => wb.delete(d.ref));
    for(let i=1; i<=totalBatches; i++) { wb.set(doc(db, "colleges", currentCollegeID, "subject_batches", `BATCH_Sem${asnCurrentSem}_${cleanSub}_Batch${i}`), { batchName: `Batch ${i}`, subjectName: subject, semester: asnCurrentSem, studentIDs: batchMap[`Batch ${i}`] }, {merge:true}); }
    await wb.commit();

    let existingCount = asnActiveRows.filter(r => r.period === asnPendSplitRow.period).length;
    if (totalBatches > existingCount) { for(let i=existingCount; i<totalBatches; i++) asnActiveRows.push({ id: `r_${asnPendSplitRow.period}_${i}_${Date.now()}`, period: asnPendSplitRow.period, splitIndex: i, isSplit: true, category: asnPendSplitRow.category, subject: subject, teacher: "", teacherID: "", room: "" }); }
    else if (totalBatches < existingCount) { asnActiveRows = asnActiveRows.filter(r => r.period !== asnPendSplitRow.period || r.splitIndex < totalBatches); }
    asnRenderLayout(); showRcToast(`Saved as ${totalBatches} batches!`);
}

async function asnSaveTimetable() {
    let btn = document.getElementById("btnAsnSave"); 
    btn.innerText = "Saving..."; 
    btn.disabled = true;
    
    let tMap = {}; 
    let conflict = false;
    
    asnActiveRows.forEach(r => {
        let elTea = document.getElementById(`tea_${r.id}`);
        let elSub = document.getElementById(`sub_${r.id}`);
        let elCat = document.getElementById(`cat_${r.id}`);
        
        let currentTeachVal = elTea ? elTea.value : "";
        let currentSubject = elSub ? elSub.value : r.subject;
        let currentCategory = elCat ? elCat.value : r.category;
        
        if(currentSubject && currentTeachVal && currentTeachVal !== "Unassigned") {
            let tName = currentTeachVal.split('|')[1];
            if(!tMap[r.period]) tMap[r.period] = {};
            
            if(tMap[r.period][tName]) { 
                let eSub = tMap[r.period][tName]; 
                let cleanCat = currentCategory.toUpperCase().replace(/\s+/g,"");
                let cleanSubj = currentSubject.toUpperCase().replace(/\s+/g,"");
                let isVac3 = cleanCat.includes("VAC3") || cleanSubj.includes("VAC3"); 
                
                if(!isVac3 || eSub !== currentSubject) conflict = true; 
            } else {
                tMap[r.period][tName] = currentSubject;
            }
        }
    });
    
    if(conflict) { 
        showRcToast("⚠️ Save Failed: Teacher assigned multiple times in same period!"); 
        btn.innerText = "Save Timetable"; 
        btn.disabled = false; 
        return; 
    }

    let safeHodDept = teacherDeptRaw.startsWith("DEPT_") ? teacherDeptRaw : `DEPT_${teacherDeptRaw.replace(/\s+/g,"")}`;
    
    showRcToast("Cleaning old timetable data...");
    
    try {
        const snap = await getDocs(query(
            collection(db, "colleges", currentCollegeID, "timetable_allocations"), 
            where("semester", "==", asnCurrentSem), 
            where("day", "==", asnSelectedDay), 
            where("departmentID", "==", safeHodDept)
        ));
        
        let wipeBatch = writeBatch(db); 
        snap.forEach(d => wipeBatch.delete(d.ref));
        await wipeBatch.commit();

        let saveBatch = writeBatch(db);
        let entriesSaved = 0;

        for (let r of asnActiveRows) {
            let elCat = document.getElementById(`cat_${r.id}`);
            let elSub = document.getElementById(`sub_${r.id}`);
            let elTea = document.getElementById(`tea_${r.id}`);
            let elRoom = document.getElementById(`rm_${r.id}`);

            let category = elCat ? elCat.value : r.category;
            let subjectName = elSub ? elSub.value : r.subject;
            let teacherVal = elTea ? elTea.value : "";
            let room = elRoom ? elRoom.value.trim() : r.room;

            if (subjectName && teacherVal && teacherVal !== "Unassigned") {
                let parts = teacherVal.split('|');
                let teacherID = parts[0];
                let teacherName = parts[1];

                let safeSubj = subjectName.replace(/\s+/g, '').replace(/\//g, ''); 
                
                let isCom = !asnActiveRows.some(x => x.period === r.period && x.isSplit);
                let sIdxStr = !isCom ? r.splitIndex.toString() : "0";

                let docID = `Sem${asnCurrentSem}_${asnSelectedDay}_P${r.period}_${sIdxStr}_${safeSubj}`;
                let docRef = doc(db, "colleges", currentCollegeID, "timetable_allocations", docID);

                let saveData = {
                    semester: asnCurrentSem, 
                    day: asnSelectedDay, 
                    period: r.period.toString(), 
                    category: category, 
                    subjectName: subjectName, 
                    teacherName: teacherName, 
                    teacherID: teacherID, 
                    departmentID: safeHodDept, 
                    room: room
                };

                if (isCom) {
                    saveData.isCommon = true;
                } else {
                    saveData.isCommon = false;
                    saveData.splitIndex = sIdxStr; 
                }

                saveBatch.set(docRef, saveData, { merge: true });
                entriesSaved++;

                if (!isCom) {
                    let batchNumber = parseInt(sIdxStr) + 1;
                    let bDoc = `BATCH_Sem${asnCurrentSem}_${safeSubj}_Batch${batchNumber}`;
                    let batchRef = doc(db, "colleges", currentCollegeID, "subject_batches", bDoc);
                    
                    saveBatch.set(batchRef, {
                        teacherName: teacherName,
                        teacherID: teacherID,
                        room: room
                    }, { merge: true });
                    entriesSaved++;
                }
            }
        }

        if (entriesSaved > 0) {
            await saveBatch.commit();
            showRcToast("Successfully Saved Timetable!");
        } else {
            showRcToast("No active schedules found to register.");
        }
        
        // Removed the line that kicked the user back to the main view here
        
    } catch(e) {
        console.error("Timetable Batch Commit Failed:", e);
        showRcToast("Database write rejection. Verify permissions.");
    } finally {
        btn.innerText = "Save Timetable"; 
        btn.disabled = false;
    }
}

// ==========================================
// 🚨 HOD DATA EXPORT ENGINE (C# TRANSLATION)
// ==========================================
let expDeptName = "";
let expIsProcessing = false;

// 1. Initialize the button click listener
document.getElementById("btnOpenExport")?.addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("active");
    document.getElementById("exportDataModal").classList.add("active");
});

document.getElementById("btnExecuteExport")?.addEventListener("click", executeDataExport);

// 2. Hook into your existing Profile Engine to setup the HOD details
// Add this call inside your `finalizeProfileUI` function right after setting `isHOD`:
// if (isHOD) { setupExportEngine(); }
async function setupExportEngine() {
    let btn = document.getElementById("btnOpenExport");
    if (!btn) return;

    try {
        let safeDeptId = teacherDeptRaw.startsWith("DEPT_") ? teacherDeptRaw : `DEPT_${teacherDeptRaw.replace(/\s+/g,"")}`;
        const snap = await getDoc(doc(db, "colleges", currentCollegeID, "departments", safeDeptId));
        
        if (snap.exists()) {
            expDeptName = snap.data().name || "";
            let maxYears = snap.data().maxYears ? parseInt(snap.data().maxYears) : 3;
            
            document.getElementById("exportDeptNameText").innerText = expDeptName;
            
            let semDrop = document.getElementById("exportSemDrop");
            semDrop.innerHTML = "";
            for (let i = 1; i <= maxYears * 2; i++) {
                semDrop.innerHTML += `<option value="${i}">Semester ${i}</option>`;
            }
            
            btn.style.display = "flex"; // Reveal the button in settings
        }
    } catch (e) {
        console.error("Export Setup Error:", e);
    }
}

// 3. The Main Executor
async function executeDataExport() {
    if (expIsProcessing) return;
    
    let btn = document.getElementById("btnExecuteExport");
    let semNum = document.getElementById("exportSemDrop").value;
    let reportType = parseInt(document.getElementById("exportTypeDrop").value);
    
    expIsProcessing = true;
    btn.innerText = "Processing...";
    btn.disabled = true;
    btn.style.opacity = "0.7";
    showRcToast(`Fetching ${expDeptName} Students...`);

    let yearNum = Math.ceil(parseInt(semNum) / 2).toString();

    try {
        // Fetch Students exactly like C#
        let stuSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), 
            where("Department", "==", expDeptName), 
            where("Year", "==", yearNum)));

        if (stuSnap.empty) {
            stuSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), 
                where("department", "==", expDeptName), 
                where("Year", "==", yearNum)));
        }

        if (stuSnap.empty) {
            showRcToast(`No students found for Year ${yearNum}.`);
            resetExportBtn(btn);
            return;
        }

        let students = [];
        stuSnap.forEach(d => students.push({ id: d.id, ...d.data() }));

        showRcToast("Generating CSV Data...");
        let csvContent = "";

        if (reportType === 0) csvContent = await generateNepMarksCSV(students, semNum);
        else if (reportType === 1) csvContent = await generateNepAttendanceStatsCSV(students, semNum);
        else csvContent = await generateDailyLogsCSV(students, semNum);

        if (!csvContent) {
            showRcToast("No data found for this semester to export.");
        } else {
            downloadCSVFile(csvContent, reportType, semNum);
            showRcToast("Success! File Downloaded.");
            document.getElementById("exportDataModal").classList.remove("active");
        }
    } catch (e) {
        console.error("Export Failed:", e);
        showRcToast("Export Failed! Check console.");
    }

    resetExportBtn(btn);
}

function resetExportBtn(btn) {
    expIsProcessing = false;
    btn.innerText = "Download CSV";
    btn.disabled = false;
    btn.style.opacity = "1";
}

// 4. CSV GENERATOR: NEP MARKS (Highly Optimized Chunked Fetch)
async function generateNepMarksCSV(students, sem) {
    let globalData = {};
    let semKey = `Semester ${sem}`;
    let marksSnapshots = [];
    const CHUNK_SIZE = 30; // 🚀 OPTIMIZATION: Safe batching limit

    // Fetch in chunks to prevent Firebase connection throttling and RAM spikes
    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
        let chunk = students.slice(i, i + CHUNK_SIZE);
        let fetchPromises = chunk.map(s => 
            getDoc(doc(db, "colleges", currentCollegeID, "students", s.id, "nep_marks", semKey))
        );
        let chunkResults = await Promise.all(fetchPromises);
        marksSnapshots.push(...chunkResults);
    }

    for (let i = 0; i < students.length; i++) {
        let student = students[i];
        let snap = marksSnapshots[i];

        if (snap.exists()) {
            let data = snap.data();
            for (let subject in data) {
                let exams = data[subject];
                for (let examName in exams) {
                    let stats = exams[examName];

                    if (!globalData[examName]) globalData[examName] = {};
                    if (!globalData[examName][subject]) globalData[examName][subject] = {};

                    globalData[examName][subject][student.id] = {
                        Obtained: stats.total || 0,
                        Max: stats.max !== undefined ? stats.max : 50,
                        Test: stats.test || 0,
                        Assign: stats.assign || 0,
                        Att: stats.att || 0
                    };
                }
            }
        }
    }

    if (Object.keys(globalData).length === 0) return "";

    let sb = [];
    Object.keys(globalData).sort().forEach(examName => {
        sb.push(`\n===== EXAM: ${examName} =====,,,,,,,,,`);
        
        let subjectsMap = globalData[examName];
        Object.keys(subjectsMap).sort().forEach(subject => {
            sb.push(`\n--- SUBJECT: ${subject} ---,,,,,,,,,`);
            sb.push("Roll No,Name,Obtained,Max,Test,Assignment,Attendance,Status");

            students.sort((a,b) => a.id.localeCompare(b.id)).forEach(student => {
                let roll = student.id;
                let name = `"${(student.Name || student.studentName || "").replace(/"/g, '""')}"`;
                
                if (subjectsMap[subject][roll]) {
                    let s = subjectsMap[subject][roll];
                    sb.push(`${roll},${name},${s.Obtained},${s.Max},${s.Test},${s.Assign},${s.Att},Present`);
                } else {
                    sb.push(`${roll},${name},Nil,--,--,--,--,Not Entered`);
                }
            });
        });
        sb.push("");
    });

    return sb.join("\n");
}

// 5. CSV GENERATOR: ATTENDANCE STATS
async function generateNepAttendanceStatsCSV(students, sem) {
    let semKey = `Semester_${sem}`;
    let enrolledSemKey = `Semester ${sem}`;
    let allSubjects = new Set();
    let electiveSubjects = new Set();

    students.forEach(student => {
        if (student.attendance_stats && student.attendance_stats[semKey]) {
            Object.keys(student.attendance_stats[semKey]).forEach(sub => {
                if (sub !== "Strict_Global") allSubjects.add(sub);
            });
        }
        if (student.enrolledSubjects && student.enrolledSubjects[enrolledSemKey]) {
            Object.values(student.enrolledSubjects[enrolledSemKey]).forEach(val => {
                electiveSubjects.add(val.toString());
            });
        }
    });

    if (allSubjects.size === 0) return "";
    let sb = [];

    sb.push("===== OVERALL ATTENDANCE DATA =====,,,,");
    sb.push("Roll No,Name,Total Attended,Total Conducted,Overall Percentage");

    students.sort((a,b) => a.id.localeCompare(b.id)).forEach(student => {
        let roll = student.id;
        let name = `"${(student.Name || student.studentName || "").replace(/"/g, '""')}"`;
        let totalPresent = 0;
        let totalConducted = 0;

        if (student.attendance_stats && student.attendance_stats[semKey]) {
            let subjects = student.attendance_stats[semKey];
            for (let sub in subjects) {
                if (sub === "Strict_Global") continue;
                totalPresent += parseFloat(subjects[sub].present || 0);
                totalConducted += parseFloat(subjects[sub].total || 0);
            }
        }
        let pct = totalConducted > 0 ? ((totalPresent / totalConducted) * 100).toFixed(2) + "%" : "0.00%";
        sb.push(`${roll},${name},${totalPresent},${totalConducted},${pct}`);
    });

    sb.push("\n");

    Array.from(allSubjects).sort().forEach(subject => {
        sb.push(`\n--- SUBJECT: ${subject} ---,,,,`);
        sb.push("Roll No,Name,Present,Total,Percentage");

        let isElective = electiveSubjects.has(subject);

        students.sort((a,b) => a.id.localeCompare(b.id)).forEach(student => {
            let roll = student.id;
            let name = `"${(student.Name || student.studentName || "").replace(/"/g, '""')}"`;
            let hasData = false;
            let isEnrolledInSubject = false;

            if (!isElective) {
                isEnrolledInSubject = true;
            } else {
                if (student.enrolledSubjects && student.enrolledSubjects[enrolledSemKey]) {
                    if (Object.values(student.enrolledSubjects[enrolledSemKey]).includes(subject)) {
                        isEnrolledInSubject = true;
                    }
                }
            }

            if (student.attendance_stats && student.attendance_stats[semKey] && student.attendance_stats[semKey][subject]) {
                let s = student.attendance_stats[semKey][subject];
                let p = parseFloat(s.present || 0);
                let t = parseFloat(s.total || 0);
                let pct = t > 0 ? ((p / t) * 100).toFixed(2) + "%" : "0.00%";
                sb.push(`${roll},${name},${p},${t},${pct}`);
                hasData = true;
            }

            if (!hasData && isEnrolledInSubject) {
                sb.push(`${roll},${name},Nil,Nil,0.00%`);
            }
        });
    });

    return sb.join("\n");
}

// 6. CSV GENERATOR: DAILY LOGS (Optimized)
async function generateDailyLogsCSV(students, sem) {
    let sb = ["Date,Semester,Roll No,Name,P1,P2,P3,P4,P5,P6,Daily Status"];
    let validLogs = [];

    // Optimized Fetch matching C#
    const snap = await getDocs(query(collection(db, "colleges", currentCollegeID, "attendance"), where("semester", "==", `Semester ${sem}`)));
    
    if (!snap.empty) {
        snap.forEach(doc => {
            if (!doc.id.includes("_GLOBAL") && !doc.id.includes("_EVENTS")) validLogs.push({ id: doc.id, ...doc.data() });
        });
    }

    if (validLogs.length === 0) return "";

    let groupedLogs = {};
    validLogs.forEach(doc => {
        let parts = doc.id.split('_');
        let key = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : doc.id;
        if (!groupedLogs[key]) groupedLogs[key] = [];
        groupedLogs[key].push(doc);
    });

    Object.keys(groupedLogs).sort().forEach(groupKey => {
        let keyParts = groupKey.split('_');
        let dateStr = keyParts[0];
        let semStr = keyParts.length > 1 ? keyParts[1] : "";
        let dailyData = groupedLogs[groupKey];

        students.sort((a,b) => a.id.localeCompare(b.id)).forEach(student => {
            let r = student.id;
            let name = `"${(student.Name || student.studentName || "").replace(/"/g, '""')}"`;
            let p = ["-", "-", "-", "-", "-", "-"];

            dailyData.forEach(data => {
                for (let i = 1; i <= 6; i++) {
                    if (p[i-1] === "-") p[i-1] = checkNepPeriod(data, `period_${i}`, r);
                }
            });

            let present = p.includes("P");
            let status = present ? "Present" : "Absent";

            sb.push(`${dateStr},${semStr},${r},${name},${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},${status}`);
        });
        
        sb.push(",,,,,,,,,,"); // Spacer
        sb.push("----------,----------,----------,----------,----------,----------,----------,----------,----------,----------,----------");
    });

    return sb.join("\n");
}

function checkNepPeriod(data, periodKey, rollNo) {
    if (data[periodKey] && data[periodKey].attendance && data[periodKey].attendance[rollNo] !== undefined) {
        return data[periodKey].attendance[rollNo] === true ? "P" : "A";
    }
    return "-";
}

// 7. SECURE BROWSER FILE DOWNLOADER
function downloadCSVFile(csvContent, type, sem) {
    let typeName = type === 0 ? "Marks" : (type === 1 ? "Stats" : "DailyLogs");
    let safeDept = expDeptName ? expDeptName.replace(/\s+/g, "") : "Dept";
    
    // Formatting timestamp: yyyyMMdd_HHmmss
    let now = new Date();
    let timeStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    let fileName = `${safeDept}_${typeName}_Sem${sem}_${timeStr}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    
    // Create an invisible download link and click it
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// 🚨 COMPOSE & MESSAGING ENGINE
// ==========================================
let composeIsPrivate = false;
let composeRecipientID = "";
let composeFCMTokens = [];

// RAM Cache for Departments (Matches C# cachedDepartments)
let composeCachedDepartments = [];

// 1. Bind Buttons (Clean contextual binding for Inbox sub-items only)
document.getElementById("btnOpenInboxCompose")?.addEventListener("click", () => window.OpenCompose(false));

// Dynamic UI Toggles (Matches C# OnToggleChanged)
function updateComposeUI() {
    let sendT = document.getElementById("chkSendTeachers").checked;
    let sendS = document.getElementById("chkSendStudents").checked;
    
    let deptDrop = document.getElementById("composeDeptDrop");
    let yearDrop = document.getElementById("composeYearDrop");

    deptDrop.style.display = (sendT || sendS) ? "block" : "none";
    yearDrop.style.display = sendS ? "block" : "none";
}

document.getElementById("chkSendTeachers")?.addEventListener("change", updateComposeUI);
document.getElementById("chkSendStudents")?.addEventListener("change", updateComposeUI);
document.getElementById("chkSendPrincipal")?.addEventListener("change", updateComposeUI);

// Dynamic Max Years Toggle (Matches C# OnDeptChanged)
document.getElementById("composeDeptDrop")?.addEventListener("change", () => {
    let deptDrop = document.getElementById("composeDeptDrop");
    let yearDrop = document.getElementById("composeYearDrop");
    if (!deptDrop || !yearDrop) return;

    let maxYears = 4; // Default fallback
    let selectedOpt = deptDrop.options[deptDrop.selectedIndex];
    
    if (selectedOpt && selectedOpt.hasAttribute("data-max")) {
        maxYears = parseInt(selectedOpt.getAttribute("data-max"));
    }

    let yHtml = `<option value="All">All Years</option>`;
    for(let i = 1; i <= maxYears; i++) {
        yHtml += `<option value="Year ${i}">Year ${i}</option>`;
    }
    yearDrop.innerHTML = yHtml;
});

// 2. Open Modal Logic
window.OpenCompose = async (isPrivate, recipientName = "", fcmTokens = [], recipientID = "") => {
    composeIsPrivate = isPrivate;
    composeFCMTokens = fcmTokens;
    composeRecipientID = recipientID;

    let broadcastUI = document.getElementById("composeBroadcastUI");
    let privateTarget = document.getElementById("composePrivateTarget");
    
    document.getElementById("composeTitle").value = "";
    document.getElementById("composeBody").value = "";

    if (isPrivate) {
        // Locked to private chat UI
        broadcastUI.style.display = "none";
        privateTarget.style.display = "block";
        privateTarget.value = recipientName;
    } else {
        // Standard Broadcast UI
        broadcastUI.style.display = "block";
        privateTarget.style.display = "none";
        
        // Reset Checkboxes (Default Off)
        document.getElementById("chkSendPrincipal").checked = false;
        document.getElementById("chkSendTeachers").checked = false;
        document.getElementById("chkSendStudents").checked = false;
        updateComposeUI();
        
        // Fetch Departments dynamically
        let deptDrop = document.getElementById("composeDeptDrop");
        
        if (composeCachedDepartments.length === 0) {
            try {
                const snap = await getDocs(collection(db, "colleges", currentCollegeID, "departments"));
                snap.forEach(d => {
                    let data = d.data();
                    let name = data.name || d.id;
                    let max = data.maxYears ? parseInt(data.maxYears) : 3;
                    composeCachedDepartments.push({ id: d.id, name: name, maxYears: max });
                });
                composeCachedDepartments.sort((a, b) => a.name.localeCompare(b.name));
            } catch(e) { console.error("Failed to load departments:", e); }
        }

        // Populate Dropdown
        let html = `<option value="All" data-max="4">All Departments</option>`;
        if (teacherDeptRaw) {
            html += `<option value="My Dept" data-max="4">My Dept (${teacherDeptRaw.replace("DEPT_", "")})</option>`;
        }
        
        composeCachedDepartments.forEach(d => {
            html += `<option value="${d.name}" data-max="${d.maxYears}">${d.name}</option>`;
        });
        
        deptDrop.innerHTML = html;
        
        // Force the Year dropdown to update based on the default selection
        deptDrop.dispatchEvent(new Event("change"));
    }

    document.getElementById("composeMessageModal").classList.add("active");
};

// 3. Execution & Firestore Write Logic
document.getElementById("btnSendMessage")?.addEventListener("click", async () => {
    let btn = document.getElementById("btnSendMessage");
    let title = document.getElementById("composeTitle").value.trim();
    let body = document.getElementById("composeBody").value.trim();
    
    if (!title || !body) {
        showRcToast("Please enter a title and message!");
        return;
    }

    btn.innerText = "Sending...";
    btn.disabled = true;
    btn.style.opacity = "0.7";

    let safeSenderRole = "Teacher"; 
    let displaySenderName = isHOD ? `${currentTeacherName} (HOD)` : currentTeacherName;

    try {
        if (composeIsPrivate && composeRecipientID) {
            // Private message implementation
            let targetName = document.getElementById("composePrivateTarget").value;
            await sendPrivateMessageToDatabase(title, body, composeRecipientID, targetName, safeSenderRole, displaySenderName);
            if (composeFCMTokens && composeFCMTokens.length > 0) {
                sendPushNotification(title, body, composeFCMTokens, null);
            }
        } else {
            let sendP = document.getElementById("chkSendPrincipal").checked;
            let sendT = document.getElementById("chkSendTeachers").checked;
            let sendS = document.getElementById("chkSendStudents").checked;

            if (!sendP && !sendT && !sendS) {
                showRcToast("Please select at least one recipient group!");
                btn.innerText = "Send Message"; btn.disabled = false; btn.style.opacity = "1";
                return;
            }

            if (sendP && !sendT && !sendS) {
                const prinSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "principals"), limit(1)));
                if (prinSnap.empty) {
                    showRcToast("Error: Principal profile not found.");
                    btn.innerText = "Send Message"; btn.disabled = false; btn.style.opacity = "1";
                    return;
                }
                let prinID = prinSnap.docs[0].id;
                let prinName = prinSnap.docs[0].data().name || "Principal";
                await sendPrivateMessageToDatabase(title, body, prinID, prinName, safeSenderRole, displaySenderName);
                let safeColID = getSafeTopic(currentCollegeID);
                sendPushNotification(title, body, null, [`${safeColID}_PRINCIPAL`]);
            } else {
                let deptVal = document.getElementById("composeDeptDrop").value;
                let yearVal = document.getElementById("composeYearDrop").value;
                let actualDeptName = deptVal === "My Dept" ? teacherDeptRaw.replace("DEPT_", "") : deptVal;
                let actualYear = yearVal;
                let safeColID = getSafeTopic(currentCollegeID);
                let safeDept = getSafeTopic(actualDeptName);
                let safeYear = getSafeTopic(yearVal);
                let targetDescription = "";
                let topicsToPing = [];

                if (sendP) { topicsToPing.push(`${safeColID}_PRINCIPAL`); targetDescription += "Principal"; }
                if (sendT) {
                    topicsToPing.push(`${safeColID}_TEACHERS_${safeDept}`);
                    if (targetDescription !== "") targetDescription += " & ";
                    targetDescription += (actualDeptName === "All") ? "Teachers (All)" : `Teachers (${actualDeptName})`;
                }
                if (sendS) {
                    topicsToPing.push(`${safeColID}_STUDENTS_${safeDept}_${safeYear}`);
                    if (targetDescription !== "") targetDescription += " & ";
                    if (actualDeptName === "All" && actualYear === "All") targetDescription += "All Students";
                    else if (actualDeptName === "All") targetDescription += `Students (All Depts - ${actualYear})`;
                    else if (actualYear === "All") targetDescription += `Students (${actualDeptName} - All Years)`;
                    else targetDescription += `Students (${actualDeptName} - ${actualYear})`;
                }

                let payload = {
                    title: title, body: body, targetSummary: targetDescription,
                    timestamp: serverTimestamp(), type: "broadcast", status: "sent",
                    senderRole: safeSenderRole, senderID: currentUserID, senderName: displaySenderName
                };
                await addDoc(collection(db, "colleges", currentCollegeID, "sent_messages"), payload);
                if (topicsToPing.length > 0) sendPushNotification(title, body, null, topicsToPing);
            }
        }
        showRcToast("Message Sent Successfully!");
        document.getElementById("composeMessageModal").classList.remove("active");
    } catch (e) {
        console.error("Error sending message: ", e);
        showRcToast("Failed to send message.");
    } finally {   // <--- Change this line
        btn.innerText = "Send Message"; btn.disabled = false; btn.style.opacity = "1";
    }
});

// 🚨 NEW HELPER: Reusable Private Message Writer
async function sendPrivateMessageToDatabase(title, body, targetID, targetName, safeSenderRole, displaySenderName) {
    let chatRoomID = [currentUserID, targetID].sort().join("_");
    let chatRef = doc(db, "colleges", currentCollegeID, "chats", chatRoomID);
    let batch = writeBatch(db);
    batch.set(chatRef, { participants: [currentUserID, targetID], lastMessage: body, lastUpdated: serverTimestamp(), receiverName: targetName }, { merge: true });
    let msgRef = doc(collection(chatRef, "messages"));
    batch.set(msgRef, { title: title, body: body, senderID: currentUserID, senderName: displaySenderName, senderRole: safeSenderRole, timestamp: serverTimestamp(), type: "incoming", status: "sent" });
    let historyRef = doc(collection(db, "colleges", currentCollegeID, "sent_messages"));
    batch.set(historyRef, { title: title, body: body, targetSummary: `Personal: ${targetName}`, timestamp: serverTimestamp(), type: "personal", status: "sent", linkedChatID: chatRoomID, linkedMessageID: msgRef.id, senderRole: safeSenderRole, senderID: currentUserID, senderName: displaySenderName });
    await batch.commit();
}

// 4. WEBHOOK EXECUTOR
// 🚨 FIX 1: Added 'customType' parameter (defaults to "chat")
function sendPushNotification(title, body, tokens, topics, customType = "chat") {
    let finalTitle = `${title} • ${currentTeacherName} (Teacher)`;
    let iconUrl = "https://raw.githubusercontent.com/Pixelaks/pixelaks.in/80f18d76be90054cccf1b1ddd5d04d8282635b59/AdhyoraRedSplashIcon.png";
    
    // 🚨 FIX 2: Apply the customType to the payload
    let payload = { title: finalTitle, body: body, image: iconUrl, type: customType, priority: "high" };
    
    if (tokens && tokens.length > 0) payload.tokens = tokens;
    else if (topics && topics.length > 0) payload.topics = topics;
    
    fetch("https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec", { 
        method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) 
    }).catch(e => console.log("Push notification skipped.", e));
}

// ==========================================
// 🚨 NOTIFICATION PERMISSIONS & TOGGLE
// ==========================================

// 1. Update Visual Switch
function updateNotificationToggleUI() {
    const toggle = document.getElementById("notifToggleSwitch");
    if (!toggle) return;
    
    if (Notification.permission === "granted" && myCurrentPushToken !== "") {
        toggle.classList.add("active");
    } else {
        toggle.classList.remove("active");
    }
}

// 2. Safely Destroy Token (Opt-Out)
async function unsubscribePushNotifications() {
    try {
        const toggle = document.getElementById("notifToggleSwitch");
        toggle.style.opacity = "0.5"; 

        // Tell Firebase to delete this browser's notification link
        await deleteToken(messaging);

        // Remove the token from Firestore Database
        if (myCurrentPushToken && currentUserID && currentCollegeID) {
            const teacherRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
            await setDoc(teacherRef, {
                webFcmTokens: arrayRemove(myCurrentPushToken)
            }, { merge: true });
        }
        
        myCurrentPushToken = ""; 
        console.log("Successfully unsubscribed from notifications.");
        
        toggle.style.opacity = "1";
        updateNotificationToggleUI();
    } catch (e) {
        console.error("Error unsubscribing:", e);
        alert("Failed to turn off notifications. Please try again.");
    }
}

// 3. UI Click Handler
document.getElementById("btnToggleNotifications")?.addEventListener("click", async () => {
    if (Notification.permission === "denied") {
        alert("Notifications are blocked by your browser. Please click the lock icon in your address bar to allow them.");
        return;
    }

    const toggle = document.getElementById("notifToggleSwitch");
    
    if (toggle.classList.contains("active")) {
        if (confirm("Are you sure you want to disable notifications for this device?")) {
            await unsubscribePushNotifications();
        }
    } else {
        toggle.style.opacity = "0.5";
        await requestPushPermissions();
        toggle.style.opacity = "1";
    }
});

// 4. Permission Request & Webhook Registration (コスト最適化版)
async function requestPushPermissions() {
    try {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            // Explicitly use the root service worker route to match dev tools setup
            const swRegistration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
            
            const currentToken = await getToken(messaging, { 
                vapidKey: "BNO8RVA-R1iOy19P2rbVYPBzlCSnptpq13ybtqqO0IgHhDOXhkauOXEWm2hGN6yIUz2_fHL-Iv7IG9cpRZv2YkU",
                serviceWorkerRegistration: swRegistration 
            });

            if (currentToken) {
                console.log("Web Push Token Generated:", currentToken);
                myCurrentPushToken = currentToken; 

                // Direct collection document mapping to avoid reading outdated cache streams
                const teacherRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
                const tSnap = await getDoc(teacherRef);
                
                let activeTokens = [];
                if (tSnap.exists() && tSnap.data().webFcmTokens) {
                    activeTokens = tSnap.data().webFcmTokens;
                }

                // Clean old instances and cap the array at a maximum of 3 web locations
                activeTokens = activeTokens.filter(t => t !== currentToken);
                activeTokens.push(currentToken);
                if (activeTokens.length > 3) {
                    activeTokens = activeTokens.slice(activeTokens.length - 3);
                }

                // 🚨 BULLETPROOF FALLBACK: Write directly with an isolated setDoc layout
                await setDoc(teacherRef, { 
                    webFcmTokens: activeTokens,
                    lastWebLogin: serverTimestamp()
                }, { merge: true });
                
                console.log("Token synced into Firestore collection doc successfully.");

                // 🚨 LOOPHOLE SYNC: Push the web worker token straight up to native FCM maps
                let safeCol = getSafeTopic(currentCollegeID);
                let safeDept = getSafeTopic(teacherDeptRaw);

                let topicsToJoin = [
                    `${safeCol}_ALL`, 
                    `${safeCol}_TEACHERS_ALL`, 
                    `${safeCol}_TEACHERS_${safeDept}`, 
                    `ADHYORA_GLOBAL_USERS`
                ];

                const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVL1MGATuPxN4cmAkWbd8GsY5YaoWBkyVTkjfDV-f4jJrWBnMvZ-gXdMZU5pnhHmlPHw/exec";

                fetch(APPS_SCRIPT_URL, {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "subscribe",
                        token: currentToken,
                        topics: topicsToJoin
                    })
                }).then(() => {
                    console.log("✅ Loophole Complete: Teacher Dashboard bound to Native Topics!");
                    updateNotificationToggleUI();
                }).catch(err => console.error("Apps Script Hook Rejected:", err));
            } else {
                console.warn("FCM registration returned blank. Verify cloud configuration files.");
            }
        } else {
            console.log('Notification permissions withheld by client UI.');
        }
    } catch (error) {
        console.error('Error getting push token:', error);
    }
}

// ==========================================
// 🚨 NOTIFICATION CLICK ROUTER 🚨
// ==========================================

// 1. If the app is open in the background (Service Worker message handler):
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'openMessages') {
        document.getElementById("btnMessages")?.click();
    } 
    else if (event.data && event.data.action === 'openNotifications') {
        document.getElementById("btnNotifications")?.click();
    }
    else if (event.data && event.data.action === 'openEventReq') {
        document.getElementById("btnNavEventAttendance")?.click();
    }
});

// 2. If the app was completely closed (Hash router on boot):
window.addEventListener('load', () => {
    // Check for Inbox requests
    if (window.location.hash === "#inbox" || localStorage.getItem("pendingInboxOpen") === "true") {
        localStorage.removeItem("pendingInboxOpen");
        setTimeout(() => document.getElementById("btnMessages")?.click(), 1500); 
    }
    // Check for Admin Notification requests
    if (window.location.hash === "#notifications" || localStorage.getItem("pendingNotifOpen") === "true") {
        localStorage.removeItem("pendingNotifOpen");
        setTimeout(() => document.getElementById("btnNotifications")?.click(), 1500); 
    }
    // Check for Event requests
    if (window.location.hash === "#events" || localStorage.getItem("pendingEventOpen") === "true") {
        localStorage.removeItem("pendingEventOpen");
        setTimeout(() => document.getElementById("btnNavEventAttendance")?.click(), 1500); 
    }
    
    // 🚨 ADDED FOR NEW SIGN-IN NOTIFICATION CLICKS:
    if (window.location.hash === "#sessions" || localStorage.getItem("pendingSessionOpen") === "true") {
        localStorage.removeItem("pendingSessionOpen");
        setTimeout(() => {
            document.getElementById("btnDevices")?.click();
        }, 1500); 
    }
});

// ==========================================
// 🚨 DEVICE SESSIONS & KICK ENGINE
// ==========================================
let myWebDeviceID = localStorage.getItem("myWebDeviceID");
let sessionsCache = new Map();
let activeSessionsListenerUnsub = null;

// 1. Initialize Browser unique hardware string & register platform
async function registerTeacherWebSession() {
    if (!myWebDeviceID) {
        myWebDeviceID = "WEB_" + Date.now().toString(36) + Math.random().toString(36).substr(2);
        localStorage.setItem("myWebDeviceID", myWebDeviceID);
    }
    
    let osName = "Web Browser";
    if (navigator.userAgent.indexOf("Win") !== -1) osName = "Windows PC";
    if (navigator.userAgent.indexOf("Mac") !== -1) osName = "Mac OS";
    if (navigator.userAgent.indexOf("Linux") !== -1) osName = "Linux PC";
    if (navigator.userAgent.indexOf("Android") !== -1) osName = "Android Browser";
    if (navigator.userAgent.indexOf("like Mac") !== -1) osName = "iOS Browser";

    try {
        const sessionRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID, "sessions", myWebDeviceID);
        await setDoc(sessionRef, { deviceName: osName, loginTime: serverTimestamp() }, { merge: true });
        
        // Listen to our own subcollection document. If deleted, instantly force-kick the browser session!
        onSnapshot(sessionRef, (docSnap) => {
            if (!docSnap.exists()) {
                signOut(auth).then(() => window.location.href = "index.html");
            }
        });
    } catch(e) {
        console.error("Session registration rejected:", e);
    }
}

// 2. Bind UI Open/Close buttons
document.getElementById("btnDevices")?.addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("active");
    document.getElementById("sessionsModal").classList.add("active");
    startSessionsListener();
});

// 3. Real-Time Sessions Cache Synchronization (Matches C# updateSessionCache)
function startSessionsListener() {
    if (activeSessionsListenerUnsub) return;

    const sessionsRef = collection(db, "colleges", currentCollegeID, "teachers", currentUserID, "sessions");
    
    activeSessionsListenerUnsub = onSnapshot(sessionsRef, (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "removed") {
                sessionsCache.delete(change.doc.id);
            } else {
                let d = change.doc.data();
                sessionsCache.set(change.doc.id, { id: change.doc.id, ...d });
            }
        });
        
        if (document.getElementById("sessionsModal").classList.contains("active")) {
            renderActiveSessionsUI();
        }
    });
}

// 4. Render Active Device Cards
function renderActiveSessionsUI() {
    let container = document.getElementById("sessionsListContainer");
    if (!container) return;

    if (sessionsCache.size === 0) {
        container.innerHTML = `<div class="no-data-text" style="text-align:center; color:#94a3b8; padding:20px;">No active sessions found.</div>`;
        return;
    }
    
    let htmlBuffer = "";
    sessionsCache.forEach((d) => {
        let devName = d.deviceName || "Unknown Device";
        let isMe = (d.id === myWebDeviceID);
        if (isMe) devName += " <span style='color:#10b981; font-size:11px;'>(This Browser)</span>";
        
        let timeStr = "Recently";
        if (d.loginTime && d.loginTime.toDate) {
            timeStr = d.loginTime.toDate().toLocaleString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
        }

        let actionElement = isMe 
            ? `<span style="font-size:12px; color:#10b981; font-weight:bold; padding: 6px 12px;">Active</span>` 
            : `<button class="revoke-btn" onclick="window.kickActiveSession('${d.id}')" style="background:#fee2e2; color:var(--brand-red); border:none; padding:6px 14px; border-radius:8px; font-weight:bold; cursor:pointer; transition:0.2s; font-family:'Poppins'; font-size:12px;">Kick</button>`;
        
        htmlBuffer += `
            <div class="session-card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface, #f8fafc); border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:2px; box-shadow:0 1px 3px rgba(0,0,0,0.01);">
                <div class="session-info" style="text-align:left;">
                    <h4 style="margin:0 0 4px 0; font-size:14px; color:var(--text-dark); font-weight:bold;">${devName}</h4>
                    <p style="margin:0; font-size:11px; color:var(--text-muted); font-weight:600;">Logged in: ${timeStr}</p>
                </div>
                ${actionElement}
            </div>`;
    });
    container.innerHTML = htmlBuffer;
}

// 5. Revoke Session Engine (Kicking functionality)
window.kickActiveSession = async function(sessionID) {
    if (!confirm("Are you sure you want to kick this device out of your account?")) return;
    try {
        await deleteDoc(doc(db, "colleges", currentCollegeID, "teachers", currentUserID, "sessions", sessionID));
        showRcToast("Device kicked! Access revoked.");
        renderActiveSessionsUI();
    } catch(e) { 
        showRcToast("Error revoking session."); 
    }
};

// ==========================================
// 🚨 NEP ASSIGNMENT ENGINE (C# TRANSLATION)
// ==========================================
let asgnSubjectsMap = new Map();
let asgnIsProcessing = false;
const asgnMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

window.OpenAssignmentPanel = () => {
    document.getElementById("asgnTopicInput").value = "";
    document.getElementById("asgnDescInput").value = "";
    
    // Clear and set default today's date into native input picker
    let dateInput = document.getElementById("asgnDatePicker");
    if (dateInput) {
        let today = new Date();
        let yyyy = today.getFullYear();
        let mm = String(today.getMonth() + 1).padStart(2, '0');
        let dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    let btn = document.getElementById("btnPostAssignment");
    btn.innerText = "Post Assignment";
    btn.disabled = false;
    btn.style.opacity = "1";

    fetchAsgnTeacherSubjects();
    document.getElementById("createAssignmentModal").classList.add("active");
};

function fetchAsgnTeacherSubjects() {
    let subDrop = document.getElementById("asgnSubDrop");
    subDrop.innerHTML = `<option value="">Loading Subjects...</option>`;

    onSnapshot(query(collection(db, "colleges", currentCollegeID, "faculty_subjects"), where("teacherID", "==", currentUserID), where("isActive", "==", true)), (snap) => {
        asgnSubjectsMap.clear();
        
        snap.forEach(docSnap => {
            let d = docSnap.data();
            let sName = d.subjectName;
            let sSemStr = d.semester !== undefined ? d.semester.toString() : "1";
            let semArray = sSemStr.split(',');

            semArray.forEach(s => {
                let cleanSem = s.trim();
                if (!cleanSem) return;
                let semKey = `Semester ${cleanSem}`;

                if (!asgnSubjectsMap.has(semKey)) asgnSubjectsMap.set(semKey, []);
                if (!asgnSubjectsMap.get(semKey).includes(sName)) asgnSubjectsMap.get(semKey).push(sName);
            });
        });

        let yearDrop = document.getElementById("asgnYearDrop");
        yearDrop.innerHTML = `<option value="1">1st Year</option><option value="2">2nd Year</option><option value="3">3rd Year</option><option value="4">4th Year</option>`;
        
        yearDrop.onchange = (e) => {
            let selectedYear = parseInt(e.target.value);
            let currentActiveSem = (currentSemesterType === "Odd") ? (selectedYear * 2) - 1 : (selectedYear * 2);
            
            let semDrop = document.getElementById("asgnSemDrop");
            semDrop.innerHTML = `<option value="${currentActiveSem}">Semester ${currentActiveSem}</option>`;
            semDrop.dispatchEvent(new Event("change"));
        };

        document.getElementById("asgnSemDrop").onchange = (e) => {
            let selectedSemText = `Semester ${e.target.value}`;
            subDrop.innerHTML = "";

            if (asgnSubjectsMap.has(selectedSemText) && asgnSubjectsMap.get(selectedSemText).length > 0) {
                let subs = asgnSubjectsMap.get(selectedSemText).sort();
                subDrop.innerHTML = `<option value="">Select Subject</option>` + subs.map(s => `<option value="${s}">${s}</option>`).join('');
                subDrop.disabled = false;
            } else {
                subDrop.innerHTML = `<option value="None">No Subjects Allocated</option>`;
                subDrop.disabled = true;
            }
        };

        yearDrop.dispatchEvent(new Event("change"));
    });
}

async function executeCreateAssignment() {
    if (asgnIsProcessing) return;

    let btn = document.getElementById("btnPostAssignment");
    let topic = document.getElementById("asgnTopicInput").value.trim();
    let desc = document.getElementById("asgnDescInput").value.trim();
    let selectedSubject = document.getElementById("asgnSubDrop").value;
    let semNum = document.getElementById("asgnSemDrop").value;
    let dateVal = document.getElementById("asgnDatePicker").value;

    if (!topic) { showRcToast("Topic Title is required!"); return; }
    if (!selectedSubject || selectedSubject === "None") { showRcToast("Select a valid allocated subject."); return; }
    if (!dateVal) { showRcToast("Please select a due date!"); return; }

    // Parse native picker layout string (YYYY-MM-DD)
    let parts = dateVal.split('-');
    let y = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let d = parseInt(parts[2]);

    let selectedDate = new Date(y, m - 1, d, 23, 59, 59);
    let today = new Date(); today.setHours(0,0,0,0);
    if (selectedDate < today) { showRcToast("Due date cannot be in the past!"); return; }

    asgnIsProcessing = true;
    btn.innerText = "Processing...";
    btn.disabled = true;
    btn.style.opacity = "0.7";

    showRcToast("Analyzing Audience Group...");

    let dueDateDisplay = `${d} ${asgnMonthNames[m - 1]} ${y}`;
    let standardizedDateISO = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T23:59:59Z`;

    try {
        let isMjdOrCore = false;
        // 🚨 FIX: Use currentDeptName instead of the HOD-exclusive expDeptName
        let targetDeptName = currentDeptName; 

        const subSnap = await getDocs(collection(db, "colleges", currentCollegeID, "subjects"));
        for (let docObj of subSnap.docs) {
            let data = docObj.data();
            let dName = data.name || data.Name || "";

            if (dName.replace(/\s+/g, "").toLowerCase() === selectedSubject.replace(/\s+/g, "").toLowerCase()) {
                let type = (data.type || data.Type || "").toUpperCase();
                if (type.includes("MJD") || type.includes("CORE") || type.includes("MAJOR")) {
                    isMjdOrCore = true;
                }
                
                let fetchedDept = data.Department || data.department || "";
                if (fetchedDept) {
                    let safeFetch = fetchedDept.replace(/\s+/g, "").toLowerCase();
                    let safeCurrent = currentDeptName.replace(/\s+/g, "").toLowerCase();
                    
                    if (safeCurrent.includes(safeFetch) || safeFetch.includes(safeCurrent)) {
                        targetDeptName = currentDeptName; 
                    } else {
                        targetDeptName = fetchedDept; 
                    }
                }
                break;
            }
        }

        showRcToast("Posting Assignment Document...");
        let assignmentPayload = {
            teacherID: currentUserID,
            teacherName: currentTeacherName,
            teacherDeptID: teacherDeptRaw,
            subject: selectedSubject,
            semester: `Semester ${semNum}`,
            topic: topic,
            description: desc,
            dueDate: dueDateDisplay,
            dueDateISO: standardizedDateISO,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "colleges", currentCollegeID, "assignments"), assignmentPayload);

        let pushTopic = "";
        let targetTokens = [];
        let pushTitle = `New Assignment • ${currentTeacherName}`;
        let pushBody = `A new assignment has been posted for ${selectedSubject}.`;

        if (isMjdOrCore) {
            pushTopic = `${getSafeTopic(currentCollegeID)}_STUDENTS_${getSafeTopic(targetDeptName)}_${getSafeTopic("Year" + Math.ceil(parseInt(semNum) / 2))}`;
            sendPushNotification(pushTitle, pushBody, null, [pushTopic], "assignment");
        } else {
            let targetYearStr = Math.ceil(parseInt(semNum) / 2).toString();
            const stuSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "students"), where("Year", "==", targetYearStr)));
            
            stuSnap.forEach(docObj => {
                let sData = docObj.data();
                let isEnrolled = false;

                if (sData.enrolledSubjects) {
                    let semKey = `Semester ${semNum}`;
                    let semMap = sData.enrolledSubjects[semKey] || sData.enrolledSubjects[`Semester_${semNum}`] || sData.enrolledSubjects[semNum] || {};
                    
                    if (Object.values(semMap).some(v => v.toString().trim().toLowerCase() === selectedSubject.trim().toLowerCase())) {
                        isEnrolled = true;
                    }
                }

                if (isEnrolled) {
                    if (sData.fcmTokens) sData.fcmTokens.forEach(t => { if(t && !targetTokens.includes(t)) targetTokens.push(t); });
                    else if (sData.fcmToken && !targetTokens.includes(sData.fcmToken)) targetTokens.push(sData.fcmToken);

                    if (sData.webFcmTokens) sData.webFcmTokens.forEach(t => { if(t && !targetTokens.includes(t)) targetTokens.push(t); });
                    else if (sData.webFcmToken && !targetTokens.includes(sData.webFcmToken)) targetTokens.push(sData.webFcmToken);
                }
            });

            if (targetTokens.length > 0) {
                sendPushNotification(pushTitle, pushBody, targetTokens, null, "assignment");
            }
        }

        let reminderPayload = {
            topic: pushTopic || "",
            tokens: targetTokens,
            subject: selectedSubject,
            dueDateISO: standardizedDateISO,
            teacherName: currentTeacherName,
            teacherID: currentUserID,      
            collegeID: currentCollegeID,   
            createdAt: serverTimestamp()   
        };
        
        // 🚨 FIX 2: Swapped setDoc(doc(...)) for addDoc(...) for standard permission compliance
        await addDoc(collection(db, "adhyora_reminders"), reminderPayload);

        showRcToast("Assignment Posted Successfully!");
        setTimeout(() => {
            document.getElementById("createAssignmentModal").classList.remove("active");
            if (typeof initAssignmentsEngine === "function") initAssignmentsEngine(); 
        }, 1200);

    } catch(e) {
        console.error("Assignment Engine Crash:", e);
        showRcToast("Database Error. Check configurations.");
    } finally {
        resetAsgnBtn(btn);
    }
}

function resetAsgnBtn(btn) {
    asgnIsProcessing = false;
    btn.innerText = "Post Assignment";
    btn.disabled = false;
    btn.style.opacity = "1";
}

// ==========================================
// 🚨 GLOBAL FORCE COMPOSITION BAR ENGINE
// ==========================================
document.getElementById("btnOpenCompose")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 1. Force the dashboard navigation layer to slide view focus onto assignments
    let assignmentsTabBtn = document.getElementById("btnNavAssignments");
    if (assignmentsTabBtn && typeof switchView === "function") {
        switchView(views.assignments, assignmentsTabBtn);
    }
    
    // 2. Open up the newly designed modular creation template form sheet overlay
    if (typeof window.OpenAssignmentPanel === "function") {
        window.OpenAssignmentPanel();
    }
});
