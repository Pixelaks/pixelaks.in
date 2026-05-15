import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

let currentCollegeID = "";
const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            // Unlock UI immediately for testing
            document.getElementById("initialAppLoader").style.display = "none";
            document.getElementById("teacherEmailText").innerText = user.email;
        } else { 
            window.location.href = "index.html"; 
        }
    });
}

// ==========================================
// 🚨 UI NAVIGATION ROUTER (MOBILE SAFE)
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"),
    attendance: document.getElementById("attendanceView"),
    timetable: document.getElementById("timetableView"),
    internalMarks: document.getElementById("internalMarksView"),
    subjects: document.getElementById("subjectsView"),
    calendar: document.getElementById("calendarView"),
    assignments: document.getElementById("assignmentsView"),
    studentList: document.getElementById("studentListView"),
    subjectAssign: document.getElementById("subjectAssignView"),
    batch: document.getElementById("batchView"),
    eventAttendance: document.getElementById("eventAttendanceView"),
    notifications: document.getElementById("notificationsView"),
    messages: document.getElementById("messagesView")
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");

function switchView(targetView) {
    // Hide all view containers
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });

    if (targetView === "HOME") {
        sidebar.classList.remove("mobile-hidden"); 
        mainContent.classList.remove("mobile-active");
        if (window.innerWidth > 1024) views.welcome.classList.remove("hidden-view");
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

// Map the 10 Grid Buttons
document.getElementById("btnHome").addEventListener("click", () => switchView("HOME"));
document.getElementById("btnNavAttendance").addEventListener("click", () => switchView(views.attendance));
document.getElementById("btnNavTimetable").addEventListener("click", () => switchView(views.timetable));
document.getElementById("btnNavInternalMarks").addEventListener("click", () => switchView(views.internalMarks));
document.getElementById("btnNavSubjects").addEventListener("click", () => switchView(views.subjects));
document.getElementById("btnNavCalendar").addEventListener("click", () => switchView(views.calendar));
document.getElementById("btnNavAssignments").addEventListener("click", () => switchView(views.assignments));
document.getElementById("btnNavStudentList").addEventListener("click", () => switchView(views.studentList));
document.getElementById("btnNavSubjectAssign").addEventListener("click", () => switchView(views.subjectAssign));
document.getElementById("btnNavBatch").addEventListener("click", () => switchView(views.batch));
document.getElementById("btnNavEventAttendance").addEventListener("click", () => switchView(views.eventAttendance));

// Map Bottom Pill Icons
document.getElementById("btnNotifications").addEventListener("click", () => switchView(views.notifications));
document.getElementById("btnMessages").addEventListener("click", () => switchView(views.messages));

// Settings Drawer
const elSettings = document.getElementById("settingsOverlay");
document.getElementById("btnSettings").addEventListener("click", () => elSettings.classList.add("active"));
document.getElementById("closeSettingsBtn").addEventListener("click", () => elSettings.classList.remove("active"));
elSettings.addEventListener("click", (e) => { if (e.target === elSettings) elSettings.classList.remove("active"); });

// Sign Out
document.getElementById("btnSignOut").addEventListener("click", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});
