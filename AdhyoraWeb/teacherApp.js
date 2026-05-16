import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit, writeBatch, increment, serverTimestamp, deleteField, documentId, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
            // 🚨 Standardize the raw ID right here!
            teacherDeptRaw = "DEPT_" + deptName.replace(/ /g, ""); 
        } else if (data.departmentID) {
            try {
                const deptSnap = await getDoc(doc(db, "colleges", currentCollegeID, "departments", data.departmentID));
                if (deptSnap.exists()) {
                    deptName = deptSnap.data().name || data.departmentID;
                    // 🚨 Keep the raw ID exactly as it is in the database
                    teacherDeptRaw = data.departmentID; 
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

async function finalizeProfileUI(rawName, email, deptName) {
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

        // 🚨 THE RACE CONDITION FIX
        await syncSemesterWithDatabase();

        initAttendanceEngine(); 
        initSubjectDeclarationEngine(); 
        initCalendarEngine(); // 🚨 Added Calendar Init!
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

function cleanupAttendanceView() {
    if (attSessionListenerUnsub) { attSessionListenerUnsub(); attSessionListenerUnsub = null; }
    if (attMainEventListenerUnsub) { attMainEventListenerUnsub(); attMainEventListenerUnsub = null; }
    
    if (typeof showAttCenterMessage === "function") {
        showAttCenterMessage("Please select a subject<br>to mark attendance.");
        let subDrop = document.getElementById("attSubjDropdown");
        if(subDrop) subDrop.value = "Select Subject";
    }

    // 🚨 Always reset the view back to Main when clicking out of Attendance
    let mainScr = document.getElementById("attMainScreen");
    let histScr = document.getElementById("attHistoryScreen");
    let recScr = document.getElementById("attRecordScreen");
    if (mainScr) mainScr.style.display = "flex";
    if (histScr) histScr.style.display = "none";
    if (recScr) recScr.style.display = "none";
}

function switchView(targetView, clickedBtn) {
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn && (clickedBtn.classList.contains('nav-icon-btn') || clickedBtn.classList.contains('nav-btn') || clickedBtn.classList.contains('menu-btn'))) clickedBtn.classList.add("active-nav");
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });
    
    // 🚨 Clean up the heavy listeners and unsaved data if we navigate away
    if (targetView !== views.attendance) cleanupAttendanceView();
    if (targetView !== views.subjects) subjPurgeUnsavedPending();

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
