const CLIENT_ID = "95097301836-6v5mtlk740fgumquijro6h4ulra3eahi.apps.googleusercontent.com"; 
let tokenClient;
const authArea = document.getElementById("authArea");

async function initializeGapi() {
  return new Promise(res => gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: '',
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
    });
    res();
  }));
}

function initializeTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    callback: handleTokenResponse
  });
}

async function getUserEmail(access_token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const data = await res.json();
  return data.email;
}

async function handleTokenResponse(resp) {
  if (resp.error) {
    console.error(resp);
    alert("Login failed. Try again.");
    return;
  }

  const email = await getUserEmail(resp.access_token);
  if (!email) {
    alert("Failed to get user email");
    return;
  }

  localStorage.setItem("accessToken", resp.access_token);
  localStorage.setItem("userEmail", email); // store email for IndexedDB separation
  window.location.href = "main.html";
}

function renderLoginButton() {
  authArea.innerHTML = '';
  const btn = document.createElement("button");
  btn.textContent = "Sign in with Google";
  btn.className = "px-6 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow hover:scale-105 transition transform";
  
  btn.onclick = async () => {
    await initializeGapi();
    initializeTokenClient();

    const storedToken = localStorage.getItem("accessToken");
    if (storedToken) {
      // Validate token if needed
      gapi.client.setToken({ access_token: storedToken });
      window.location.href = "main.html";
    } else {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  };

  authArea.appendChild(btn);
}

// Run on load
window.onload = () => {
  renderLoginButton();
};