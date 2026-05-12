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
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 4000); // 🚨 Increased to 4 seconds so they have time to read the email message
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

continueBtn.addEventListener("click", () => {
    selectedCollegeID = collegeDropdown.value;
    selectedCollegeName = collegeDropdown.options[collegeDropdown.selectedIndex].text;
    window.switchPanel('signInPanel');
});

// --- 3. STUDENT LOGIN LOGIC ---
signInBtn.addEventListener("click", async () => {
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

        // 🚨 PRODUCTION LOCK: Re-enabled!
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
registerBtn.addEventListener("click", async () => {
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
        // Step 1: Check public_lookup EXACTLY like your C# code
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

        // Step 2: Create Auth Account
        registerBtn.innerText = "Creating Account...";
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 🚨 PRODUCTION SECURITY: Send the verification email instantly!
        registerBtn.innerText = "Sending Verification...";
        await sendEmailVerification(user);

        // Step 3: Update Firestore document
        const studentRef = doc(db, "colleges", selectedCollegeID, "students", rollNo);
        await updateDoc(studentRef, {
            userID: user.uid,
            email: email,
            authStatus: "Verified"
        });

        // Step 4: Cleanup
        await signOut(auth);
        
        // 🚨 Tell the user to check their email!
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

// Map Firebase Error codes to friendly text
function getErrorMessage(code) {
    switch (code) {
        case 'auth/email-already-in-use': return "Email already registered.";
        case 'auth/weak-password': return "Password too weak (Min 6 chars).";
        case 'auth/invalid-credential': return "Invalid email or password.";
        case 'auth/user-not-found': return "No account found.";
        default: return "An error occurred. Try again.";
    }
}
