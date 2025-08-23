const CLIENT_ID = "95097301836-6v5mtlk740fgumquijro6h4ulra3eahi.apps.googleusercontent.com"; 
let tokenClient, accessToken = null;
const authArea = document.getElementById("authArea");

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
async function initializeGapiClient() { await gapi.client.init({apiKey:'', discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]}); }

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: '',
  });
  renderLoginButton();
}

function renderLoginButton() {
  authArea.innerHTML = '';
  const btn = document.createElement("button");
  btn.textContent = "Sign in with Google";
  btn.className = "px-6 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow hover:scale-105 transition transform";
  btn.onclick = () => {
    tokenClient.callback = (resp) => {
      if (resp.error) throw(resp);
      accessToken = resp.access_token;
      localStorage.setItem("accessToken", accessToken);
      window.location.href = "main.html";
    };
    if (!accessToken) tokenClient.requestAccessToken({prompt: 'consent'});
  };
  authArea.appendChild(btn);
}

window.onload = () => { gapiLoaded(); gisLoaded(); };
