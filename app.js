// ================== GLOBAL VARIABLES ==================
let notes = JSON.parse(localStorage.getItem("notes")) || [];
let selectedColor = "";
let currentUser = null;

// DOM Elements
const notesGrid = document.getElementById("notesGrid");
const emptyState = document.getElementById("emptyState");
const fab = document.getElementById("fab");
const noteDialog = document.getElementById("noteDialog");
const noteForm = document.getElementById("noteForm");
const noteIdInput = document.getElementById("noteId");
const noteTitleInput = document.getElementById("noteTitle");
const noteContentInput = document.getElementById("noteContent");
const noteFilesInput = document.getElementById("noteFiles");
const noteTagsInput = document.getElementById("noteTags");
const noteColorInput = document.getElementById("noteColor");
const noteColorOptions = document.querySelectorAll(".color-btn");
const deleteNoteBtn = document.getElementById("deleteNoteBtn");
const closeNoteBtn = document.getElementById("closeNoteBtn");
const searchInput = document.getElementById("searchInput");
const tagFilter = document.getElementById("tagFilter");
const logoutBtn = document.getElementById("logoutBtn");

// ================== HELPERS ==================
function saveNotes() {
  localStorage.setItem("notes", JSON.stringify(notes));
}

function toast(message) {
  const t = document.createElement("div");
  t.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 bg-sky-600 text-white px-4 py-2 rounded-xl shadow-lg animate-fade";
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ================== RENDER NOTES ==================
function renderNotes() {
  notesGrid.innerHTML = "";
  const search = searchInput.value.toLowerCase();
  const selectedTag = tagFilter.value;

  let filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search) ||
      n.content.toLowerCase().includes(search) ||
      n.tags.some((t) => t.toLowerCase().includes(search))
  );

  if (selectedTag) {
    filtered = filtered.filter((n) => n.tags.includes(selectedTag));
  }

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
  }

  filtered.forEach((note) => {
    const card = document.createElement("div");
    card.className =
      "p-4 rounded-2xl shadow hover:shadow-lg transition relative";
    card.style.background = note.color || "linear-gradient(135deg,#fff,#eee)";

    // Edit button (prevents accidental open)
    const editBtn = document.createElement("button");
    editBtn.innerHTML = "✏️";
    editBtn.className =
      "absolute top-2 right-2 bg-white/80 hover:bg-white text-slate-700 rounded-full px-2 shadow";
    editBtn.addEventListener("click", () => openNoteDialog(note));
    card.appendChild(editBtn);

    // Title
    const title = document.createElement("h2");
    title.className = "font-bold text-lg mb-1";
    title.textContent = note.title;
    card.appendChild(title);

    // Content (render links as <a>)
    const content = document.createElement("p");
    content.className = "text-sm mb-2 whitespace-pre-wrap";
    content.innerHTML = note.content.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" class="text-sky-700 underline">$1</a>'
    );
    card.appendChild(content);

    // Files
    if (note.files && note.files.length > 0) {
      const fileList = document.createElement("div");
      fileList.className = "space-y-2 mt-2";
      note.files.forEach((file) => {
        const fileLink = document.createElement("a");
        fileLink.href = file.driveUrl || "#";
        fileLink.target = "_blank";
        fileLink.className =
          "block p-2 bg-white/60 rounded hover:bg-white shadow";

        if (file.type.startsWith("image/")) {
          const img = document.createElement("img");
          img.src = file.driveUrl;
          img.className = "rounded max-h-40 object-cover";
          fileLink.appendChild(img);
        } else if (file.type.startsWith("video/")) {
          const vid = document.createElement("video");
          vid.src = file.driveUrl;
          vid.controls = true;
          vid.className = "rounded max-h-40";
          fileLink.appendChild(vid);
        } else {
          fileLink.textContent = file.name;
        }
        fileList.appendChild(fileLink);
      });
      card.appendChild(fileList);
    }

    // Tags
    if (note.tags.length > 0) {
      const tagDiv = document.createElement("div");
      tagDiv.className = "mt-2 flex flex-wrap gap-1";
      note.tags.forEach((t) => {
        const span = document.createElement("span");
        span.className =
          "px-2 py-1 bg-sky-100 text-sky-700 rounded-full text-xs";
        span.textContent = t;
        tagDiv.appendChild(span);
      });
      card.appendChild(tagDiv);
    }

    notesGrid.appendChild(card);
  });
  populateTagFilter();
}

