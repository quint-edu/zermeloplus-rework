function initializeLogin() {
    initTheme();

    const form = document.getElementById("login-form");
    const loginCodeElement = document.getElementById("login-code");
    const schoolNameElement = document.getElementById("school-name");
    const loginButton = document.getElementById("login-btn");
    const errorText = document.getElementById("error-msg");
    const themeSelect = document.getElementById("theme-select");

    if(!form || !loginCodeElement || !schoolNameElement || !loginButton || !errorText || !themeSelect) {
        console.error("Login UI is incomplete.");
        return;
    }

    themeSelect.addEventListener("change", event => {
        setTheme(event.target.value);
        chrome.storage.sync.set({theme: event.target.value});
    });

    form.addEventListener("submit", event => {
        event.preventDefault();
        submitLogin({
            loginCode: loginCodeElement.value,
            schoolName: schoolNameElement.value,
            loginButton,
            errorText
        });
    });
}

if(document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLogin, {once: true});
} else {
    initializeLogin();
}

async function submitLogin({loginCode, schoolName, loginButton, errorText}) {
    const normalizedCode = loginCode.replace(/\s/g, "");
    const normalizedSchool = schoolName.trim();
    errorText.hidden = true;

    if(!normalizedSchool || !/^\d{12}$/.test(normalizedCode)) {
        errorText.textContent = "Vul je schoolnaam en de 12-cijferige login code in.";
        errorText.hidden = false;
        return;
    }

    loginButton.disabled = true;
    try {
        const tokenResponse = await fetch(
            "https://" + encodeURI(normalizedSchool) + ".zportal.nl/api/v2/oauth/token",
            {
                method: "POST",
                headers: {"Content-Type": "application/x-www-form-urlencoded"},
                body: "grant_type=authorization_code&code=" + encodeURIComponent(normalizedCode)
            }
        );
        const tokenPayload = await readApiResponse(tokenResponse);
        const accessToken = tokenPayload.access_token;
        if(!accessToken) throw new Error("Zermelo gaf geen access token terug.");

        // The auth code is single-use. Persist the token before making any
        // additional API request so a profile failure cannot lose the login.
        const fallbackUserInfo = {firstName: "daar", lastName: ""};
        await storeData(normalizedSchool, accessToken, fallbackUserInfo);

        try {
            const userInfo = await getUserInfo(normalizedSchool, accessToken);
            await storeData(normalizedSchool, accessToken, userInfo);
        } catch(error) {
            console.warn("User profile unavailable; continuing with token:", error);
        }

        redirectMain();
    } catch(error) {
        console.error("Login failed:", error);
        errorText.textContent = error.message || "Inloggen mislukt, probeer het opnieuw.";
        errorText.hidden = false;
        loginButton.disabled = false;
    }
}

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

async function readApiResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if(!response.ok) {
        const message = payload.message || payload.error_description || payload.error
            || payload.response?.message;
        throw new Error(message || `API-fout (${response.status})`);
    }
    return payload;
}

async function getUserInfo(siteName, accessToken) {
    const url = "https://" + encodeURI(siteName)
        + ".zportal.nl/api/v3/users/~me?access_token=" + encodeURIComponent(accessToken);
    const payload = await readApiResponse(await fetch(url));
    const data = payload.response?.data?.[0];
    if(!data) throw new Error("De gebruikersgegevens konden niet worden opgehaald.");
    data.fullName = data.firstName + " " + data.lastName;
    return data;
}

function storeData(schoolName, accessToken, userInfo) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({accessToken, schoolName, userInfo}, () => {
            if(chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

function redirectMain() {
    chrome.action.setPopup({popup: "popup.html"});
    window.location.href = "popup.html";
}
