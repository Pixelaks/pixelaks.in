// ==========================================
// 🚨 NEW: TIMETABLE MANAGER (100% C# TRANSLATION)
// ==========================================
let ttLoaded = false;
let ttPhase = 0; // 0 = StructureInput, 1 = Locked
let ttCurrentSem = "1";
let ttSelectedDay = "Monday";

let ttSubjectsCached = false;
let ttAllSubjectsMasterList = [];
let ttCachedCategoriesList = [];
let ttCachedSubjectsByCategory = {};
let ttCachedTimetableStructures = {};
let ttStructureListener = null;

let ttActiveSlotsData = []; // Array of { period, splitIndex, isSplit, category, subject, teacher, room, bgCol, markerID }
const ttPeriodEndTimes = [10.5, 11.5, 12.5, 14.5, 15.5, 16.5];

const viewsTT = { timetable: document.getElementById("timetableView") };
Object.assign(views, viewsTT); // Add to master view router

document.getElementById("btnNavTimetable").addEventListener("click", () => { 
    switchView(views.timetable); 
    if (!ttLoaded) TT_Init(); 
});

function TT_Init() {
    ttLoaded = true;
    
    // 1. Populate Semester Dropdown
    let dropSem = document.getElementById("ttSemDrop");
    dropSem.innerHTML = ""; 
    let hasSems = false;
    let defaultIndex = (collegeSemesterType === "Even") ? 1 : 0;
    
    for (let i = 1; i <= 8; i++) {
        let isOdd = (i % 2 !== 0);
        let label = `Semester ${i}`;
        if ((collegeSemesterType === "Odd" && isOdd) || (collegeSemesterType === "Even" && !isOdd)) label += " (Active)";
        dropSem.innerHTML += `<option value="${i}">${label}</option>`;
        hasSems = true;
    }
    if(!hasSems) dropSem.innerHTML = `<option value="1">Semester 1</option>`; 
    
    dropSem.selectedIndex = defaultIndex;
    ttCurrentSem = dropSem.options[defaultIndex].value;

    dropSem.addEventListener("change", (e) => { 
        ttCurrentSem = e.target.value; 
        TT_LoadGlobalCategories(); 
    });

    // 2. Day Selection
    let dBtns = document.querySelectorAll(".tt-day-btn");
    dBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            ttSelectedDay = e.target.dataset.day;
            dBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            TT_LoadTimetableForDay();
        });
    });

    // 3. Actions
    document.getElementById("btnTTAssign").addEventListener("click", TT_SaveStructureAndLock);
    document.getElementById("btnTTEdit").addEventListener("click", () => TT_SetPhase(0));

    TT_LoadGlobalCategories();
    
    // Timeline Auto-updater
    setInterval(() => {
        if (!document.getElementById('timetableView').classList.contains('hidden-view')) {
            TT_UpdateTimelineVisuals();
        }
    }, 60000); // Check every minute
}

function TT_LoadGlobalCategories() {
    if (ttSubjectsCached) {
        TT_ProcessSubjectsFromRAM();
        return;
    }

    getDocs(collection(db, "colleges", currentCollegeID, "subjects")).then(snap => {
        ttAllSubjectsMasterList = [];
        snap.forEach(doc => {
            let d = doc.data();
            ttAllSubjectsMasterList.push({
                semester: (d.Semester || d.semester || "").toString(),
                type: (d.Type || d.type || "").trim(),
                name: (d.Name || d.name || "").trim()
            });
        });
        ttSubjectsCached = true;
        TT_ProcessSubjectsFromRAM();
    });
}

