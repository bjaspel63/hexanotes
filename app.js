// ===== Config =====
const DRIVE_FOLDER = "HexaNotes";
const DRIVE_FILE = "notes.json";
const COLOR_OPTIONS = [
  { name: "Yellow", value: "#fef08a", gradient: "linear-gradient(135deg, #fef08a, #facc15)", text: "#000" },
  { name: "Red", value: "#f87171", gradient: "linear-gradient(135deg, #f87171, #ef4444)", text: "#fff" },
  { name: "Sky", value: "#38bdf8", gradient: "linear-gradient(135deg, #38bdf8, #0ea5e9)", text: "#fff" },
  { name: "Green", value: "#4ade80", gradient: "linear-gradient(135deg, #4ade80, #22c55e)", text: "#000" },
  { name: "Purple", value: "#c084fc", gradient: "linear-gradient(135deg, #c084fc, #9333ea)", text: "#fff" }
];

let notes = [], db, dbName, accessToken;

// ===== DOM Elements =====
let notesGrid, noteDialog, noteForm, noteIdInput, noteTitle, noteContent, noteTags, noteColor, noteFilesInput, existingFilesDiv;
let searchInput, tagFilter, deleteNoteBtn, logoutBtn, emptyState, closeNoteBtn, fab, syncIndicator;

// ===== Helpers =====
const toast = (msg, dur = 2000) => {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, { position:"fixed", bottom:"20px", left:"50%", transform:"translateX(-50%)", background:"#0ea5e9", color:"#fff", padding:"10px 15px", borderRadius:"8px", zIndex:50 });
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), dur);
};

const debounce = (fn, delay=1500)=>{let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a), delay);}};

