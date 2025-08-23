// ======== Config ========
const DRIVE_PRIMARY_FOLDER = "HexaNotes";
const DRIVE_PRIMARY_FILE = "notes.json";
const DRIVE_LEGACY_FOLDER = "HexaNotesBackup";
const DRIVE_LEGACY_FILE = "hexa-notes.json";

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
function isGapiReady() { return window.gapi && gapi.client && typeof gapi.client.request === "function"; }

// ===== Local Storage =====
function saveNotes() { localStorage.setItem("hexaNotes", JSON.stringify(notes)); }
function loadNotes() { notes = JSON.parse(localStorage.getItem("hexaNotes") || "[]"); }

// ===== Initialize GAPI + Token =====
async function ensureGapiAndToken() {
    await new Promise(res => gapi.load('client', res));
    await gapi.client.init({
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
    });
    accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
        toast("Login required.");
        window.location.href = "index.html";
        return false;
    }
    gapi.client.setToken({ access_token: accessToken });
    return true;
}

// ===== Drive Helpers =====
async function getOrCreateFolderByName(name) {
    const res = await gapi.client.drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id,name)",
        spaces: "drive"
    });
    if (res.result.files?.length) return res.result.files[0].id;
    const folder = await gapi.client.drive.files.create({
        resource: { name, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
    });
    return folder.result.id;
}
async function getOrCreatePrimaryFolder() { return await getOrCreateFolderByName(DRIVE_PRIMARY_FOLDER); }
async function findFileInFolder(folderId, fileName) {
    const res = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
        fields: "files(id,name,webViewLink)"
    });
    return res.result.files?.[0] || null;
}

// ===== Debounce =====
function debounce(fn, delay = 2000) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ===== Auto Backup =====
const autoBackup = debounce(async () => {
    if (!accessToken || !notes.length) return;
    try {
        showSyncing();
        const ready = await ensureGapiAndToken();
        if (!ready) { hideSyncing(); return; }

        const folderId = await getOrCreatePrimaryFolder();
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

            await fetch(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
                { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
            );
        }

    } catch (err) { console.warn("Auto-backup failed:", err); }
    finally { hideSyncing(); }
}, 2000);

// ===== Restore Notes =====
async function restoreNotes() {
    try {
        const ready = await ensureGapiAndToken();
        if (!ready) return;

        const primaryFolderId = await getOrCreatePrimaryFolder();
        let file = await findFileInFolder(primaryFolderId, DRIVE_PRIMARY_FILE);

        if (!file) {
            const legacySearch = await gapi.client.drive.files.list({
                q: `name='${DRIVE_LEGACY_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: "files(id,name)"
            });
            const legacyFolderId = legacySearch.result.files?.[0]?.id || null;
            if (legacyFolderId) file = await findFileInFolder(legacyFolderId, DRIVE_LEGACY_FILE);
        }

        if (!file) return;

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (!Array.isArray(data)) return;
        notes = data;
        saveNotes();
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
        const matchesTag = !selectedTag || (n.tags && n.tags.includes(selectedTag));
        return matchesSearch && matchesTag;
    });

    emptyState.classList.toggle("hidden", filtered.length !== 0);

    filtered.forEach(note => {
        const div = document.createElement("div");
        div.className = "note-card";
        div.draggable = true;

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
            <div class="mt-3 note-files">
                ${note.files?.map(f => {
                    if(f.type.startsWith("image/")) return `<img src="${f.url}" class="w-full rounded-lg mb-2">`;
                    if(f.type === "application/pdf") return `<a href="${f.url}" target="_blank" style="color:${colorOption.textColor}; text-decoration: underline;">${f.name}</a>`;
                    if(f.type.startsWith("video/")) return `<video src="${f.url}" controls class="w-full rounded-lg mb-2"></video>`;
                    return `<a href="${f.url}" target="_blank" style="color:${colorOption.textColor}; text-decoration: underline;">${f.name}</a>`;
                }).join('') || ''}
            </div>
        `;
        div.addEventListener("click", () => openNote(note.id));
        notesGrid.appendChild(div);
    });

    renderTagFilter();
}

// ===== Tag Filter Rendering =====
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
    noteColor.value = note.color || COLOR_OPTIONS[0].value;
    noteFilesInput.value = "";
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

// ===== Initialize DOM-dependent elements =====
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
    searchInput = document.getElementById("searchInput");
    tagFilter = document.getElementById("tagFilter");
    deleteNoteBtn = document.getElementById("deleteNoteBtn");
    logoutBtn = document.getElementById("logoutBtn");
    installBtn = document.getElementById("installBtn");
    emptyState = document.getElementById("emptyState");
    closeNoteBtn = document.getElementById("closeNoteBtn");

    fab = document.createElement("button");
    fab.innerHTML = "+";
    fab.className = "fixed bottom-6 right-6 w-16 h-16 rounded-full bg-sky-600 text-white text-3xl shadow-lg flex items-center justify-center hover:bg-sky-700 transition";
    document.body.appendChild(fab);
    fab.addEventListener("click", openNewNoteDialog);

    syncIndicator = document.createElement("div");
    syncIndicator.id = "syncIndicator";
    syncIndicator.textContent = "Syncing...";
    Object.assign(syncIndicator.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        background: "rgba(0,0,0,0.7)",
        color: "white",
        padding: "10px 15px",
        borderRadius: "8px",
        fontSize: "14px",
        display: "none"
    });
    document.body.appendChild(syncIndicator);

    // Correct color selection
    document.querySelectorAll(".color-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            noteColor.value = btn.dataset.color;
        });
    });

    noteForm.addEventListener("submit", handleNoteSubmit);
    closeNoteBtn?.addEventListener("click", () => noteDialog.close());
    deleteNoteBtn.addEventListener("click", handleNoteDelete);
    [noteTitle, noteContent, noteTags, noteColor, noteFilesInput].forEach(input => input.addEventListener("input", autoBackup));
    searchInput.addEventListener("input", renderNotes);
    tagFilter.addEventListener("change", renderNotes);

    logoutBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to logout?")) {
            localStorage.removeItem("accessToken");
            window.location.href = "index.html";
        }
    });

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.classList.remove("hidden");
    });
    installBtn.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        installBtn.classList.add("hidden");
        deferredPrompt = null;
    });

    loadNotes();
    renderNotes();

    if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('service-worker.js'); }
        catch (e) { console.warn("SW registration failed", e); }
    }

    await restoreNotes();
};

// ===== Handle Note Form =====
async function handleNoteSubmit(e) {
    e.preventDefault();
    const title = noteTitle.value.trim();
    if (!title) { toast("Title cannot be empty ❌"); return; }

    const id = noteIdInput.value;
    const tags = noteTags.value.split(",").map(t => t.trim()).filter(t => t);
    const colorValue = noteColor.value || COLOR_OPTIONS[0].value;
    const filesArray = Array.from(noteFilesInput.files).map(f => ({
        name: f.name,
        type: f.type,
        url: URL.createObjectURL(f)
    }));

    if (id) {
        const note = notes.find(n => n.id === id);
        if (!note) return;
        note.title = title;
        note.content = noteContent.value.trim();
        note.tags = tags;
        note.color = colorValue;
        note.files = filesArray;
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

    saveNotes();
    renderNotes();
    noteDialog.close();
    autoBackup();
}

// ===== Handle Note Delete =====
function handleNoteDelete() {
    const id = noteIdInput.value;
    notes = notes.filter(n => n.id !== id);
    saveNotes();
    renderNotes();
    noteDialog.close();
    toast("Note deleted ✔");
    autoBackup();
}
