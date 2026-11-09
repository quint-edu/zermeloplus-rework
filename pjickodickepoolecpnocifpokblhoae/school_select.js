let accessToken = null;
let schoolName = null;
let projects = [];

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    document.getElementById("theme-select").addEventListener("change", event => {
        setTheme(event.target.value);
        chrome.storage.sync.set({theme: event.target.value});
    });

    const schoolSelect = document.getElementById("school-select");
    const yearSelect = document.getElementById("year-select");
    const continueButton = document.getElementById("continue-btn");
    const errorMessage = document.getElementById("error-msg");
    const loginAgainButton = document.getElementById("login-again-btn");

    loginAgainButton.addEventListener("click", redirectLogin);
    chrome.storage.sync.get(["accessToken", "schoolName"], async result => {
        accessToken = result.accessToken;
        schoolName = result.schoolName;
        if(!accessToken || !schoolName) {
            redirectLogin();
            return;
        }

        try {
            projects = await getProjects();
            if(projects.length === 0) {
                throw new Error("Er zijn geen roosters beschikbaar voor deze koppeling.");
            }
            populateSchools(schoolSelect);
            updateYears(schoolSelect, yearSelect);
            schoolSelect.addEventListener("change", () => updateYears(schoolSelect, yearSelect));
            continueButton.addEventListener("click", () => {
                if(!yearSelect.value) return;
                continueButton.disabled = true;
                chrome.storage.sync.set({schoolYear: yearSelect.value}, redirectMain);
            });
        } catch(error) {
            console.error("Unable to load school years:", error);
            errorMessage.textContent = error.message || "De roosters konden niet worden geladen.";
            errorMessage.hidden = false;
            schoolSelect.disabled = true;
            yearSelect.disabled = true;
            continueButton.disabled = true;
            if(error.authenticated === false) {
                loginAgainButton.hidden = false;
            }
        }
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
    chrome.storage.sync.remove(["accessToken", "userInfo", "schoolYear"]);
    chrome.action.setPopup({popup: "login.html"});
    window.location.href = "login.html";
}

function redirectMain() {
    chrome.action.setPopup({popup: "popup.html"});
    window.location.href = "popup.html";
}

async function apiRequest(path) {
    const url = "https://" + encodeURIComponent(schoolName) + ".zportal.nl/api" + path;
    const response = await fetch(url, {headers: {Authorization: accessToken}});
    const payload = await response.json().catch(() => ({}));
    if(response.ok && Number(payload.response?.status || 200) < 400) {
        return payload.response?.data || payload.data || payload.response || payload;
    }

    const error = new Error(
        getApiErrorMessage(payload, response.status)
    );
    if(isUnauthorized(response, payload)) {
        error.authenticated = false;
        error.message = "Zermelo weigert deze token. Log opnieuw in met een nieuwe authcode.";
    }
    throw error;
}

function getApiErrorMessage(payload, status) {
    const response = payload?.response || {};
    const message = response.message || payload?.message || payload?.error_description || payload?.error;
    const details = response.details || payload?.details;
    if(message && details && details !== message) return `${message} (${details})`;
    return message || `API-fout (${status || "onbekend"})`;
}

function isUnauthorized(response, payload) {
    return response.status === 401
        || response.status === 403
        || Number(payload.response?.status) === 401
        || Number(payload.response?.status) === 403
        || /niet ingelogd|sessie.*verlopen|unauthori[sz]ed|invalid token|geen toegang/i.test(
            payload.response?.message || payload.response?.details || payload.message || payload.error || ""
        );
}

async function getProjects() {
    const partnerInfo = await apiRequest("/partners/~me");
    const candidates = findProjectArrays(partnerInfo);
    const byId = new Map();
    candidates.flat().forEach(project => {
        if(typeof project === "string" || typeof project === "number") {
            project = {id: project};
        }
        const id = project?.id || project?.schoolInSchoolYear || project?.schoolInSchoolYearId;
        if(id && !byId.has(String(id))) {
            byId.set(String(id), {
                id: String(id),
                name: project.name || project.schoolName || project.projectName || "Rooster " + id,
                year: Number(project.year || project.schoolYear || project.schoolyear || 0),
                school: project.schoolName || project.school || project.name || "School"
            });
        }
    });
    return Array.from(byId.values()).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
}

function findProjectArrays(value, key = "") {
    if(!value || typeof value !== "object") return [];
    if(Array.isArray(value)) {
        return key.toLowerCase().includes("school") || key.toLowerCase().includes("project")
            ? [value]
            : value.flatMap(item => findProjectArrays(item, key));
    }
    return Object.entries(value).flatMap(([childKey, childValue]) =>
        findProjectArrays(childValue, childKey)
    );
}

function populateSchools(schoolSelect) {
    const schools = Array.from(new Map(projects.map(project => [project.school, project.school])).values());
    schoolSelect.replaceChildren(...schools.map(school => new Option(school, school)));
}

function updateYears(schoolSelect, yearSelect) {
    const matchingProjects = projects.filter(project => project.school === schoolSelect.value);
    yearSelect.replaceChildren(...matchingProjects.map(project =>
        new Option(project.year ? String(project.year) : project.name, project.id)
    ));
}
