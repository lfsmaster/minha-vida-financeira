(function () {
  'use strict';

  const STORAGE_KEY = 'mvf_complete_v2';
  const APP_FRAME_ID = 'appFrame';
  const MONEY = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let lastSignature = '';
  let observer = null;

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function readDatabase() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...parsed,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
      };
    } catch (error) {
      console.error('Não foi possível ler os dados financeiros.', error);
      return { accounts: [], transactions: [] };
    }
  }

  function normalized(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function isSettled(transaction) {
    const status = normalized(transaction.status);

    if (!status) return true;

    return [
      'paid',
      'pago',
      'paga',
      'received',
      'recebido',
      'recebida',
      'realized',
      'realizado',
      'realizada',
      'completed',
      'concluido',
      'concluida'
    ].includes(status);
  }

  function transactionType(transaction) {
    return normalized(transaction.type || transaction.kind || transaction.transactionType);
  }

  function transactionAmount(transaction) {
    return Math.abs(number(transaction.amount ?? transaction.value ?? transaction.total));
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

  function destinationAccountId(transaction) {
    return String(
      transaction.toAccountId ??
      transaction.destinationAccountId ??
      transaction.accountToId ??
      transaction.targetAccountId ??
      ''
    );
  }

  function accountId(transaction) {
    return String(transaction.accountId ?? transaction.account ?? '');
  }

  function movementForAccount(transaction, targetAccountId) {
    if (!isSettled(transaction)) return 0;

    const type = transactionType(transaction);
    const amount = transactionAmount(transaction);
    const target = String(targetAccountId);

    if (!amount || !target) return 0;

    if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) {
      return accountId(transaction) === target ? amount : 0;
    }

    if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
      return accountId(transaction) === target ? -amount : 0;
    }

    if (['transfer', 'transferencia'].includes(type)) {
      const from = sourceAccountId(transaction);
      const to = destinationAccountId(transaction);
      let movement = 0;

      if (from === target) movement -= amount;
      if (to === target) movement += amount;

      // Compatibilidade com transferências antigas que guardam somente
      // a conta e a direção do movimento.
      if (!to && accountId(transaction) === target) {
        const direction = normalized(transaction.direction || transaction.flow);
        if (['in', 'entrada', 'credit', 'credito'].includes(direction)) movement += amount;
        if (['out', 'saida', 'debit', 'debito'].includes(direction)) movement -= amount;
      }

      return movement;
    }

    // Compatibilidade com lançamentos antigos sem tipo explícito.
    const signedValue = number(transaction.amount ?? transaction.value);
    if (accountId(transaction) === target && signedValue !== 0) {
      return signedValue;
    }

    return 0;
  }

  function initialBalance(account) {
    return number(
      account.initial ??
      account.initialBalance ??
      account.openingBalance ??
      account.balanceInitial ??
      0
    );
  }

  function accountBalance(account, transactions) {
    return transactions.reduce(
      (balance, transaction) => balance + movementForAccount(transaction, account.id),
      initialBalance(account)
    );
  }

  function calculate(database) {
    const balances = new Map();

    database.accounts.forEach(account => {
      balances.set(String(account.id), accountBalance(account, database.transactions));
    });

    const totalBalance = Array.from(balances.values()).reduce((sum, value) => sum + value, 0);

    return { balances, totalBalance };
  }

  function currentMonth(documentRef) {
    const selected = documentRef && documentRef.getElementById('monthFilter');
    if (selected && /^\d{4}-\d{2}$/.test(selected.value)) return selected.value;
    return new Date().toISOString().slice(0, 7);
  }

  function monthTotals(database, month) {
    let income = 0;
    let expense = 0;
    let pendingIncome = 0;
    let pendingExpense = 0;

    database.transactions.forEach(transaction => {
      if (!String(transaction.date || '').startsWith(month)) return;

      const type = transactionType(transaction);
      const amount = transactionAmount(transaction);
      const settled = isSettled(transaction);

      if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) {
        if (settled) income += amount;
        else pendingIncome += amount;
      }

      if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
        if (settled) expense += amount;
        else pendingExpense += amount;
      }
    });

    return {
      income,
      expense,
      pendingIncome,
      pendingExpense
    };
  }

  function setText(documentRef, id, value) {
    const element = documentRef.getElementById(id);
    if (element) element.textContent = MONEY.format(value);
  }

  function findAccountCard(documentRef, account) {
    const container = documentRef.getElementById('accountCards');
    if (!container) return null;

    const cards = Array.from(container.querySelectorAll('.card'));
    const name = normalized(account.name);

    return cards.find(card => normalized(card.textContent).includes(name)) || null;
  }

  function updateAccountCards(documentRef, database, balances) {
    const container = documentRef.getElementById('accountCards');
    if (!container) return;

    database.accounts.forEach(account => {
      const balance = balances.get(String(account.id)) || 0;
      const card = findAccountCard(documentRef, account);
      if (!card) return;

      let value = card.querySelector('[data-calculated-account-balance]');

      if (!value) {
        value = documentRef.createElement('div');
        value.setAttribute('data-calculated-account-balance', String(account.id));
        value.style.marginTop = '12px';
        value.style.paddingTop = '12px';
        value.style.borderTop = '1px solid var(--line, #e4e9f1)';
        value.innerHTML = '<small style="display:block;color:var(--muted,#68758b);margin-bottom:5px">Saldo atual calculado</small><strong></strong>';
        card.appendChild(value);
      }

      const strong = value.querySelector('strong');
      if (strong) {
        strong.textContent = MONEY.format(balance);
        strong.style.fontSize = '20px';
        strong.style.color = balance < 0 ? 'var(--red,#d64553)' : 'var(--green,#16875f)';
      }
    });
  }

  function updateInterface() {
    const frame = document.getElementById(APP_FRAME_ID);
    if (!frame || !frame.contentDocument) return;

    const documentRef = frame.contentDocument;
    const database = readDatabase();
    const signature = JSON.stringify({
      accounts: database.accounts,
      transactions: database.transactions
    });

    const calculation = calculate(database);
    const totals = monthTotals(database, currentMonth(documentRef));

    setText(documentRef, 'balance', calculation.totalBalance);
    setText(documentRef, 'income', totals.income);
    setText(documentRef, 'expense', totals.expense);
    setText(
      documentRef,
      'projected',
      calculation.totalBalance + totals.pendingIncome - totals.pendingExpense
    );

    updateAccountCards(documentRef, database, calculation.balances);

    const status = document.getElementById('balanceStatus');
    if (status) {
      status.textContent = 'Saldos atualizados';
      status.dataset.state = 'ok';
    }

    lastSignature = signature;
  }

  function scheduleUpdate() {
    window.setTimeout(updateInterface, 40);
    window.setTimeout(updateInterface, 250);
    window.setTimeout(updateInterface, 700);
  }

  function watchFrame() {
    const frame = document.getElementById(APP_FRAME_ID);
    if (!frame) return;

    frame.addEventListener('load', () => {
      if (observer) observer.disconnect();

      try {
        observer = new MutationObserver(scheduleUpdate);
        observer.observe(frame.contentDocument.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });

        frame.contentDocument.addEventListener('click', scheduleUpdate, true);
        frame.contentDocument.addEventListener('submit', scheduleUpdate, true);
        frame.contentDocument.addEventListener('change', scheduleUpdate, true);
      } catch (error) {
        console.warn('Não foi possível acompanhar as alterações da interface.', error);
      }

      scheduleUpdate();
    });
  }

  function watchStorage() {
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) scheduleUpdate();
    });

    window.setInterval(() => {
      const database = readDatabase();
      const signature = JSON.stringify({
        accounts: database.accounts,
        transactions: database.transactions
      });

      if (signature !== lastSignature) updateInterface();
    }, 600);
  }

  window.MVFBalance = {
    readDatabase,
    calculate,
    accountBalance,
    update: updateInterface
  };

  watchFrame();
  watchStorage();
  scheduleUpdate();
})();