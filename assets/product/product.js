(() => {
  const button = document.getElementById('product-menu');
  const links = document.getElementById('product-links');
  button?.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
  });
  links?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    button.setAttribute('aria-expanded', 'false'); links.classList.remove('is-open');
  }));
})();
