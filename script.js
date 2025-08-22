// ===========================
// Initialize Firebase
// ===========================
const firebaseConfig = {
  apiKey: "AIzaSyCaI-TBhNJHlewgMk9Zi9F3pYErS-CDAx8",
  authDomain: "hexanotes-d49d6.firebaseapp.com",
  projectId: "hexanotes-d49d6",
  storageBucket: "hexanotes-d49d6.firebasestorage.app",
  messagingSenderId: "951796055993",
  appId: "1:951796055993:web:63a3988924a610ce44c068"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ===========================
// Initialize Supabase
// ===========================
const SUPABASE_URL = 'https://kwvyjdhsvwiywjmjafws.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3dnlqZGhzdndpeXdqbWphZndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzQwMTMsImV4cCI6MjA3MTQ1MDAxM30.SXsYUH7pl_QRGr36sUA1V806ZhZn4yc2n0jp0WZunc0';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===========================
// DOM Elements
// ===========================
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const notesContainer = document.getElementById('notes-container');
const addNoteForm = document.getElementById('add-note-form');
const searchInput = document.getElementById('search-input');

let currentUser = null;

// ===========================
// Login / Logout
// ===========================
loginBtn.addEventListener('click', async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    currentUser = result.user;
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
    fetchNotes();
  } catch (error) {
    console.error(error);
  }
});

logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
  currentUser = null;
  loginBtn.hidden = false;
  logoutBtn.hidden = true;
  notesContainer.innerHTML = '';
});

// ===========================
// Auth State Observer
// ===========================
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

// ===========================
// Fetch Notes
// ===========================
async function fetchNotes(searchTerm = '') {
  if (!currentUser) return;

  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', currentUser.uid)
    .order('created_at', { ascending: false });

  if (searchTerm) {
    query = query.ilike('title', `%${searchTerm}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return;
  }

  renderNotes(data);
}

// ===========================
// Render Notes
// ===========================
function renderNotes(notes) {
  notesContainer.innerHTML = '';
  notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <h3>${note.title}</h3>
      <p>${note.content}</p>
      <p class="tags">${note.tags?.join(', ') || ''}</p>
      <button onclick="editNote('${note.id}')">Edit</button>
      <button onclick="deleteNote('${note.id}')">Delete</button>
    `;
    notesContainer.appendChild(card);
  });
}

// ===========================
// Add Note
// ===========================
addNoteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const title = addNoteForm.title.value.trim();
  const content = addNoteForm.content.value.trim();
  const tags = addNoteForm.tags.value
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag !== '');

  const { data, error } = await supabase
    .from('notes')
    .insert([{ title, content, tags, user_id: currentUser.uid }]);

  if (error) console.error(error);
  else fetchNotes();

  addNoteForm.reset();
});

// ===========================
// Edit Note
// ===========================
async function editNote(noteId) {
  const noteTitle = prompt('New title:');
  const noteContent = prompt('New content:');
  const noteTags = prompt('New tags (comma separated):');

  if (!noteTitle || !noteContent) return;

  const tagsArray = noteTags ? noteTags.split(',').map(t => t.trim()) : [];

  const { data, error } = await supabase
    .from('notes')
    .update({ title: noteTitle, content: noteContent, tags: tagsArray })
    .eq('id', noteId)
    .eq('user_id', currentUser.uid);

  if (error) console.error(error);
  else fetchNotes();
}

// ===========================
// Delete Note
// ===========================
async function deleteNote(noteId) {
  const confirmDelete = confirm('Are you sure you want to delete this note?');
  if (!confirmDelete) return;

  const { data, error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', currentUser.uid);

  if (error) console.error(error);
  else fetchNotes();
}

// ===========================
// Search Notes
// ===========================
searchInput.addEventListener('input', (e) => {
  const term = e.target.value.trim();
  fetchNotes(term);
});