function TT_ProcessSubjectsFromRAM() {
    let types = new Set();
    ttCachedSubjectsByCategory = {};

    ttAllSubjectsMasterList.forEach(sub => {
        let sems = sub.semester.split(',').map(s => s.trim());
        if (sems.includes(ttCurrentSem) && sub.type) {
            types.add(sub.type);
            if (!ttCachedSubjectsByCategory[sub.type]) ttCachedSubjectsByCategory[sub.type] = [];
            ttCachedSubjectsByCategory[sub.type].push(sub.name);
        }
    });

    ttCachedCategoriesList = Array.from(types).sort();
    if (!ttCachedCategoriesList.includes("Select Category")) ttCachedCategoriesList.unshift("Select Category");
    if (!ttCachedCategoriesList.includes("Break")) ttCachedCategoriesList.push("Break");
    if (!ttCachedCategoriesList.includes("Lunch")) ttCachedCategoriesList.push("Lunch");

    // Set Today
    let dayNum = new Date().getDay(); // 0=Sun, 1=Mon...
    let todayIndex = (dayNum >= 1 && dayNum <= 5) ? dayNum - 1 : 0;
    const daysList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    
    ttSelectedDay = daysList[todayIndex];
    let dBtns = document.querySelectorAll(".tt-day-btn");
    dBtns.forEach((b, idx) => {
        if(idx === todayIndex) b.classList.add("active"); else b.classList.remove("active");
    });

    TT_LoadTimetableForDay();
}

function TT_LoadTimetableForDay() {
    let docID = `Sem${ttCurrentSem}_${ttSelectedDay}`;

    if (ttStructureListener) ttStructureListener(); // stop old listener

    if (ttCachedTimetableStructures[docID]) {
        TT_BuildSlotsFromData(ttCachedTimetableStructures[docID]);
    }

    ttStructureListener = onSnapshot(doc(db, "colleges", currentCollegeID, "timetable_structure", docID), (snapshot) => {
        let slotsData = {};
        if (snapshot.exists() && snapshot.data().slots) {
            slotsData = snapshot.data().slots;
        }
        ttCachedTimetableStructures[docID] = slotsData;
        TT_BuildSlotsFromData(slotsData);
    });
}

function TT_BuildSlotsFromData(slotsData) {
    ttActiveSlotsData = [];
    let hasStructure = Object.keys(slotsData).length > 0;

    for (let p = 1; p <= 6; p++) {
        let mainKey = `P${p}`;
        let mainCat = slotsData[mainKey] || "Select Category";
        
        ttActiveSlotsData.push({
            period: p, splitIndex: 0, isSplit: false,
            category: mainCat, subject: "Select Subject", teacher: "Waiting for HOD", room: "", bgCol: "white"
        });
    }

    TT_SetPhase(hasStructure ? 1 : 0); // 1 = Locked, 0 = StructureInput
}

function TT_SetPhase(phase) {
    ttPhase = phase;
    document.getElementById("btnTTAssign").style.display = (phase === 0) ? "inline-flex" : "none";
    document.getElementById("btnTTEdit").style.display = (phase === 1) ? "inline-flex" : "none";
    TT_RenderLayout();
}

function TT_RenderLayout() {
    let wrapper = document.getElementById("ttMainWrapper");
    
    // Sort array
    ttActiveSlotsData.sort((a, b) => {
        if (a.period !== b.period) return a.period - b.period;
        return a.splitIndex - b.splitIndex;
    });

    let html = "";
    ttActiveSlotsData.forEach((slot, idx) => {
        let idBase = `tt_${slot.period}_${slot.splitIndex}`;
        
        // Build Category Options
        let catOpts = ttCachedCategoriesList.map(c => `<option value="${c}" ${c === slot.category ? 'selected' : ''}>${c}</option>`).join('');
        
        // Build Subject Options (Only if Phase 1 and not a split)
        let subOpts = `<option value="Select Subject">Select Subject</option>`;
        if (ttPhase === 1 && !slot.isSplit && ttCachedSubjectsByCategory[slot.category]) {
            subOpts += ttCachedSubjectsByCategory[slot.category].map(s => `<option value="${s}" ${s === slot.subject ? 'selected' : ''}>${s}</option>`).join('');
        } else if (slot.subject !== "Select Subject") {
            subOpts += `<option value="${slot.subject}" selected>${slot.subject}</option>`;
        }

        // Lock Logic
        let catLocked = (ttPhase === 1) ? "disabled" : "";
        let subLocked = (ttPhase === 1 && !slot.isSplit) ? "" : "disabled";

        let cardClass = slot.isSplit ? "tt-card tt-split-card" : "tt-card";
        let nodeNum = slot.isSplit ? "" : slot.period;
        let nodeColor = slot.isSplit ? "transparent" : "white";
        let nodeBorder = slot.isSplit ? "none" : "2px solid #333";
        let bgPaint = slot.bgCol || "white";

        html += `
        <div class="tt-row" id="row_${idBase}">
            <div class="tt-timeline-col">
                <div class="tt-node" id="node_${idBase}" style="background:${nodeColor}; border:${nodeBorder}">${nodeNum}</div>
                ${!slot.isSplit && slot.period < 6 ? `<div class="tt-line-bg"><div class="tt-line-fill" id="fill_${idBase}"></div></div>` : ''}
            </div>
            <div class="${cardClass}" style="background-color: ${bgPaint}">
                <select class="tt-input-field select" id="cat_${idBase}" ${catLocked}>${catOpts}</select>
                <select class="tt-input-field select" id="sub_${idBase}" ${subLocked}>${subOpts}</select>
                <select class="tt-input-field select" disabled><option>${slot.teacher}</option></select>
                <input type="text" class="tt-input-field" disabled value="${slot.room}" placeholder="Room TBD">
            </div>
        </div>`;
    });

    wrapper.innerHTML = html;
    TT_UpdateTimelineVisuals();

    // Attach Event Listeners
    ttActiveSlotsData.forEach((slot) => {
        let idBase = `tt_${slot.period}_${slot.splitIndex}`;
        
        if (!slot.isSplit && ttPhase === 0) {
            document.getElementById(`cat_${idBase}`).addEventListener("change", (e) => {
                slot.category = e.target.value;
            });
        }
        
        if (!slot.isSplit && ttPhase === 1) {
            document.getElementById(`sub_${idBase}`).addEventListener("change", (e) => {
                slot.subject = e.target.value;
                TT_OnSubjectSelectedByPrincipal(slot.period, slot.subject);
            });
        }
    });
}

