// ======== Config ========
const DRIVE_PRIMARY_FOLDER = "HexaNotes";
const DRIVE_PRIMARY_FILE = "notes.json";

// ===== Color Options =====
const COLOR_OPTIONS = [
    { name: "Yellow", value: "#fef08a", gradient: "linear-gradient(135deg, #fef08a, #facc15)", textColor: "#000" },
    { name: "Red", value: "#f87171", gradient: "linear-gradient(135deg, #f87171, #ef4444)", textColor: "#fff" },
    { name: "Sky", value: "#38bdf8", gradient: "linear-gradient(135deg, #38bdf8, #0ea5e9)", textColor: "#fff" },
    { name: "Green", value: "#4ade80", gradient: "linear-gradient(135deg, #4ade80, #22c55e)", textColor: "#000" },
    { name: "Purple", value: "#c084fc", gradient: "linear-gradient(135deg, #c084fc, #9333ea)", textColor: "#fff" }
];

// ===== Global Variables =====
let notes = [];
let accessToken = null;

let notesGrid, noteDialog, noteForm, noteIdInput, noteTitle, noteContent, noteTags, noteColor, noteFilesInput;
let searchInput, tagFilter, deleteNoteBtn, logoutBtn, installBtn, emptyState, closeNoteBtn;
let fab, syncIndicator, noteColorOptionsDiv;

// ===== Helpers =====
function toast(msg, duration = 2000) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.className = "fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-sky-500 text-white px-4 py-2 rounded shadow-lg z-50 animate-fade-in";
    document.body.appendChild(t);
    setTimeout(() => {
        t.classList.add("opacity-0");
        setTimeout(() => t.remove(), 500);
    }, duration);
}

function showSyncing() { syncIndicator.style.display = "block"; }
function hideSyncing() { syncIndicator.style.display = "none"; }
function isGapiReady() { return window.gapi && gapi.client && typeof gapi.client.request === "function"; }

// ===== Local Storage =====
function saveNotesLocal() { localStorage.setItem("hexaNotes", JSON.stringify(notes)); }
function loadNotesLocal() { notes = JSON.parse(localStorage.getItem("hexaNotes") || "[]"); }

// ===== Initialize GAPI + Token =====
async function ensureGapiAndToken() {
    await new Promise(res => gapi.load('client', res));
    await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
    accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return false;
    gapi.client.setToken({ access_token: accessToken });
    return true;
}

// ===== Drive Helpers =====
async function getOrCreateFolderByName(name) {
    const res = await gapi.client.drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id,name)", spaces: "drive"
    });
    if (res.result.files?.length) return res.result.files[0].id;
    const folder = await gapi.client.drive.files.create({
        resource: { name, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
    });
    return folder.result.id;
}

async function findFileInFolder(folderId, fileName) {
    const res = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
        fields: "files(id,name,webViewLink)"
    });
    return res.result.files?.[0] || null;
}

async function uploadFileToDrive(folderId, file) {
    const metadata = { name: file.name, parents: [folderId] };
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);
    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
    });
    return await res.json();
}

