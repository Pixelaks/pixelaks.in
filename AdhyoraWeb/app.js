// Import Firebase functions directly from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
// 🚨 ADDED: setDoc and serverTimestamp for Teacher registration
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// REPLACE THIS WITH YOUR FIREBASE WEB CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global State
let selectedCollegeID = "";
let selectedCollegeName = "";

// --- DOM ELEMENTS ---
const collegeDropdown = document.getElementById("collegeDropdown");
const roleDropdown = document.getElementById("roleDropdown");
const continueBtn = document.getElementById("continueBtn");
const signInBtn = document.getElementById("signInBtn");
const registerBtn = document.getElementById("registerBtn");

// --- UI HELPERS & NATIVE BACK BUTTON FIX ---
window.switchPanel = function(panelId, pushToHistory = true) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    
    if (pushToHistory) {
        history.pushState({ panel: panelId }, "", `#${panelId}`);
    }
}

window.addEventListener('load', () => {
    history.replaceState({ panel: 'roleSelectionPanel' }, "", "#roleSelectionPanel");
});

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.panel) {
        window.switchPanel(e.state.panel, false);
    } else {
        window.switchPanel('roleSelectionPanel', false);
    }
});

window.toggleVisibility = function(inputId, iconWrapper) {
    const input = document.getElementById(inputId);
    const icon = iconWrapper.querySelector('i');
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 4000); 
}

// --- 1. LOAD COLLEGES ON START ---
async function fetchColleges() {
    try {
        const querySnapshot = await getDocs(collection(db, "colleges"));
        collegeDropdown.innerHTML = '<option value="" disabled selected>Select Your College</option>';
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const option = document.createElement("option");
            option.value = docSnap.id;
            option.text = data.name || data.Name || "Unknown College";
            collegeDropdown.appendChild(option);
        });

        buildCustomDropdown('collegeDropdown');

    } catch (error) {
        showToast("Error loading colleges.");
        console.error(error);
    }
}
fetchColleges();

// --- 2. ROLE SELECTION LOGIC ---
function checkSelection() {
    if (collegeDropdown.value !== "" && roleDropdown.value !== "") {
        continueBtn.disabled = false;
    } else {
        continueBtn.disabled = true;
    }
}

collegeDropdown.addEventListener("change", checkSelection);
roleDropdown.addEventListener("change", checkSelection);

// --- DYNAMIC UI VISIBILITY ---
function updateSecurityInputsVisibility() {
    const role = roleDropdown.value;
    const regRollNoInput = document.getElementById("regRollNo");
    const regRoomCodeInput = document.getElementById("regRoomCode");
    const loginRoomCodeInput = document.getElementById("loginRoomCode");
    
    // Reset inputs
    if (regRollNoInput) regRollNoInput.style.display = "none";
    if (regRoomCodeInput) regRoomCodeInput.style.display = "none";
    if (loginRoomCodeInput) loginRoomCodeInput.style.display = "none";

    if (role === "Principal") {
        document.getElementById("signInTitle").innerText = "Principal SignIn";
        document.getElementById("registerTitle").innerText = "Principal Registration";
    } 
    // 🚨 ADDED: Teacher Layout Logic
    else if (role === "Teacher") {
        document.getElementById("signInTitle").innerText = "Teacher SignIn";
        document.getElementById("registerTitle").innerText = "Teacher Registration";
        if (regRoomCodeInput) regRoomCodeInput.style.display = "block";
        if (loginRoomCodeInput) loginRoomCodeInput.style.display = "block";
    } 
    else {
        document.getElementById("signInTitle").innerText = "Student SignIn";
        document.getElementById("registerTitle").innerText = "Student Registration";
        if (regRollNoInput) regRollNoInput.style.display = "block"; 
    }
}

// --- CONTINUE BUTTON CLICK ---
continueBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedCollegeID = collegeDropdown.value;
    selectedCollegeName = collegeDropdown.options[collegeDropdown.selectedIndex].text;
    
    updateSecurityInputsVisibility();
    window.switchPanel('signInPanel');
});

