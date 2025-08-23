const CLIENT_ID = "95097301836-6v5mtlk740fgumquijro6h4ulra3eahi.apps.googleusercontent.com"; 
let tokenClient;
const authArea = document.getElementById("authArea");

function gapiLoaded() { 
  gapi.load('client', initializeGapiClient); 
}

async function initializeGapiClient() { 
  await gapi.client.init({
    apiKey: '', 
    discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
  }); 
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: '', // will assign on button click
  });

  renderLoginButton();
}

function renderLoginButton() {
  authArea.innerHTML = '';
  const btn = document.createElement("button");
  btn.textContent = "Sign in with Google";
  btn.className = "px-6 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow hover:scale-105 transition transform";
  
  btn.onclick = () => {
    // Assign callback for this request
    tokenClient.callback = (resp) => {
      if (resp.error) {
        console.error(resp);
        alert("Login failed. Try again.");
        return;
      }
      // Save token and redirect
      localStorage.setItem("accessToken", resp.access_token);
      window.location.href = "main.html";
    };

    const storedToken = localStorage.getItem("accessToken");
    if (storedToken) {
      // Token exists: use it and redirect
      window.location.href = "main.html";
    } else {
      // Request token from Google
      tokenClient.requestAccessToken({prompt:'consent'});
    }
  };

  authArea.appendChild(btn);
}

// Run loaders
window.onload = () => {
  gapiLoaded();
  gisLoaded();
};
