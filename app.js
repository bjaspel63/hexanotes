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

// ===== Render Notes =====
function renderNotes() {
  notesGrid.innerHTML = "";
  const search = searchInput.value.toLowerCase();
  const selectedTag = tagFilter.value;
  const filtered = notes.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search);
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
      <h3 class="text-lg font-bold">${note.title}</h3>
      <p class="mt-2 text-sm break-words">${note.content}</p>
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
  noteTitle.value = note.title;
  noteContent.value = note.content;
  noteTags.value = note.tags?.join(", ")||"";
  noteColor.value = note.color||"#fef08a";
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
  if(id){
    const note = notes.find(n=>n.id===id);
    note.title = noteTitle.value;
    note.content = noteContent.value;
    note.tags = tags;
    note.color = noteColor.value;
  } else {
    notes.push({id:Date.now().toString(), title:noteTitle.value, content:noteContent.value, tags, color:noteColor.value});
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

// ===== Google Drive Backup =====
async function getOrCreateFolder(name="HexaNotesBackup"){
  const res = await gapi.client.drive.files.list({
    q:`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)"
  });
  if(res.result.files.length>0) return res.result.files[0].id;
  const folder = await gapi.client.drive.files.create({
    resource:{name, mimeType:'application/vnd.google-apps.folder'},
    fields:'id'
  });
  return folder.result.id;
}

async function backupNotes(){
  if(!accessToken) return alert("Login required");
  gapi.client.setToken({access_token:accessToken});
  const folderId = await getOrCreateFolder();
  const fileName = 'hexa-notes.json';
  const search = await gapi.client.drive.files.list({
    q:`name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)'
  });
  const fileContent = JSON.stringify(notes);
  const blob = new Blob([fileContent], {type:'application/json'});
  if(search.result.files.length > 0){
    const fileId = search.result.files[0].id;
    await gapi.client.request({
      path:`/upload/drive/v3/files/${fileId}`,
      method:'PATCH',
      params:{uploadType:'media'},
      body: blob
    });
  } else {
    const metadata = {name:fileName, parents:[folderId]};
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], {type:'application/json'}));
    formData.append('file', blob);
    await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method:'POST',
      headers:{Authorization:`Bearer ${accessToken}`},
      body:formData
    });
  }
  alert("Backup complete!");
}

async function restoreNotes(){
  if(!accessToken) return alert("Login required");
  gapi.client.setToken({access_token:accessToken});
  const folderId = await getOrCreateFolder();
  const search = await gapi.client.drive.files.list({
    q:`name='hexa-notes.json' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)'
  });
  if(search.result.files.length===0) return alert("No backup found");
  const fileId = search.result.files[0].id;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {headers:{Authorization:`Bearer ${accessToken}`}});
  const data = await res.json();
  notes = data;
  saveNotes();
  renderNotes();
  alert("Restore complete!");
}

backupBtn.addEventListener("click", backupNotes);
restoreBtn.addEventListener("click", restoreNotes);

// ===== Initialize =====
function init(){
  if(!accessToken){ window.location.href="index.html"; return; }
  loadNotes();
  renderNotes();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('service-worker.js'); }
}
window.onload = init;
