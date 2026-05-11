import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 🚨 USE YOUR CONFIG HERE 🚨
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

// --- State Variables ---
let collegeID = "";
let studentUID = "";
let currentRollNo = "";

let loadedSemesters = {};
let sortedSemesterKeys = [];
let currentSemesterIndex = 0;

let activeMarksUnsubscribe = null;

// --- DOM Elements ---
const el = {
    name: document.getElementById("studentName"),
    roll: document.getElementById("studentRoll"),
    badge: document.getElementById("statusBadge"),
    semTitle: document.getElementById("semesterTitle"),
    circle: document.getElementById("attendanceCircle"),
    pctText: document.getElementById("overallPercentageText"),
    attClasses: document.getElementById("attendedClassesText"),
    absClasses: document.getElementById("absentClassesText"),
    totClasses: document.getElementById("totalClassesTakenText"),
    curPctText: document.getElementById("currentPercentageText"),
    subList: document.getElementById("subjectListContainer"),
    markList: document.getElementById("marksListContainer"),
    examDrop: document.getElementById("examDropdown"),
    noMarks: document.getElementById("noMarksData")
};

// --- Initialization ---
// Grab URL parameters passed from login page (e.g. ?college=COL123&uid=UID456)
const urlParams = new URLSearchParams(window.location.search);
collegeID = urlParams.get('college');
studentUID = urlParams.get('uid');

if (!collegeID || !studentUID) {
    alert("Session error. Please login again.");
    window.location.href = "index.html"; // Go back to login
} else {
    initStudentListener();
}

// --- Listeners & Queries ---

// 1. Listen to Student Root Document (Profile & Attendance)
function initStudentListener() {
    // Note: We need the Roll Number first to read the doc path properly if your 
    // structure uses Roll Number as Document ID. We use a collection group query or 
    // basic query to find the doc where userID == studentUID.
    
    // For this example, assuming the studentUID was used to query and find the roll number, 
    // or passed directly in URL as 'roll'. Assuming roll passed in URL for speed:
    currentRollNo = urlParams.get('roll') || studentUID; // Adjust based on your Auth setup

    const studentRef = doc(db, "colleges", collegeID, "students", currentRollNo);

    onSnapshot(studentRef, (docSnap) => {
        if (!docSnap.exists()) {
            el.name.innerText = "Profile Not Found";
            return;
        }
        processStudentData(docSnap.data());
    }, (error) => {
        console.error("Error fetching student:", error);
    });
}

function processStudentData(data) {
    // 1. Header Info
    el.name.innerText = data.Name || data.name || "Unknown Student";
    el.roll.innerText = `Roll no: ${data.RollNumber || currentRollNo}`;

    // Setup Semester Array
    loadedSemesters = {};
    sortedSemesterKeys = [];
    for(let i=1; i<=8; i++) {
        const key = `Semester_${i}`;
        loadedSemesters[key] = {
            id: key, name: `Semester ${i}`, hasData: false, 
            strictPresent: 0, strictTotal: 0, subjects: []
        };
        sortedSemesterKeys.push(key);
    }

    // 2. Parse Attendance Stats
    if (data.attendance_stats) {
        for (const [key, semData] of Object.entries(data.attendance_stats)) {
            const cleanKey = key.replace("semester_", "Semester_");
            if (loadedSemesters[cleanKey]) {
                let semInfo = loadedSemesters[cleanKey];
                semInfo.hasData = true;

                if (semData.present !== undefined) semInfo.strictPresent = semData.present;
                if (semData.total !== undefined) semInfo.strictTotal = semData.total;

                // Parse subjects
                for (const [subKey, subStats] of Object.entries(semData)) {
                    if (subKey === "present" || subKey === "total") continue;
                    if (subKey === "Strict_Global") {
                        semInfo.strictPresent = subStats.present;
                        semInfo.strictTotal = subStats.total;
                    } else if (typeof subStats === 'object') {
                        semInfo.subjects.push({
                            name: subKey.replace("-", "/"),
                            present: subStats.present || 0,
                            total: subStats.total || 0
                        });
                    }
                }
            }
        }
    }

    // Default to Sem 1 or read CurrentSemester from DB
    let currentSemStr = data.CurrentSemester || data.currentSemester || "1";
    currentSemesterIndex = parseInt(currentSemStr.replace(/\D/g, '')) - 1;
    if (currentSemesterIndex < 0 || currentSemesterIndex > 7) currentSemesterIndex = 0;

    updateUIForCurrentSemester();
}

// --- Navigation ---
document.getElementById("prevSemBtn").addEventListener("click", () => {
    if (currentSemesterIndex > 0) { currentSemesterIndex--; updateUIForCurrentSemester(); }
});
document.getElementById("nextSemBtn").addEventListener("click", () => {
    if (currentSemesterIndex < 7) { currentSemesterIndex++; updateUIForCurrentSemester(); }
});

