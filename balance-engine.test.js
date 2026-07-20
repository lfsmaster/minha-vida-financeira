const test = require('node:test');
const assert = require('node:assert');

// Mock environment for the browser
global.window = {
  addEventListener: () => {}
};
global.document = {
  getElementById: () => null,
  createElement: () => ({}),
  head: { appendChild: () => {} },
  addEventListener: () => {}
};
global.localStorage = { getItem: () => '{}' };
global.Intl = {
  NumberFormat: function() {
    return { format: (v) => v };
  }
};
global.MutationObserver = class {
  observe() {}
  disconnect() {}
};

// Mock setTimeout and setInterval to avoid tests hanging
global.setTimeout = () => {};
global.setInterval = () => {};

require('./balance-engine.js');

const calculateMonth = window.MVFBalance.calculateMonth;

test('calculateMonth: basic categorization', () => {
  const data = {
    transactions: [
      { date: '2023-10-01', type: 'income', amount: 100, status: 'paid' },
      { date: '2023-10-02', type: 'expense', amount: 50, status: 'completed' },
      { date: '2023-10-03', type: 'income', amount: 200, status: 'pending' },
      { date: '2023-10-04', type: 'expense', amount: 75, status: 'agendado' }
    ]
  };

  const result = calculateMonth(data, '2023-10');
  assert.deepStrictEqual(result, {
    income: 100,
    expense: 50,
    pendingIncome: 200,
    pendingExpense: 75
  });
});

test('calculateMonth: ignores transactions outside the month', () => {
  const data = {
    transactions: [
      { date: '2023-09-30', type: 'income', amount: 100, status: 'paid' },
      { date: '2023-10-01', type: 'income', amount: 150, status: 'paid' },
      { date: '2023-11-01', type: 'expense', amount: 50, status: 'paid' }
    ]
  };

  const result = calculateMonth(data, '2023-10');
  assert.deepStrictEqual(result, {
    income: 150,
    expense: 0,
    pendingIncome: 0,
    pendingExpense: 0
  });
});

test('calculateMonth: handles type aliases', () => {
  const data = {
    transactions: [
      { date: '2023-10-01', type: 'income', amount: 10, status: 'paid' },
      { date: '2023-10-02', type: 'receita', amount: 20, status: 'paid' },
      { date: '2023-10-03', type: 'entrada', amount: 30, status: 'paid' },
      { date: '2023-10-04', type: 'credit', amount: 40, status: 'paid' },
      { date: '2023-10-05', type: 'credito', amount: 50, status: 'paid' },

      { date: '2023-10-06', type: 'expense', amount: 5, status: 'paid' },
      { date: '2023-10-07', type: 'despesa', amount: 15, status: 'paid' },
      { date: '2023-10-08', type: 'saida', amount: 25, status: 'paid' },
      { date: '2023-10-09', type: 'debit', amount: 35, status: 'paid' },
      { date: '2023-10-10', type: 'debito', amount: 45, status: 'paid' }
    ]
  };

  const result = calculateMonth(data, '2023-10');
  assert.deepStrictEqual(result, {
    income: 150, // 10+20+30+40+50
    expense: 125, // 5+15+25+35+45
    pendingIncome: 0,
    pendingExpense: 0
  });
});

test('calculateMonth: handles status aliases for settled vs pending', () => {
  const data = {
    transactions: [
      // Settled income
      { date: '2023-10-01', type: 'income', amount: 1, status: 'paid' },
      { date: '2023-10-01', type: 'income', amount: 2, status: 'pago' },
      { date: '2023-10-01', type: 'income', amount: 3, status: 'paga' },
      { date: '2023-10-01', type: 'income', amount: 4, status: 'received' },
      { date: '2023-10-01', type: 'income', amount: 5, status: 'recebido' },
      { date: '2023-10-01', type: 'income', amount: 6, status: 'recebida' },
      { date: '2023-10-01', type: 'income', amount: 7, status: 'realized' },
      { date: '2023-10-01', type: 'income', amount: 8, status: 'realizado' },
      { date: '2023-10-01', type: 'income', amount: 9, status: 'realizada' },
      { date: '2023-10-01', type: 'income', amount: 10, status: 'completed' },
      { date: '2023-10-01', type: 'income', amount: 11, status: 'concluido' },
      { date: '2023-10-01', type: 'income', amount: 12, status: 'concluida' },
      { date: '2023-10-01', type: 'income', amount: 13, status: '' }, // empty is settled

      // Pending income
      { date: '2023-10-01', type: 'income', amount: 100, status: 'pending' },
      { date: '2023-10-01', type: 'income', amount: 200, status: 'pendente' }
    ]
  };

  const result = calculateMonth(data, '2023-10');
  // 1+2+3+4+5+6+7+8+9+10+11+12+13 = 91
  assert.deepStrictEqual(result, {
    income: 91,
    expense: 0,
    pendingIncome: 300,
    pendingExpense: 0
  });
});

test('calculateMonth: resilience against missing properties', () => {
  const data = {
    transactions: [
      { type: 'income', amount: 100, status: 'paid' }, // no date
      { date: '2023-10-01', amount: 100, status: 'paid' }, // no type
      { date: '2023-10-01', type: 'income', status: 'paid' }, // no amount
      { date: '2023-10-01', type: 'income', amount: 100 } // no status (default settled)
    ]
  };

  const result = calculateMonth(data, '2023-10');
  assert.deepStrictEqual(result, {
    income: 100,
    expense: 0,
    pendingIncome: 0,
    pendingExpense: 0
  });
});

test('calculateMonth: handles case insensitivity and accents', () => {
  const data = {
    transactions: [
      { date: '2023-10-01', type: 'Crédito', amount: 100, status: 'Concluído' }, // accent + uppercase
      { date: '2023-10-01', type: 'SAÍDA', amount: 50, status: 'Pendente' } // accent + uppercase + pending
    ]
  };

  const result = calculateMonth(data, '2023-10');
  assert.deepStrictEqual(result, {
    income: 100,
    expense: 0,
    pendingIncome: 0,
    pendingExpense: 50
  });
});
