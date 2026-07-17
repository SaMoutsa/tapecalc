// =========================================================
// Μηχανή υπολογισμού: tokenizer + recursive-descent parser
// Καμία χρήση eval() — η προτεραιότητα τελεστών (precedence)
// υλοποιείται ρητά μέσω ιεραρχίας: expression > term > factor
// =========================================================

function tokenize(str) {
  const tokens = [];
  const re = /\d+\.?\d*|[+\-*/()%]/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    const t = match[0];
    if (/^\d/.test(t)) {
      tokens.push({ type: 'num', value: parseFloat(t) });
    } else if (t === '(') {
      tokens.push({ type: 'paren', value: '(' });
    } else if (t === ')') {
      tokens.push({ type: 'paren', value: ')' });
    } else if (t === '%') {
      tokens.push({ type: 'percent' });
    } else {
      tokens.push({ type: 'op', value: t });
    }
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek() {
    return this.tokens[this.pos];
  }
  next() {
    return this.tokens[this.pos++];
  }

  // χαμηλότερη προτεραιότητα: + και -
  parseExpression() {
    let left = this.parseTerm();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  // μεσαία προτεραιότητα: * και / (δεσμεύουν πιο σφιχτά από +/-)
  parseTerm() {
    let left = this.parseFactor();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value;
      const right = this.parseFactor();
      if (op === '/') {
        if (right === 0) throw new Error('Διαίρεση με το μηδέν');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  // υψηλότερη προτεραιότητα: αριθμοί, παρενθέσεις, μοναδιαίο πρόσημο, %
  parseFactor() {
    const tok = this.peek();
    if (tok && tok.type === 'op' && (tok.value === '-' || tok.value === '+')) {
      const op = this.next().value;
      const val = this.parseFactor();
      return op === '-' ? -val : val;
    }

    if (!tok) throw new Error('Μη έγκυρη έκφραση');

    let value;
    if (tok.type === 'num') {
      value = this.next().value;
    } else if (tok.type === 'paren' && tok.value === '(') {
      this.next();
      value = this.parseExpression();
      if (!this.peek() || this.peek().value !== ')') throw new Error('Λείπει παρένθεση κλεισίματος');
      this.next();
    } else {
      throw new Error('Μη έγκυρη έκφραση');
    }

    // postfix %: δεσμεύει πάνω στον αριθμό πριν από αυτό (π.χ. 50% -> 0.5)
    while (this.peek() && this.peek().type === 'percent') {
      this.next();
      value = value / 100;
    }
    return value;
  }
}

function evaluateExpression(str) {
  if (!str || !str.trim()) return null;
  const tokens = tokenize(str);
  if (tokens.length === 0) return null;
  const parser = new Parser(tokens);
  const result = parser.parseExpression();
  if (parser.pos !== tokens.length) throw new Error('Μη έγκυρη έκφραση');
  if (!isFinite(result)) throw new Error('Σφάλμα υπολογισμού');
  return result;
}

function formatNumber(num) {
  if (Object.is(num, -0)) num = 0;
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(10)).toString();
}

function formatForDisplay(expr) {
  return expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
}

// =========================================================
// State + UI
// =========================================================
let expression = '';
let history = [];

const lcdMain = document.getElementById('lcd-main');
const lcdExpression = document.getElementById('lcd-expression');
const tape = document.getElementById('tape');
const tapeEmpty = document.getElementById('tape-empty');
const tapeClearBtn = document.getElementById('tape-clear');
const keypad = document.getElementById('keypad');

function render() {
  lcdMain.classList.remove('error');
  lcdMain.textContent = expression ? formatForDisplay(expression) : '0';

  // live preview: μόνο αν η έκφραση είναι ήδη έγκυρη (αλλιώς αφήνουμε κενό, χωρίς error flicker)
  try {
    const preview = evaluateExpression(expression);
    lcdExpression.textContent = preview !== null && expression.trim() !== '' && !/[+\-*/(]$/.test(expression.trim())
      ? '= ' + formatNumber(preview)
      : '\u00A0';
  } catch (e) {
    lcdExpression.textContent = '\u00A0';
  }
}

function renderTape() {
  tape.querySelectorAll('.tape-entry').forEach(el => el.remove());
  if (history.length === 0) {
    tapeEmpty.style.display = 'block';
    return;
  }
  tapeEmpty.style.display = 'none';
  history.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'tape-entry';
    row.innerHTML = `<span class="t-expr">${formatForDisplay(entry.expr)} =</span><span class="t-res">${entry.result}</span>`;
    tape.appendChild(row);
  });
  tape.scrollTop = tape.scrollHeight;
}

function appendChar(char) {
  expression += char;
  render();
}

function appendOperator(op) {
  const lastChar = expression.slice(-1);
  const lastIsOperator = /[+\-*/]/.test(lastChar);

  if (expression === '' && op !== '-') return; // δεν ξεκινάμε με * / + (εκτός από μοναδιαίο μείον)

  if (lastIsOperator) {
    if (op === '-' && lastChar !== '-') {
      expression += op; // επιτρέπει μοναδιαίο μείον μετά από άλλον τελεστή, π.χ. 3×-2
    } else {
      expression = expression.slice(0, -1) + op; // αντικατάσταση διπλού τελεστή
    }
  } else {
    expression += op;
  }
  render();
}

function appendDecimal() {
  // βρες το τρέχον αριθμητικό segment (μετά τον τελευταίο τελεστή/παρένθεση)
  const segments = expression.split(/[+\-*/(]/);
  const currentSegment = segments[segments.length - 1];
  if (currentSegment.includes('.')) return; // ήδη έχει υποδιαστολή
  expression += expression === '' || /[+\-*/(]$/.test(expression) ? '0.' : '.';
  render();
}

function appendPercent() {
  if (!/\d$/.test(expression)) return; // % μόνο μετά από αριθμό
  expression += '%';
  render();
}

function clearAll() {
  expression = '';
  render();
}

function backspace() {
  expression = expression.slice(0, -1);
  render();
}

function equals() {
  try {
    const result = evaluateExpression(expression);
    if (result === null) return;
    const formatted = formatNumber(result);
    history.push({ expr: expression, result: formatted });
    expression = formatted;
    renderTape();
    render();
  } catch (e) {
    lcdMain.classList.add('error');
    lcdMain.textContent = e.message || 'Σφάλμα';
    setTimeout(render, 1100);
  }
}

// =========================================================
// Event listeners
// =========================================================
keypad.addEventListener('click', (e) => {
  const btn = e.target.closest('.key');
  if (!btn) return;

  if (btn.dataset.num !== undefined) appendChar(btn.dataset.num);
  else if (btn.dataset.op) appendOperator(btn.dataset.op);
  else if (btn.dataset.action === 'decimal') appendDecimal();
  else if (btn.dataset.action === 'percent') appendPercent();
  else if (btn.dataset.action === 'clear') clearAll();
  else if (btn.dataset.action === 'backspace') backspace();
  else if (btn.dataset.action === 'equals') equals();
  else if (btn.dataset.action === 'paren-open') appendChar('(');
  else if (btn.dataset.action === 'paren-close') appendChar(')');
});

tapeClearBtn.addEventListener('click', () => {
  history = [];
  renderTape();
});

window.addEventListener('keydown', (e) => {
  if (/^\d$/.test(e.key)) { appendChar(e.key); return; }
  if (['+', '-', '*', '/'].includes(e.key)) { appendOperator(e.key); return; }
  if (e.key === '.') { appendDecimal(); return; }
  if (e.key === '%') { appendPercent(); return; }
  if (e.key === '(' || e.key === ')') { appendChar(e.key); return; }
  if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); return; }
  if (e.key === 'Backspace') { backspace(); return; }
  if (e.key === 'Escape') { clearAll(); return; }
});

render();
renderTape();
