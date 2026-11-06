let teacherTranslations = {};

const maxCacheTime = 1800000; // 30 minutes

let accessToken = null;
let schoolName = null;
let schoolYear = null;

let appointmentsToday = null;
let currentAppointment = null;

let dayStartTime = null;
let latestAppointment = null;

document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    chrome.storage.sync.get(['accessToken', 'schoolName', 'userInfo', 'schoolYear', 'theme'], function(result) {
        if(result.accessToken == undefined || result.schoolName == undefined || result.userInfo == undefined) {
            redirectLogin();
            return;
        }

        if(result.schoolYear == undefined) {
            redirectSchoolSelect();
            return;
        }

        accessToken = result.accessToken;
        schoolName = result.schoolName;
        schoolYear = result.schoolYear;
        document.getElementById('username-span').textContent = result.userInfo.firstName;
        document.getElementById('school-label').textContent = schoolName + " · vandaag";
        setTheme(result.theme || "system");

        loadSchedule();
        setInterval(updateAppointmentView, 1000);
    });

    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("refresh-btn").addEventListener("click", () => {
        clearAppointmentView();
        retrieveSchedule();
    });
    document.getElementById("more-info-btn").addEventListener("click", toggleExtraInfo);
    document.getElementById("theme-select").addEventListener("change", event => {
        setTheme(event.target.value);
        chrome.storage.sync.set({theme: event.target.value});
    });
});

function applyTheme() {
    chrome.storage.sync.get(["theme"], result => setTheme(result.theme || "system"));
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    let themeSelect = document.getElementById("theme-select");
    if(themeSelect) themeSelect.value = theme;
}

function redirectLogin() {
    chrome.action.setPopup({
        popup: "login.html"
    });
    window.location.href = "login.html";
}

function redirectSchoolSelect() {
    chrome.action.setPopup({
        popup: "school_select.html"
    });
    window.location.href = "school_select.html";
}

function logout() {
    chrome.storage.sync.remove(["accessToken", "schoolName", "userInfo", "schoolYear"]);
    chrome.storage.local.remove(["appointmentCache", "appointmentCacheTime", "dayStartTime"]);
    redirectLogin();
}

function updateAppointmentView() {
    if(!appointmentsToday) return;
    let lessonElement = document.getElementById('lesson-info');
    let timeLeftElement = document.getElementById('time-left');
    let roomElement = document.getElementById('room-info');
    let statusElement = document.getElementById('status-label');
    let statusDot = document.getElementById('status-dot');
    let doubleHourNotifier = document.getElementById('notification-double-hour');
    let nextAppointment = getEarliestAppointment();
    let currentTime = getUnixSeconds();

    if(currentAppointment == null) {
        if(nextAppointment == null) {
            statusElement.textContent = "Klaar voor vandaag";
            lessonElement.textContent = "Schooldag voorbij";
            roomElement.textContent = "Geniet van je vrije tijd.";
            timeLeftElement.textContent = "";
        } else {
            let timeLeft = nextAppointment.start - currentTime;
            if(timeLeft <= 0) {
                retrieveSchedule();
                return;
            }
            statusElement.textContent = "Volgende les";
            lessonElement.textContent = "Geen les";
            roomElement.textContent = formatArray(nextAppointment.subjects) + " om " + formatClock(nextAppointment.start);
            timeLeftElement.textContent = formatDuration(timeLeft);
        }
        statusDot.classList.add("waiting");
        doubleHourNotifier.hidden = true;
        setElements();
        return;
    }

    let timeLeft = currentAppointment.end - currentTime;

    if(timeLeft <= 0) {
        retrieveSchedule();
        return;
    }

    let doubleHour = getDoubleHour(appointmentsToday, currentAppointment);
    if(doubleHour != null) timeLeft = doubleHour.end - currentTime;
    statusElement.textContent = "Nu bezig";
    statusDot.classList.remove("waiting");
    lessonElement.textContent = formatArray(currentAppointment.subjects);
    roomElement.textContent = formatArray(currentAppointment.teachers) + " · " + formatArray(currentAppointment.locations);
    doubleHourNotifier.hidden = doubleHour == null;
    timeLeftElement.textContent = formatDuration(timeLeft);
    setElements();
}

function clearAppointmentView() {
    document.getElementById('lesson-info').textContent = "Rooster wordt vernieuwd";
    document.getElementById('time-left').textContent = "...";
    document.getElementById('room-info').textContent = "Even geduld...";
    document.getElementById('upcoming-list').textContent = "";
}