function TT_OnSubjectSelectedByPrincipal(period, subjectName) {
    // 1. Remove old splits for this period
    ttActiveSlotsData = ttActiveSlotsData.filter(s => !(s.period === period && s.isSplit));
    let mainSlot = ttActiveSlotsData.find(s => s.period === period && !s.isSplit);
    
    if (subjectName === "Select Subject" || subjectName === "Waiting for HOD" || !subjectName) {
        mainSlot.teacher = "Waiting for HOD";
        mainSlot.room = "";
        mainSlot.bgCol = "white";
        TT_RenderLayout();
        return;
    }

    mainSlot.teacher = "Loading...";
    TT_RenderLayout(); // Show loading instantly

    // Query DB for Allocation
    getDocs(query(collection(db, "colleges", currentCollegeID, "timetable_allocations"),
        where("semester", "==", ttCurrentSem),
        where("day", "==", ttSelectedDay),
        where("period", "==", period.toString()),
        where("subjectName", "==", subjectName)
    )).then(snap => {
        if (snap.empty) {
            mainSlot.teacher = "Waiting for HOD";
            mainSlot.room = "";
            mainSlot.bgCol = "white";
            TT_RenderLayout();
            return;
        }

        let docs = [];
        snap.forEach(d => docs.push(d.data()));
        docs.sort((a,b) => (parseInt(a.splitIndex) || 0) - (parseInt(b.splitIndex) || 0));

        let mainDoc = docs[0];
        mainSlot.teacher = mainDoc.teacherName || "Unassigned";
        mainSlot.room = mainDoc.room || "TBD";
        mainSlot.markerID = mainDoc.teacherID || "";
        
        TT_CheckAttendanceCompliance(mainSlot, subjectName);

        // Process Splits
        for (let i = 1; i < docs.length; i++) {
            let sDoc = docs[i];
            let newSplit = {
                period: period,
                splitIndex: parseInt(sDoc.splitIndex),
                isSplit: true,
                category: mainSlot.category,
                subject: subjectName,
                teacher: sDoc.teacherName || "Unassigned",
                room: sDoc.room || "TBD",
                bgCol: "white",
                markerID: sDoc.teacherID || ""
            };
            ttActiveSlotsData.push(newSplit);
            TT_CheckAttendanceCompliance(newSplit, subjectName);
        }
    });
}

