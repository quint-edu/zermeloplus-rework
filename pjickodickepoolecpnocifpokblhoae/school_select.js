let accessToken = null;
let schoolName = null;

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    document.getElementById("theme-select").addEventListener("change", event => {
        setTheme(event.target.value);
        chrome.storage.sync.set({theme: event.target.value});
    });

    chrome.storage.sync.get(["accessToken", "schoolName"], async result => {
        accessToken = result.accessToken;
        schoolName = result.schoolName;
        if(!accessToken || !schoolName) {
            redirectLogin();
            return;
        }

        const schoolSelect = document.getElementById("school-select");
        const yearSelect = document.getElementById("year-select");
        try {
            const schools = await getSchools();
            schools.forEach(school => schoolSelect.add(new Option(school.name, school.id)));
            await onSchoolSelect(schoolSelect, yearSelect);
            schoolSelect.addEventListener("change", () => onSchoolSelect(schoolSelect, yearSelect));
        } catch(error) {
            console.error("Unable to load schools:", error);
            schoolSelect.add(new Option("Scholen konden niet worden geladen", ""));
            schoolSelect.disabled = true;
        }

        document.getElementById("continue-btn").addEventListener("click", () => {
            if(!yearSelect.value) return;
            chrome.storage.sync.set({schoolYear: yearSelect.value}, redirectMain);
        });
    });
});

function initTheme() {
    chrome.storage.sync.get(["theme"], result => setTheme(result.theme || "system"));
}

function setTheme(theme) {
    const resolvedTheme = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    document.documentElement.dataset.theme = resolvedTheme;
    document.getElementById("theme-select").value = theme;
}

function redirectLogin() {
    chrome.action.setPopup({popup: "login.html"});
    window.location.href = "login.html";
}

function redirectMain() {
    chrome.action.setPopup({popup: "popup.html"});
    window.location.href = "popup.html";
}

async function apiRequest(path) {
    const response = await fetch("https://" + encodeURIComponent(schoolName) + ".zportal.nl/api" + path, {
        headers: {Authorization: accessToken}
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(payload.message || payload.error || `API-fout (${response.status})`);
    return payload.response?.data || payload.data || [];
}

async function getSchools() {
    return apiRequest("/schools?fields=id,name");
}

async function onSchoolSelect(schoolSelect, yearSelect) {
    if(!schoolSelect.value) return;
    const years = await getYears(schoolSelect.value);
    yearSelect.replaceChildren(...years.filter(year => !year.archived)
        .map(year => new Option(year.name, year.id)));
}

function getYears(school) {
    return apiRequest("/schoolsinschoolyears?fields=id,name,year,archived&school=" + encodeURIComponent(school))
        .then(sortYears);
}

function sortYears(years) {
    return years.slice().sort((a, b) => b.year - a.year);
}
