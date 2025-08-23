// ======== Config ========
const DRIVE_PRIMARY_FOLDER = "HexaNotes";
const DRIVE_PRIMARY_FILE = "notes.json";
const COLOR_OPTIONS = [
    { name: "Yellow", value: "#fef08a", gradient: "linear-gradient(135deg, #fef08a, #facc15)", textColor: "#000" },
    { name: "Red", value: "#f87171", gradient: "linear-gradient(135deg, #f87171, #ef4444)", textColor: "#fff" },
    { name: "Sky", value: "#38bdf8", gradient: "linear-gradient(135deg, #38bdf8, #0ea5e9)", textColor: "#fff" },
    { name: "Green", value: "#4ade80", gradient: "linear-gradient(135deg, #4ade80, #22c55e)", textColor: "#000" },
    { name: "Purple", value: "#c084fc", gradient: "linear-gradient(135deg, #c084fc, #9333ea)", textColor: "#fff" }
];

let notes = [];
let accessToken = null;
let lastBackupNotes = "";

// ===== DOM Elements =====
let notesGrid, noteDialog, noteForm, noteIdInput, noteTitle, noteContent, noteTags, noteColor, noteFilesInput, existingFilesDiv;
let searchInput, tagFilter, deleteNoteBtn, logoutBtn, installBtn, emptyState, closeNoteBtn;
let fab, syncIndicator;

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
function debounce(fn, delay = 1500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ===== Local Storage =====
function saveNotesLocal() { localStorage.setItem("hexaNotes", JSON.stringify(notes)); }
function loadNotesLocal() { notes = JSON.parse(localStorage.getItem("hexaNotes") || "[]"); }

// ===== GAPI =====
async function ensureGapiAndToken() {
    await new Promise(res => gapi.load('client', res));
    await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
    accessToken = localStorage.getItem("accessToken");
    if (!accessToken) { window.location.href = "index.html"; return false; }
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
        resource: { name, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id'
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

// ===== Restore Notes with Auto-Recovery =====
async function restoreNotes() {
    try {
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        let file = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);

        if (!file) {
            notes = [];
            await backupNotes(); // create notes.json on Drive if missing
            return;
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        let data;
        try {
            data = await res.json();
            if (!Array.isArray(data)) throw new Error("Invalid JSON structure");
        } catch (err) {
            console.warn("Drive JSON invalid or corrupted, auto-recovering...", err);
            toast("Notes file was invalid. Recovering from localStorage ✔");
            data = JSON.parse(localStorage.getItem("hexaNotes") || "[]");
            notes = data;
            await backupNotes();
        }

        notes = data;
        saveNotesLocal();
        renderNotes();
    } catch (err) { 
        console.error("Restore failed", err); 
    }
}

// ===== Backup Notes =====
async function backupNotes() {
    try {
        showSyncing();
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        let file = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);

        const cleanNotes = Array.isArray(notes) ? notes : [];
        const payload = new Blob([JSON.stringify(cleanNotes, null, 2)], { type: 'application/json' });

        if (file) {
            await gapi.client.request({
                path: `/upload/drive/v3/files/${file.id}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: payload
            });
        } else {
            const metadata = { name: DRIVE_PRIMARY_FILE, parents: [folderId], mimeType: 'application/json' };
            const formData = new FormData();
            formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            formData.append('file', payload);

            await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: formData
            });
        }

        toast("Notes synced to Drive ✔");
        lastBackupNotes = JSON.stringify(notes); // update last backup snapshot
    } catch (err) {
        console.error("Backup failed", err);
        toast("Sync failed ❌");
    } finally {
        hideSyncing();
    }
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
        div.className = "note-card relative bg-white p-4 rounded-xl shadow hover:shadow-md transition";
        div.style.cursor = "default";

        const colorOption = COLOR_OPTIONS.find(c => c.value === note.color) || COLOR_OPTIONS[0];
        div.style.background = colorOption.gradient;
        div.style.color = colorOption.textColor;

        const linkedContent = note.content?.replace(
            /(https?:\/\/[^\s]+)/g,
            `<a href="$1" target="_blank" style="color:${colorOption.textColor}; text-decoration: underline;">$1</a>`
        ) || "";

        div.innerHTML = `
            <h3 class="text-lg font-bold">${note.title || ""}</h3>
            <p class="mt-2 text-sm break-words">${linkedContent}</p>
            <div class="mt-3 flex flex-wrap gap-1">
                ${note.tags?.map(t => `<span class="tag-chip" style="color:${colorOption.textColor}; border-color:${colorOption.textColor}">${t}</span>`).join('') || ''}
            </div>
            <div class="mt-3 note-files flex flex-col gap-1">
                ${note.files?.map(f => {
                    if (!f.url) return '';
                    if (f.type.startsWith("image/")) return `<img src="${f.url}" class="w-full rounded-lg" />`;
                    if (f.type.startsWith("video/")) return `<video src="${f.url}" controls class="w-full rounded-lg"></video>`;
                    return `<a href="${f.url}" target="_blank" class="underline text-sm">${f.name}</a>`;
                }).join('') || ''}
            </div>
            <button class="edit-btn absolute top-2 right-2 text-white bg-black/30 px-2 py-1 rounded">Edit</button>
        `;

        div.querySelector(".edit-btn").addEventListener("click", e => {
            e.stopPropagation();
            openNoteDialog(note.id);
        });

        notesGrid.appendChild(div);
    });

    renderTagFilter();
}

// ===== Tag Filter =====
function renderTagFilter() {
    const tags = [...new Set(notes.flatMap(n => n.tags || []))];
    tagFilter.innerHTML = '<option value="">All Tags</option>' + tags.map(t => `<option value="${t}">${t}</option>`).join('');
}

// ===== Note Dialog =====
function openNoteDialog(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    noteIdInput.value = note.id;
    noteTitle.value = note.title || "";
    noteContent.value = note.content || "";
    noteTags.value = note.tags?.join(", ") || "";
    noteColor.value = note.color || COLOR_OPTIONS[0].value;

    existingFilesDiv.innerHTML = "";
    note.files?.forEach(f => {
        const el = document.createElement("div");
        el.innerHTML = f.type.startsWith("video/") ?
            `<video src="${f.url}" controls class="w-full rounded-lg mb-1"></video>` :
            `<a href="${f.url}" target="_blank" class="underline text-sm">${f.name}</a>`;
        existingFilesDiv.appendChild(el);
    });

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
    existingFilesDiv.innerHTML = "";
    deleteNoteBtn.style.display = "none";
    noteDialog.showModal();
}

// ===== Handle Notes =====
async function handleNoteSubmit(e) {
    e.preventDefault();
    const title = noteTitle.value.trim();
    if (!title) { toast("Title cannot be empty ❌"); return; }

    const id = noteIdInput.value;
    const tags = noteTags.value.split(",").map(t => t.trim()).filter(t => t);
    const colorValue = noteColor.value || COLOR_OPTIONS[0].value;

    let filesArray = [];

    if (noteFilesInput.files.length > 0) {
        try {
            const ready = await ensureGapiAndToken();
            if (!ready) return;

            const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);

            for (const f of noteFilesInput.files) {
                const metadata = { name: f.name, parents: [folderId] };
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                formData.append('file', f);

                const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}` },
                    body: formData
                });
                const data = await res.json();
                filesArray.push({ name: f.name, type: f.type, url: data.webViewLink });
            }
        } catch (err) {
            console.error("File upload failed", err);
            toast("File upload failed ❌");
        }
    }

    if (id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;
        note.title = title;
        note.content = noteContent.value.trim();
        note.tags = tags;
        note.color = colorValue;
        note.files = [...(note.files || []), ...filesArray];
        toast("Note updated ✔");
    } else {
        notes.push({ id: Date.now().toString(), title, content: noteContent.value.trim(), tags, color: colorValue, files: filesArray });
        toast("Note added ✔");
    }

    saveNotesLocal();
    renderNotes();
    noteDialog.close();
    backupNotes();
}

