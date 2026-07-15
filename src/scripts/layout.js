// src/scripts/layout.js
function initLanguageSelector() {
  const langBtn = document.getElementById('lang-btn');
  const langDropdown = document.getElementById('lang-dropdown');

  if (langBtn && langDropdown) {
    // Remover eventos antiguos para evitar duplicados
    const newBtn = langBtn.cloneNode(true);
    langBtn.parentNode.replaceChild(newBtn, langBtn);

    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('lang-dropdown');
      if (dropdown) {
        dropdown.classList.toggle('active');
        const expanded = dropdown.classList.contains('active');
        newBtn.setAttribute('aria-expanded', expanded);
      }
    });

    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('lang-dropdown');
      if (dropdown && !newBtn.contains(e.target)) {
        dropdown.classList.remove('active');
        newBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

document.addEventListener('astro:page-load', initLanguageSelector);