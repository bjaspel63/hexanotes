// --- Supabase Setup ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let editingNoteId = null;

// --- DOM Elements ---
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const addNoteBtn = document.getElementById('add-note-btn');
const notesContainer = document.getElementById('notes-container');
const searchInput = document.getElementById('search');

const modal = document.getElementById('note-modal');
const modalTitle = document.getElementById('modal-title');
const closeModal = document.querySelector('.close');
const noteTitle = document.getElementById('note-title');
const noteContent = document.getElementById('note-content');
const noteTags = document.getElementById('note-tags');
const saveNoteBtn = document.getElementById('save-note-btn');

// --- Authentication ---
loginBtn.addEventListener('click', async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
});

logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    currentUser = null;
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
    notesContainer.innerHTML = '';
});

supabase.auth.onAuthStateChange((event, session) => {
    if(session?.user){
        currentUser = session.user;
        loginBtn.hidden = true;
        logoutBtn.hidden = false;
        fetchNotes();
    }
});

// --- Modal ---
addNoteBtn.addEventListener('click', () => {
    modal.style.display = 'block';
    modalTitle.textContent = 'Add Note';
    noteTitle.value = '';
    noteContent.value = '';
    noteTags.value = '';
    editingNoteId = null;
});

closeModal.addEventListener('click', () => modal.style.display = 'none');
window.onclick = (e) => { if(e.target === modal) modal.style.display = 'none'; }

// --- Save Note ---
saveNoteBtn.addEventListener('click', async () => {
    const title = noteTitle.value.trim();
    const content = noteContent.value.trim();
    const tags = noteTags.value.split(',').map(t => t.trim()).filter(Boolean);

    if(!title || !content) return alert('Title and content are required');

    if(editingNoteId){
        await supabase.from('notes').update({title, content, tags}).eq('id', editingNoteId);
    } else {
        await supabase.from('notes').insert({title, content, tags, user_id: currentUser.id});
    }
    modal.style.display = 'none';
    fetchNotes();
});

// --- Fetch Notes ---
async function fetchNotes(){
    if(!currentUser) return;
    let { data, error } = await supabase.from('notes').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false});
    if(error) console.error(error);
    else renderNotes(data);
}

// --- Render Notes ---
function renderNotes(notes){
    const searchTerm = searchInput.value.toLowerCase();
    notesContainer.innerHTML = '';
    notes.filter(note => 
        note.title.toLowerCase().includes(searchTerm) ||
        note.content.toLowerCase().includes(searchTerm) ||
        (note.tags && note.tags.join(',').toLowerCase().includes(searchTerm))
    ).forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `
            <h3>${note.title}</h3>
            <p>${note.content}</p>
            <div class="tags">${note.tags ? note.tags.join(', ') : ''}</div>
            <div class="actions">
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </div>
        `;
        card.querySelector('.edit-btn').addEventListener('click', () => {
            editingNoteId = note.id;
            modal.style.display = 'block';
            modalTitle.textContent = 'Edit Note';
            noteTitle.value = note.title;
            noteContent.value = note.content;
            noteTags.value = note.tags ? note.tags.join(', ') : '';
        });
        card.querySelector('.delete-btn').addEventListener('click', async () => {
            if(confirm('Are you sure?')){
                await supabase.from('notes').delete().eq('id', note.id);
                fetchNotes();
            }
        });
        notesContainer.appendChild(card);
    });
}

// --- Search ---
searchInput.addEventListener('input', fetchNotes);
