import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit, writeBatch, increment, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🚨 GLOBAL VARIABLES
// ==========================================
let currentCollegeID = "";
let currentUserID = "";
let currentTeacherName = "Unknown";
let isHOD = false;
let profileListener = null;
let teacherDeptRaw = ""; 
let hasStartedInbox = false;

// Notification Variables
let allMessagesMap = new Map();
let allNotifsMap = new Map();
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

const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            ListenToProfile(); 
        } else { 
            window.location.href = "index.html"; 
        }
    });
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

        const data = snapshot.data();
        isHOD = data.isHOD || false;
        currentTeacherName = data.name || "Unknown";
        const email = auth.currentUser ? auth.currentUser.email : data.email;
        let deptName = "Unknown Dept";

        if (data.department) {
            deptName = data.department;
            teacherDeptRaw = deptName;
        } else if (data.departmentID) {
            try {
                const deptSnap = await getDoc(doc(db, "colleges", currentCollegeID, "departments", data.departmentID));
                if (deptSnap.exists()) {
                    deptName = deptSnap.data().name || data.departmentID;
                    teacherDeptRaw = deptName; 
                } else {
                    teacherDeptRaw = data.departmentID;
                    deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
                }
            } catch (e) {
                teacherDeptRaw = data.departmentID;
            }
        }
        finalizeProfileUI(currentTeacherName, email, deptName);
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

    let loader = document.getElementById("initialAppLoader");
    if(loader) loader.style.display = "none";

    if (!hasStartedInbox && teacherDeptRaw !== "") {
        startInboxListener();
        hasStartedInbox = true;
        initAttendanceEngine(); // 🚨 START ATTENDANCE ENGINE ONCE PROFILE LOADED
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
// 🚨 SEMESTER MANAGER (C# PORT)
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
// 🚨 NEP ATTENDANCE ENGINE (C# PORT)
// ==========================================
let attCurrentDate = new Date();
let attTeacherSubjects = [];
let attSubjectCategories = new Map();
let attCachedStudentsByYear = new Map();
let attMedicalLeavesCache = new Set();
let attLastMedicalFetchDate = null;

let attCurrentPeriodClaims = new Map();
let attCurrentPeriodEvents = new Map();
let attActiveRows = [];
let attCurrentSessionBatchIndex = -1;
let attIsMainClassLocked = false;
let attIsSubstitutePanelOpen = false;

let attPendingSubBatchIndex = 0;
let attPendingSubBatchName = "";
let attPendingSubTeacherID = "";
let attPendingSubTeacherName = "";

// Firebase Listeners for Attendance
let attSubjectListenerUnsub = null;
let attStudentRosterUnsub = null;
let attSessionListenerUnsub = null;
let attMainEventListenerUnsub = null;
let attActiveRosterYear = "";
let attCurrentLoadTicket = 0;

async function initAttendanceEngine() {
    // 🚨 FIX: Await the Semester Manager before building the UI!
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

    // Initialize to today
    yDrop.value = curYear; mDrop.value = new Date().getMonth(); updateDays(); dDrop.value = new Date().getDate();
}

function fetchTeacherSubjects() {
    if (attSubjectListenerUnsub) attSubjectListenerUnsub();
    document.getElementById("attSubjDropdown").innerHTML = `<option>Loading...</option>`;
    
    // Auto-Heal & Cache Logic Ported
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
                            // 🚨 Silent background heal (no await needed)
                        }
                    }
                }));
            }
        });
        
        await Promise.all(autoHealPromises);
        
        // 🚨 NEW: Setup Semesters dynamically via SemesterManager
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
    attActiveRows = [];
}

