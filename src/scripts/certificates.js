// src/scripts/certificates.js
export function initCertificates(certs) {
  const allCerts = certs || [];
  if (!allCerts || allCerts.length === 0) {
    const detalleNombre = document.getElementById('certDetalleNombre');
    if (detalleNombre) detalleNombre.textContent = 'No hay certificados';
    return;
  }

  // Elementos del detalle
  const detalleImg = document.getElementById('certDetalleImagen');
  const detalleNombre = document.getElementById('certDetalleNombre');
  const detalleAcademia = document.getElementById('certDetalleAcademia');
  const detalleCategoria = document.getElementById('certDetalleCategoria');
  const detalleSubcategoria = document.getElementById('certDetalleSubcategoria');
  const detalleLink = document.getElementById('certDetalleLink');
  const detalleId = document.getElementById('certDetalleId');

  // Elementos del carrusel
  const carouselContainer = document.getElementById('certCarouselVertical');
  const viewport = document.getElementById('certCarouselViewport');
  const upBtn = document.getElementById('carousel-up-vertical');
  const downBtn = document.getElementById('carousel-down-vertical');

  // Filtros
  const searchInput = document.getElementById('cert-search');
  const filterCategoria = document.getElementById('cert-filter-categoria');
  const filterSubcategoria = document.getElementById('cert-filter-subcategoria');
  const filterAcademia = document.getElementById('cert-filter-academia');
  const clearBtn = document.getElementById('cert-clear-filters');

  // Constantes
  const THUMBS_PER_PAGE = 4;
  const THUMB_HEIGHT = 70;
  const GAP = 0.8 * 16;
  const ITEM_HEIGHT = THUMB_HEIGHT + GAP;

  // Estado
  let allFiltered = [];
  let displayedCerts = [];
  let currentIndex = 0;
  let autoScrollTimer = null;
  let isPaused = false;
  let pauseTimeout = null;
  let debounceTimer = null;

  function getRandomSubset(arr, size = 20) {
    if (!arr || arr.length === 0) return [];
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(size, shuffled.length));
  }

  function renderThumbs() {
    if (!carouselContainer) return;
    carouselContainer.innerHTML = '';
    displayedCerts.forEach((cert, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'cert-thumb';
      if (idx === currentIndex) thumb.classList.add('active');
      thumb.dataset.index = idx;
      thumb.innerHTML = `
        <img src="${cert.imagen || '/images/placeholder.webp'}" alt="${cert.nombre}" loading="lazy" />
        <div class="thumb-info">
          <span class="thumb-nombre">${cert.nombre}</span>
          <span class="thumb-meta">${cert.academia || ''}</span>
        </div>
      `;
      thumb.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        selectThumb(index);
      });
      carouselContainer.appendChild(thumb);
    });
    updateCarouselPosition();
  }

  function updateCarouselPosition() {
    const offset = currentIndex * ITEM_HEIGHT;
    carouselContainer.style.transform = `translateY(-${offset}px)`;
  }

  function selectThumb(index) {
    if (index < 0 || index >= displayedCerts.length) return;
    currentIndex = index;
    document.querySelectorAll('.cert-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === currentIndex);
    });
    const cert = displayedCerts[currentIndex];
    if (cert) mostrarDetalle(cert);
    updateCarouselPosition();
    pauseAutoScroll(30000);
  }

  function moveUp() {
    if (displayedCerts.length === 0) return;
    const maxIndex = Math.max(0, displayedCerts.length - THUMBS_PER_PAGE);
    let newIndex = currentIndex - THUMBS_PER_PAGE;
    if (newIndex < 0) newIndex = maxIndex;
    selectThumb(newIndex);
  }

  function moveDown() {
    if (displayedCerts.length === 0) return;
    const maxIndex = Math.max(0, displayedCerts.length - THUMBS_PER_PAGE);
    let newIndex = currentIndex + THUMBS_PER_PAGE;
    if (newIndex > maxIndex) newIndex = 0;
    selectThumb(newIndex);
  }

  function autoScrollStep() {
    if (isPaused) return;
    if (displayedCerts.length === 0) return;
    if (displayedCerts.length <= THUMBS_PER_PAGE) {
      if (currentIndex !== 0) selectThumb(0);
      return;
    }
    const maxIndex = Math.max(0, displayedCerts.length - THUMBS_PER_PAGE);
    let nextIndex = currentIndex + THUMBS_PER_PAGE;
    if (nextIndex > maxIndex) nextIndex = 0;
    selectThumb(nextIndex);
  }

  function resetAutoScroll() {
    if (autoScrollTimer) clearInterval(autoScrollTimer);
    if (!isPaused && displayedCerts.length > 0) {
      autoScrollTimer = setInterval(autoScrollStep, 4000);
    }
  }

  function pauseAutoScroll(duration = 30000) {
    isPaused = true;
    if (pauseTimeout) clearTimeout(pauseTimeout);
    pauseTimeout = setTimeout(() => {
      isPaused = false;
      pauseTimeout = null;
      resetAutoScroll();
    }, duration);
  }

  function mostrarDetalle(cert) {
    if (!cert) {
      detalleNombre.textContent = 'No hay certificado seleccionado';
      detalleImg.src = '';
      detalleAcademia.textContent = '';
      detalleCategoria.textContent = '';
      detalleSubcategoria.textContent = '';
      detalleLink.href = '#';
      detalleLink.textContent = '';
      detalleId.textContent = '';
      return;
    }
    detalleImg.src = cert.imagen || '/images/placeholder.webp';
    detalleImg.alt = cert.nombre || 'Certificado';
    detalleNombre.textContent = cert.nombre || 'Sin nombre';
    detalleAcademia.textContent = `🏛️ ${cert.academia || ''}`;
    detalleCategoria.textContent = `📂 ${cert.categoria || ''}`;
    detalleSubcategoria.textContent = `🏷️ ${cert.subcategoria || ''}`;
    detalleLink.href = cert.link || '#';
    detalleLink.textContent = cert.link ? 'Ver certificado' : 'Sin enlace';
    detalleId.textContent = `ID: ${cert.id || 'No disponible'}`;
  }

  function applyFilters() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const search = searchInput.value.toLowerCase();
      const categoria = filterCategoria.value;
      const subcategoria = filterSubcategoria.value;
      const academia = filterAcademia.value;

      const filteredAll = allCerts.filter(cert => {
        const matchSearch = cert.nombre.toLowerCase().includes(search);
        const matchCategoria = categoria === 'all' || cert.categoria === categoria;
        const matchSubcategoria = subcategoria === 'all' || (cert.subcategoria || '') === subcategoria;
        const matchAcademia = academia === 'all' || cert.academia === academia;
        return matchSearch && matchCategoria && matchSubcategoria && matchAcademia;
      });

      allFiltered = filteredAll;
      displayedCerts = getRandomSubset(filteredAll, 20);
      currentIndex = 0;
      renderThumbs();
      if (displayedCerts.length > 0) {
        mostrarDetalle(displayedCerts[0]);
        document.querySelectorAll('.cert-thumb').forEach((el, i) => {
          el.classList.toggle('active', i === 0);
        });
      } else {
        mostrarDetalle(null);
      }
      pauseAutoScroll(30000);
      resetAutoScroll();
    }, 300);
  }

  function updateSubcategorias() {
    const categoriaSeleccionada = filterCategoria.value;
    const subcategorias = new Set();
    allCerts.forEach(cert => {
      if (categoriaSeleccionada === 'all' || cert.categoria === categoriaSeleccionada) {
        if (cert.subcategoria) subcategorias.add(cert.subcategoria);
      }
    });
    filterSubcategoria.innerHTML = '<option value="all">Todas las subcategorías</option>';
    [...subcategorias].sort().forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      filterSubcategoria.appendChild(opt);
    });
  }

  // Eventos
  searchInput.addEventListener('input', applyFilters);
  filterCategoria.addEventListener('change', () => {
    updateSubcategorias();
    applyFilters();
  });
  filterSubcategoria.addEventListener('change', applyFilters);
  filterAcademia.addEventListener('change', applyFilters);
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    filterCategoria.value = 'all';
    filterAcademia.value = 'all';
    updateSubcategorias();
    filterSubcategoria.value = 'all';
    applyFilters();
  });
  upBtn.addEventListener('click', moveUp);
  downBtn.addEventListener('click', moveDown);

  viewport.addEventListener('mouseenter', () => { isPaused = true; });
  viewport.addEventListener('mouseleave', () => {
    isPaused = false;
    if (pauseTimeout) clearTimeout(pauseTimeout);
    resetAutoScroll();
  });

  // Inicialización
  updateSubcategorias();
  allFiltered = allCerts;
  displayedCerts = getRandomSubset(allCerts, 20);
  currentIndex = 0;
  renderThumbs();
  if (displayedCerts.length > 0) {
    mostrarDetalle(displayedCerts[0]);
    document.querySelectorAll('.cert-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === 0);
    });
  }
  resetAutoScroll();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (autoScrollTimer) clearInterval(autoScrollTimer);
    } else {
      resetAutoScroll();
    }
  });
}