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

    loginButton.addEventListener("click", async event => {
        event.preventDefault();
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
                "https://" + encodeURI(schoolName) + ".zportal.nl/api/v2/oauth/token",
                {
                    method: "POST",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body: "grant_type=authorization_code&code=" + encodeURI(loginCode)
                }
            );
            const tokenPayload = await readApiResponse(tokenResponse);
            const accessToken = tokenPayload.access_token;
            if(!accessToken) throw new Error("Zermelo gaf geen access token terug.");

            const userInfo = await getUserInfo(schoolName, accessToken);
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
                chrome.action.setPopup({popup: "popup.html"});
                window.location.href = "popup.html";
                resolve();
            });
        });
    });
}
