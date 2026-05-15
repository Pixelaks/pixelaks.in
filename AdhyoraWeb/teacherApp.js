import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

try { enableIndexedDbPersistence(db); } catch(e) {}

let currentCollegeID = "";
let currentUserID = "";
let isHOD = false;
let profileListener = null;

// UI Elements
const el = {
    teacherName: document.getElementById("teacherNameText"),
    teacherDept: document.getElementById("teacherDeptText"),
    teacherEmail: document.getElementById("teacherEmailText"),
    settingsOverlay: document.getElementById("settingsOverlay"),
    hodNotificationOverlay: document.getElementById("hodNotificationOverlay")
};

// 1. Wait For Auth & URL Parameters (Translating WaitForAuthAndLoad)
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

// 2. Fetch Profile Logic (Translating ListenToProfile)
function ListenToProfile() {
    if (profileListener) profileListener(); // Clear old listener

    const teacherDocRef = doc(db, "colleges", currentCollegeID, "teachers", currentUserID);

    profileListener = onSnapshot(teacherDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            el.teacherName.innerText = "Profile Not Found";
            return;
        }

        const data = snapshot.data();
        
        // Check HOD Status
        isHOD = data.isHOD || false;
        let hodBadge = isHOD ? " <span style='color:#eab308;'>(HOD)</span>" : "";

        // Format Name and Email
        let rawName = data.name || "Unknown";
        el.teacherName.innerHTML = rawName + hodBadge;
        el.teacherEmail.innerText = auth.currentUser.email || "No Email Provided";

        // Format Department (Strip out 'DEPT_')
        let deptName = "Unknown Dept";
        if (data.department) {
            deptName = data.department;
        } else if (data.departmentID) {
            deptName = data.departmentID.replace("DEPT_", "").replace(/_/g, " ");
        }
        el.teacherDept.innerText = deptName;

        // HOD Notification Logic (Translating SecurePrefs logic)
        if (isHOD) {
            let seenKey = `HOD_Seen_${currentUserID}`;
            if (localStorage.getItem(seenKey) !== "1") {
                el.hodNotificationOverlay.classList.add("active");
                localStorage.setItem(seenKey, "1");
            }
        }
    });
}

// 3. Contact Support Logic (Translating OnContactUsClicked)
document.getElementById("btnContactUs").addEventListener("click", () => {
    let role = isHOD ? "Teacher (HOD)" : "Teacher";
    let deviceInfo = `\n========================\nDiagnostic Information\n========================\nBrowser/Device: ${navigator.userAgent}\nOS: ${navigator.platform}\nApp Version: 1.0.0 (Web)\nCollege ID: ${currentCollegeID}\nRole: ${role}\n========================`;
    
    let userPrompt = "Please describe your issue here:\n\n\n";
    let fullMessage = userPrompt + deviceInfo;
    
    window.open(`mailto:pixelaks.technologies@gmail.com?subject=${encodeURIComponent("Support Request - Teacher App")}&body=${encodeURIComponent(fullMessage)}`, "_blank");
});

// 4. Basic UI Button Wiring
document.getElementById("btnSettings").addEventListener("click", () => el.settingsOverlay.classList.add("active"));
document.getElementById("closeSettingsBtn").addEventListener("click", () => el.settingsOverlay.classList.remove("active"));
document.getElementById("btnPrivacy").addEventListener("click", () => window.open("https://pixelaks.in/privacy", "_blank"));
document.getElementById("btnTerms").addEventListener("click", () => window.open("https://pixelaks.in/terms", "_blank"));
document.getElementById("btnWebsite").addEventListener("click", () => window.open("https://pixelaks.in/", "_blank"));

document.getElementById("btnSignOut").addEventListener("click", () => { 
    if (confirm("Sign out?")) signOut(auth).then(() => window.location.href = "index.html"); 
});