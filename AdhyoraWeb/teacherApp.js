import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// Ensure user accessed via valid URL
const urlParams = new URLSearchParams(window.location.search);
currentCollegeID = urlParams.get('college');

if (!currentCollegeID) { 
    window.location.href = "index.html"; 
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) { 
            currentUserID = user.uid; 
            
            // For now, immediately unlock the UI (We will add the DB check later)
            document.getElementById("initialAppLoader").style.display = "none";
            document.getElementById("teacherNameText").innerText = "Teacher Profile";
            document.getElementById("teacherEmailText").innerText = user.email;
        } 
        else { 
            window.location.href = "index.html"; 
        }
    });
}

// ==========================================
// 🚨 THEME MANAGER
// ==========================================
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add("dark-mode");
        document.getElementById("btnDarkMode").style.border = "2px solid var(--brand-green)";
        document.getElementById("btnLightMode").style.border = "1px solid #475569";
    } else {
        document.body.classList.remove("dark-mode");
        document.getElementById("btnLightMode").style.border = "2px solid var(--brand-green)";
        document.getElementById("btnDarkMode").style.border = "1px solid #cbd5e1";
    }
    localStorage.setItem("adhyora_teacher_theme", isDark ? "dark" : "light");
}

document.getElementById("btnDarkMode").addEventListener("click", () => applyTheme(true));
document.getElementById("btnLightMode").addEventListener("click", () => applyTheme(false));

// Load saved theme immediately on boot
applyTheme(localStorage.getItem("adhyora_teacher_theme") === "dark");

// ==========================================
// 🚨 UI NAVIGATION ROUTER
// ==========================================
const views = {
    welcome: document.getElementById("welcomeView"),
    profile: document.getElementById("profileView"),
    timetable: document.getElementById("timetableView"),
    attendance: document.getElementById("attendanceView"),
    marks: document.getElementById("marksView"),
    students: document.getElementById("studentsView"),
    events: document.getElementById("eventsView"),
    notifications: document.getElementById("notificationsView"), 
    calendar: document.getElementById("calendarView"), 
    messages: document.getElementById("messagesView")
};

const sidebar = document.getElementById("mainSidebar");
const mainContent = document.querySelector(".main-content");
const navButtons = document.querySelectorAll(".nav-icon-btn");

function switchView(targetView, clickedBtn) {
    // Reset Top Nav Icons
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    if (clickedBtn && clickedBtn.classList.contains('nav-icon-btn')) {
        clickedBtn.classList.add("active-nav");
    }

    // Hide all views
    Object.values(views).forEach(v => { if (v) v.classList.add("hidden-view"); });

    // Handle Mobile Sidebar vs Main Content Toggle
    if (targetView === "HOME") {
        sidebar.classList.remove("mobile-hidden"); 
        mainContent.classList.remove("mobile-active");
        if (window.innerWidth > 900) views.welcome.classList.remove("hidden-view");
    } else {
        sidebar.classList.add("mobile-hidden"); 
        mainContent.classList.add("mobile-active");
        
        // Show Target View with fade in
        if (targetView) { 
            targetView.classList.remove("hidden-view"); 
            targetView.style.opacity = 0; 
            setTimeout(() => targetView.style.opacity = 1, 50); 
        }
    }
}

// Top Nav Listeners
document.getElementById("btnHome").addEventListener("click", (e) => switchView("HOME", e.currentTarget));
document.getElementById("btnNotifications").addEventListener("click", (e) => switchView(views.notifications, e.currentTarget));
document.getElementById("btnCalendar").addEventListener("click", (e) => switchView(views.calendar, e.currentTarget));
document.getElementById("btnMessages").addEventListener("click", (e) => switchView(views.messages, e.currentTarget));

// Sidebar Listeners
document.getElementById("btnNavProfile").addEventListener("click", () => switchView(views.profile));
document.getElementById("btnNavTimetable").addEventListener("click", () => switchView(views.timetable));
document.getElementById("btnNavAttendance").addEventListener("click", () => switchView(views.attendance));
document.getElementById("btnNavMarks").addEventListener("click", () => switchView(views.marks));
document.getElementById("btnNavStudents").addEventListener("click", () => switchView(views.students));
document.getElementById("btnNavEvents").addEventListener("click", () => switchView(views.events));

// ==========================================
// 🚨 MODAL & SETTINGS MANAGER
// ==========================================
const elSettings = document.getElementById("settingsOverlay");

// Settings Drawer
document.getElementById("btnSettings").addEventListener("click", () => elSettings.classList.add("active"));
document.getElementById("closeSettingsBtn").addEventListener("click", () => elSettings.classList.remove("active"));
elSettings.addEventListener("click", (e) => { if (e.target === elSettings) elSettings.classList.remove("active"); });

// Themes Modal
document.getElementById("btnThemes").addEventListener("click", () => {
    elSettings.classList.remove("active");
    document.getElementById("themesModal").classList.add("active");
});

// Devices Modal
document.getElementById("btnDevices").addEventListener("click", () => {
    elSettings.classList.remove("active");
    document.getElementById("sessionsModal").classList.add("active");
});

// Compose Message Modal
document.getElementById("btnOpenCompose").addEventListener("click", () => {
    document.getElementById("composeOverlay").classList.add("active");
});
document.getElementById("closeComposeBtn").addEventListener("click", () => {
    document.getElementById("composeOverlay").classList.remove("active");
});

// Basic Sign Out
document.getElementById("btnSignOut").addEventListener("click", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});

// Generic Toast Function
window.showRcToast = function(msg) { 
    let t = document.getElementById("rcToast"); 
    t.innerText = msg; 
    t.style.bottom = "30px"; 
    setTimeout(() => t.style.bottom = "-100px", 3000); 
};
