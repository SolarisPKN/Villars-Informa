let observer;
function initScrollReveal() {
  observer?.disconnect();
  const reveals = document.querySelectorAll('[data-reveal]');
  if (!reveals.length || matchMedia('(prefers-reduced-motion: reduce)').matches) { reveals.forEach((element) => element.classList.add('visible')); return; }
  observer = new IntersectionObserver((entries) => { for (const entry of entries) { if (!entry.isIntersecting) continue; entry.target.classList.add('visible'); observer?.unobserve(entry.target); } }, { threshold: .15, rootMargin: '0px 0px -40px' });
  reveals.forEach((element) => observer.observe(element));
}
document.addEventListener('astro:page-load', initScrollReveal);
document.addEventListener('astro:before-swap', () => observer?.disconnect());
