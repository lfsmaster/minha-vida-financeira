(function () {
  'use strict';

  const KEY = 'mvf_complete_v2';
  const FRAME_ID = 'appFrame';
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  let lastDataSignature = '';
  let frameObserver = null;
  let updateTimer = null;

  const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

  function readData() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
      return {
        ...stored,
        accounts: Array.isArray(stored.accounts) ? stored.accounts : [],
        transactions: Array.isArray(stored.transactions) ? stored.transactions : []
      };
    } catch (error) {
      console.error('Erro ao ler a base financeira.', error);
      return { accounts: [], transactions: [] };
    }
  }

  function isSettled(transaction) {
    const status = normalize(transaction.status);
    if (!status) return true;
    return ['paid', 'pago', 'paga', 'received', 'recebido', 'recebida', 'realized', 'realizado', 'realizada', 'completed', 'concluido', 'concluida'].includes(status);
  }

  function typeOf(transaction) {
    return normalize(transaction.type || transaction.kind || transaction.transactionType);
  }

  function amountOf(transaction) {
    return Math.abs(numeric(transaction.amount ?? transaction.value ?? transaction.total));
  }

  function mainAccountId(transaction) {
    return String(transaction.accountId ?? transaction.account ?? '');
  }

  function sourceAccountId(transaction) {
    return String(transaction.fromAccountId ?? transaction.sourceAccountId ?? transaction.accountFromId ?? transaction.originAccountId ?? transaction.accountId ?? '');
  }

  function targetAccountId(transaction) {
    return String(transaction.toAccountId ?? transaction.destinationAccountId ?? transaction.accountToId ?? transaction.targetAccountId ?? '');
  }

  function openingBalance(account) {
    return numeric(account.initial ?? account.initialBalance ?? account.openingBalance ?? account.balanceInitial ?? 0);
  }

  function movementForAccount(transaction, accountId) {
    if (!isSettled(transaction)) return 0;
    const type = typeOf(transaction);
    const amount = amountOf(transaction);
    const target = String(accountId);
    if (!amount || !target) return 0;

    if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) {
      return mainAccountId(transaction) === target ? amount : 0;
    }
    if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
      return mainAccountId(transaction) === target ? -amount : 0;
    }
    if (['transfer', 'transferencia'].includes(type)) {
      const source = sourceAccountId(transaction);
      const destination = targetAccountId(transaction);
      let movement = 0;
      if (source === target) movement -= amount;
      if (destination === target) movement += amount;
      if (!destination && mainAccountId(transaction) === target) {
        const direction = normalize(transaction.direction || transaction.flow);
        if (['in', 'entrada', 'credit', 'credito'].includes(direction)) movement += amount;
        if (['out', 'saida', 'debit', 'debito'].includes(direction)) movement -= amount;
      }
      return movement;
    }

    const legacySignedValue = numeric(transaction.amount ?? transaction.value);
    return mainAccountId(transaction) === target ? legacySignedValue : 0;
  }

  function calculateAccountBalance(account, transactions) {
    return transactions.reduce((balance, transaction) => balance + movementForAccount(transaction, account.id), openingBalance(account));
  }

  function calculate(data) {
    const balances = new Map();
    data.accounts.forEach(account => balances.set(String(account.id), calculateAccountBalance(account, data.transactions)));
    return {
      balances,
      totalBalance: Array.from(balances.values()).reduce((total, value) => total + value, 0)
    };
  }

  function selectedMonth(documentRef) {
    const field = documentRef.getElementById('monthFilter');
    return field && /^\d{4}-\d{2}$/.test(field.value) ? field.value : new Date().toISOString().slice(0, 7);
  }

  function calculateMonth(data, month) {
    const totals = { income: 0, expense: 0, pendingIncome: 0, pendingExpense: 0 };
    data.transactions.forEach(transaction => {
      if (!String(transaction.date || '').startsWith(month)) return;
      const type = typeOf(transaction);
      const amount = amountOf(transaction);
      const settled = isSettled(transaction);
      if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) totals[settled ? 'income' : 'pendingIncome'] += amount;
      if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) totals[settled ? 'expense' : 'pendingExpense'] += amount;
    });
    return totals;
  }

  function importedStatementInfo(data) {
    const imported = data.transactions.filter(transaction => transaction.importBatchId || transaction.importId || /importado de extrato/i.test(String(transaction.note || '')));
    const validDates = imported.map(transaction => String(transaction.date || '')).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    return {
      count: imported.length,
      lastDate: validDates.length ? validDates[validDates.length - 1] : ''
    };
  }

  function setMoney(documentRef, id, value) {
    const element = documentRef.getElementById(id);
    if (!element) return;
    const formatted = money.format(value);
    if (element.textContent !== formatted) element.textContent = formatted;
  }

  function injectStyles(documentRef) {
    if (documentRef.getElementById('prominentBalanceStyles')) return;
    const style = documentRef.createElement('style');
    style.id = 'prominentBalanceStyles';
    style.textContent = `
      .balanceHero{position:relative;overflow:hidden;border-radius:22px;padding:24px;margin-bottom:16px;background:linear-gradient(135deg,#0b683f,#16875f);color:#fff;box-shadow:0 18px 42px rgba(14,105,67,.22)}
      .balanceHero.negative{background:linear-gradient(135deg,#8f1d2c,#d64553);box-shadow:0 18px 42px rgba(214,69,83,.22)}
      .balanceHeroTop{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
      .balanceHeroLabel{font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)}
      .balanceHeroValue{font-size:clamp(38px,6vw,64px);font-weight:950;line-height:1.05;margin:7px 0 8px;letter-spacing:-.04em}
      .balanceHeroHelp{font-size:13px;color:rgba(255,255,255,.82);max-width:650px;line-height:1.45}
      .balanceHeroProjected{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:13px 16px;min-width:210px}
      .balanceHeroProjected small{display:block;color:rgba(255,255,255,.78);margin-bottom:5px}.balanceHeroProjected strong{font-size:22px}
      .balanceAccounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px;margin-top:18px}
      .balanceAccount{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px}
      .balanceAccount span{display:block;font-size:11px;color:rgba(255,255,255,.75);margin-bottom:4px}.balanceAccount strong{font-size:18px}
      .accountBalanceSummary{border-radius:19px;padding:18px;margin-top:12px;margin-bottom:14px;background:linear-gradient(135deg,#10213d,#1b3155);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .accountBalanceSummary small{display:block;color:#b9c7da;margin-bottom:5px}.accountBalanceSummary strong{font-size:32px}
      [data-calculated-account-balance]{border:0!important;background:var(--panel2,#f5f8fc);border-radius:14px;padding:13px!important;margin-top:14px!important}
      [data-calculated-account-balance] small{font-size:11px!important;text-transform:uppercase;letter-spacing:.05em;font-weight:900}
      [data-calculated-account-balance] strong{display:block;font-size:27px!important;margin-top:4px}
      @media(max-width:650px){.balanceHero{padding:19px}.balanceHeroProjected{width:100%}.balanceHeroValue{font-size:40px}.accountBalanceSummary strong{font-size:27px}}
    `;
    documentRef.head.appendChild(style);
  }

  function renderHero(documentRef, data, calculation, month) {
    injectStyles(documentRef);
    const dashboard = documentRef.getElementById('page-dashboard');
    if (!dashboard) return;
    let hero = documentRef.getElementById('prominentBalanceHero');
    if (!hero) {
      hero = documentRef.createElement('section');
      hero.id = 'prominentBalanceHero';
      const metrics = dashboard.querySelector('.metrics');
      metrics ? dashboard.insertBefore(hero, metrics) : dashboard.prepend(hero);
    }

    const projected = calculation.totalBalance + month.pendingIncome - month.pendingExpense;
    const statement = importedStatementInfo(data);
    const sourceText = statement.count
      ? `${statement.count} lançamento(s) de extrato considerados${statement.lastDate ? ` · último lançamento em ${statement.lastDate.split('-').reverse().join('/')}` : ''}.`
      : 'Nenhum extrato importado ainda. O valor considera saldo inicial e lançamentos realizados.';
    const accountsHtml = data.accounts.length
      ? data.accounts.map(account => `<div class="balanceAccount"><span>${escapeHtml(account.name || 'Conta')}</span><strong>${money.format(calculation.balances.get(String(account.id)) || 0)}</strong></div>`).join('')
      : '<div class="balanceAccount"><span>Contas</span><strong>Nenhuma cadastrada</strong></div>';

    hero.className = `balanceHero${calculation.totalBalance < 0 ? ' negative' : ''}`;
    hero.innerHTML = `
      <div class="balanceHeroTop">
        <div>
          <div class="balanceHeroLabel">Saldo disponível agora</div>
          <div class="balanceHeroValue">${money.format(calculation.totalBalance)}</div>
          <div class="balanceHeroHelp">Valor real calculado por conta: saldo inicial + entradas realizadas − saídas realizadas. ${sourceText}</div>
        </div>
        <div class="balanceHeroProjected"><small>Saldo projetado</small><strong>${money.format(projected)}</strong><small style="margin-top:5px">Inclui valores pendentes a receber e a pagar.</small></div>
      </div>
      <div class="balanceAccounts">${accountsHtml}</div>
    `;

    const originalBalance = documentRef.getElementById('balance');
    if (originalBalance) {
      const card = originalBalance.closest('.card');
      const label = card && card.querySelector('.muted');
      if (label) label.textContent = 'Saldo disponível agora';
      originalBalance.style.fontSize = '30px';
      originalBalance.style.color = calculation.totalBalance < 0 ? 'var(--red,#d64553)' : 'var(--green,#16875f)';
    }
  }

  function findAccountCard(documentRef, account) {
    const container = documentRef.getElementById('accountCards');
    if (!container) return null;
    const accountName = normalize(account.name);
    return Array.from(container.querySelectorAll('.card')).find(card => normalize(card.textContent).includes(accountName)) || null;
  }

  function updateAccountCards(documentRef, data, balances, totalBalance) {
    const container = documentRef.getElementById('accountCards');
    if (container) {
      let summary = documentRef.getElementById('accountBalanceSummary');
      if (!summary) {
        summary = documentRef.createElement('div');
        summary.id = 'accountBalanceSummary';
        summary.className = 'accountBalanceSummary';
        container.parentNode.insertBefore(summary, container);
      }
      summary.innerHTML = `<div><small>Total disponível em todas as contas</small><strong>${money.format(totalBalance)}</strong></div><div>${data.accounts.length} conta(s) calculada(s)</div>`;
    }

    data.accounts.forEach(account => {
      const card = findAccountCard(documentRef, account);
      if (!card) return;
      const balance = balances.get(String(account.id)) || 0;
      let block = card.querySelector('[data-calculated-account-balance]');
      if (!block) {
        block = documentRef.createElement('div');
        block.setAttribute('data-calculated-account-balance', String(account.id));
        block.innerHTML = '<small>Saldo disponível nesta conta</small><strong></strong>';
        card.appendChild(block);
      }
      const value = block.querySelector('strong');
      if (value) {
        value.textContent = money.format(balance);
        value.style.color = balance < 0 ? 'var(--red,#d64553)' : 'var(--green,#16875f)';
      }
    });
  }

  function applyCalculation() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame || !frame.contentDocument) return;
    const documentRef = frame.contentDocument;
    const data = readData();
    const result = calculate(data);
    const month = calculateMonth(data, selectedMonth(documentRef));

    setMoney(documentRef, 'balance', result.totalBalance);
    setMoney(documentRef, 'income', month.income);
    setMoney(documentRef, 'expense', month.expense);
    setMoney(documentRef, 'projected', result.totalBalance + month.pendingIncome - month.pendingExpense);
    renderHero(documentRef, data, result, month);
    updateAccountCards(documentRef, data, result.balances, result.totalBalance);

    const status = document.getElementById('balanceStatus');
    if (status) {
      status.textContent = 'Saldo disponível atualizado';
      status.dataset.state = 'ok';
    }

    lastDataSignature = JSON.stringify({ accounts: data.accounts, transactions: data.transactions });
  }

  function scheduleCalculation() {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(applyCalculation, 80);
  }

  function attachToFrame() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    frame.addEventListener('load', () => {
      if (frameObserver) frameObserver.disconnect();
      try {
        frameObserver = new MutationObserver(scheduleCalculation);
        frameObserver.observe(frame.contentDocument.documentElement, { childList: true, subtree: true, characterData: true });
        frame.contentDocument.addEventListener('click', scheduleCalculation, true);
        frame.contentDocument.addEventListener('submit', scheduleCalculation, true);
        frame.contentDocument.addEventListener('change', scheduleCalculation, true);
      } catch (error) {
        console.warn('Não foi possível acompanhar a tela do sistema.', error);
      }
      scheduleCalculation();
      setTimeout(applyCalculation, 300);
    });
  }

  window.addEventListener('storage', event => {
    if (event.key === KEY) scheduleCalculation();
  });

  setInterval(() => {
    const data = readData();
    const signature = JSON.stringify({ accounts: data.accounts, transactions: data.transactions });
    if (signature !== lastDataSignature) scheduleCalculation();
  }, 700);

  window.MVFBalance = { readData, calculate, calculateAccountBalance, update: applyCalculation };
  attachToFrame();
  scheduleCalculation();
})();