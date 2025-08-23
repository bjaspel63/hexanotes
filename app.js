// ==========================
// HexaNotes App
// ==========================

// Google API config
const CLIENT_ID = "95097301836-6v5mtlk740fgumquijro6h4ulra3eahi.apps.googleusercontent.com";
const API_KEY = "AIzaSyAIQ9iQTSVyaDNlxbay4pnlAmq9oqlnxfc";
const SCOPES = "https://www.googleapis.com/auth/drive.file";
let tokenClient, gapiInited = false, gisInited = false;
let driveFolderId = null;

const notesKey = "hexaNotes";
let notes = [];

// Elements
const fab = document.getElementById("fab");
const noteDialog = document.getElementById("noteDialog");
const noteForm = document.getElementById("noteForm");
const noteIdInput = document.getElementById("noteId");
const noteTitle = document.getElementById("noteTitle");
const noteContent = document.getElementById("noteContent");
const noteTags = document.getElementById("noteTags");
const noteFiles = document.getElementById("noteFiles");
const noteColor = document.getElementById("noteColor");
const noteColorOptions = document.getElementById("noteColorOptions");
const notesGrid = document.getElementById("notesGrid");
const emptyState = document.getElementById("emptyState");
const closeNoteBtn = document.getElementById("closeNoteBtn");
const deleteNoteBtn = document.getElementById("deleteNoteBtn");
const searchInput = document.getElementById("searchInput");
const tagFilter = document.getElementById("tagFilter");

// ==========================
// Init Google API
// ==========================
window.onload = () => {
  gapi.load("client", initClient);
};

async function initClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
  });
  gapiInited = true;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (tokenResponse) => {
      if (tokenResponse && tokenResponse.access_token) {
        await ensureDriveFolder();
        await loadBackup();
      }
    },
  });

  // Trigger login immediately
  tokenClient.requestAccessToken();
}

// ==========================
// Drive Helpers
// ==========================
async function ensureDriveFolder() {
  let response = await gapi.client.drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='HexaNotes' and trashed=false",
    fields: "files(id, name)",
  });

  if (response.result.files && response.result.files.length > 0) {
    driveFolderId = response.result.files[0].id;
  } else {
    let folder = await gapi.client.drive.files.create({
      resource: {
        name: "HexaNotes",
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    driveFolderId = folder.result.id;
  }
}

async function uploadFileToDrive(file) {
  const metadata = {
    name: file.name,
    parents: [driveFolderId],
  };
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: new Headers({
        Authorization: "Bearer " + gapi.client.getToken().access_token,
      }),
      body: form,
    }
  );
  const data = await res.json();
  return `https://drive.google.com/uc?id=${data.id}`;
}

async function saveBackup() {
  const backupData = JSON.stringify(notes);
  const existing = await gapi.client.drive.files.list({
    q: `'${driveFolderId}' in parents and name='hexaNotesBackup.json' and trashed=false`,
    fields: "files(id)",
  });

  if (existing.result.files.length > 0) {
    await gapi.client.request({
      path: `/upload/drive/v3/files/${existing.result.files[0].id}`,
      method: "PATCH",
      params: { uploadType: "media" },
      body: backupData,
    });
  } else {
    await gapi.client.drive.files.create({
      resource: {
        name: "hexaNotesBackup.json",
        parents: [driveFolderId],
        mimeType: "application/json",
      },
      media: {
        mimeType: "application/json",
        body: backupData,
      },
    });
  }
}

async function loadBackup() {
  const existing = await gapi.client.drive.files.list({
    q: `'${driveFolderId}' in parents and name='hexaNotesBackup.json' and trashed=false`,
    fields: "files(id, name)",
  });

  if (existing.result.files.length > 0) {
    const fileId = existing.result.files[0].id;
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: "media",
    });
    notes = response.result || [];
    renderNotes();
  }
}

