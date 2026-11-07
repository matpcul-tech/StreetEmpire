// Entry gate: the live game loads only src/main.js. The street demo loads
// only when the URL has ?demo=street, and only then are demo assets fetched.
const params = new URLSearchParams(location.search);
if (params.get('demo') === 'street') {
  document.documentElement.classList.add('se-street-demo');
  import('./demo-street.js');
} else {
  import('./main.js');
}