function TT_CheckAttendanceCompliance(slotObj, subjectName) {
    // Math to get target date
    let currentDayNum = new Date().getDay();
    if (currentDayNum === 0) currentDayNum = 7;
    const daysList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    let targetDayNum = daysList.indexOf(ttSelectedDay) + 1;
    let daysDiff = targetDayNum - currentDayNum;
    
    let targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysDiff);
    let dateStr = targetDate.toISOString().split('T')[0];

    // Check deadlines
    let now = new Date();
    let currentHour = now.getHours() + (now.getMinutes() / 60.0);
    let endTime = ttPeriodEndTimes[slotObj.period - 1];

    let isDeadlinePassed = false;
    
    // Wipe time to safely compare dates
    let targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    let nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (targetDateOnly < nowDateOnly) {
        isDeadlinePassed = true;
    } else if (targetDateOnly.getTime() === nowDateOnly.getTime()) {
        if (currentHour >= endTime) isDeadlinePassed = true;
    }

    if (!isDeadlinePassed) {
        slotObj.bgCol = "white";
        TT_RenderLayout();
        return;
    }

    // Ping DB for Attendance Record
    let semName = `Semester${ttCurrentSem}`;
    let cleanSubID = subjectName.replace(/\s+/g, '').replace(/\//g, '-').replace(/\./g, '');
    let docID = `${dateStr}_${semName}_${cleanSubID}`;
    let periodKey = `period_${slotObj.period}`;

    getDoc(doc(db, "colleges", currentCollegeID, "attendance", docID)).then(snap => {
        if (snap.exists() && snap.data()[periodKey]) {
            let pData = snap.data()[periodKey];
            
            // NEP Split Check
            if (slotObj.isSplit || pData.batch_teachers) {
                let batchMap = pData.batch_teachers || {};
                let bKey = slotObj.isSplit ? slotObj.splitIndex.toString() : "common";
                
                if (batchMap[bKey]) {
                    let markerID = batchMap[bKey].id || "";
                    slotObj.bgCol = (markerID === slotObj.markerID) ? "rgba(187,247,208,0.6)" : "rgba(254,240,138,0.6)"; // Green : Yellow
                } else {
                    slotObj.bgCol = "rgba(254,202,202,0.6)"; // Red
                }
            } else {
                let actualID = pData.markedByTeacherID || "";
                slotObj.bgCol = (actualID === slotObj.markerID) ? "rgba(187,247,208,0.6)" : "rgba(254,240,138,0.6)";
            }
        } else {
            slotObj.bgCol = "rgba(254,202,202,0.6)"; // Red (Missed!)
        }
        TT_RenderLayout();
    }).catch(e => {
        slotObj.bgCol = "rgba(254,202,202,0.6)";
        TT_RenderLayout();
    });
}

function TT_SaveStructureAndLock() {
    document.getElementById("btnTTAssign").innerText = "Saving...";
    
    let newSlots = {};
    ttActiveSlotsData.forEach(s => {
        if (!s.isSplit) newSlots[`P${s.period}`] = s.category;
    });

    let docID = `Sem${ttCurrentSem}_${ttSelectedDay}`;
    setDoc(doc(db, "colleges", currentCollegeID, "timetable_structure", docID), {
        semester: ttCurrentSem,
        day: ttSelectedDay,
        slots: newSlots
    }, { merge: true }).then(() => {
        showRcToast("Categories Updated!");
        document.getElementById("btnTTAssign").innerHTML = '<i class="fas fa-check"></i> Assign / Update';
        TT_SetPhase(1);
    });
}

function TT_UpdateTimelineVisuals() {
    let now = new Date();
    let currentHour = now.getHours() + (now.getMinutes() / 60.0);

    ttActiveSlotsData.forEach(slot => {
        if (slot.isSplit) return;
        
        let pIndex = slot.period - 1;
        let endTime = ttPeriodEndTimes[pIndex];
        let startTime = endTime - 1.0;
        let idBase = `tt_${slot.period}_0`;

        let nodeEl = document.getElementById(`node_${idBase}`);
        let fillEl = document.getElementById(`fill_${idBase}`);

        if (nodeEl) {
            let nodeColor = (currentHour >= endTime) ? "#94a3b8" : (currentHour >= startTime && currentHour < endTime) ? "#4ade80" : "white";
            nodeEl.style.background = nodeColor;
            nodeEl.style.color = (nodeColor === "white") ? "#333" : "white";
        }

        if (fillEl) {
            let fillAmount = (currentHour >= endTime) ? 100 : (currentHour <= startTime) ? 0 : ((currentHour - startTime) / (endTime - startTime)) * 100;
            fillEl.style.height = `${fillAmount}%`;
        }
    });
}
