// ======== Config (visible folder + file names) ========
const DRIVE_PRIMARY_FOLDER = "HexaNotes";           // New/visible folder in My Drive
const DRIVE_PRIMARY_FILE   = "notes.json";          // New/visible file
const DRIVE_LEGACY_FOLDER  = "HexaNotesBackup";     // Back-compat restore
const DRIVE_LEGACY_FILE    = "hexa-notes.json";     // Back-compat restore

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

// ===== Local Storage Helpers =====
function saveNotes() { localStorage.setItem("hexaNotes", JSON.stringify(notes)); }
function loadNotes() { notes = JSON.parse(localStorage.getItem("hexaNotes")||"[]"); }

// ===== Small Helpers =====
function toast(msg) { alert(msg); } // swap with a nicer toast if you like
function isGapiReady() { return window.gapi && gapi.client && typeof gapi.client.request === "function"; }

/** Ensure gapi client is initialized with Drive discovery before any API call */
async function ensureGapiReady() {
  if (isGapiReady() && gapi.client.drive) return;
  // Load client if not loaded (gapi script must be included in HTML)
  await new Promise((res) => gapi.load('client', res));
  // Initialize with Drive discovery doc (no API key needed for OAuth-based calls)
  await gapi.client.init({
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
  });
}

/** Ensure we have a valid access token set for gapi client */
function ensureToken() {
  accessToken = localStorage.getItem("accessToken");
  if (!accessToken) return false;
  gapi.client.setToken({ access_token: accessToken });
  return true;
}

/** Handle common Drive errors */
function handleDriveError(err, fallbackMessage = "Drive request failed.") {
  console.warn("Drive error:", err);
  try {
    const code = err?.status || err?.result?.error?.code;
    if (code === 401 || code === 403) {
      toast("Your session expired or lacks permission. Please log in again.");
      localStorage.removeItem("accessToken");
      window.location.href = "index.html";
      return;
    }
  } catch (_) {}
  toast(fallbackMessage);
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

    // Support solid color (e.g., #ff...) or gradient strings
    div.style.background = note.color || "linear-gradient(135deg, #fef08a, #fbbf24)";
    div.innerHTML = `
      <h3 class="text-lg font-bold">${note.title || ""}</h3>
      <p class="mt-2 text-sm break-words">${note.content || ""}</p>
      <div class="mt-3 flex flex-wrap gap-1">${note.tags?.map(t=>`<span class="tag-chip">${t}</span>`).join('')||''}</div>
    `;

    div.addEventListener("click",()=>openNote(note.id));
    div.addEventListener("dragstart",e=>{ e.dataTransfer.setData("text/plain",note.id); div.classList.add("dragging"); });
    div.addEventListener("dragend",()=>div.classList.remove("dragging"));
    notesGrid.appendChild(div);
  });

  renderTagFilter();
}

// ===== Tag Filter Options =====
function renderTagFilter(){
  const tags = [...new Set(notes.flatMap(n=>n.tags||[]))];
  tagFilter.innerHTML = '<option value="">All Tags</option>'+tags.map(t=>`<option value="${t}">${t}</option>`).join('');
}

// ===== Open Note Dialog =====
function openNote(id){
  const note = notes.find(n=>n.id===id);
  if(!note) return;
  noteIdInput.value = note.id;
  noteTitle.value = note.title || "";
  noteContent.value = note.content || "";
  noteTags.value = note.tags?.join(", ")||"";
  noteColor.value = (note.color && note.color.startsWith("#")) ? note.color : "#fef08a"; // color input wants hex
  deleteNoteBtn.style.display = "inline-block";
  noteDialog.showModal();
}

// ===== New Note =====
newNoteBtn.addEventListener("click",()=>{
  noteIdInput.value="";
  noteTitle.value="";
  noteContent.value="";
  noteTags.value="";
  noteColor.value="#fef08a";
  deleteNoteBtn.style.display = "none";
  noteDialog.showModal();
});

// ===== Save Note =====
noteForm.addEventListener("submit",e=>{
  e.preventDefault();
  const id = noteIdInput.value;
  const tags = noteTags.value.split(",").map(t=>t.trim()).filter(t=>t);
  const colorValue = noteColor.value || "#fef08a";

  if(id){
    const note = notes.find(n=>n.id===id);
    if (!note) return;
    note.title = noteTitle.value.trim();
    note.content = noteContent.value.trim();
    note.tags = tags;
    note.color = colorValue;
  } else {
    notes.push({
      id: Date.now().toString(),
      title: noteTitle.value.trim(),
      content: noteContent.value.trim(),
      tags,
      color: colorValue
    });
  }
  saveNotes();
  renderNotes();
  noteDialog.close();
});