// ===== Auto Backup =====
async function autoBackup() {
    if (!accessToken) return;
    try {
        showSyncing();
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        let file = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);

        const payload = new Blob([JSON.stringify(notes)], { type: 'application/json' });

        if (file) {
            await gapi.client.request({
                path: `/upload/drive/v3/files/${file.id}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: payload
            });
        } else {
            const metadata = { name: DRIVE_PRIMARY_FILE, parents: [folderId] };
            const formData = new FormData();
            formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            formData.append('file', payload);
            await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: formData
            });
        }
    } catch (err) { console.warn("Auto-backup failed:", err); }
    finally { hideSyncing(); }
}

// ===== Restore Notes =====
async function restoreNotes() {
    try {
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        const file = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);
        if (!file) return;

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (Array.isArray(data)) notes = data;
        saveNotesLocal();
        renderNotes();
    } catch (err) { console.warn("Restore failed", err); }
}

// ===== Notes Rendering =====
function renderNotes() {
    notesGrid.innerHTML = "";
    const search = (searchInput.value || "").toLowerCase();
    const selectedTag = tagFilter.value;

    const filtered = notes.filter(n => {
        const t = (n.title || "").toLowerCase();
        const c = (n.content || "").toLowerCase();
        const matchesSearch = t.includes(search) || c.includes(search);
        const matchesTag = !selectedTag || (n.tags?.includes(selectedTag));
        return matchesSearch && matchesTag;
    });

    emptyState.classList.toggle("hidden", filtered.length !== 0);

    filtered.forEach(note => {
        const div = document.createElement("div");
        div.className = "note-card p-4 rounded-lg shadow cursor-default relative";
        div.style.background = COLOR_OPTIONS.find(c => c.value === note.color)?.gradient || COLOR_OPTIONS[0].gradient;
        div.style.color = COLOR_OPTIONS.find(c => c.value === note.color)?.textColor || "#000";

        // Card content
        const linkedContent = note.content?.replace(/(https?:\/\/[^\s]+)/g,
            `<a href="$1" target="_blank" style="color:inherit;text-decoration:underline;">$1</a>`) || "";

        div.innerHTML = `
            <h3 class="text-lg font-bold">${note.title}</h3>
            <p class="mt-2 text-sm break-words">${linkedContent}</p>
            <div class="mt-3 flex flex-wrap gap-1">${note.tags?.map(t=>`<span class="tag-chip" style="border:1px solid; padding:2px 6px; border-radius:4px;">${t}</span>`).join('')||''}</div>
            <div class="mt-3 note-files flex flex-col gap-2">
                ${note.files?.map(f => {
                    if(f.type.startsWith("image/")) return `<img src="${f.url}" class="rounded-lg max-h-48 object-contain">`;
                    if(f.type.startsWith("video/")) return `<video src="${f.url}" controls class="rounded-lg max-h-48"></video>`;
                    return `<a href="${f.url}" target="_blank" style="text-decoration:underline;">${f.name}</a>`;
                }).join('')||''}
            </div>
            <button class="absolute top-2 right-2 edit-btn p-1 bg-white/80 rounded hover:bg-white">✏️</button>
        `;

        div.querySelector(".edit-btn").addEventListener("click", (e)=>{
            e.stopPropagation();
            openNote(note.id);
        });

        notesGrid.appendChild(div);
    });

    renderTagFilter();
}

// ===== Tag Filter Rendering =====
function renderTagFilter() {
    const tags = [...new Set(notes.flatMap(n=>n.tags||[]))];
    tagFilter.innerHTML = '<option value="">All Tags</option>' + tags.map(t=>`<option value="${t}">${t}</option>`).join('');
}

// ===== Note Dialog =====
function openNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    noteIdInput.value = note.id;
    noteTitle.value = note.title;
    noteContent.value = note.content;
    noteTags.value = note.tags?.join(", ") || "";
    noteColor.value = note.color || COLOR_OPTIONS[0].value;
    deleteNoteBtn.style.display = "inline-block";
    noteDialog.showModal();
}

function openNewNoteDialog() {
    noteIdInput.value = "";
    noteTitle.value = "";
    noteContent.value = "";
    noteTags.value = "";
    noteColor.value = COLOR_OPTIONS[0].value;
    noteFilesInput.value = "";
    deleteNoteBtn.style.display = "none";
    noteDialog.showModal();
}

// ===== Handle Note Form =====
async function handleNoteSubmit(e) {
    e.preventDefault();
    const title = noteTitle.value.trim();
    if (!title) { toast("Title cannot be empty ❌"); return; }

    const id = noteIdInput.value;
    const tags = noteTags.value.split(",").map(t=>t.trim()).filter(t=>t);
    const colorValue = noteColor.value || COLOR_OPTIONS[0].value;

    // Upload files to Drive
    let filesArray = [];
    if (noteFilesInput.files.length) {
        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        for (let f of noteFilesInput.files) {
            const uploaded = await uploadFileToDrive(folderId, f);
            filesArray.push({ name: f.name, type: f.type, url: uploaded.webViewLink || uploaded.id });
        }
    }

    if (id) {
        const note = notes.find(n => n.id===id);
        note.title = title;
        note.content = noteContent.value.trim();
        note.tags = tags;
        note.color = colorValue;
        if (filesArray.length) note.files = [...(note.files||[]), ...filesArray];
        toast("Note updated ✔");
    } else {
        notes.push({
            id: Date.now().toString(),
            title,
            content: noteContent.value.trim(),
            tags,
            color: colorValue,
            files: filesArray
        });
        toast("Note added ✔");
    }

    saveNotesLocal();
    renderNotes();
    noteDialog.close();
    autoBackup();
}

// ===== Handle Note Delete =====
function handleNoteDelete() {
    if (!confirm("Are you sure you want to delete this note?")) return;
    const id = noteIdInput.value;
    notes = notes.filter(n => n.id !== id);
    saveNotesLocal();
    renderNotes();
    noteDialog.close();
    toast("Note deleted ✔");
    autoBackup();
}

// ===== Initialize DOM-dependent elements =====
window.onload = async () => {
    // DOM elements
    notesGrid = document.getElementById("notesGrid");
    noteDialog = document.getElementById("noteDialog");
    noteForm = document.getElementById("noteForm");
    noteIdInput = document.getElementById("noteId");
    noteTitle = document.getElementById("noteTitle");
    noteContent = document.getElementById("noteContent");
    noteTags = document.getElementById("noteTags");
    noteColor = document.getElementById("noteColor");
    noteFilesInput = document.getElementById("noteFiles");
    searchInput = document.getElementById("searchInput");
    tagFilter = document.getElementById("tagFilter");
    deleteNoteBtn = document.getElementById("deleteNoteBtn");
    logoutBtn = document.getElementById("logoutBtn");
    installBtn = document.getElementById("installBtn");
    emptyState = document.getElementById("emptyState");
    closeNoteBtn = document.getElementById("closeNoteBtn");

    fab = document.getElementById("fab");
    syncIndicator = document.createElement("div");
    syncIndicator.textContent = "Syncing...";
    Object.assign(syncIndicator.style, {position:"fixed",bottom:"20px",right:"20px",background:"rgba(0,0,0,0.7)",color:"white",padding:"10px 15px",borderRadius:"8px",fontSize:"14px",display:"none"});
    document.body.appendChild(syncIndicator);

    fab.addEventListener("click", openNewNoteDialog);
    noteForm.addEventListener("submit", handleNoteSubmit);
    closeNoteBtn?.addEventListener("click", () => noteDialog.close());
    deleteNoteBtn.addEventListener("click", handleNoteDelete);
    [noteTitle,noteContent,noteTags,noteColor,noteFilesInput].forEach(i=>i.addEventListener("input", autoBackup));
    searchInput.addEventListener("input", renderNotes);
    tagFilter.addEventListener("change", renderNotes);

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to logout?")) return;

    // Remove stored token
    localStorage.removeItem("accessToken");

    // Optional: revoke Google token
    const token = gapi?.client?.getToken?.()?.access_token || localStorage.getItem("accessToken");
    if (token) {
        fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
    }

    // Redirect to login page
    window.location.href = "index.html";
});

    // Color buttons
    document.querySelectorAll(".color-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>noteColor.value=btn.dataset.color);
    });

    loadNotesLocal();
    renderNotes();
    await restoreNotes();
};