// Import Firebase functions directly from CDN (No Node.js needed!)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 🚨 REPLACE THIS WITH YOUR FIREBASE WEB CONFIG 🚨
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

// --- UI HELPERS ---
window.switchPanel = function(panelId) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
}

window.toggleVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === "password" ? "text" : "password";
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

        // Build Custom UI for College Selection after data loads
        buildCustomDropdown('collegeDropdown');

    } catch (error) {
        showToast("Error loading colleges.");
        console.error(error);
    }
}
fetchColleges();

// --- 2. ROLE SELECTION LOGIC ---
function checkSelection() {
    if (collegeDropdown.value !== "" && roleDropdown.value === "Student") {
        continueBtn.disabled = false;
    } else {
        continueBtn.disabled = true;
    }
}

collegeDropdown.addEventListener("change", checkSelection);
roleDropdown.addEventListener("change", checkSelection);

continueBtn.addEventListener("click", (e) => {
    e.preventDefault();
    selectedCollegeID = collegeDropdown.value;
    selectedCollegeName = collegeDropdown.options[collegeDropdown.selectedIndex].text;
    window.switchPanel('signInPanel');
});

// --- 3. STUDENT LOGIN LOGIC ---
signInBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showToast("Enter Email and Password");
        return;
    }

    signInBtn.disabled = true;
    signInBtn.innerText = "Processing...";

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
            showToast("Please verify your email first. Check your inbox!");
            await signOut(auth);
            resetSignInBtn();
            return;
        }

        showToast("Login Successful!");
        const rollNo = email.split('@')[0]; 
        window.location.href = `studentDashboard.html?college=${selectedCollegeID}&uid=${user.uid}&roll=${rollNo.toUpperCase()}`;
        
    } catch (error) {
        showToast(getErrorMessage(error.code));
        resetSignInBtn();
    }
});

function resetSignInBtn() {
    signInBtn.disabled = false;
    signInBtn.innerText = "SignIn";
}

// --- 4. STUDENT REGISTRATION LOGIC ---
registerBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const name = document.getElementById("regName").value.trim();
    const rollNo = document.getElementById("regRollNo").value.trim().toUpperCase();
    const email = document.getElementById("regEmail").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regConfirmPassword").value;

    if (!name || !rollNo || !email || !password) {
        showToast("Fill all fields");
        return;
    }
    if (password !== confirm) {
        showToast("Passwords do not match");
        return;
    }

    registerBtn.disabled = true;
    registerBtn.innerText = "Verifying...";

    try {
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

// Initialize Particles
tsParticles.load("tsparticles", {
    particles: {
        number: { value: 80, density: { enable: true, area: 800 } },
        color: { value: "#2ecc71" }, 
        links: { enable: true, distance: 150, color: "#2ecc71", opacity: 0.3, width: 1 },
        move: { enable: true, speed: 1.5, outModes: { default: "out" } },
        opacity: { value: 0.4 },
        size: { value: { min: 1, max: 3 } }
    },
    interactivity: {
        events: { onHover: { enable: true, mode: "grab" }, onClick: { enable: true, mode: "push" } },
        modes: { grab: { distance: 150, links: { opacity: 0.6 } }, push: { quantity: 4 } }
    },
    background: { color: "transparent" } 
});

// Glitch Logic
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

// Start glitch 500ms after load
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

// Build Role dropdown on load
buildCustomDropdown('roleDropdown');