function updateMainButtonState() {
    let btn = document.getElementById("attSaveBtn");
    if(attIsSubstitutePanelOpen) btn.style.opacity = "0.5";
    else if(attIsMainClassLocked) btn.style.opacity = "0.5";
    else btn.style.opacity = "1";
    btn.style.pointerEvents = (attIsSubstitutePanelOpen || attIsMainClassLocked) ? "none" : "auto";
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
    
    const dateStr = `${attCurrentDate.getFullYear()}-${String(attCurrentDate.getMonth()+1).padStart(2,'0')}-${String(attCurrentDate.getDate()).padStart(2,'0')}`;

    // 1. Fetch Medical Leaves (Daily RAM Cache)
    if(!attLastMedicalFetchDate || attLastMedicalFetchDate !== dateStr) {
        attMedicalLeavesCache.clear();
        try {
            const medSnap = await getDocs(query(collection(db, "colleges", currentCollegeID, "medical_leaves"), where("endDate", ">=", dateStr)));
            medSnap.forEach(doc => {
                let start = new Date(doc.data().startDate);
                if(start <= attCurrentDate) attMedicalLeavesCache.add(doc.data().studentID);
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
        // 1. GLOBAL LOCKS CHECK
        const globalSnap = await getDoc(doc(db, "colleges", currentCollegeID, "attendance", globalDocID));
        if(globalSnap.exists()) {
            const data = globalSnap.data();
            // A. Teacher Double Booking
            if(data.teacher_locks) {
                let lockedSubj = data.teacher_locks[`p${pIndex}_${currentUserID}`];
                if(lockedSubj && lockedSubj !== selectedSubject) {
                    showAttCenterMessage(`Double Booking Prevented:<br>You already marked '${lockedSubj}' for Period ${pIndex}.`); return;
                }
            }
            // B. Dept Lock
            if(data.dept_locks) {
                let dLock = data.dept_locks[`p${pIndex}_DEPT_${teacherDeptRaw.replace(/ /g, '')}`];
                if(dLock && dLock.subject !== selectedSubject) {
                    if(dLock.teacherID !== currentUserID) {
                        showAttCenterMessage(`Period ${pIndex} is locked for your department.<br>Already marked for '${dLock.subject}' by ${dLock.teacherName || "another teacher"}.`); return;
                    }
                }
            }
        }

        // 2. TIMETABLE STRUCTURE CHECK
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

        // 3. ALLOCATIONS CHECK
        const allocQuery = query(collection(db, "colleges", currentCollegeID, "timetable_allocations"), where("semester", "==", `Semester ${selectedSem}`), where("day", "==", dayName), where("period", "==", String(pIndex)));
        const allocSnap = await getDocs(allocQuery);

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

        // --- DECISION ENGINE ---
        if(isTargetSubjectScheduled) {
            if(myAllocations.length > 0 || substituteAllocations.length > 0) {
                let iTeachSubject = attTeacherSubjects.some(s => s.name === selectedSubject);
                if(myAllocations.length > 0 || iTeachSubject) {
                    if(myAllocations.length === 0) showAttCenterMessage("Not assigned to you.<br>(Substitute options available)");
                    else showAttCenterMessage("Select a batch to mark attendance:");
                    
                    spawnSubstituteCards(myAllocations, substituteAllocations);
                } else {
                    showAttCenterMessage("This period is assigned to another teacher.");
                }
            } else {
                showAttCenterMessage("This period is assigned to another teacher.");
            }
        } else {
            let isFreeRoam = targetSubCategory.includes("MJD") || targetSubCategory.includes("MID") || targetSubCategory.includes("SEC") || targetSubCategory.includes("TUTORIAL") || targetSubCategory.includes("CORE");
            if(isFreeRoam) {
                const batchQuery = query(collection(db, "colleges", currentCollegeID, "subject_batches"), where("semester", "==", `Semester ${selectedSem}`), where("subjectName", "==", selectedSubject));
                const bSnap = await getDocs(batchQuery);
                if(ticket !== attCurrentLoadTicket) return;
                
                if(!bSnap.empty) spawnManualBatchCards(bSnap.docs, selectedSem, selectedSubject);
                else {
                    attCurrentSessionBatchIndex = -1;
                    loadAttendanceRegister(null, ticket, targetSubCategory, dateStr);
                }
            } else {
                showAttCenterMessage("No class scheduled for this subject.");
            }
        }
    } catch(e) { console.error("Timetable Engine Error", e); showAttCenterMessage("Connection Error."); }
}

function spawnSubstituteCards(myDocs, subDocs) {
    document.getElementById("attListContainer").innerHTML = ""; // Clear list
    document.getElementById("attTotalStudentsText").innerText = "Select Batch";

    const createCardHTML = (docSnap, isMine) => {
        let d = docSnap.data();
        let bIndex = parseInt(d.splitIndex || "0");
        let bName = d.isCommon ? "Entire Class" : `Batch ${bIndex + 1}`;
        if(isMine) bName += " (My Class)";
        
        let subBtnId = `subCard_${docSnap.id}`;
        return `
        <div style="background:var(--bg-base); border:1px solid var(--border-color); border-radius:12px; margin-bottom:10px; overflow:hidden;">
            <button id="${subBtnId}" style="width:100%; padding:15px; background:transparent; border:none; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold; color:var(--text-dark); font-size:15px;">${bName}</div>
                    <div style="font-size:12px; color:var(--text-muted);">Assigned: ${d.teacherName || "Unknown"}</div>
                </div>
                <i class="fas fa-chevron-right" style="color:#cbd5e1;"></i>
            </button>
        </div>`;
    };

    let fullHTML = "";
    myDocs.sort((a,b)=>parseInt(a.data().splitIndex||0)-parseInt(b.data().splitIndex||0)).forEach(d => fullHTML += createCardHTML(d, true));
    subDocs.sort((a,b)=>parseInt(a.data().splitIndex||0)-parseInt(b.data().splitIndex||0)).forEach(d => fullHTML += createCardHTML(d, false));
    
    document.getElementById("attListContainer").innerHTML = fullHTML;

    myDocs.forEach(d => attachSubCardListener(d, true));
    subDocs.forEach(d => attachSubCardListener(d, false));
}

function spawnManualBatchCards(docs, sem, subj) {
    document.getElementById("attListContainer").innerHTML = "";
    document.getElementById("attTotalStudentsText").innerText = "Select Batch";
    let validBatches = docs.filter(d => d.data().teacherID && d.data().teacherName);
    
    if(validBatches.length === 0) { showAttCenterMessage("No teachers assigned to these batches yet."); return; }

    validBatches.sort((a,b) => {
        let ai = a.id.lastIndexOf("Batch") !== -1 ? parseInt(a.id.substring(a.id.lastIndexOf("Batch")+5))-1 : 0;
        let bi = b.id.lastIndexOf("Batch") !== -1 ? parseInt(b.id.substring(b.id.lastIndexOf("Batch")+5))-1 : 0;
        return ai - bi;
    });

    let fullHTML = "";
    validBatches.forEach(d => {
        let bIndex = d.id.lastIndexOf("Batch") !== -1 ? parseInt(d.id.substring(d.id.lastIndexOf("Batch")+5))-1 : 0;
        let bName = `Batch ${bIndex + 1}`;
        if(d.data().teacherID === currentUserID) bName += " (My Class)";
        
        fullHTML += `
        <div style="background:var(--bg-base); border:1px solid var(--border-color); border-radius:12px; margin-bottom:10px; overflow:hidden;">
            <button id="subCard_${d.id}" style="width:100%; padding:15px; background:transparent; border:none; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold; color:var(--text-dark); font-size:15px;">${bName}</div>
                    <div style="font-size:12px; color:var(--text-muted);">Assigned: ${d.data().teacherName}</div>
                </div>
                <i class="fas fa-chevron-right" style="color:#cbd5e1;"></i>
            </button>
        </div>`;
    });
    
    document.getElementById("attListContainer").innerHTML = fullHTML;
    validBatches.forEach(d => {
        let bIndex = d.id.lastIndexOf("Batch") !== -1 ? parseInt(d.id.substring(d.id.lastIndexOf("Batch")+5))-1 : 0;
        let bName = `Batch ${bIndex + 1}`;
        if(d.data().teacherID === currentUserID) bName += " (My Class)";
        
        document.getElementById(`subCard_${d.id}`).addEventListener("click", () => {
            attPendingSubBatchName = bName.replace(" (My Class)", "").trim();
            attPendingSubBatchIndex = bIndex;
            attPendingSubTeacherID = d.data().teacherID;
            attPendingSubTeacherName = d.data().teacherName;
            showSubstituteConfirmModal(bName);
        });
    });
}

function attachSubCardListener(docSnap, isMine) {
    let d = docSnap.data();
    let bIndex = parseInt(d.splitIndex || "0");
    let bName = d.isCommon ? "Entire Class" : `Batch ${bIndex + 1}`;
    if(isMine) bName += " (My Class)";

    document.getElementById(`subCard_${docSnap.id}`).addEventListener("click", () => {
        attPendingSubBatchName = bName.replace(" (My Class)", "").trim();
        attPendingSubBatchIndex = bIndex;
        attPendingSubTeacherID = d.teacherID || "";
        attPendingSubTeacherName = d.teacherName || "Unknown";
        showSubstituteConfirmModal(bName);
    });
}

function showSubstituteConfirmModal(displayName) {
    let t = document.getElementById("subConfirmText");
    if(displayName.includes("(My Class)")) t.innerHTML = `Open register for<br><b>${attPendingSubBatchName}</b>?`;
    else t.innerHTML = `<b>Substitute Mode</b><br>Mark attendance for ${displayName}?`;
    document.getElementById("subConfirmModal").classList.add("active");
}

function confirmSubstituteLoad() {
    document.getElementById("subConfirmModal").classList.remove("active");
    const dateStr = `${attCurrentDate.getFullYear()}-${String(attCurrentDate.getMonth()+1).padStart(2,'0')}-${String(attCurrentDate.getDate()).padStart(2,'0')}`;
    const selectedSem = document.getElementById("attSemDropdown").value;
    const selectedSubject = document.getElementById("attSubjDropdown").value;

    showAttCenterMessage("Loading Register...");
    attIsSubstitutePanelOpen = true; // Signals we are modifying someone else's batch

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
                showAttCenterMessage("Batch Error. Ask Principal to resplit.");
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
        // 1. Fetch Global Claims
        const gSnap = await getDoc(doc(db, "colleges", currentCollegeID, "attendance", globalDocID));
        if(gSnap.exists() && gSnap.data().student_claims) {
            let claims = gSnap.data().student_claims;
            let prefix = `p${pIndex}_`;
            for(let key in claims) {
                if(key.startsWith(prefix)) attCurrentPeriodClaims.set(key.substring(prefix.length), claims[key]);
            }
        }

        // 2. Realtime Event Listener
        attMainEventListenerUnsub = onSnapshot(doc(db, "colleges", currentCollegeID, "attendance", eventDocID), (eSnap) => {
            if(ticket !== attCurrentLoadTicket) return;
            attCurrentPeriodEvents.clear();
            if(eSnap.exists() && eSnap.data()[periodKey] && eSnap.data()[periodKey].event_details) {
                let evts = eSnap.data()[periodKey].event_details;
                for(let key in evts) attCurrentPeriodEvents.set(key, String(evts[key]));
            }
            if(attActiveRows.length > 0) renderStudentRows(filterStudentIDs, ticket, trueCategory, dateStr); // Re-render if open
        });

        // 3. Realtime Register Listener
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

    if(matchingStudents.length === 0) { showAttCenterMessage(`No students found for<br>'${subjName}'`); return; }

    document.getElementById("attTotalStudentsText").innerText = `${matchingStudents.length} Students`;
    
    // Sort
    matchingStudents.sort((a,b) => {
        let r1 = a.data().RollNumber || a.data().rollNumber || "0";
        let r2 = b.data().RollNumber || b.data().rollNumber || "0";
        return r1.localeCompare(r2, undefined, {numeric:true});
    });

    renderStudentRows(matchingStudents, existingData, batchTeachersMap, ticket);
}

function renderStudentRows(students, existingData, batchTeachersMap, ticket) {
    attIsMainClassLocked = false;
    let lockerName = "";
    let myKey = attCurrentSessionBatchIndex === -1 ? "common" : String(attCurrentSessionBatchIndex);
    const selectedSubject = document.getElementById("attSubjDropdown").value;

    // 1. Dept Lock Check (Who saved it first?)
    if(batchTeachersMap && batchTeachersMap[myKey]) {
        let bInfo = batchTeachersMap[myKey];
        if(bInfo.id && bInfo.id !== currentUserID && !attIsSubstitutePanelOpen) {
            attIsMainClassLocked = true;
            lockerName = bInfo.name || "a Substitute";
        }
    }

    // 2. Claim Check
    let claimedCount = 0; let conflictSubject = "";
    students.forEach(s => {
        if(attCurrentPeriodClaims.has(s.id) && attCurrentPeriodClaims.get(s.id) !== selectedSubject) {
            claimedCount++; conflictSubject = attCurrentPeriodClaims.get(s.id);
        }
    });

    if(claimedCount > 0) { attIsMainClassLocked = true; lockerName = conflictSubject; }
    updateMainButtonState();

    if(attIsMainClassLocked && !attIsSubstitutePanelOpen) {
        document.getElementById("attLockStatusText").innerText = claimedCount > 0 ? `Locked by ${conflictSubject}` : `View Only`;
    } else {
        document.getElementById("attLockStatusText").innerText = "";
    }

    let fullHTML = "";
    attActiveRows = [];

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

        let rowLocked = attIsMainClassLocked || isAtEvent || isClaimed || isMedical;
        if(isAtEvent || isMedical) isPresent = true; // Auto Present
        if(isClaimed) isPresent = false; // Auto Absent to avoid collision

        let uiText = `${name} (${roll})`;
        if(isAtEvent) uiText += ` - <span style="color:#10b981; font-weight:bold;">${attCurrentPeriodEvents.get(id).toUpperCase()}</span>`;
        else if(isClaimed) uiText += ` - <span style="color:#f59e0b; font-weight:bold;">IN ${attCurrentPeriodClaims.get(id)}</span>`;
        else if(isMedical) uiText += ` - <span style="color:#3b82f6; font-weight:bold;">MEDICAL</span>`;

        uiText += `<br><span style="font-size:11px; color:#94a3b8;">${sDept}</span>`;

        let toggleClass = `attd-toggle ${isPresent ? 'active' : ''} ${rowLocked ? 'locked' : ''}`;
        
        fullHTML += `
        <div style="background:var(--bg-base); border:1px solid var(--border-color); border-radius:12px; margin-bottom:10px; padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:14px; font-weight:600; color:var(--text-dark);">${uiText}</div>
            <div id="tog_${id}" class="${toggleClass}" data-id="${id}" data-state="${isPresent}" data-locked="${rowLocked}" data-new="${isNewEntry}" data-init="${isPresent}"></div>
        </div>`;

        attActiveRows.push(id);
    });

    document.getElementById("attListContainer").innerHTML = fullHTML;

    // Attach Toggle Listeners
    attActiveRows.forEach(id => {
        let el = document.getElementById(`tog_${id}`);
        el.addEventListener("click", () => {
            if(el.dataset.locked === "true") return;
            let currentState = el.dataset.state === "true";
            el.dataset.state = (!currentState).toString();
            if(!currentState) el.classList.add("active"); else el.classList.remove("active");
        });
    });
}

// ==========================================
// 🚨 SAVE ATTENDANCE ENGINE (C# PORT)
// ==========================================
async function saveAttendance() {
    if(attActiveRows.length === 0) return;
    document.getElementById("updateProgressModal").classList.add("active");
    document.getElementById("updateProgressFill").style.width = "0%";
    document.getElementById("updateStatusText").innerText = "Saving Attendance...";
    document.getElementById("attSaveBtn").style.pointerEvents = "none";

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

    // Target Teacher Logic
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

        // 0. Backend Collision Check
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
            alert(`LOCKED: Batch marked by ${batchTeachers[myKey].name}`); document.getElementById("updateProgressModal").classList.remove("active"); updateMainButtonState(); return;
        }

        let attendanceMap = pData.attendance || {};
        let myBatchPresent = 0; let myBatchTotal = 0;

        attActiveRows.forEach(id => {
            let el = document.getElementById(`tog_${id}`);
            if(attCurrentPeriodEvents.has(id)) {
                delete attendanceMap[id]; // Server will wipe it
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

        // Teacher Scorecard
        if(isFirstTimeMarking) {
            const tRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);
            batch.update(tRef, { 
                "total_hours_taught": increment(1), 
                [`semester_hours.${semKey}.total`]: increment(1),
                [`semester_hours.${semKey}.subjects.${selectedSubject}`]: increment(1)
            });
            opCount++;
        }

        for(let id of attActiveRows) {
            if(attCurrentPeriodClaims.has(id) && attCurrentPeriodClaims.get(id) !== selectedSubject) {
                alert("Save aborted. Students locked by another subject."); document.getElementById("updateProgressModal").classList.remove("active"); updateMainButtonState(); return;
            }
            if(attCurrentPeriodEvents.has(id)) continue;

            studentClaims[`p${pIndex}_${id}`] = selectedSubject;
            
            let el = document.getElementById(`tog_${id}`);
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
            dLocks[`p${pIndex}_DEPT_${teacherDeptRaw.replace(/ /g, '')}`] = { subject: selectedSubject, teacherName: currentTeacherName, teacherID: currentUserID };
            gUpdateObj.dept_locks = dLocks;
        }

        batch.set(globalRef, gUpdateObj, {merge:true});
        batchPromises.push(batch.commit());

        document.getElementById("updateProgressFill").style.width = "90%";
        await Promise.all(batchPromises);
        
        document.getElementById("updateProgressFill").style.width = "100%";
        document.getElementById("updateStatusText").innerText = "Attendance Saved!";
        setTimeout(() => {
            document.getElementById("updateProgressModal").classList.remove("active");
            if(attIsSubstitutePanelOpen) {
                loadSessionData(); // Returns to batch list
            } else {
                // UI Refresh to reset initial states to green/locked
                loadSessionData(); 
            }
        }, 1000);

    } catch(e) {
        console.error("Save Crash", e);
        document.getElementById("updateStatusText").innerText = "Save Failed!";
        setTimeout(() => { document.getElementById("updateProgressModal").classList.remove("active"); updateMainButtonState(); }, 1500);
    }
}

// ==========================================
// 🚨 UI NAVIGATION ROUTER (Intact)
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"), attendance: document.getElementById("attendanceView"), timetable: document.getElementById("timetableView"),
    internalMarks: document.getElementById("internalMarksView"), subjects: document.getElementById("subjectsView"), calendar: document.getElementById("calendarView"),
    assignments: document.getElementById("assignmentsView"), studentList: document.getElementById("studentListView"), subjectAssign: document.getElementById("subjectAssignView"),
    batch: document.getElementById("batchView"), eventAttendance: document.getElementById("eventAttendanceView"), notifications: document.getElementById("notificationsView"),
    messages: document.getElementById("messagesView")
};
const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn, .nav-btn, .menu-btn");

function switchView(targetView, clickedBtn) {
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn && (clickedBtn.classList.contains('nav-icon-btn') || clickedBtn.classList.contains('nav-btn') || clickedBtn.classList.contains('menu-btn'))) clickedBtn.classList.add("active-nav");
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });
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
attachSafeClick("btnSignOut", () => { if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); });

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
}
attachSafeClick("btnThemes", () => { let s = document.getElementById("settingsOverlay"); let t = document.getElementById("themesModal"); if(s) s.classList.remove("active"); if(t) t.classList.add("active"); });
attachSafeClick("btnDarkMode", () => applyTheme(true));
attachSafeClick("btnLightMode", () => applyTheme(false));
applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");