// --- 3. LOGIN LOGIC ---
signInBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const role = roleDropdown.value;

    if (!email || !password) {
        showToast("Enter Email and Password");
        return;
    }

    // 🚨 TEACHER ROOM CODE CHECK PRE-LOGIN
    let roomCode = "";
    if (role === "Teacher") {
        roomCode = document.getElementById("loginRoomCode").value.trim().toUpperCase();
        if (!roomCode) {
            showToast("Enter Room Code");
            return;
        }
    }

    signInBtn.disabled = true;
    signInBtn.innerText = "Processing...";

    try {
        // Teacher Room Code DB Validation (matches C# PerformRoomCodeValidation)
        if (role === "Teacher") {
            const secureID = "TEACHER_" + roomCode;
            const lookupRef = doc(db, "colleges", selectedCollegeID, "public_lookup", secureID);
            const lookupSnap = await getDoc(lookupRef);

            if (!lookupSnap.exists()) {
                showToast("Invalid Room Code.");
                resetSignInBtn();
                return;
            }
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
            showToast("Please verify your email first. Check your inbox!");
            await signOut(auth);
            resetSignInBtn();
            return;
        }

        // 🚨 ROLE-BASED VERIFICATION & ROUTING
        if (role === "Student") {
            showToast("Login Successful!");
            const rollNo = email.split('@')[0]; 
            window.location.href = `studentDashboard.html?college=${selectedCollegeID}&uid=${user.uid}&roll=${rollNo.toUpperCase()}`;
        } 
        // 🚨 ADDED: TEACHER LOGIN VERIFICATION
        else if (role === "Teacher") {
            showToast("Verifying Teacher Access...");
            const teacherRef = doc(db, "colleges", selectedCollegeID, "teachers", user.uid);
            const teacherSnap = await getDoc(teacherRef);

            if (teacherSnap.exists()) {
                const status = teacherSnap.data().status || "Pending";
                if (status === "Approved" || status === "Pending") {
                    showToast("Teacher Login Successful!");
                    window.location.href = `teacherDashboard.html?college=${selectedCollegeID}&uid=${user.uid}`;
                } else {
                    showToast("Access Denied. Account Status: " + status);
                    await signOut(auth);
                    resetSignInBtn();
                }
            } else {
                showToast("Teacher record not found in this college.");
                await signOut(auth);
                resetSignInBtn();
            }
        }
        else if (role === "Principal") {
            showToast("Verifying Principal Access...");
            const principalRef = doc(db, "colleges", selectedCollegeID, "principals", user.uid);
            const principalSnap = await getDoc(principalRef);

            if (principalSnap.exists()) {
                if (principalSnap.data().subRole === "Staff") {
                    showToast("Staff must request a 1-time access code to log in via App.");
                    await signOut(auth);
                    resetSignInBtn();
                    return;
                }
                
                showToast("Principal Login Successful!");
                window.location.href = `principalDashboard.html?college=${selectedCollegeID}`;
            } else {
                showToast("Access Denied: Not a Principal here.");
                await signOut(auth);
                resetSignInBtn();
            }
        }
        
    } catch (error) {
        showToast(getErrorMessage(error.code));
        resetSignInBtn();
    }
});

function resetSignInBtn() {
    signInBtn.disabled = false;
    signInBtn.innerText = "SignIn";
}

