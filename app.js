// ======== Config ========
const DRIVE_PRIMARY_FOLDER = "HexaNotes";
const DRIVE_PRIMARY_FILE   = "notes.json";
const DRIVE_LEGACY_FOLDER  = "HexaNotesBackup";
const DRIVE_LEGACY_FILE    = "hexa-notes.json";

// ===== Global Variables =====
let notes = [];
let accessToken = localStorage.getItem("accessToken");
const notesGrid = document.getElementById("notesGrid");
const noteDialog = document.getElementById("noteDialog");
const noteForm = document.getElementById("noteForm");
const noteIdInput = document.getElementById("noteId");
const noteTitle = document.getElementById("noteTitle");
const noteContent = document.getElementById("noteContent");
const noteTags = document.getElementById("noteTags");
const noteColor = document.getElementById("noteColor");
const searchInput = document.getElementById("searchInput");
const tagFilter = document.getElementById("tagFilter");
const newNoteBtn = document.getElementById("newNoteBtn");
const deleteNoteBtn = document.getElementById("deleteNoteBtn");
const backupBtn = document.getElementById("backupBtn");
const restoreBtn = document.getElementById("restoreBtn");
const logoutBtn = document.getElementById("logoutBtn");
const installBtn = document.getElementById("installBtn");
const emptyState = document.getElementById("emptyState");

// ===== Local Storage =====
function saveNotes() { localStorage.setItem("hexaNotes", JSON.stringify(notes)); }
function loadNotes() { notes = JSON.parse(localStorage.getItem("hexaNotes") || "[]"); }

// ===== Helpers =====
function toast(msg) { alert(msg); }
function handleDriveError(err, fallback = "Drive request failed.") {
  console.warn("Drive error:", err);
  try {
    const code = err?.status || err?.result?.error?.code;
    if (code === 401 || code === 403) {
      toast("Session expired or permission denied. Login again.");
      localStorage.removeItem("accessToken");
      window.location.href = "index.html";
      return;
    }
  } catch (_) {}
  toast(fallback);
}

// ===== Google API Helpers =====
async function ensureGapiReady() {
  if (window.gapi && gapi.client && gapi.client.drive) return;

  await new Promise(res => gapi.load('client', res));
  await gapi.client.init({
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
  });
}

async function ensureToken() {
  accessToken = localStorage.getItem("accessToken");
  if (!accessToken) return false;

  await ensureGapiReady();
  gapi.client.setToken({ access_token: accessToken });
  return true;
}

// ===== Render Notes =====
function renderNotes() {
  notesGrid.innerHTML = "";
  const search = (searchInput.value || "").toLowerCase();
  const selectedTag = tagFilter.value;

  const filtered = notes.filter(n => {
    const t = (n.title || "").toLowerCase();
    const c = (n.content || "").toLowerCase();
    const matchesSearch = t.includes(search) || c.includes(search);
    const matchesTag = !selectedTag || (n.tags && n.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  emptyState.classList.toggle("hidden", filtered.length !== 0);

  filtered.forEach(note => {
    const div = document.createElement("div");
    div.className = "note-card";
    div.draggable = true;
    div.style.background = note.color || "linear-gradient(135deg, #fef08a, #fbbf24)";
    div.innerHTML = `
      <h3 class="text-lg font-bold">${note.title || ""}</h3>
      <p class="mt-2 text-sm break-words">${note.content || ""}</p>
      <div class="mt-3 flex flex-wrap gap-1">${note.tags?.map(t => `<span class="tag-chip">${t}</span>`).join('') || ''}</div>
    `;
    div.addEventListener("click", () => openNote(note.id));
    div.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", note.id); div.classList.add("dragging"); });
    div.addEventListener("dragend", () => div.classList.remove("dragging"));
    notesGrid.appendChild(div);
  });

  renderTagFilter();
}

function renderTagFilter() {
  const tags = [...new Set(notes.flatMap(n => n.tags || []))];
  tagFilter.innerHTML = '<option value="">All Tags</option>' + tags.map(t => `<option value="${t}">${t}</option>`).join('');
}

// ===== Note Dialog =====
function openNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  noteIdInput.value = note.id;
  noteTitle.value = note.title || "";
  noteContent.value = note.content || "";
  noteTags.value = note.tags?.join(", ") || "";
  noteColor.value = (note.color && note.color.startsWith("#")) ? note.color : "#fef08a";
  deleteNoteBtn.style.display = "inline-block";
  noteDialog.showModal();
}

newNoteBtn.addEventListener("click", () => {
  noteIdInput.value = ""; noteTitle.value = ""; noteContent.value = ""; noteTags.value = "";
  noteColor.value = "#fef08a";
  deleteNoteBtn.style.display = "none";
  noteDialog.showModal();
});

noteForm.addEventListener("submit", e => {
  e.preventDefault();
  const id = noteIdInput.value;
  const tags = noteTags.value.split(",").map(t => t.trim()).filter(t => t);
  const colorValue = noteColor.value || "#fef08a";

  if (id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    note.title = noteTitle.value.trim();
    note.content = noteContent.value.trim();
    note.tags = tags;
    note.color = colorValue;
  } else {
    notes.push({ id: Date.now().toString(), title: noteTitle.value.trim(), content: noteContent.value.trim(), tags, color: colorValue });
  }
  saveNotes();
  renderNotes();
  noteDialog.close();
});

deleteNoteBtn.addEventListener("click", () => {
  const id = noteIdInput.value;
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  renderNotes();
  noteDialog.close();
});

// ===== Search/Tag =====
searchInput.addEventListener("input", renderNotes);
tagFilter.addEventListener("change", renderNotes);

// ===== Logout =====
logoutBtn.addEventListener("click", () => { localStorage.removeItem("accessToken"); window.location.href = "index.html"; });

// ===== PWA Install =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installBtn.classList.remove("hidden"); });
installBtn.addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; installBtn.classList.add("hidden"); deferredPrompt = null; });

