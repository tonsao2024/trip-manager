/** Group money while typing without replacing the focused field. */
export function bindMoneyInputs(root) {
  root.querySelectorAll('.money-input').forEach(inp => {
    if (inp.dataset.moneyBound) return;
    inp.dataset.moneyBound = 'true';
    inp.pattern = '(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]+)?';
    inp.addEventListener('input', () => {
      const before = inp.value.slice(0, inp.selectionStart).replace(/,/g, '').length;
      const raw = inp.value.replace(/,/g, '');
      if (!/^-?\d*(\.\d*)?$/.test(raw)) return;
      const [whole, fraction] = raw.split('.');
      inp.value = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
      let pos = 0, count = 0;
      while (pos < inp.value.length && count < before) {
        if (inp.value[pos] !== ',') count++;
        pos++;
      }
      inp.setSelectionRange(pos, pos);
    });
  });
}