function handleNoteDelete() {
    if (!confirm("Are you sure you want to delete this note?")) return;
    const id = noteIdInput.value;
    notes = notes.filter(n => n.id !== id);
    saveNotesLocal();
    renderNotes();
    noteDialog.close();
    toast("Note deleted ✔");
    backupNotes();
}

// ===== Auto Backup =====
function setupAutoBackup(interval = 5000) {
    setInterval(() => {
        const currentNotes = JSON.stringify(notes);
        if (currentNotes !== lastBackupNotes) {
            backupNotes();
        }
    }, interval);
}

// ===== DOM Initialization =====
window.onload = async () => {
    notesGrid = document.getElementById("notesGrid");
    noteDialog = document.getElementById("noteDialog");
    noteForm = document.getElementById("noteForm");
    noteIdInput = document.getElementById("noteId");
    noteTitle = document.getElementById("noteTitle");
    noteContent = document.getElementById("noteContent");
    noteTags = document.getElementById("noteTags");
    noteColor = document.getElementById("noteColor");
    noteFilesInput = document.getElementById("noteFiles");
    existingFilesDiv = document.getElementById("existingFiles");
    searchInput = document.getElementById("searchInput");
    tagFilter = document.getElementById("tagFilter");
    deleteNoteBtn = document.getElementById("deleteNoteBtn");
    logoutBtn = document.getElementById("logoutBtn");
    installBtn = document.getElementById("installBtn");
    emptyState = document.getElementById("emptyState");
    closeNoteBtn = document.getElementById("closeNoteBtn");

    fab = document.getElementById("fab");
    fab.addEventListener("click", openNewNoteDialog);

    syncIndicator = document.createElement("div");
    syncIndicator.id = "syncIndicator";
    syncIndicator.textContent = "Syncing...";
    Object.assign(syncIndicator.style, {
        position: "fixed", bottom: "20px", right: "20px",
        background: "rgba(0,0,0,0.7)", color: "white",
        padding: "10px 15px", borderRadius: "8px",
        fontSize: "14px", display: "none"
    });
    document.body.appendChild(syncIndicator);

    document.querySelectorAll(".color-btn").forEach(btn => {
        btn.addEventListener("click", () => { noteColor.value = btn.dataset.color; });
    });

    noteForm.addEventListener("submit", handleNoteSubmit);
    closeNoteBtn.addEventListener("click", () => noteDialog.close());
    deleteNoteBtn.addEventListener("click", handleNoteDelete);
    [noteTitle, noteContent, noteTags, noteColor, noteFilesInput].forEach(i => i.addEventListener("input", backupNotes));
    searchInput.addEventListener("input", renderNotes);
    tagFilter.addEventListener("change", renderNotes);

    logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to logout?")) {
            await backupNotes();
            localStorage.removeItem("accessToken");
            window.location.href = "index.html";
        }
    });

    loadNotesLocal();
    renderNotes();
    await restoreNotes();

    // Start auto backup
    setupAutoBackup(5000);
};