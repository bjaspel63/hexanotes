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
let db = null;
let dbName = null;

let notesGrid, noteDialog, noteForm, noteIdInput, noteTitle, noteContent, noteTags, noteColor, noteFilesInput, existingFilesDiv;
let searchInput, tagFilter, deleteNoteBtn, logoutBtn, installBtn, emptyState, closeNoteBtn;
let fab, syncIndicator;

// ======== Helpers ========
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

// ======== IndexedDB ========
async function initDB() {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) return alert("User not logged in!");

    dbName = `hexaNotes-${userEmail}`;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = event => {
            db = event.target.result;
            db.createObjectStore("notes", { keyPath: "id" });
        };
        request.onsuccess = event => {
            db = event.target.result;
            resolve();
        };
        request.onerror = event => reject(event);
    });
}

async function saveNoteToDB(note) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("notes", "readwrite");
        tx.objectStore("notes").put(note);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e);
    });
}

async function deleteNoteFromDB(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("notes", "readwrite");
        tx.objectStore("notes").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e);
    });
}

async function loadNotesFromDB() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("notes", "readonly");
        const store = tx.objectStore("notes");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = e => reject(e);
    });
}

// ======== GAPI ========
async function ensureGapiAndToken() {
    await new Promise(res => gapi.load('client', res));
    await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
    accessToken = localStorage.getItem("accessToken");
    if (!accessToken) { window.location.href = "index.html"; return false; }
    gapi.client.setToken({ access_token: accessToken });
    return true;
}

// ======== Drive Backup ========
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

async function backupToDrive() {
    try {
        showSyncing();
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        let file = await findFileInFolder(folderId, DRIVE_PRIMARY_FILE);

        const payload = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });

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
        toast("Backup to Drive complete ✔");
    } catch (err) {
        console.error("Drive backup failed", err);
        toast("Backup failed ❌");
    } finally {
        hideSyncing();
    }
}

// Auto-backup debounced
const autoBackup = debounce(() => backupToDrive(), 2000);

// ======== Render Notes ========
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

// ======== Tag Filter ========
function renderTagFilter() {
    const tags = [...new Set(notes.flatMap(n => n.tags || []))];
    tagFilter.innerHTML = '<option value="">All Tags</option>' + tags.map(t => `<option value="${t}">${t}</option>`).join('');
}

// ======== Note Dialogs ========
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

// ======== Handle Notes ========
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
        note.title = title;
        note.content = noteContent.value.trim();
        note.tags = tags;
        note.color = colorValue;
        note.files = [...(note.files || []), ...filesArray];
        await saveNoteToDB(note);
        toast("Note updated ✔");
    } else {
        const newNote = { id: Date.now().toString(), title, content: noteContent.value.trim(), tags, color: colorValue, files: filesArray };
        notes.push(newNote);
        await saveNoteToDB(newNote);
        toast("Note added ✔");
    }

    renderNotes();
    noteDialog.close();
    autoBackup();
}

async function handleNoteSubmit(e) {
    e.preventDefault();
    const title = noteTitle.value.trim();
    if (!title) { toast("Title cannot be empty ❌"); return; }

    const id = noteIdInput.value || Date.now().toString();
    const tags = noteTags.value.split(",").map(t => t.trim()).filter(t => t);
    const colorValue = noteColor.value || COLOR_OPTIONS[0].value;

    // Construct the note object fully first
    let newNote = {
        id,
        title,
        content: noteContent.value.trim(),
        tags,
        color: colorValue,
        files: []
    };

    // Handle file uploads
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

                const res = await fetch(
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
                    {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${accessToken}` },
                        body: formData
                    }
                );
                const data = await res.json();
                newNote.files.push({ name: f.name, type: f.type, url: data.webViewLink });
            }
        } catch (err) {
            console.error("File upload failed", err);
            toast("File upload failed ❌");
        }
    }

    // Check if updating existing note
    const existingIndex = notes.findIndex(n => n.id === id);
    if (existingIndex > -1) {
        notes[existingIndex] = { 
            ...notes[existingIndex], 
            ...newNote, 
            files: [...(notes[existingIndex].files || []), ...newNote.files] 
        };
        await saveNoteToDB(notes[existingIndex]);
        toast("Note updated ✔");
    } else {
        notes.push(newNote);
        await saveNoteToDB(newNote);
        toast("Note added ✔");
    }

    renderNotes();
    noteDialog.close();
    backupToDrive();
}

// ======== File Upload Auto-backup ========
noteFilesInput?.addEventListener("change", async () => {
    const files = noteFilesInput.files;
    if (!files.length) return;

    try {
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const folderId = await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER);
        let noteIdVal = noteIdInput.value || Date.now().toString();

        let note = notes.find(n => n.id === noteIdVal);
        if (!note) {
            note = { id: noteIdVal, title: noteTitle.value, content: noteContent.value, tags: noteTags.value.split(",").map(t => t.trim()).filter(t => t), color: noteColor.value || COLOR_OPTIONS[0].value, files: [] };
            notes.push(note);
        }

        for (const f of files) {
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
            note.files.push({ name: f.name, type: f.type, url: data.webViewLink });
        }

        await saveNoteToDB(note);
        renderNotes();
        toast("Files uploaded ✔");
        autoBackup();

    } catch (err) {
        console.error("File upload failed", err);
        toast("File upload failed ❌");
    } finally {
        noteFilesInput.value = "";
    }
});

// ======== DOM Initialization ========
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
    searchInput.addEventListener("input", renderNotes);
    tagFilter.addEventListener("change", renderNotes);

    logoutBtn.addEventListener("click", async () => {
        if (confirm("Are you sure you want to logout?")) {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("userEmail");
            window.location.href = "index.html";
        }
    });

    // Initialize DB & load notes
    await initDB();
    notes = await loadNotesFromDB();
    renderNotes();
};