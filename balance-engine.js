(function () {
  'use strict';

  const KEY = 'mvf_complete_v2';
  const FRAME_ID = 'appFrame';
  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let lastDataSignature = '';
  let frameObserver = null;
  let updateTimer = null;

  const normalize = value => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const numeric = value => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  };

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

    return [
      'paid', 'pago', 'paga',
      'received', 'recebido', 'recebida',
      'realized', 'realizado', 'realizada',
      'completed', 'concluido', 'concluida'
    ].includes(status);
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
    return String(
      transaction.fromAccountId ??
      transaction.sourceAccountId ??
      transaction.accountFromId ??
      transaction.originAccountId ??
      transaction.accountId ??
      ''
    );
  }

  function targetAccountId(transaction) {
    return String(
      transaction.toAccountId ??
      transaction.destinationAccountId ??
      transaction.accountToId ??
      transaction.targetAccountId ??
      ''
    );
  }

  function openingBalance(account) {
    return numeric(
      account.initial ??
      account.initialBalance ??
      account.openingBalance ??
      account.balanceInitial ??
      0
    );
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
    if (mainAccountId(transaction) === target && legacySignedValue !== 0) {
      return legacySignedValue;
    }

    return 0;
  }

  function calculateAccountBalance(account, transactions) {
    return transactions.reduce(
      (balance, transaction) => balance + movementForAccount(transaction, account.id),
      openingBalance(account)
    );
  }

  function calculate(data) {
    const balances = new Map();

    data.accounts.forEach(account => {
      balances.set(
        String(account.id),
        calculateAccountBalance(account, data.transactions)
      );
    });

    const totalBalance = Array.from(balances.values())
      .reduce((total, value) => total + value, 0);

    return { balances, totalBalance };
  }

  function selectedMonth(documentRef) {
    const field = documentRef.getElementById('monthFilter');
    if (field && /^\d{4}-\d{2}$/.test(field.value)) return field.value;
    return new Date().toISOString().slice(0, 7);
  }

  function calculateMonth(data, month) {
    const totals = {
      income: 0,
      expense: 0,
      pendingIncome: 0,
      pendingExpense: 0
    };

    data.transactions.forEach(transaction => {
      if (!String(transaction.date || '').startsWith(month)) return;

      const type = typeOf(transaction);
      const amount = amountOf(transaction);
      const settled = isSettled(transaction);

      if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) {
        totals[settled ? 'income' : 'pendingIncome'] += amount;
      }

      if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
        totals[settled ? 'expense' : 'pendingExpense'] += amount;
      }
    });

    return totals;
  }

  function setMoney(documentRef, id, value) {
    const element = documentRef.getElementById(id);
    if (!element) return;

    const formatted = money.format(value);
    if (element.textContent !== formatted) element.textContent = formatted;
  }

  function findAccountCard(documentRef, account) {
    const container = documentRef.getElementById('accountCards');
    if (!container) return null;

    const accountName = normalize(account.name);
    return Array.from(container.querySelectorAll('.card'))
      .find(card => normalize(card.textContent).includes(accountName)) || null;
  }

  function updateAccountCards(documentRef, data, balances) {
    data.accounts.forEach(account => {
      const card = findAccountCard(documentRef, account);
      if (!card) return;

      const balance = balances.get(String(account.id)) || 0;
      const formatted = money.format(balance);
      let block = card.querySelector('[data-calculated-account-balance]');

      if (!block) {
        block = documentRef.createElement('div');
        block.setAttribute('data-calculated-account-balance', String(account.id));
        block.style.marginTop = '12px';
        block.style.paddingTop = '12px';
        block.style.borderTop = '1px solid var(--line, #e4e9f1)';
        block.innerHTML = '<small style="display:block;color:var(--muted,#68758b);margin-bottom:5px">Saldo atual calculado</small><strong style="font-size:20px"></strong>';
        card.appendChild(block);
      }

      const value = block.querySelector('strong');
      if (!value) return;

      if (value.textContent !== formatted) value.textContent = formatted;

      const expectedColor = balance < 0
        ? 'var(--red,#d64553)'
        : 'var(--green,#16875f)';

      if (value.style.color !== expectedColor) value.style.color = expectedColor;
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
    setMoney(
      documentRef,
      'projected',
      result.totalBalance + month.pendingIncome - month.pendingExpense
    );

    updateAccountCards(documentRef, data, result.balances);

    const status = document.getElementById('balanceStatus');
    if (status && status.textContent !== 'Saldos atualizados') {
      status.textContent = 'Saldos atualizados';
      status.dataset.state = 'ok';
    }

    lastDataSignature = JSON.stringify({
      accounts: data.accounts,
      transactions: data.transactions
    });
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
        frameObserver.observe(frame.contentDocument.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });

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
    const signature = JSON.stringify({
      accounts: data.accounts,
      transactions: data.transactions
    });

    if (signature !== lastDataSignature) scheduleCalculation();
  }, 700);

  window.MVFBalance = {
    readData,
    calculate,
    calculateAccountBalance,
    update: applyCalculation
  };

  attachToFrame();
  scheduleCalculation();
})();