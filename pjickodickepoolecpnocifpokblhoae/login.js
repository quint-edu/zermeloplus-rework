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
                {
                    method: "POST",
                    headers: {"Accept": "application/json"}
                }
            );
            const tokenPayload = await readApiResponse(tokenResponse);
            const accessToken = findToken(tokenPayload);
            if(!accessToken) throw new Error("De API gaf geen token terug.");

            await saveData(schoolName, accessToken, {firstName: "daar", lastName: ""});
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
    if(!response.ok || Number(payload.response?.status) >= 400) {
        throw new Error(getApiErrorMessage(payload, response.status));
    }
    return payload;
}

function getApiErrorMessage(payload, status) {
    const response = payload?.response || {};
    const message = response.message || payload?.message || payload?.error_description || payload?.error;
    const details = response.details || payload?.details;
    if(message && details && details !== message) {
        return `${message} (${details})`;
    }
    if(message) return message;
    if(status === 400) {
        return "De login code is ongeldig, verlopen of al eerder gebruikt. Vraag een nieuwe Zermelo-authcode aan.";
    }
    return `API-fout (${status})`;
}

function findToken(value) {
    if(!value || typeof value !== "object") return null;
    for(const [key, child] of Object.entries(value)) {
        if(/^(access[_-]?token|accesstoken|token)$/i.test(key)
            && typeof child === "string" && child.length > 10) {
            return child.replace(/^Bearer\s+/i, "");
        }
        const nestedToken = findToken(child);
        if(nestedToken) return nestedToken;
    }
    return null;
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
