// Config central del frontend.
// La API vive en otro origen/puerto (backend Express).
// Para cambiarla sin tocar codigo: localStorage.setItem('API_BASE', 'http://...')
const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3000/api';