// ===== Delete Note =====
deleteNoteBtn.addEventListener("click",()=>{
  const id = noteIdInput.value;
  notes = notes.filter(n=>n.id!==id);
  saveNotes();
  renderNotes();
  noteDialog.close();
});

// ===== Search & Tag Filter Events =====
searchInput.addEventListener("input", renderNotes);
tagFilter.addEventListener("change", renderNotes);

// ===== Logout =====
logoutBtn.addEventListener("click",()=>{
  localStorage.removeItem("accessToken");
  window.location.href="index.html";
});

// ===== PWA Install Prompt =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove("hidden");
});
installBtn.addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  installBtn.classList.add("hidden");
  deferredPrompt = null;
});

// ===== Drive helpers =====
async function getOrCreateFolderByName(name){
  const res = await gapi.client.drive.files.list({
    q:`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive"
  });
  if(res.result.files?.length) return res.result.files[0].id;

  const folder = await gapi.client.drive.files.create({
    resource:{ name, mimeType:'application/vnd.google-apps.folder' },
    fields:'id'
  });
  return folder.result.id;
}

// Prefer PRIMARY (HexaNotes/notes.json); restore also supports legacy
async function getOrCreatePrimaryFolder() {
  return await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
}

// Find a file by name within a folder
async function findFileInFolder(folderId, fileName) {
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
    fields: "files(id,name,webViewLink)"
  });
  return res.result.files?.[0] || null;
}

// ===== Google Drive Backup (robust) =====
async function backupNotes(){
  try {
    await ensureGapiReady();
    if(!ensureToken()) return toast("Login required");

    const folderId = await getOrCreatePrimaryFolder();
    const existing = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);

    const payload = new Blob([JSON.stringify(notes)], {type:'application/json'});

    if (existing) {
      // Update existing file (media upload)
      await gapi.client.request({
        path:`/upload/drive/v3/files/${existing.id}`,
        method:'PATCH',
        params:{ uploadType:'media' },
        body: payload
      });
      toast("Backup updated in Drive ✔");
    } else {
      // Create new file via multipart (metadata + media)
      const metadata = { name: DRIVE_PRIMARY_FILE, parents:[folderId] };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], {type:'application/json'}));
      formData.append('file', payload);

      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
        method:'POST',
        headers:{ Authorization:`Bearer ${accessToken}` },
        body: formData
      });
      toast("Backup created in Drive ✔");
    }
  } catch (err) {
    handleDriveError(err, "Backup failed. Check your login and permissions.");
  }
}

// ===== Google Drive Restore (primary with legacy fallback) =====
async function restoreNotes(){
  try {
    await ensureGapiReady();
    if(!ensureToken()) return toast("Login required");

    // Try primary location first
    const primaryFolderId = await getOrCreatePrimaryFolder();
    let file = await findFileInFolder(primaryFolderId, DRIVE_PRIMARY_FILE);

    // Fallback to legacy location if not found
    if (!file) {
      // Look for legacy folder (don’t create it if it doesn’t exist)
      const legacyFolderSearch = await gapi.client.drive.files.list({
        q:`name='${DRIVE_LEGACY_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id,name)"
      });
      const legacyFolderId = legacyFolderSearch.result.files?.[0]?.id || null;

      if (legacyFolderId) {
        file = await findFileInFolder(legacyFolderId, DRIVE_LEGACY_FILE);
      }
    }

    if(!file) return toast("No backup found in Drive.");

    // Download file content
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers:{ Authorization:`Bearer ${accessToken}` }
    });
    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error("Backup file is corrupted or in unexpected format.");
    }

    notes = data;
    saveNotes();
    renderNotes();
    toast("Restore complete ✔");
  } catch (err) {
    handleDriveError(err, "Restore failed. Check your login and permissions.");
  }
}

backupBtn.addEventListener("click", backupNotes);
restoreBtn.addEventListener("click", restoreNotes);

// ===== Initialize =====
async function init(){
  if(!accessToken){ window.location.href="index.html"; return; }
  loadNotes();
  renderNotes();

  // Register SW for PWA
  if('serviceWorker' in navigator){
    try { await navigator.serviceWorker.register('service-worker.js'); }
    catch (e) { console.warn("SW registration failed", e); }
  }
}
window.onload = init;