function setElements() {
    latestAppointment = getLatestAppointment();
    if(!latestAppointment) {
        document.getElementById("day-info").textContent = "Geen lessen gevonden";
        document.getElementById("day-time-left").textContent = "";
        document.getElementById("day-progress").value = 0;
        renderUpcoming();
        return;
    }
    setLessonsLeft(document.getElementById('day-info'));
    setDayTimeLeft(document.getElementById('day-time-left'));
    setDayProgress();
    renderUpcoming();
}

function setLessonsLeft(dayElement) {
    let lessonsLeft = appointmentsToday.length - (currentAppointment == null ? 0 : 1);

    if(lessonsLeft > 0) {
        dayElement.textContent = (currentAppointment == null ? "Zometeen" : "Hierna") + " nog " + lessonsLeft + (lessonsLeft == 1 ? " lesuur" : " lesuren");
    } else {
        dayElement.textContent = "Laatste les";
    }
}

function setDayTimeLeft(dayTimeElement) {
    let formattedTimeLeft = formatDuration(getTimeLeft());
    dayTimeElement.textContent = "Tot " + formattedTimeLeft;
}

function getTimeLeft() {
    let latestAppointment = getLatestAppointment();
    let currentTime = getUnixSeconds();

    if(currentTime > latestAppointment.end) {
        return 0;
    }

    return latestAppointment.end - currentTime;
}

function setDayProgress() {
    let progressElement = document.getElementById("day-progress");

    let dayLength = latestAppointment.end - dayStartTime;
    let dayPosition = getUnixSeconds() - dayStartTime;
    let percentage = dayPosition / dayLength * 100;
    percentage = Math.round(percentage * 10) / 10; // Round to 1 decimal place

    progressElement.value = percentage;
}

function toggleExtraInfo() {
    let card = document.querySelector(".progress-card");
    let button = document.getElementById("more-info-btn");
    let hidden = card.hidden;
    card.hidden = !hidden;
    button.textContent = hidden ? "Minder info" : "Meer info";
}

function renderUpcoming() {
    let list = document.getElementById("upcoming-list");
    if(!appointmentsToday || appointmentsToday.length === 0) {
        list.innerHTML = '<p class="empty-state">Geen lessen meer vandaag.</p>';
        return;
    }
    let now = getUnixSeconds();
    let upcoming = appointmentsToday.filter(item => item.valid && !item.cancelled && item.start > now).slice(0, 3);
    if(upcoming.length === 0) {
        list.innerHTML = '<p class="empty-state">Geen lessen meer vandaag.</p>';
        return;
    }
    list.innerHTML = upcoming.map(appointment => `
        <div class="upcoming-item">
            <span class="upcoming-time">${formatClock(appointment.start)}</span>
            <div>
                <p class="upcoming-subject">${escapeHtml(formatArray(appointment.subjects))}</p>
                <p class="upcoming-detail">${escapeHtml(formatArray(appointment.locations))} · ${escapeHtml(formatArray(appointment.teachers))}</p>
            </div>
        </div>`).join("");
}

function formatClock(timestamp) {
    return new Date(timestamp * 1000).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[character]));
}

function retrieveTeachers() {
    console.log("Retrieving teachers...");

    let url = getZermeloDomain()
            + "/users?archived=false&schoolInSchoolYear=" + schoolYear + "&fields=code%2ClastName%2Cprefix&isEmployee=true&access_token=" + accessToken;

    return fetch(url).then(r => r.json()).then(result => {
        let teachers = result.response.data;
        teachers.forEach(teacher => {
            let prefix = teacher.prefix;
            let lastName = teacher.lastName;

			if(!lastName) {
				return;
			}

            let commaIndex = lastName.indexOf(",");
            if(commaIndex != -1) {
                lastName = lastName.substring(0, commaIndex);
            }

            let fullName = (prefix ? prefix + " " : "") + lastName;
            teacherTranslations[teacher.code] = fullName;
        });

        console.log(teachers.length + " teachers retrieved!");
    });
}

function retrieveSchedule() {
    console.log("Retrieving schedule...");

    let startTime = getStartOfDay();
    let endTime = startTime + 86400;

    let url = getZermeloDomain()
                + "/appointments?user=~me&access_token=" + accessToken + "&start=" + startTime + "&end=" + endTime;

    fetch(url).then(r => r.json()).then(result => {
        appointmentsToday = sortAppointments(result.response.data);

        if(appointmentsToday.length != 0) {
            dayStartTime = appointmentsToday[0].start;
        } else {
            dayStartTime = 0;
        }

        console.log("Schedule retrieved!");

        retrieveTeachers().then(result => {
            onLoadingFinished();
        });
    });
}

