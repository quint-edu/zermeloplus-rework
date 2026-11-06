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

    loginCodeElement.addEventListener("input", () => {
        loginCodeElement.value = loginCodeElement.value.replace(/\D/g, "").slice(0, 12);
    });

    loginButton.addEventListener("click", async () => {
        const loginCode = loginCodeElement.value.trim();
        const schoolName = schoolNameElement.value.trim();

        errorText.hidden = true;
        if(!schoolName || loginCode.length !== 12) {
            errorText.textContent = "Vul je schoolnaam en de 12-cijferige login code in.";
            errorText.hidden = false;
            return;
        }

        loginButton.disabled = true;
        try {
            const tokenResponse = await fetch(
                "https://" + encodeURIComponent(schoolName) + ".zportal.nl/api/oauth/token?code=" + encodeURIComponent(loginCode),
                {method: "POST"}
            );
            const tokenPayload = await readApiResponse(tokenResponse);
            const accessToken = tokenPayload.access_token
                || tokenPayload.token
                || tokenPayload.response?.access_token
                || tokenPayload.response?.data?.[0]?.access_token
                || tokenPayload.response?.data?.[0]?.token;
            if(!accessToken) throw new Error("De API gaf geen token terug.");

            const userInfo = await getUserInfo(schoolName, accessToken).catch(error => {
                console.warn("User profile is unavailable until a school year is selected:", error);
                return {firstName: "daar", lastName: ""};
            });
            await saveData(schoolName, accessToken, userInfo);
        } catch(error) {
            console.error("Login failed:", error);
            errorText.textContent = error.message || "Inloggen mislukt, probeer het opnieuw.";
            errorText.hidden = false;
            loginButton.disabled = false;
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

async function readApiResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if(!response.ok) {
        throw new Error(payload.message || payload.error || `API-fout (${response.status})`);
    }
    return payload;
}

function redirectMain() {
    chrome.action.setPopup({popup: "popup.html"});
    window.location.href = "popup.html";
}

function saveData(schoolName, accessToken, userInfo) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({accessToken, schoolName, userInfo}, () => {
            if(chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            redirectMain();
            resolve();
        });
    });
}

async function getUserInfo(siteName, accessToken) {
    const url = "https://" + encodeURIComponent(siteName)
        + ".zportal.nl/api/users/~me?fields=firstName,lastName,userCode";
    const response = await fetch(url, {headers: {Authorization: accessToken}});
    const payload = await readApiResponse(response);
    const data = payload.response?.data?.[0] || payload.data?.[0] || payload.data || payload;
    if(!data?.firstName) throw new Error("De gebruikersgegevens konden niet worden opgehaald.");
    data.fullName = [data.firstName, data.lastName].filter(Boolean).join(" ");
    return data;
}
