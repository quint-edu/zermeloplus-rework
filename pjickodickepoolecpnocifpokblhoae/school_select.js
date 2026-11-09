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

        getSchools().then(schools => {
            schools.forEach(school => {
                const option = document.createElement("option");
                option.text = school.name;
                option.value = school.id;
                selectElement.add(option);
            });

            onSchoolSelect(selectElement, yearSelectElement);
        });

        selectElement.addEventListener("change", function() {
            onSchoolSelect(selectElement, yearSelectElement);
        });

        document.getElementById("continue-btn").addEventListener("click", function() {
            chrome.storage.sync.set({schoolYear: yearSelectElement.value}, function() {
                redirectMain();
            });
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
    });
}

function getSchools() {
    return fetch("https://" + schoolName + ".zportal.nl/api/v3/schools?access_token=" + accessToken)
        .then(response => response.json())
        .then(result => result.response.data);
}

function getYears(school) {
    return fetch(
        "https://" + schoolName + ".zportal.nl/api/v3/schoolsinschoolyears?access_token="
        + accessToken + "&school=" + school
    ).then(response => response.json())
        .then(result => sortYears(result.response.data));
}

function sortYears(years) {
    const byYear = years.slice();
    byYear.sort((a, b) => b.year - a.year);
    return byYear;
}
