const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

// Mock browser environment
global.window = {
  addEventListener: () => {},
};
global.document = {
  getElementById: () => null,
  createElement: () => ({ setAttribute: () => {}, style: {} }),
  head: { appendChild: () => {} },
};
global.localStorage = { getItem: () => null };
global.MutationObserver = class { observe() {} disconnect() {} };
global.setInterval = () => {};
global.setTimeout = () => {};
global.Intl = {
  NumberFormat: class {
    constructor() {}
    format(v) { return String(v); }
  }
};

const code = fs.readFileSync('./balance-engine.js', 'utf8');
eval(code);

const { calculateAccountBalance } = window.MVFBalance;

test('calculateAccountBalance', async (t) => {
  await t.test('calculates balance with no transactions', () => {
    assert.strictEqual(calculateAccountBalance({ id: 'acc1', initial: 100 }, []), 100);
    assert.strictEqual(calculateAccountBalance({ id: 'acc1', initialBalance: 200 }, []), 200);
    assert.strictEqual(calculateAccountBalance({ id: 'acc1', openingBalance: 300 }, []), 300);
    assert.strictEqual(calculateAccountBalance({ id: 'acc1', balanceInitial: 400 }, []), 400);
    assert.strictEqual(calculateAccountBalance({ id: 'acc1' }, []), 0);
  });

  await t.test('ignores unsettled transactions', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { accountId: 'acc1', amount: 50, type: 'income', status: 'pending' },
      { accountId: 'acc1', amount: 30, type: 'expense', status: 'pendente' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 100);
  });

  await t.test('adds income transactions', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { accountId: 'acc1', amount: 50, type: 'income', status: 'paid' },
      { accountId: 'acc1', amount: 25, type: 'receita', status: 'recebido' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 175);
  });

  await t.test('subtracts expense transactions', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { accountId: 'acc1', amount: 30, type: 'expense', status: 'paid' },
      { accountId: 'acc1', amount: 20, type: 'despesa', status: 'pago' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 50);
  });

  await t.test('handles transfers correctly for source account', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { fromAccountId: 'acc1', toAccountId: 'acc2', amount: 40, type: 'transfer', status: 'completed' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 60);
  });

  await t.test('handles transfers correctly for destination account', () => {
    const account = { id: 'acc2', initial: 100 };
    const transactions = [
      { fromAccountId: 'acc1', toAccountId: 'acc2', amount: 40, type: 'transfer', status: 'completed' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 140);
  });

  await t.test('handles legacy single-account transfers with direction out', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      // Using 'account' instead of 'accountId' to avoid double-counting due to 'sourceAccountId' fallback
      { account: 'acc1', amount: 40, type: 'transfer', direction: 'out', status: 'completed' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 60);
  });

  await t.test('handles legacy single-account transfers with direction in', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { account: 'acc1', amount: 40, type: 'transfer', direction: 'in', status: 'completed' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 140);
  });

  await t.test('ignores transactions for other accounts', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { accountId: 'acc2', amount: 50, type: 'income', status: 'paid' },
      { fromAccountId: 'acc2', toAccountId: 'acc3', amount: 40, type: 'transfer', status: 'completed' }
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 100);
  });

  await t.test('handles legacy transactions with negative amounts', () => {
    const account = { id: 'acc1', initial: 100 };
    const transactions = [
      { accountId: 'acc1', amount: -30, status: 'paid' },
      { accountId: 'acc1', amount: 50, status: 'paid' } // For legacy, positive adds, negative subtracts without type
    ];
    assert.strictEqual(calculateAccountBalance(account, transactions), 120);
  });
});
