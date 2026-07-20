// Mock numeric, isSettled, typeOf, amountOf
function numeric(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/[^0-9.-]+/g, '')) || 0;
}

function normalize(str) {
  return String(str || '').toLowerCase().trim();
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

function accountBalanceFallback_old(account, transactions) {
  const initial = numeric(account.initial ?? account.initialBalance ?? account.openingBalance ?? account.balanceInitial);
  return transactions.reduce((balance, transaction) => {
    if (!isSettled(transaction)) return balance;
    const type = typeOf(transaction);
    const amount = amountOf(transaction);
    const accountId = String(transaction.accountId ?? transaction.account ?? '');
    const target = String(account.id);
    if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type) && accountId === target) return balance + amount;
    if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type) && accountId === target) return balance - amount;
    if (['transfer', 'transferencia'].includes(type)) {
      const from = String(transaction.fromAccountId ?? transaction.sourceAccountId ?? transaction.accountFromId ?? transaction.originAccountId ?? transaction.accountId ?? '');
      const to = String(transaction.toAccountId ?? transaction.destinationAccountId ?? transaction.accountToId ?? transaction.targetAccountId ?? '');
      if (from === target) balance -= amount;
      if (to === target) balance += amount;
    }
    return balance;
  }, initial);
}

function accountBalances_old(data) {
  const balances = new Map();
  data.accounts.forEach(account => balances.set(String(account.id), accountBalanceFallback_old(account, data.transactions)));
  return { balances, totalBalance: Array.from(balances.values()).reduce((sum, value) => sum + value, 0) };
}

function accountBalances_new(data) {
  const balances = new Map();

  data.accounts.forEach(account => {
    const initial = numeric(account.initial ?? account.initialBalance ?? account.openingBalance ?? account.balanceInitial);
    balances.set(String(account.id), initial);
  });

  data.transactions.forEach(transaction => {
    if (!isSettled(transaction)) return;
    const type = typeOf(transaction);
    const amount = amountOf(transaction);

    if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) {
      const accountId = String(transaction.accountId ?? transaction.account ?? '');
      if (balances.has(accountId)) {
        balances.set(accountId, balances.get(accountId) + amount);
      }
    } else if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
      const accountId = String(transaction.accountId ?? transaction.account ?? '');
      if (balances.has(accountId)) {
        balances.set(accountId, balances.get(accountId) - amount);
      }
    } else if (['transfer', 'transferencia'].includes(type)) {
      const from = String(transaction.fromAccountId ?? transaction.sourceAccountId ?? transaction.accountFromId ?? transaction.originAccountId ?? transaction.accountId ?? '');
      const to = String(transaction.toAccountId ?? transaction.destinationAccountId ?? transaction.accountToId ?? transaction.targetAccountId ?? '');

      if (balances.has(from)) {
        balances.set(from, balances.get(from) - amount);
      }
      if (balances.has(to)) {
        balances.set(to, balances.get(to) + amount);
      }
    }
  });

  return { balances, totalBalance: Array.from(balances.values()).reduce((sum, value) => sum + value, 0) };
}

const generateData = (numAccounts, numTransactions) => {
  const accounts = Array.from({ length: numAccounts }, (_, i) => ({
    id: `acc_${i}`,
    initial: 1000
  }));

  const types = ['income', 'expense', 'transfer'];
  const transactions = Array.from({ length: numTransactions }, (_, i) => {
    const type = types[i % 3];
    const t = {
      status: 'paid',
      type: type,
      amount: Math.random() * 100
    };

    if (type === 'transfer') {
      t.fromAccountId = `acc_${Math.floor(Math.random() * numAccounts)}`;
      t.toAccountId = `acc_${Math.floor(Math.random() * numAccounts)}`;
    } else {
      t.accountId = `acc_${Math.floor(Math.random() * numAccounts)}`;
    }
    return t;
  });

  return { accounts, transactions };
};

const data = generateData(100, 10000);

// verify correctness
const oldResult = accountBalances_old(data);
const newResult = accountBalances_new(data);

let correct = oldResult.totalBalance === newResult.totalBalance;
for (const [k, v] of oldResult.balances) {
  if (newResult.balances.get(k) !== v) {
    correct = false;
  }
}
console.log("Results match:", correct);

// Benchmark
const t0 = performance.now();
for (let i = 0; i < 100; i++) accountBalances_old(data);
const t1 = performance.now();
console.log(`Old: ${(t1 - t0).toFixed(2)} ms`);

const t2 = performance.now();
for (let i = 0; i < 100; i++) accountBalances_new(data);
const t3 = performance.now();
console.log(`New: ${(t3 - t2).toFixed(2)} ms`);