function populateTagFilter() {
  const allTags = new Set();
  notes.forEach((n) => n.tags.forEach((t) => allTags.add(t)));
  tagFilter.innerHTML = '<option value="">All Tags</option>';
  allTags.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagFilter.appendChild(opt);
  });
}

// ================== NOTE DIALOG ==================
function openNewNoteDialog() {
  noteForm.reset();
  noteIdInput.value = "";
  noteColorInput.value = "";
  selectedColor = "";
  noteDialog.showModal();
}

function openNoteDialog(note) {
  noteIdInput.value = note.id;
  noteTitleInput.value = note.title;
  noteContentInput.value = note.content;
  noteTagsInput.value = note.tags.join(", ");
  noteColorInput.value = note.color || "";
  selectedColor = note.color || "";
  noteFilesInput.value = ""; // reset (avoid showing prev)
  noteDialog.showModal();
}

// ================== FORM SUBMIT ==================
noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = noteIdInput.value || generateId();
  const title = noteTitleInput.value.trim();
  if (!title) {
    alert("Title cannot be empty");
    return;
  }
  const content = noteContentInput.value.trim();
  const tags = noteTagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t);

  let files = [];
  if (noteFilesInput.files.length > 0) {
    for (const file of noteFilesInput.files) {
      const uploaded = await uploadFileToDrive(file);
      files.push({
        name: file.name,
        type: file.type,
        driveId: uploaded.id,
        driveUrl: `https://drive.google.com/uc?id=${uploaded.id}`,
      });
    }
  }

  let existing = notes.find((n) => n.id === id);
  if (existing) {
    existing.title = title;
    existing.content = content;
    existing.tags = tags;
    existing.color = selectedColor || existing.color;
    if (files.length > 0) {
      existing.files = (existing.files || []).concat(files);
    }
  } else {
    notes.push({
      id,
      title,
      content,
      tags,
      color: selectedColor || "",
      files,
    });
  }

  saveNotes();
  renderNotes();
  noteDialog.close();
  toast("Note saved ✔");

  await autoBackup();
});

// ================== DELETE NOTE ==================
deleteNoteBtn.addEventListener("click", handleNoteDelete);

async function handleNoteDelete() {
  const id = noteIdInput.value;
  if (!id) return;

  if (!confirm("Are you sure you want to delete this note and all attached files?"))
    return;

  const noteToDelete = notes.find((n) => n.id === id);

  notes = notes.filter((n) => n.id !== id);
  saveNotes();
  renderNotes();
  noteDialog.close();
  toast("Note deleted ✔");

  await autoBackup();

  // Cleanup files
  if (noteToDelete?.files?.length) {
    for (const file of noteToDelete.files) {
      if (file.driveId) {
        try {
          await gapi.client.drive.files.delete({
            fileId: file.driveId,
          });
          console.log("Deleted file from Drive:", file.name);
        } catch (err) {
          console.warn("Could not delete file:", file.name, err);
        }
      }
    }
  }
}

// ================== COLOR SELECTION ==================
noteColorOptions.forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedColor = btn.style.background;
    noteColorInput.value = selectedColor;
    noteColorOptions.forEach((b) => b.classList.remove("ring-4", "ring-sky-500"));
    btn.classList.add("ring-4", "ring-sky-500");
  });
});

// ================== EVENTS ==================
fab.addEventListener("click", openNewNoteDialog);
closeNoteBtn.addEventListener("click", () => noteDialog.close());
searchInput.addEventListener("input", renderNotes);
tagFilter.addEventListener("change", renderNotes);

logoutBtn.addEventListener("click", () => {
  if (confirm("Do you really want to logout?")) {
    google.accounts.id.disableAutoSelect();
    localStorage.clear();
    location.reload();
  }
});

// ================== INIT ==================
window.onload = () => {
  renderNotes();
};
