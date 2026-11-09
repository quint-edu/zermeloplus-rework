document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const form = document.getElementById("login-form");
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

    const handleLogin = event => {
        if(event) event.preventDefault();
        submitLogin();
    };

    loginButton.addEventListener("click", handleLogin);
    form.addEventListener("submit", event => {
        event.preventDefault();
        submitLogin();
    });

    async function submitLogin() {
        const loginCode = loginCodeElement.value.replace(/\s/g, "");
        const schoolName = schoolNameElement.value.trim();
        errorText.hidden = true;

        if(!schoolName || !/^\d{12}$/.test(loginCode)) {
            errorText.textContent = "Vul je schoolnaam en de 12-cijferige login code in.";
            errorText.hidden = false;
            return;
        }

        loginButton.disabled = true;
        try {
            const response = await fetch(
                "https://" + encodeURIComponent(schoolName) + ".zportal.nl/api/v2/oauth/token",
                {
                    method: "POST",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body: "grant_type=authorization_code&code=" + encodeURIComponent(loginCode)
                }
            );
            const payload = await readApiResponse(response);
            if(!payload.access_token) throw new Error("Zermelo gaf geen toegangstoken terug.");

            await saveData(schoolName, payload.access_token, {firstName: "", lastName: ""});
            try {
                const userInfo = await getUserInfo(schoolName, payload.access_token);
                await saveData(schoolName, payload.access_token, userInfo);
            } catch(error) {
                console.warn("Gebruikersprofiel kon niet worden geladen:", error);
            }
            redirectSchoolSelect();
        } catch(error) {
            console.error("Login failed:", error);
            errorText.textContent = error.message || "Inloggen mislukt, probeer het opnieuw.";
            errorText.hidden = false;
            loginButton.disabled = false;
        }
    }
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

function redirectSchoolSelect() {
    chrome.action.setPopup({popup: "school_select.html"});
    window.location.href = "school_select.html";
}

function readApiResponse(response) {
    return response.json().catch(() => ({})).then(payload => {
        if(!response.ok) {
            throw new Error(
                payload.message || payload.error_description || payload.error
                || payload.response?.message || `API-fout (${response.status})`
            );
        }
        return payload;
    });
}

function saveData(schoolName, accessToken, userInfo) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.remove(["schoolYear"], () => {
            if(chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            chrome.storage.sync.set({accessToken, schoolName, userInfo}, () => {
                if(chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve();
            });
        });
    });
}

function isLetter(keyCode) {
    return keyCode > 31 && (keyCode < 48 || keyCode > 57);
}

function getUserInfo(siteName, accessToken) {
    const url = "https://" + encodeURIComponent(siteName)
        + ".zportal.nl/api/v3/users/~me?access_token=" + encodeURIComponent(accessToken);
    return fetch(url).then(readApiResponse).then(result => {
        const data = result.response?.data?.[0];
        if(!data) throw new Error("De gebruikersgegevens konden niet worden opgehaald.");
        data.fullName = data.firstName + " " + data.lastName;
        return data;
    });
}
