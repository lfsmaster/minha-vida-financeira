const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('./auth-fix.js', 'utf8');
const modifiedCode = code.replace(
  /if \(document\.readyState === 'loading'\).*?\(\);\n\}\)\(\);/s,
  `
  return { register, prepareDatabase };
})();
`
);

test('auth-fix register function', async (t) => {
  let localStorageData = {};
  let locationReplaced = null;

  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener: () => {}
    },
    localStorage: {
      getItem: (key) => localStorageData[key] || null,
      setItem: (key, value) => { localStorageData[key] = value; },
      removeItem: (key) => { delete localStorageData[key]; }
    },
    location: {
      pathname: '/',
      replace: (url) => { locationReplaced = url; }
    },
    console: console,
    Date: Date,
    Math: Math,
    String: String,
    Number: Number,
    Array: Array,
    Error: Error
  };

  vm.createContext(sandbox);
  const { register } = vm.runInContext(modifiedCode, sandbox);

  await t.test('throws if name is missing', () => {
    assert.throws(
      () => register('', 'test@example.com', '1234', '1234'),
      { message: 'Informe seu nome.' }
    );
  });

  await t.test('throws if email is invalid', () => {
    assert.throws(
      () => register('User', 'invalidemail', '1234', '1234'),
      { message: 'Informe um e-mail válido.' }
    );
    assert.throws(
      () => register('User', '', '1234', '1234'),
      { message: 'Informe um e-mail válido.' }
    );
  });

  await t.test('throws if password is too short', () => {
    assert.throws(
      () => register('User', 'test@example.com', '123', '123'),
      { message: 'A senha deve ter pelo menos 4 caracteres.' }
    );
  });

  await t.test('throws if passwords do not match', () => {
    assert.throws(
      () => register('User', 'test@example.com', '1234', '12345'),
      { message: 'As senhas não coincidem.' }
    );
  });

  await t.test('registers successfully and prevents duplication', () => {
    localStorageData = {}; // reset db

    // First registration should succeed
    register('User', 'test@example.com', '1234', '1234');

    // Validate state
    const db = JSON.parse(localStorageData['mvf_clock_v3']);
    assert.strictEqual(db.users.length, 1);
    assert.strictEqual(db.users[0].email, 'test@example.com');
    assert.strictEqual(db.users[0].name, 'User');
    assert.strictEqual(db.users[0].password, '1234');

    // Second registration with same email should throw
    assert.throws(
      () => register('User 2', 'test@example.com', '1234', '1234'),
      { message: 'Este e-mail já está cadastrado. Entre ou redefina a senha local.' }
    );
  });
});