// --- 4. REGISTRATION LOGIC ---
registerBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const role = roleDropdown.value;
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regConfirmPassword").value;
    const rollNo = document.getElementById("regRollNo").value.trim().toUpperCase();
    const roomCode = document.getElementById("regRoomCode").value.trim().toUpperCase(); // 🚨 Added

    // Basic Validation
    if (!name || !email || !password) {
        showToast("Fill all required fields");
        return;
    }
    if (role === "Student" && !rollNo) {
        showToast("Roll Number is required for students");
        return;
    }
    if (role === "Teacher" && !roomCode) {
        showToast("Room Code is required for teachers");
        return;
    }
    if (password !== confirm) {
        showToast("Passwords do not match");
        return;
    }

    registerBtn.disabled = true;
    registerBtn.innerText = "Verifying...";

    try {
        // ==========================================
        // PRINCIPAL REGISTRATION FLOW
        // ==========================================
        if (role === "Principal") {
            const lockRef = doc(db, "colleges", selectedCollegeID, "public_lookup", "PRINCIPAL_LOCK");
            const lockSnap = await getDoc(lockRef);

            if (lockSnap.exists()) {
                showToast("Registration Blocked: A Principal is already registered for this college.");
                resetRegBtn();
                return;
            }

            registerBtn.innerText = "Creating Account...";
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            registerBtn.innerText = "Sending Verification...";
            await sendEmailVerification(user);

            const principalRef = doc(db, "colleges", selectedCollegeID, "principals", user.uid);
            await setDoc(principalRef, {
                name: name,
                email: email,
                role: "Principal",
                authID: user.uid,
                userID: user.uid,
                createdAt: serverTimestamp(),
                hasAgreedToDisclaimer: false,
                webFcmTokens: []
            });

            await setDoc(lockRef, {
                claimed: true,
                claimedByUID: user.uid,
                timestamp: serverTimestamp()
            });

            await signOut(auth);
            showToast("Success! A verification link has been sent to your email.");
            window.switchPanel('signInPanel');
        } 
        
        // ==========================================
        // 🚨 TEACHER REGISTRATION FLOW (ADDED)
        // ==========================================
        else if (role === "Teacher") {
            const secureID = "TEACHER_" + roomCode;
            const lookupRef = doc(db, "colleges", selectedCollegeID, "public_lookup", secureID);
            const lookupSnap = await getDoc(lookupRef);

            if (!lookupSnap.exists()) {
                showToast("Verification Failed. Invalid Room Code.");
                resetRegBtn();
                return;
            }

            const data = lookupSnap.data();
            const deptID = data.deptID || data.departmentID || "";

            if (!deptID) {
                showToast("Error: Room Code has no Department assigned.");
                resetRegBtn();
                return;
            }

            registerBtn.innerText = "Creating Account...";
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            registerBtn.innerText = "Sending Verification...";
            await sendEmailVerification(user);

            const teacherRef = doc(db, "colleges", selectedCollegeID, "teachers", user.uid);
            await setDoc(teacherRef, {
                name: name,
                email: email,
                role: "Teacher",
                authID: user.uid,
                userID: user.uid,
                hasAgreedToDisclaimer: false,
                webFcmTokens: [],
                createdAt: serverTimestamp(),
                departmentID: deptID,
                status: "Pending"
            });

            await signOut(auth);
            showToast("Success! A verification link has been sent to your email.");
            window.switchPanel('signInPanel');
        }

        // ==========================================
        // STUDENT REGISTRATION FLOW
        // ==========================================
        else if (role === "Student") {
            const lookupRef = doc(db, "colleges", selectedCollegeID, "public_lookup", rollNo);
            const lookupSnap = await getDoc(lookupRef);

            if (!lookupSnap.exists()) {
                showToast(`Verification Failed. Roll No: ${rollNo} not found.`);
                resetRegBtn();
                return;
            }

            const dbName = lookupSnap.data().name || "";
            const normalizedInputName = name.replace(/\s/g, "").toLowerCase();
            const normalizedDbName = dbName.replace(/\s/g, "").toLowerCase();

            if (normalizedInputName !== normalizedDbName) {
                showToast("Verification Failed: Name does not match Roll Number.");
                resetRegBtn();
                return;
            }

            registerBtn.innerText = "Creating Account...";
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            registerBtn.innerText = "Sending Verification...";
            await sendEmailVerification(user);

            const studentRef = doc(db, "colleges", selectedCollegeID, "students", rollNo);
            await updateDoc(studentRef, {
                userID: user.uid,
                email: email,
                authStatus: "Verified"
            });

            await signOut(auth);
            showToast("Success! A verification link has been sent to your email.");
            window.switchPanel('signInPanel');
        }

    } catch (error) {
        showToast(getErrorMessage(error.code));
    } finally {
        resetRegBtn();
    }
});

function resetRegBtn() {
    registerBtn.disabled = false;
    registerBtn.innerText = "Register";
}

function getErrorMessage(code) {
    switch (code) {
        case 'auth/email-already-in-use': return "Email already registered.";
        case 'auth/weak-password': return "Password too weak (Min 6 chars).";
        case 'auth/invalid-credential': return "Invalid email or password.";
        case 'auth/user-not-found': return "No account found.";
        default: return "An error occurred. Try again.";
    }
}


// ==========================================
// BACKGROUND PARTICLES & GLITCH EFFECTS
// ==========================================

tsParticles.load("tsparticles", {
    fpsLimit: 60, // Cap the framerate so it doesn't drain 120Hz/144Hz monitors
    detectRetina: false, // HUGE performance boost. Disables 4x pixel rendering on MacBooks/Phones
    particles: {
        number: { value: 50, density: { enable: true, area: 800 } }, // Reduced from 80 to 50 (barely noticeable)
        color: { value: "#2ecc71" }, 
        links: { 
            enable: true, 
            distance: 110, // Reduced from 150. Exponentially decreases the math required to draw lines
            color: "#2ecc71", 
            opacity: 0.3, 
            width: 1 
        },
        move: { enable: true, speed: 1.2, outModes: { default: "out" } }, // Slightly reduced speed
        opacity: { value: 0.4 },
        size: { value: { min: 1, max: 2 } } // Removed max 3 for better anti-aliasing performance
    },
    interactivity: {
        events: { onHover: { enable: true, mode: "grab" }, onClick: { enable: true, mode: "push" } },
        modes: { grab: { distance: 150, links: { opacity: 0.6 } }, push: { quantity: 4 } }
    },
    background: { color: "transparent" } 
});

