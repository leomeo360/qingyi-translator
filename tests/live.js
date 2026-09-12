document.querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById(button.dataset.select));
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}));