// ==========================
// Notes Handling
// ==========================
fab.addEventListener("click", () => {
  noteForm.reset();
  noteIdInput.value = "";
  noteColor.value = "";
  noteFiles.value = "";
  noteDialog.showModal();
});

noteColorOptions.querySelectorAll(".color-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    noteColor.value = btn.dataset.color;
    noteColorOptions
      .querySelectorAll(".color-btn")
      .forEach((b) => b.classList.remove("ring-4", "ring-sky-500"));
    btn.classList.add("ring-4", "ring-sky-500");
  });
});

closeNoteBtn.addEventListener("click", () => noteDialog.close());

deleteNoteBtn.addEventListener("click", async () => {
  if (!noteIdInput.value) return;
  if (!confirm("Are you sure you want to delete this note?")) return;
  notes = notes.filter((n) => n.id !== noteIdInput.value);
  await saveBackup();
  renderNotes();
  noteDialog.close();
});

noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  let id = noteIdInput.value || Date.now().toString();
  let title = noteTitle.value.trim();
  let content = noteContent.value.trim();
  let tags = noteTags.value.split(",").map((t) => t.trim()).filter(Boolean);
  let color = noteColor.value || "#ffffff";

  let files = [];
  for (let file of noteFiles.files) {
    let link = await uploadFileToDrive(file);
    files.push({ name: file.name, url: link, type: file.type });
  }

  let existing = notes.find((n) => n.id === id);
  if (existing) {
    existing.title = title;
    existing.content = content;
    existing.tags = tags;
    existing.color = color;
    existing.files = files;
  } else {
    notes.push({ id, title, content, tags, color, files });
  }

  await saveBackup();
  renderNotes();
  noteDialog.close();
});

function renderNotes() {
  notesGrid.innerHTML = "";
  if (notes.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  } else {
    emptyState.classList.add("hidden");
  }

  notes.forEach((note) => {
    const card = document.createElement("div");
    card.className =
      "rounded-2xl shadow p-4 flex flex-col gap-2 bg-white relative";
    if (note.color) {
      card.style.background = note.color;
    }

    let tagHtml = note.tags
      .map(
        (t) =>
          `<span class="px-2 py-1 text-xs rounded bg-slate-200 text-slate-700">#${t}</span>`
      )
      .join(" ");

    let fileHtml = note.files
      ? note.files
          .map((f) => {
            if (f.type.startsWith("image/")) {
              return `<img src="${f.url}" class="w-full rounded-lg">`;
            } else if (f.type.startsWith("video/")) {
              return `<video controls class="w-full rounded-lg"><source src="${f.url}" type="${f.type}"></video>`;
            } else {
              return `<a href="${f.url}" target="_blank" class="text-sky-600 underline">${f.name}</a>`;
            }
          })
          .join("")
      : "";

    card.innerHTML = `
      <button class="absolute top-2 right-2 text-gray-500 hover:text-gray-800 edit-btn">✏️</button>
      <h2 class="font-bold text-lg">${note.title}</h2>
      <p>${note.content}</p>
      <div class="flex gap-2 flex-wrap">${tagHtml}</div>
      <div class="mt-2">${fileHtml}</div>
    `;

    card.querySelector(".edit-btn").addEventListener("click", () => {
      noteIdInput.value = note.id;
      noteTitle.value = note.title;
      noteContent.value = note.content;
      noteTags.value = note.tags.join(", ");
      noteColor.value = note.color;
      noteDialog.showModal();
    });

    notesGrid.appendChild(card);
  });

  updateTagFilter();
}

function updateTagFilter() {
  let allTags = new Set();
  notes.forEach((n) => n.tags.forEach((t) => allTags.add(t)));
  tagFilter.innerHTML = `<option value="">All Tags</option>`;
  allTags.forEach((t) => {
    let opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagFilter.appendChild(opt);
  });
}

searchInput.addEventListener("input", renderNotes);
tagFilter.addEventListener("change", renderNotes);