// ===== Drive Helpers =====
async function getOrCreateFolderByName(name) {
  const res = await gapi.client.drive.files.list({ q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: "files(id,name)", spaces: "drive" });
  if (res.result.files?.length) return res.result.files[0].id;
  const folder = await gapi.client.drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
  return folder.result.id;
}

async function getOrCreatePrimaryFolder() { return await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER); }
async function findFileInFolder(folderId, fileName) {
  const res = await gapi.client.drive.files.list({ q: `'${folderId}' in parents and name='${fileName}' and trashed=false`, fields: "files(id,name,webViewLink)" });
  return res.result.files?.[0] || null;
}

// ===== Backup =====
async function backupNotes() {
  try {
    if (!await ensureToken()) return toast("Login required");

    const folderId = await getOrCreatePrimaryFolder();
    let file = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);
    const payload = new Blob([JSON.stringify(notes)], { type: 'application/json' });

    if (file) {
      await gapi.client.request({ path: `/upload/drive/v3/files/${file.id}`, method: 'PATCH', params: { uploadType: 'media' }, body: payload });
      toast("Backup updated in Drive ✔");
    } else {
      const metadata = { name: DRIVE_PRIMARY_FILE, parents: [folderId] };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', payload);

      const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
      const newFile = await res.json();

      // Ensure file is in visible folder
      await gapi.client.drive.files.update({ fileId: newFile.id, addParents: folderId, removeParents: 'root' });
      toast("Backup created in Drive ✔");
    }
  } catch (err) {
    handleDriveError(err, "Backup failed. Check your login and permissions.");
  }
}

// ===== Restore =====
async function restoreNotes() {
  try {
    if (!await ensureToken()) return toast("Login required");

    const primaryFolderId = await getOrCreatePrimaryFolder();
    let file = await findFileInFolder(primaryFolderId, DRIVE_PRIMARY_FILE);

    if (!file) {
      const legacySearch = await gapi.client.drive.files.list({ q: `name='${DRIVE_LEGACY_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: "files(id,name)" });
      const legacyFolderId = legacySearch.result.files?.[0]?.id || null;
      if (legacyFolderId) file = await findFileInFolder(legacyFolderId, DRIVE_LEGACY_FILE);
    }

    if (!file) return toast("No backup found in Drive.");

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Backup corrupted or unexpected format.");

    notes = data;
    saveNotes();
    renderNotes();
    toast("Restore complete ✔");
  } catch (err) { handleDriveError(err, "Restore failed."); }
}

backupBtn.addEventListener("click", backupNotes);
restoreBtn.addEventListener("click", restoreNotes);

// ===== Init =====
async function init() {
  if (!accessToken) { window.location.href = "index.html"; return; }
  loadNotes();
  renderNotes();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('service-worker.js'); } catch (e) { console.warn("SW failed", e); }
  }
}
window.onload = init;
