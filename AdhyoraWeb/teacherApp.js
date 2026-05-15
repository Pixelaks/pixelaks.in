import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

let currentCollegeID = "";
let currentUserID = "";
let isHOD = false;
let profileListener = null;

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
// 🚨 PROFILE DATA ENGINE (Replicating C# logic)
// ==========================================
function ListenToProfile() {
    if (profileListener) profileListener(); // Unsubscribe if existing

    const teacherDocRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);

    profileListener = onSnapshot(teacherDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            document.getElementById("teacherNameText").innerText = "Profile Data Not Found";
            return;
        }

        const data = snapshot.data();
        
        // 1. Get Data
        isHOD = data.isHOD || false;
        const rawName = data.name || "Unknown";
        const email = auth.currentUser.email || data.email;

        // 2. Format Department
        let deptName = "Unknown Dept";
        if (data.department) {
            deptName = data.department;
        } else if (data.departmentID) {
            deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
        }

        // 3. Update UI Elements
        let hodBadgeText = isHOD ? " (HOD)" : "";
        
        document.getElementById("teacherNameText").innerHTML = `${rawName} <span style="color:#f59e0b; font-size:14px;">${hodBadgeText}</span>`;
        document.getElementById("teacherEmailText").innerText = email;
        document.getElementById("teacherDeptBadge").innerText = deptName;

        // Unlock UI once data is loaded
        document.getElementById("initialAppLoader").style.display = "none";
    }, (error) => {
        console.error("Error listening to profile:", error);
        document.getElementById("teacherNameText").innerText = "Network Error";
    });
}


// ==========================================
// 🚨 SETTINGS DRAWER ACTIONS
// ==========================================
const SUPPORT_EMAIL = "pixelaks.technologies@gmail.com";
const EMAIL_SUBJECT = "Support Request - Teacher Web App";

document.getElementById("btnContactUs").addEventListener("click", () => {
    let role = isHOD ? "Teacher (HOD)" : "Teacher";
    let deviceInfo = `\n========================\nBrowser/Device: ${navigator.userAgent}\nOS: ${navigator.platform}\nApp Version: 1.0.0 (Web)\nCollege ID: ${currentCollegeID}\nRole: ${role}\n========================`;
    
    window.open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent("Please describe your issue here:\n\n\n" + deviceInfo)}`, "_blank");
});

document.getElementById("btnWebsite").addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));
document.getElementById("btnPrivacy").addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
document.getElementById("btnTerms").addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));

document.getElementById("btnSignOut").addEventListener("click", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});


// ==========================================
// 🚨 THEME MANAGER
// ==========================================
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add("dark-mode");
        document.getElementById("btnDarkMode").style.border = "2px solid var(--brand-red)";
        document.getElementById("btnLightMode").style.border = "1px solid #475569";
    } else {
        document.body.classList.remove("dark-mode");
        document.getElementById("btnLightMode").style.border = "2px solid var(--brand-red)";
        document.getElementById("btnDarkMode").style.border = "1px solid #cbd5e1";
    }
    localStorage.setItem("adhyora_teacher_theme", isDark ? "dark" : "light");
}

document.getElementById("btnDarkMode").addEventListener("click", () => applyTheme(true));
document.getElementById("btnLightMode").addEventListener("click", () => applyTheme(false));

applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");


// ==========================================
// 🚨 UI NAVIGATION ROUTER
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
const navButtons = document.querySelectorAll(".nav-icon-btn");

function switchView(targetView, clickedBtn) {
    // Reset Top/Bottom Nav Icons
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn && clickedBtn.classList.contains('nav-icon-btn')) {
        clickedBtn.classList.add("active-nav");
    }

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

// Map the 10 Sidebar Buttons
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

// Map Top/Bottom Nav Pill Icons
document.getElementById("btnNotifications").addEventListener("click", (e) => switchView(views.notifications, e.currentTarget));
document.getElementById("btnMessages").addEventListener("click", (e) => switchView(views.messages, e.currentTarget));

// Settings & Modals Drawer
const elSettings = document.getElementById("settingsOverlay");
document.getElementById("btnSettings").addEventListener("click", () => elSettings.classList.add("active"));
document.getElementById("closeSettingsBtn").addEventListener("click", () => elSettings.classList.remove("active"));
elSettings.addEventListener("click", (e) => { if (e.target === elSettings) elSettings.classList.remove("active"); });

document.getElementById("btnThemes").addEventListener("click", () => {
    elSettings.classList.remove("active");
    document.getElementById("themesModal").classList.add("active");
});

document.getElementById("btnOpenCompose").addEventListener("click", () => {
    document.getElementById("composeOverlay").classList.add("active");
});
document.getElementById("closeComposeBtn").addEventListener("click", () => {
    document.getElementById("composeOverlay").classList.remove("active");
});

// Generic Toast Function
window.showRcToast = function(msg) { 
    let t = document.getElementById("rcToast"); 
    t.innerText = msg; 
    t.style.bottom = "30px"; 
    setTimeout(() => t.style.bottom = "-100px", 3000); 
};
