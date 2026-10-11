/* ========== 搜索框交互 ========== */
const searchBar    = document.getElementById('searchBar');
const searchInput  = document.getElementById('searchInput');
const searchClear  = document.getElementById('searchClear');

if (searchBar && searchInput && searchClear) {

  searchBar.addEventListener('click', (e) => {
    if (e.target.closest('.search-clear')) return;
    searchInput.focus();
  });

  searchInput.addEventListener('input', () => {
    searchClear.classList.toggle('visible', searchInput.value.length > 0);
  });

  searchClear.addEventListener('click', (e) => {
    e.stopPropagation();
    searchInput.value = '';
    searchClear.classList.remove('visible');
    searchInput.focus();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchClear.classList.remove('visible');
      searchInput.blur();
    }
    if (e.key === 'Enter' && searchInput.value.trim()) {
      console.log('搜索:', searchInput.value.trim());
    }
  });

  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    if (modifier && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (document.activeElement === searchInput) {
        searchInput.blur();
      } else {
        searchInput.focus();
        searchInput.select();
      }
    }
  });
}