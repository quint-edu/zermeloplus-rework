document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const loginCodeElement = document.getElementById("login-code");
    const schoolNameElement = document.getElementById("school-name");
    const loginButton = document.getElementById("login-btn");
    const errorText = document.getElementById("error-msg");

    document.getElementById("theme-select").addEventListener("change", event => {
        setTheme(event.target.value);
        chrome.storage.sync.set({theme: event.target.value});
    });

    loginCodeElement.addEventListener("keypress", event => {
        if(loginCodeElement.value.length >= 12 || isLetter(event.keyCode)) {
            event.preventDefault();
        }
    });

    loginButton.addEventListener("click", () => {
        loginButton.disabled = true;
        errorText.hidden = true;

        const loginCode = loginCodeElement.value;
        const schoolName = schoolNameElement.value;
        const url = "https://" + encodeURI(schoolName) + ".zportal.nl/api/v2/oauth/token";

        fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: "grant_type=authorization_code&code=" + encodeURI(loginCode)
        }).then(response => {
            if(!response.ok) throw new Error(response.statusText);
            return response.json();
        }).then(response => {
            const accessToken = response.access_token;
            return getUserInfo(schoolName, accessToken).then(userInfo => {
                saveData(schoolName, accessToken, userInfo);
            });
        }).catch(error => {
            console.error("Login failed:", error);
            loginButton.disabled = false;
            errorText.textContent = error.message || "Inloggen mislukt, probeer het opnieuw.";
            errorText.hidden = false;
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

function saveData(schoolName, accessToken, userInfo) {
    chrome.storage.sync.set({
        accessToken,
        schoolName,
        userInfo
    }, () => {
        if(chrome.runtime.lastError) {
            console.error("Could not save login:", chrome.runtime.lastError.message);
            return;
        }
        redirectMain();
    });
}

function isLetter(keyCode) {
    return keyCode > 31 && (keyCode < 48 || keyCode > 57);
}

function getUserInfo(siteName, accessToken) {
    const url = "https://" + siteName + ".zportal.nl/api/v3/users/~me?access_token=" + accessToken;
    return fetch(url).then(response => response.json()).then(result => {
        const data = result.response.data[0];
        data.fullName = data.firstName + " " + data.lastName;
        return data;
    });
}