const TARGET_TEXT = "ADHYORA";
const DECODE_SPEED = 6; 
const CHAOS_CHARS = "अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसहABCDEFGHIJKLMNOPQRSTUVWXYZ01010101#@%&*";

const elMain = document.getElementById('text-main');
const elRed = document.getElementById('text-red');
const elBlue = document.getElementById('text-blue');

let frame = 0;
let lockIndex = 0;
let isComplete = false;

function updateText() {
    if (isComplete) return;
    let output = "";
    
    for (let i = 0; i < TARGET_TEXT.length; i++) {
        if (i < lockIndex) {
            output += TARGET_TEXT[i];
        } else {
            output += CHAOS_CHARS[Math.floor(Math.random() * CHAOS_CHARS.length)];
        }
    }

    elMain.innerText = output;
    elRed.innerText = output;
    elBlue.innerText = output;

    if (Math.random() > 0.8) {
        elRed.style.transform = `translate(${Math.random()*4 - 2}px, ${Math.random()*4 - 2}px)`;
        elBlue.style.transform = `translate(${Math.random()*4 - 2}px, ${Math.random()*4 - 2}px)`;
        elRed.style.opacity = 0.8;
        elBlue.style.opacity = 0.8;
    } else {
        elRed.style.transform = "translate(0,0)";
        elBlue.style.transform = "translate(0,0)";
        elRed.style.opacity = 0;
        elBlue.style.opacity = 0;
    }

    if (frame % DECODE_SPEED === 0) {
        lockIndex++;
        if (lockIndex > TARGET_TEXT.length) {
            isComplete = true;
            finishSequence();
        }
    }
    
    frame++;
    requestAnimationFrame(updateText);
}

function finishSequence() {
    elMain.innerText = TARGET_TEXT;
    elRed.innerText = TARGET_TEXT;
    elBlue.innerText = TARGET_TEXT;
    elRed.style.opacity = 0;
    elBlue.style.opacity = 0;
    setInterval(subtleGlitch, 2500);
}

function subtleGlitch() {
    if(Math.random() > 0.4) return;
    elRed.style.opacity = 1;
    elBlue.style.opacity = 1;
    elRed.style.transform = `translate(-3px, 0)`;
    elBlue.style.transform = `translate(3px, 0)`;
    setTimeout(() => {
        elRed.style.opacity = 0;
        elBlue.style.opacity = 0;
    }, 100);
}

setTimeout(updateText, 500);

// ==========================================
// CUSTOM DROPDOWN BUILDER 
// ==========================================
function buildCustomDropdown(selectId) {
    let select = document.getElementById(selectId);
    if (!select || select.style.display === 'none') return;

    let customUI = document.createElement('div');
    customUI.className = 'custom-select-wrapper';

    let trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    let currentText = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : 'Select...';
    trigger.innerHTML = `<span>${currentText}</span><span style="font-size:10px; color:#2ecc71;">▼</span>`;

    let optionsList = document.createElement('div');
    optionsList.className = 'custom-options';

    Array.from(select.options).forEach((opt, index) => {
        if (index === 0 && opt.disabled) return; 

        let item = document.createElement('div');
        item.className = 'custom-option';
        if (opt.disabled) item.classList.add('disabled');
        item.innerText = opt.text;

        item.addEventListener('click', () => {
            if (opt.disabled) return;
            select.value = opt.value;
            trigger.querySelector('span').innerText = opt.text;
            customUI.classList.remove('open');
            select.dispatchEvent(new Event('change'));
        });
        optionsList.appendChild(item);
    });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-wrapper').forEach(el => {
            if(el !== customUI) el.classList.remove('open');
        });
        customUI.classList.toggle('open');
    });

    customUI.appendChild(trigger);
    customUI.appendChild(optionsList);
    
    select.parentNode.insertBefore(customUI, select);
    select.style.display = 'none';
}

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(el => el.classList.remove('open'));
});

buildCustomDropdown('roleDropdown');