// ===== IndexedDB =====
async function initDB() {
  const email = localStorage.getItem("userEmail");
  if(!email) return alert("Login required!");
  dbName = `hexaNotes-${email}`;
  return new Promise((res,rej)=>{
    const req = indexedDB.open(dbName,1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("notes",{keyPath:"id"});
    req.onsuccess = e => { db=e.target.result; res(); };
    req.onerror = e => rej(e);
  });
}

const saveNoteToDB = note => new Promise((res,rej)=>{const tx=db.transaction("notes","readwrite"); tx.objectStore("notes").put(note); tx.oncomplete=()=>res(); tx.onerror=e=>rej(e);});
const deleteNoteFromDB = id => new Promise((res,rej)=>{const tx=db.transaction("notes","readwrite"); tx.objectStore("notes").delete(id); tx.oncomplete=()=>res(); tx.onerror=e=>rej(e);});
const loadNotesFromDB = () => new Promise((res,rej)=>{const tx=db.transaction("notes","readonly"); const req=tx.objectStore("notes").getAll(); req.onsuccess=()=>res(req.result); req.onerror=e=>rej(e);});

// ===== Google API =====
async function ensureGapi() {
  await new Promise(r=>gapi.load('client',r));
  await gapi.client.init({ discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
  accessToken = localStorage.getItem("accessToken");
  if(!accessToken) { window.location="index.html"; return false; }
  gapi.client.setToken({ access_token: accessToken });
  return true;
}

// ===== Drive Backup =====
async function getOrCreateFolder(name) {
  const res = await gapi.client.drive.files.list({ q:`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields:"files(id,name)" });
  if(res.result.files?.length) return res.result.files[0].id;
  const folder = await gapi.client.drive.files.create({ resource:{name,mimeType:'application/vnd.google-apps.folder'}, fields:'id' });
  return folder.result.id;
}

async function backupToDrive() {
  try {
    showSyncing();
    if(!await ensureGapi()) return;
    const folderId = await getOrCreateFolder(DRIVE_FOLDER);
    const allNotes = await loadNotesFromDB();
    const blob = new Blob([JSON.stringify(allNotes,null,2)],{type:"application/json"});
    const res = await gapi.client.drive.files.list({ q:`'${folderId}' in parents and name='${DRIVE_FILE}' and trashed=false`, fields:"files(id)" });
    const file = res.result.files?.[0];
    if(file) await gapi.client.request({ path:`/upload/drive/v3/files/${file.id}`, method:"PATCH", params:{uploadType:"media"}, body:blob });
    else {
      const metadata = { name:DRIVE_FILE, parents:[folderId], mimeType:"application/json" };
      const fd = new FormData(); fd.append("metadata", new Blob([JSON.stringify(metadata)],{type:"application/json"})); fd.append("file", blob);
      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",{ method:"POST", headers:{Authorization:`Bearer ${accessToken}`}, body:fd });
    }
    toast("Backup complete ✔");
  } catch(e){console.error(e); toast("Backup failed ❌");}
  finally{hideSyncing();}
}

const autoBackup = debounce(()=>backupToDrive(),2000);
function showSyncing(){ if(syncIndicator) syncIndicator.style.display="block"; }
function hideSyncing(){ if(syncIndicator) syncIndicator.style.display="none"; }

// ===== Render Notes =====
function renderNotes() {
  notesGrid.innerHTML="";
  const search=(searchInput.value||"").toLowerCase();
  const selectedTag=tagFilter.value;
  const filtered = notes.filter(n=>{
    const t=(n.title||"").toLowerCase(), c=(n.content||"").toLowerCase();
    return (t.includes(search)||c.includes(search)) && (!selectedTag || n.tags?.includes(selectedTag));
  });
  emptyState.classList.toggle("hidden", filtered.length!==0);
  filtered.forEach(n=>{
    const div=document.createElement("div");
    const c=COLOR_OPTIONS.find(c=>c.value===n.color)||COLOR_OPTIONS[0];
    div.className="note-card relative p-4 rounded-xl shadow hover:shadow-md transition";
    div.style.background=c.gradient; div.style.color=c.text; div.style.cursor="default";
    const linked = n.content?.replace(/(https?:\/\/[^\s]+)/g, `<a href="$1" target="_blank" style="color:${c.text}; text-decoration:underline;">$1</a>`)||"";
    div.innerHTML=`<h3 class="text-lg font-bold">${n.title||""}</h3><p class="mt-2 text-sm break-words">${linked}</p>
      <div class="mt-3 flex flex-wrap gap-1">${n.tags?.map(t=>`<span class="tag-chip" style="color:${c.text};border-color:${c.text}">${t}</span>`).join('')||''}</div>
      <div class="mt-3 note-files flex flex-col gap-1">${n.files?.map(f=>{
        if(!f.url) return ""; if(f.type.startsWith("image/")) return `<img src="${f.url}" class="w-full rounded-lg">`; 
        if(f.type.startsWith("video/")) return `<video src="${f.url}" controls class="w-full rounded-lg"></video>`; 
        return `<a href="${f.url}" target="_blank" class="underline text-sm">${f.name}</a>`;
      }).join('')||''}</div>
      <button class="edit-btn absolute top-2 right-2 text-white bg-black/30 px-2 py-1 rounded">Edit</button>`;
    div.querySelector(".edit-btn").addEventListener("click",e=>{e.stopPropagation(); openNoteDialog(n.id);});
    notesGrid.appendChild(div);
  });
  renderTagFilter();
}

function renderTagFilter() {
  const tags=[...new Set(notes.flatMap(n=>n.tags||[]))];
  tagFilter.innerHTML='<option value="">All Tags</option>'+tags.map(t=>`<option value="${t}">${t}</option>`).join('');
}

// ===== Dialogs & Submit =====
function openNoteDialog(id){
  const n=notes.find(n=>n.id===id); if(!n) return;
  noteIdInput.value=n.id; noteTitle.value=n.title; noteContent.value=n.content;
  noteTags.value=n.tags?.join(",")||""; noteColor.value=n.color||COLOR_OPTIONS[0].value;
  existingFilesDiv.innerHTML=""; n.files?.forEach(f=>{
    const el=document.createElement("div"); el.innerHTML=f.type.startsWith("video/")?`<video src="${f.url}" controls class="w-full rounded-lg mb-1"></video>`:`<a href="${f.url}" target="_blank" class="underline text-sm">${f.name}</a>`; existingFilesDiv.appendChild(el);
  });
  deleteNoteBtn.style.display="inline-block"; noteDialog.showModal();
}

function openNewNoteDialog(){ noteIdInput.value=""; noteTitle.value=""; noteContent.value=""; noteTags.value=""; noteColor.value=COLOR_OPTIONS[0].value; noteFilesInput.value=""; existingFilesDiv.innerHTML=""; deleteNoteBtn.style.display="none"; noteDialog.showModal(); }

async function handleNoteDelete(){ if(!confirm("Delete?")) return; const id=noteIdInput.value; notes=notes.filter(n=>n.id!==id); await deleteNoteFromDB(id); renderNotes(); noteDialog.close(); autoBackup(); }

async function handleNoteSubmit(e){
  e.preventDefault(); const title=noteTitle.value.trim(); if(!title){toast("Title required ❌");return;}
  const id=noteIdInput.value||Date.now().toString(); const tags=noteTags.value.split(",").map(t=>t.trim()).filter(t=>t); const color=noteColor.value||COLOR_OPTIONS[0].value;
  let note={id,title,content:noteContent.value.trim(),tags,color,files:[]};
  if(noteFilesInput.files.length && await ensureGapi()){ const folderId=await getOrCreateFolder(DRIVE_FOLDER);
    for(const f of noteFilesInput.files){ const fd=new FormData(); fd.append("metadata",new Blob([JSON.stringify({name:f.name,parents:[folderId]})],{type:"application/json"})); fd.append("file",f);
      const res=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},body:fd}); const data=await res.json(); note.files.push({name:f.name,type:f.type,url:data.webViewLink}); } }
  const idx=notes.findIndex(n=>n.id===id); if(idx>-1){notes[idx]={...notes[idx],...note,files:[...(notes[idx].files||[]),...note.files]}; await saveNoteToDB(notes[idx]); toast("Updated ✔");} else {notes.push(note); await saveNoteToDB(note); toast("Added ✔");}
  renderNotes(); noteDialog.close(); autoBackup();
}

// ===== File Input Auto-Upload =====
noteFilesInput?.addEventListener("change",async()=>{
  const files=noteFilesInput.files; if(!files.length) return;
  const id=noteIdInput.value||Date.now().toString();
  let note=notes.find(n=>n.id===id); if(!note){note={id,title:noteTitle.value,content:noteContent.value,tags:noteTags.value.split(",").map(t=>t.trim()).filter(t=>t),color:noteColor.value||COLOR_OPTIONS[0].value,files:[]}; notes.push(note);}
  if(await ensureGapi()){ const folderId=await getOrCreateFolder(DRIVE_FOLDER);
    for(const f of files){ const fd=new FormData(); fd.append("metadata",new Blob([JSON.stringify({name:f.name,parents:[folderId]})],{type:"application/json"})); fd.append("file",f);
      const res=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",{method:'POST',headers:{Authorization:`Bearer ${accessToken}`},body:fd}); const data=await res.json(); note.files.push({name:f.name,type:f.type,url:data.webViewLink}); } }
  await saveNoteToDB(note); renderNotes(); toast("Files uploaded ✔"); autoBackup(); noteFilesInput.value="";
});

// ===== Init =====
window.onload=async()=>{
  notesGrid=document.getElementById("notesGrid"); noteDialog=document.getElementById("noteDialog"); noteForm=document.getElementById("noteForm"); noteIdInput=document.getElementById("noteId");
  noteTitle=document.getElementById("noteTitle"); noteContent=document.getElementById("noteContent"); noteTags=document.getElementById("noteTags"); noteColor=document.getElementById("noteColor"); noteFilesInput=document.getElementById("noteFiles");
  existingFilesDiv=document.getElementById("existingFiles"); searchInput=document.getElementById("searchInput"); tagFilter=document.getElementById("tagFilter"); deleteNoteBtn=document.getElementById("deleteNoteBtn"); logoutBtn=document.getElementById("logoutBtn"); emptyState=document.getElementById("emptyState"); closeNoteBtn=document.getElementById("closeNoteBtn"); fab=document.getElementById("fab");

  syncIndicator=document.createElement("div"); syncIndicator.textContent="Syncing..."; Object.assign(syncIndicator.style,{position:"fixed",bottom:"20px",right:"20px",background:"rgba(0,0,0,0.7)",color:"#fff",padding:"10px 15px",borderRadius:"8px",fontSize:"14px",display:"none"}); document.body.appendChild(syncIndicator);

  fab.addEventListener("click",openNewNoteDialog); noteForm.addEventListener("submit",handleNoteSubmit); closeNoteBtn.addEventListener("click",()=>noteDialog.close()); deleteNoteBtn.addEventListener("click",handleNoteDelete);
  searchInput.addEventListener("input",renderNotes); tagFilter.addEventListener("change",renderNotes);
  logoutBtn.addEventListener("click",()=>{if(confirm("Logout?")){localStorage.removeItem("accessToken");localStorage.removeItem("userEmail");window.location="index.html";}});

  await initDB(); notes=await loadNotesFromDB(); renderNotes();
};