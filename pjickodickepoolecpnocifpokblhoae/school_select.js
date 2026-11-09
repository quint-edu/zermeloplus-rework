let accessToken = null;
let schoolName = null;

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    document.getElementById("theme-select").addEventListener("change", event => {
        setTheme(event.target.value);
        chrome.storage.sync.set({theme: event.target.value});
    });

    chrome.storage.sync.get(["accessToken", "schoolName"], function(result) {
        accessToken = result.accessToken;
        schoolName = result.schoolName;

        const selectElement = document.getElementById("school-select");
        const yearSelectElement = document.getElementById("year-select");
        const continueButton = document.getElementById("continue-btn");

        getSchools().then(schools => {
            schools.forEach(school => {
                const option = document.createElement("option");
                option.text = school.name;
                option.value = school.id;
                selectElement.add(option);
            });

            onSchoolSelect(selectElement, yearSelectElement);
        }).catch(error => {
            console.error("Could not load schools:", error);
            document.getElementById("error-msg").textContent = error.message;
            document.getElementById("error-msg").hidden = false;
        });

        selectElement.addEventListener("change", () => {
            onSchoolSelect(selectElement, yearSelectElement);
        });

        continueButton.addEventListener("click", () => {
            chrome.storage.sync.set({schoolYear: yearSelectElement.value}, redirectMain);
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

function redirectMain() {
    chrome.action.setPopup({popup: "popup.html"});
    window.location.href = "popup.html";
}

function getSchools() {
    return fetch(
        "https://" + schoolName + ".zportal.nl/api/v3/schools?access_token=" + accessToken
    ).then(response => {
        if(!response.ok) throw new Error(response.statusText);
        return response.json();
    }).then(result => result.response.data);
}

function onSchoolSelect(selectElement, yearSelectElement) {
    getYears(selectElement.value).then(years => {
        yearSelectElement.innerHTML = "";
        years.forEach(year => {
            if(year.archived) return;
            const option = document.createElement("option");
            option.text = year.name;
            option.value = year.id;
            yearSelectElement.add(option);
        });
    }).catch(error => {
        console.error("Could not load school years:", error);
        document.getElementById("error-msg").textContent = error.message;
        document.getElementById("error-msg").hidden = false;
    });
}

function getYears(school) {
    return fetch(
        "https://" + schoolName + ".zportal.nl/api/v3/schoolsinschoolyears?access_token="
        + accessToken + "&school=" + school
    ).then(response => {
        if(!response.ok) throw new Error(response.statusText);
        return response.json();
    }).then(result => sortYears(result.response.data));
}

function sortYears(years) {
    const byYear = years.slice();
    byYear.sort((a, b) => b.year - a.year);
    return byYear;
}
