let accessToken = null;
let schoolName = null;
let usesUserProjects = false;

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
            try {
                const schools = await getSchools();
                schools.forEach(school => schoolSelect.add(new Option(school.name, school.id)));
                if(schools.length === 0) throw new Error("Geen scholen gevonden.");
                await onSchoolSelect(schoolSelect, yearSelect);
            } catch(error) {
                if(!isPartnerOnlyError(error)) throw error;
                await loadProjectsFromUser(schoolSelect, yearSelect);
            }
            schoolSelect.addEventListener("change", () => {
                if(!usesUserProjects) onSchoolSelect(schoolSelect, yearSelect);
            });
            continueButton.addEventListener("click", () => {
                if(!yearSelect.value) return;
                continueButton.disabled = true;
                chrome.storage.sync.set({schoolYear: yearSelect.value}, redirectMain);
            });
        } catch(error) {
            console.error("Unable to load schools:", error);
            errorMessage.textContent = error.message || "De roosters konden niet worden geladen.";
            errorMessage.hidden = false;
            schoolSelect.disabled = true;
            yearSelect.disabled = true;
            continueButton.disabled = true;
            loginAgainButton.hidden = !isPartnerOnlyError(error);
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

async function getSchools() {
    const payload = await readApiResponse(await fetch(
        "https://" + encodeURI(schoolName) + ".zportal.nl/api/v3/schools?access_token="
        + encodeURIComponent(accessToken)
    ));
    return payload.response.data;
}

async function onSchoolSelect(schoolSelect, yearSelect) {
    const payload = await readApiResponse(await fetch(
        "https://" + encodeURI(schoolName) + ".zportal.nl/api/v3/schoolsinschoolyears?access_token="
        + encodeURIComponent(accessToken) + "&school=" + encodeURIComponent(schoolSelect.value)
    ));
    const years = payload.response.data.slice().sort((a, b) => b.year - a.year);
    yearSelect.replaceChildren(...years.filter(year => !year.archived)
        .map(year => new Option(year.name, year.id)));
}

async function loadProjectsFromUser(schoolSelect, yearSelect) {
    usesUserProjects = true;
    const payload = await readApiResponse(await fetch(
        "https://" + encodeURI(schoolName) + ".zportal.nl/api/v3/users/~me?access_token="
        + encodeURIComponent(accessToken)
    ));
    const user = payload.response?.data?.[0];
    const projects = [
        ...(user?.studentSchoolInSchoolYears || []),
        ...(user?.schoolInSchoolYears || []),
        ...(user?.employeeSchoolInSchoolYears || [])
    ].map(project => normalizeProject(project)).filter(project => project.id);

    if(projects.length === 0) {
        throw new Error("Zermelo blokkeert de schoollijst voor deze token. Gebruik een nieuwe partner-authcode of vraag de schoolbeheerder om partnerrechten.");
    }

    schoolSelect.replaceChildren(new Option(schoolName, schoolName));
    yearSelect.replaceChildren(...projects.map(project =>
        new Option(project.label, project.id)
    ));
}

function normalizeProject(project) {
    if(typeof project === "string" || typeof project === "number") {
        return {id: String(project), label: "Rooster " + project};
    }
    const id = project?.id || project?.schoolInSchoolYear || project?.schoolInSchoolYearId;
    const year = project?.year || project?.schoolYear || project?.schoolyear;
    return {
        id: id ? String(id) : "",
        label: project?.name || project?.schoolInSchoolYearName
            || (year ? "Schooljaar " + year : "Roosterproject")
    };
}

function isPartnerOnlyError(error) {
    return /alleen.*partners|partners?.*opgevraagd|partner-only/i.test(error?.message || "");
}

async function readApiResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if(!response.ok) {
        const message = payload.message || payload.error_description || payload.error
            || payload.response?.message;
        throw new Error(message || `API-fout (${response.status})`);
    }
    return payload;
}