// --- UI Updaters ---
function updateUIForCurrentSemester() {
    const semKey = sortedSemesterKeys[currentSemesterIndex];
    const semData = loadedSemesters[semKey];

    el.semTitle.innerText = semData.name;

    // 1. Calculate Overall Percentage
    let percent = 0;
    if (semData.strictTotal > 0) {
        percent = (semData.strictPresent / semData.strictTotal) * 100;
    }

    el.pctText.innerText = `${percent.toFixed(2)}%`;
    el.curPctText.innerText = `Current: ${percent.toFixed(2)}%`;
    el.attClasses.innerText = `Attended: ${semData.strictPresent}`;
    el.totClasses.innerText = `Total: ${semData.strictTotal}`;
    el.absClasses.innerText = `Absent: ${semData.strictTotal - semData.strictPresent}`;

    // Color Logic
    let ringColor = "#f44336"; let statusTxt = "Critical";
    if (percent >= 85) { ringColor = "#4caf50"; statusTxt = "Excellent"; }
    else if (percent >= 70) { ringColor = "#ffc107"; statusTxt = "Good"; }
    else if (percent >= 50) { ringColor = "#ff9800"; statusTxt = "Average"; }

    el.badge.innerText = statusTxt;
    el.badge.style.backgroundColor = ringColor;
    
    // Draw Conic Gradient
    const degrees = (percent / 100) * 360;
    el.circle.style.background = `conic-gradient(${ringColor} ${degrees}deg, #e0e0e0 ${degrees}deg)`;

    // 2. Build Subject List
    el.subList.innerHTML = ""; // Clear existing
    if (!semData.hasData || semData.subjects.length === 0) {
        el.subList.innerHTML = `<div class="no-data-text">No Attendance Data</div>`;
    } else {
        semData.subjects.forEach(sub => {
            const ratio = sub.total > 0 ? (sub.present / sub.total) : 0;
            const subPct = ratio * 100;
            let barColor = "#4caf50";
            if (ratio < 0.6) barColor = "#f44336";
            else if (ratio < 0.75) barColor = "#ff9800";

            const rowHTML = `
                <div class="subject-row">
                    <div class="row-header">
                        <span>${sub.name}</span>
                        <span style="color:${barColor}">${subPct.toFixed(0)}% <span style="font-size:9px; color:#888;">(${sub.present}/${sub.total})</span></span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${subPct}%; background-color: ${barColor};"></div>
                    </div>
                </div>
            `;
            el.subList.innerHTML += rowHTML;
        });
    }

    // 3. Trigger Marks Fetch
    fetchMarksForSemester(semData.name);
}

// --- Marks System ---
function fetchMarksForSemester(semName) {
    if (activeMarksUnsubscribe) activeMarksUnsubscribe();
    
    el.markList.innerHTML = "";
    el.examDrop.innerHTML = '<option value="">Loading...</option>';
    el.noMarks.style.display = "block";

    const marksRef = doc(db, "colleges", collegeID, "students", currentRollNo, "nep_marks", semName);

    activeMarksUnsubscribe = onSnapshot(marksRef, (docSnap) => {
        if (!docSnap.exists()) {
            el.examDrop.innerHTML = '<option value="">No Exams Data</option>';
            el.noMarks.style.display = "block";
            return;
        }

        const data = docSnap.data();
        let examMap = {}; // Will hold { "Internal 1": [ {subject, obtained, total}... ] }

        // Parse exactly like C#
        for (const [subjectName, exams] of Object.entries(data)) {
            if (typeof exams !== 'object') continue;
            
            for (const [examName, stats] of Object.entries(exams)) {
                if (!examMap[examName]) examMap[examName] = [];
                
                let t = stats.test || 0;
                let a = stats.assign || 0;
                let att = stats.att || 0;
                let max = stats.max || 50;
                let obt = stats.total || (t + a + att);

                examMap[examName].push({ name: subjectName, obtained: obt, max: max });
            }
        }

        const examKeys = Object.keys(examMap).sort();
        if (examKeys.length === 0) {
            el.examDrop.innerHTML = '<option value="">No Exams Data</option>';
            el.noMarks.style.display = "block";
            return;
        }

        // Populate Dropdown
        el.examDrop.innerHTML = "";
        examKeys.forEach(ex => {
            el.examDrop.innerHTML += `<option value="${ex}">${ex}</option>`;
        });

        // Event Listener for Dropdown Change
        el.examDrop.onchange = () => drawMarksUI(examMap[el.examDrop.value]);
        
        // Draw first exam
        drawMarksUI(examMap[examKeys[0]]);
    });
}

function drawMarksUI(marksArray) {
    el.markList.innerHTML = "";
    if (!marksArray || marksArray.length === 0) {
        el.noMarks.style.display = "block";
        return;
    }
    el.noMarks.style.display = "none";

    marksArray.forEach(m => {
        const ratio = m.max > 0 ? (m.obtained / m.max) : 0;
        const pct = ratio * 100;
        const rowHTML = `
            <div class="subject-row">
                <div class="row-header">
                    <span>${m.name}</span>
                    <span>${m.obtained}/${m.max} <span style="font-size:9px; color:#888;">(${pct.toFixed(0)}%)</span></span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${pct}%; background-color: #3b82f6;"></div>
                </div>
            </div>
        `;
        el.markList.innerHTML += rowHTML;
    });
}