function loadSchedule() {
    chrome.storage.local.get(['appointmentCache', 'appointmentCacheTime', 'dayStartTime'], function(result) {
        if(result.appointmentCache == null) {
            console.log("Appointments not cached (first startup?), retrieving");
            retrieveSchedule();
            return;
        }

        console.log("An appointment cache is available, using it");
        appointmentsToday = result.appointmentCache;
        dayStartTime = result.dayStartTime;
        onLoadingFinished();

        if(Date.now() - result.appointmentCacheTime > maxCacheTime) {
            console.log("The cache is however outdated, retrieving");
            retrieveSchedule();
        }
    });
}

function onLoadingFinished() {
    appointmentsToday.forEach(appointment => {
        appointment.teachers = translateArray(appointment.teachers, teacherTranslations);
    });

    let currentTime = getUnixSeconds();
    appointmentsToday = appointmentsToday.filter(item => {
        return currentTime <= item.end && item.valid && !item.cancelled;
    });

    currentAppointment = getCurrentAppointment(appointmentsToday);
    updateAppointmentView();

    chrome.storage.local.set({
        appointmentCache: appointmentsToday,
        appointmentCacheTime: Date.now(),
        dayStartTime: dayStartTime
    });

    console.log("Loading finished");
}

function getCurrentAppointment(appointments) {
    let currentTime = getUnixSeconds();

    let result = null;
    appointments.forEach(appointment => {
		if(!appointment.valid || appointment.cancelled) {
			return;
		}

        if(currentTime >= appointment.start && currentTime <= appointment.end) {
            result = appointment;
            return;
        }
    });

    return result;
}

function getDoubleHour(appointments, currentAppointment) {
	let result = null;
	appointments.forEach(appointment => {
		if(!appointment.valid || appointment.cancelled) {
			return;
		}

		if(appointment.start == currentAppointment.end &&
			arrayMatches(appointment.subjects, currentAppointment.subjects) && arrayMatches(appointment.locations, currentAppointment.locations) &&
			arrayMatches(appointment.teachers, currentAppointment.teachers) && arrayMatches(appointment.groups, currentAppointment.groups)) {
			result = appointment;
		}
	});

	return result;
}

function arrayMatches(array1, array2) {
	if(array1 == null || array2 == null) {
		return array1 == array2;
	}

	// hacky af, but the simplest way to do it
	// performance shouldn't matter cuz these arrays will be very small
	// (only a couple of elements at most, 90% of the time only a single element)
	return JSON.stringify(array1) == JSON.stringify(array2);
}

function getUnixSeconds() {
    return Math.floor(Date.now() / 1000);
}

function getZermeloDomain() {
    return "https://" + encodeURI(schoolName) + ".zportal.nl/api/v3";
}

function translateArray(inputArray, translationArray) {
    let copiedArray = [...inputArray];
    for(let i = 0; i < copiedArray.length; i++) {
        let translation = translationArray[copiedArray[i]];
        if(translation == undefined) {
            continue;
        }

        copiedArray[i] = translation;
    }

    return copiedArray;
}

function formatArray(array) {
    if(array.length == 0) {
        return "None";
    }

    if(array.length == 1) {
        return array[0];
    }

    return array.slice(0, array.length - 1).join(", ");
}

function formatDuration(duration) {
    let seconds = Math.floor(duration % 60);
    let minutes = Math.floor((duration / 60) % 60);
    let hours = Math.floor(duration / 3600);

    seconds = (seconds < 10) ? "0" + seconds : seconds;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    hours = (hours < 10) ? "0" + hours : hours;

    if(hours > 0) {
        return hours + "u " + minutes + "m " + seconds + "s";
    }

    return minutes + "m " + seconds + "s";
}

function getStartOfDay() {
    let date = new Date();
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth();
    let day = date.getUTCDate();

    let millisTime = Date.UTC(year, month, day, 0, 0, 0, 0);
    return Math.floor(millisTime / 1000);
}

function getEarliestAppointment() {
    let result = null;

    appointmentsToday.forEach(appointment => {
        if(!appointment.valid || appointment.cancelled) {
            return;
        }

        if(result == null || appointment.start < result.start) {
            result = appointment;
        }
    });

    return result;
}

function getLatestAppointment() {
    let result = null;

    appointmentsToday.forEach(appointment => {
        if(!appointment.valid || appointment.cancelled) {
            return;
        }

        if(result == null || appointment.end > result.end) {
            result = appointment;
        }
    });

    return result;
}

function sortAppointments(appointments) {
    let byStart = appointments.slice(0);
    byStart.sort(function(a, b) {
        return a.start - b.start;
    });
    return byStart;
}