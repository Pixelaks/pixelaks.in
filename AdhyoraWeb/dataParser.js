// dataParser.js

// Regex to split CSV by commas, IGNORING commas inside quotes
const csvSplitter = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

export const DataParser = {
    // 1. VALIDATION CHECKS
    isValidStudentFormat: (header) => {
        if (!header) return false;
        let h = header.toLowerCase();
        return h.includes("roll") || h.includes("register") || h.includes("sl no");
    },
    
    isValidSubjectFormat: (header) => {
        if (!header) return false;
        let h = header.toLowerCase();
        let hasSubject = h.includes("code") && (h.includes("subject") || h.includes("name"));
        let hasStudent = h.includes("roll") || h.includes("register") || h.includes("sl no");
        let hasCalendar = h.includes("date") || h.includes("working");
        return hasSubject && !hasStudent && !hasCalendar;
    },

    isValidCalendarFormat: (header) => {
        if (!header) return false;
        let h = header.toLowerCase();
        let hasCalendar = h.includes("date") || h.includes("event") || h.includes("working");
        let hasStudent = h.includes("roll") || h.includes("register");
        return hasCalendar && !hasStudent;
    },

    // 2. PARSERS
    parseStudents: (lines) => {
        let students = [];
        const spellFixer = { "botony": "Botany", "computerscience": "Computer Science", "maths": "Mathematics", "commerce": "Commerce", "economics": "Economics" };
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            let row = lines[i].split(csvSplitter).map(v => v.trim().replace(/^"|"$/g, ''));
            if (row.length < 6) continue;

            let rawDept = row[3];
            let courseType = row[5];
            let finalDept = generateDeptName(rawDept, courseType, spellFixer);

            students.push({
                SLNumber: row[0], RollNumber: row[1], Name: row[2].replace(/\./g, " "),
                Department: finalDept, Year: row[4], CourseType: courseType
            });
        }
        return students;
    },

    parseSubjects: (lines, currentSem) => {
        let subjects = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            let row = lines[i].split(csvSplitter).map(v => v.trim().replace(/^"|"$/g, ''));
            if (row.length < 5) continue;

            let code = row[0]; let name = row[1]; let type = row[2].toUpperCase().trim(); let dept = row[3];
            let sems = [];
            for (let s = 4; s < row.length; s++) {
                let val = row[s].toUpperCase().trim();
                if (val && val !== "NIL") sems.push(val);
            }

            // NEP MJD Override
            if (type.includes("MJD")) {
                if (sems.includes("4") || sems.includes("IV")) type = "MJD 4";
                else if (sems.includes("5") || sems.includes("V")) type = "MJD 5";
                else if (sems.includes("6") || sems.includes("VI")) type = "MJD 6";
            }

            subjects.push({
                code: code, name: name, type: type, department: dept, 
                semester: sems.join(","), search_key: name.toLowerCase(),
                isElective: (type === "MLD" || type === "VAC" || type === "SEC")
            });
        }
        return subjects;
    },

    parseCalendar: (lines) => {
        let workingMap = {}; let nonWorkingMap = {};
        let oddStart = "", oddEnd = "", evenStart = "", evenEnd = "";
        let currentYear = new Date().getFullYear(); let currentMonth = 0;
        let detectedAcademicYear = "";
        
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            let row = lines[i].split(csvSplitter).map(v => v.trim().replace(/^"|"$/g, ''));
            if (row.length < 3) continue;

            let colDate = row[0]; let colEvent = row.length > 2 ? row[2] : ""; let colWork = row.length > 3 ? row[3] : "";

            // Check if Month Header
            let monthMatch = colEvent.match(/^([a-z]+)[\s\-](\d{2,4})$/i);
            if (monthMatch) {
                let mStr = monthMatch[1].toLowerCase().substring(0,3);
                currentMonth = monthNames.indexOf(mStr) + 1;
                let yStr = monthMatch[2];
                currentYear = yStr.length === 2 ? 2000 + parseInt(yStr) : parseInt(yStr);
                if (!detectedAcademicYear) detectedAcademicYear = `${currentYear}-${currentYear + 1}`;
                continue;
            }

            if (currentMonth > 0 && !isNaN(parseInt(colDate))) {
                let day = parseInt(colDate);
                let fullDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                let eventUpper = colEvent.toUpperCase();

                if (eventUpper.includes("START OF ODD")) oddStart = fullDate;
                else if (eventUpper.includes("END OF ODD")) oddEnd = fullDate;
                else if (eventUpper.includes("START OF EVEN")) evenStart = fullDate;
                else if (eventUpper.includes("END OF EVEN")) evenEnd = fullDate;

                let isWorking = colWork && !isNaN(parseInt(colWork));
                if (isWorking) workingMap[fullDate] = "Regular Working Day";
                else nonWorkingMap[fullDate] = colEvent ? colEvent : "Holiday/Weekend";
            }
        }
        
        let currentSemType = "Odd";
        let today = new Date().toISOString().split('T')[0];
        if (evenStart && evenEnd && today >= evenStart && today <= evenEnd) currentSemType = "Even";

        return { workingMap, nonWorkingMap, detectedAcademicYear, oddStart, oddEnd, evenStart, evenEnd, currentSemType };
    }
};

// Internal Helper for Dept Generation
function generateDeptName(raw, courseType, spellFixer) {
    let input = raw.trim(); let cType = courseType.toUpperCase();
    let isPG = cType.includes("PG") || cType.includes("POST");
    let detectedPrefix = "";

    if (/\b(BSc|MSc|B\.Sc|M\.Sc)\b/i.test(input)) detectedPrefix = isPG ? "MSc" : "BSc";
    else if (/\b(BCom|MCom|B\.Com|M\.Com)\b/i.test(input)) detectedPrefix = isPG ? "MCom" : "BCom";
    else if (/\b(BA|MA|B\.A|M\.A)\b/i.test(input)) detectedPrefix = isPG ? "MA" : "BA";
    else if (/\b(BBA|MBA|B\.B\.A|M\.B\.A)\b/i.test(input)) detectedPrefix = isPG ? "MBA" : "BBA";
    else if (/\b(BCA|MCA|B\.C\.A|M\.C\.A)\b/i.test(input)) detectedPrefix = isPG ? "MCA" : "BCA";

    let core = input.replace(/^(MSc|BSc|MA|BA|BCom|MCom|BBA|BCA|B\.Sc|M\.Sc|B\.A|M\.A|B\.Com|M\.Com|B\.B\.A|B\.C\.A)(?=\s|$)\s*/i, "").trim();
    core = core.replace(/^[.\s-]+/, "");

    let lowerCore = core.toLowerCase().replace(/\s+/g, '');
    if (spellFixer[lowerCore]) core = spellFixer[lowerCore];
    else core = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase(); // Basic Title Case

    let finalPrefix = detectedPrefix;
    if (!finalPrefix) {
        if (core.includes("Commerce") || core.includes("Account")) finalPrefix = isPG ? "MCom" : "BCom";
        else if (core.includes("Business") || core.includes("Manage")) finalPrefix = isPG ? "MBA" : "BBA";
        else if (core.includes("Application") || core.includes("Computing")) finalPrefix = isPG ? "MCA" : "BCA";
        else if (/(logy|ics|try|math|physics|science|biotech|nature|geo|electronics|botany)$/i.test(core)) finalPrefix = isPG ? "MSc" : "BSc";
        else finalPrefix = isPG ? "MA" : "BA";
    }
    return `${finalPrefix} ${core}`;
}