// ---------------------------
// Firebase Setup
// ---------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCaI-TBhNJHlewgMk9Zi9F3pYErS-CDAx8",
  authDomain: "hexanotes-d49d6.firebaseapp.com",
  projectId: "hexanotes-d49d6",
  storageBucket: "hexanotes-d49d6.firebasestorage.app",
  messagingSenderId: "951796055993",
  appId: "1:951796055993:web:b39c05f47a43c24844c068"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ---------------------------
// Supabase Setup
// ---------------------------
const SUPABASE_URL = 'https://kwvyjdhsvwiywjmjafws.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3dnlqZGhzdndpeXdqbWphZndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzQwMTMsImV4cCI6MjA3MTQ1MDAxM30.SXsYUH7pl_QRGr36sUA1V806ZhZn4yc2n0jp0WZunc0';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------
// DOM Elements
// ---------------------------
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const notesContainer = document.getElementById('notes-container');
const searchInput = document.getElementById('search-input');
const addNoteBtn = document.getElementById('add-note-btn');

const modal = document.getElementById('note-modal');
const closeModal = document.querySelector('.close');
const saveNoteBtn = document.getElementById('save-note-btn');
const titleInput = document.getElementById('note-title');
const contentInput = document.getElementById('note-content');
const tagsInput = document.getElementById('note-tags');

let currentUser = null;

// ---------------------------
// Firebase Auth
// ---------------------------
loginBtn.addEventListener('click', async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    currentUser = result.user;
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
    fetchNotes();
  } catch (err) {
    alert(err.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
  currentUser = null;
  loginBtn.hidden = false;
  logoutBtn.hidden = true;
  notesContainer.innerHTML = '';
});

auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
    fetchNotes();
  } else {
    currentUser = null;
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
    notesContainer.innerHTML = '';
  }
});

// ---------------------------
// Modal Open/Close
// ---------------------------
addNoteBtn.addEventListener('click', () => modal.style.display = 'block');
closeModal.addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', e => {
  if (e.target === modal) modal.style.display = 'none';
});

// ---------------------------
// Save Note
// ---------------------------
saveNoteBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
  if (!title || !content || !currentUser) return;

  const { error } = await supabase.from('notes')
    .insert([{ title, content, tags, user_id: currentUser.uid }]);

  if (error) alert(error.message);
  else {
    fetchNotes();
    modal.style.display = 'none';
    titleInput.value = '';
    contentInput.value = '';
    tagsInput.value = '';
  }
});

// ---------------------------
// Fetch & Render Notes
// ---------------------------
async function fetchNotes(term = '') {
  if (!currentUser) return;

  let query = supabase.from('notes').select('*')
    .eq('user_id', currentUser.uid)
    .order('created_at', { ascending: false });

  if (term) query = query.ilike('title', `%${term}%`);

  const { data, error } = await query;
  if (error) console.error(error);
  else renderNotes(data);
}

function renderNotes(notes) {
  notesContainer.innerHTML = '';
  notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <h3>${note.title}</h3>
      <p>${note.content}</p>
      <p class="tags">${note.tags?.join(',') || ''}</p>
      <div class="actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;
    card.querySelector('.edit-btn').addEventListener('click', () => editNote(note));
    card.querySelector('.delete-btn').addEventListener('click', () => deleteNote(note.id));
    notesContainer.appendChild(card);
  });
}

// ---------------------------
// Edit Note
// ---------------------------
async function editNote(note) {
  const newTitle = prompt('New title:', note.title);
  const newContent = prompt('New content:', note.content);
  const newTags = prompt('New tags (comma separated):', note.tags?.join(',') || '');
  if (!newTitle || !newContent) return;

  const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);

  const { error } = await supabase.from('notes')
    .update({ title: newTitle, content: newContent, tags: tagsArray })
    .eq('id', note.id)
    .eq('user_id', currentUser.uid);

  if (error) alert(error.message);
  else fetchNotes();
}

// ---------------------------
// Delete Note
// ---------------------------
async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  const { error } = await supabase.from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.uid);
  if (error) alert(error.message);
  else fetchNotes();
}

// ---------------------------
// Search
// ---------------------------
searchInput.addEventListener('input', e => fetchNotes(e.target.value.trim()));
