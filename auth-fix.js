(function () {
  'use strict';

  const DB_KEY = 'mvf_clock_v3';
  const SESSION_KEY = 'mvf_clock_session';
  const LEGACY_KEY = 'mvf_complete_v2';

  const byId = id => document.getElementById(id);
  const text = value => String(value == null ? '' : value).trim();
  const emailKey = value => text(value).toLowerCase();

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
      console.warn(`Não foi possível ler ${key}.`, error);
      return fallback;
    }
  }

  function readDatabase() {
    const database = readJson(DB_KEY, {}) || {};
    database.version = 3;
    database.users = Array.isArray(database.users) ? database.users : [];
    database.settings = database.settings && typeof database.settings === 'object'
      ? database.settings
      : {};
    database.accounts = Array.isArray(database.accounts) ? database.accounts : [];
    database.transactions = Array.isArray(database.transactions) ? database.transactions : [];
    database.cards = Array.isArray(database.cards) ? database.cards : [];
    database.cardPurchases = Array.isArray(database.cardPurchases) ? database.cardPurchases : [];
    database.budgets = Array.isArray(database.budgets) ? database.budgets : [];
    database.goals = Array.isArray(database.goals) ? database.goals : [];
    database.debts = Array.isArray(database.debts) ? database.debts : [];
    database.investments = Array.isArray(database.investments) ? database.investments : [];
    database.assets = Array.isArray(database.assets) ? database.assets : [];
    database.meta = database.meta && typeof database.meta === 'object' ? database.meta : {};
    return database;
  }

  function saveDatabase(database, eventName) {
    database.meta = database.meta || {};
    database.meta.revision = Number(database.meta.revision || 0) + 1;
    database.meta.updatedAt = new Date().toISOString();
    database.meta.lastEvent = eventName || 'Acesso atualizado';
    localStorage.setItem(DB_KEY, JSON.stringify(database));
  }

  function normalizeUsers(database) {
    let changed = false;
    database.users = database.users
      .filter(user => user && typeof user === 'object')
      .map(user => {
        const normalized = {
          id: text(user.id) || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: text(user.name || user.nome) || 'Usuário',
          email: emailKey(user.email || user.login),
          password: text(user.password || user.senha)
        };
        if (
          normalized.id !== user.id ||
          normalized.name !== user.name ||
          normalized.email !== user.email ||
          normalized.password !== user.password
        ) changed = true;
        return normalized;
      })
      .filter(user => user.email);

    const unique = new Map();
    database.users.forEach(user => {
      if (!unique.has(user.email)) unique.set(user.email, user);
    });
    if (unique.size !== database.users.length) changed = true;
    database.users = Array.from(unique.values());
    return changed;
  }

  function migrateLegacyUsers(database) {
    if (database.users.length) return false;
    const legacy = readJson(LEGACY_KEY, null);
    if (!legacy) return false;

    const candidates = [];
    if (Array.isArray(legacy.users)) candidates.push(...legacy.users);
    if (legacy.user && typeof legacy.user === 'object') candidates.push(legacy.user);
    if (legacy.profile && typeof legacy.profile === 'object') candidates.push(legacy.profile);

    candidates.forEach(candidate => {
      const email = emailKey(candidate.email || candidate.login);
      if (!email) return;
      database.users.push({
        id: text(candidate.id) || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: text(candidate.name || candidate.nome) || 'Usuário',
        email,
        password: text(candidate.password || candidate.senha)
      });
    });

    return database.users.length > 0;
  }

  function prepareDatabase() {
    const database = readDatabase();
    const migrated = migrateLegacyUsers(database);
    const normalized = normalizeUsers(database);
    if (migrated || normalized) saveDatabase(database, 'Usuários de acesso migrados');
    return database;
  }

  function setMessage(message, isError) {
    const node = byId('authMessage');
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#d64553' : '';
  }

  function showLogin(message) {
    byId('loginForm')?.classList.remove('hidden');
    byId('registerForm')?.classList.add('hidden');
    if (message) setMessage(message, false);
  }

  function showRegister(message) {
    byId('loginForm')?.classList.add('hidden');
    byId('registerForm')?.classList.remove('hidden');
    if (message) setMessage(message, false);
  }

  function startSession(email) {
    localStorage.setItem(SESSION_KEY, emailKey(email));
    location.replace(`index.html#dashboard`);
    location.reload();
  }

  function login(email, password) {
    const database = prepareDatabase();
    const normalizedEmail = emailKey(email);
    const suppliedPassword = text(password);
    const user = database.users.find(item => emailKey(item.email) === normalizedEmail);

    if (!user) {
      setMessage('E-mail não encontrado. Use “Criar conta local” para cadastrar o acesso sem apagar seus dados.', true);
      return;
    }

    if (text(user.password) !== suppliedPassword) {
      setMessage('Senha incorreta. Use “Redefinir senha local” para recuperar o acesso neste dispositivo.', true);
      return;
    }

    startSession(user.email);
  }

  function register(name, email, password, confirmation) {
    const database = prepareDatabase();
    const normalizedEmail = emailKey(email);
    const cleanName = text(name);
    const cleanPassword = text(password);

    if (!cleanName) throw new Error('Informe seu nome.');
    if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Informe um e-mail válido.');
    if (cleanPassword.length < 4) throw new Error('A senha deve ter pelo menos 4 caracteres.');
    if (cleanPassword !== text(confirmation)) throw new Error('As senhas não coincidem.');
    if (database.users.some(user => emailKey(user.email) === normalizedEmail)) {
      throw new Error('Este e-mail já está cadastrado. Entre ou redefina a senha local.');
    }

    database.users.push({
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      email: normalizedEmail,
      password: cleanPassword
    });
    database.settings.userName = database.settings.userName || cleanName;
    saveDatabase(database, 'Nova conta de acesso criada');
    startSession(normalizedEmail);
  }

  function resetPassword() {
    const database = prepareDatabase();
    if (!database.users.length) {
      showRegister('Nenhuma conta de acesso foi encontrada. Crie uma conta local; seus dados financeiros serão preservados.');
      return;
    }

    const suggestedEmail = database.users.length === 1 ? database.users[0].email : '';
    const email = emailKey(prompt('Informe o e-mail cadastrado neste dispositivo:', suggestedEmail) || '');
    if (!email) return;

    const user = database.users.find(item => emailKey(item.email) === email);
    if (!user) {
      setMessage('E-mail não encontrado neste dispositivo.', true);
      return;
    }

    const password = text(prompt('Digite uma nova senha com pelo menos 4 caracteres:') || '');
    if (!password) return;
    if (password.length < 4) {
      setMessage('A nova senha deve ter pelo menos 4 caracteres.', true);
      return;
    }

    const confirmation = text(prompt('Confirme a nova senha:') || '');
    if (password !== confirmation) {
      setMessage('As senhas não coincidem.', true);
      return;
    }

    user.password = password;
    saveDatabase(database, 'Senha local redefinida');
    setMessage('Senha redefinida. Entre com a nova senha.', false);
    const emailField = byId('loginEmail');
    if (emailField) emailField.value = email;
    showLogin();
  }

  function replaceForm(id) {
    const original = byId(id);
    if (!original || !original.parentNode) return original;
    const clone = original.cloneNode(true);
    original.parentNode.replaceChild(clone, original);
    return clone;
  }

  function addRecoveryButton() {
    const loginForm = byId('loginForm');
    if (!loginForm || byId('resetLocalPassword')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link';
    button.id = 'resetLocalPassword';
    button.textContent = 'Redefinir senha local';
    button.addEventListener('click', resetPassword);
    loginForm.appendChild(button);
  }

  function repairSession(database) {
    const session = emailKey(localStorage.getItem(SESSION_KEY));
    if (!session) return;
    if (!database.users.some(user => emailKey(user.email) === session)) {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  function initialize() {
    const database = prepareDatabase();
    repairSession(database);

    const loginForm = replaceForm('loginForm');
    const registerForm = replaceForm('registerForm');

    loginForm?.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      login(byId('loginEmail')?.value, byId('loginPassword')?.value);
    });

    registerForm?.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        register(
          byId('registerName')?.value,
          byId('registerEmail')?.value,
          byId('registerPassword')?.value,
          byId('registerPassword2')?.value
        );
      } catch (error) {
        setMessage(error.message || 'Não foi possível criar a conta.', true);
      }
    });

    byId('showRegister')?.addEventListener('click', () => showRegister('Crie um novo acesso local sem apagar seus dados financeiros.'));
    byId('showLogin')?.addEventListener('click', () => showLogin('Entre com a conta cadastrada neste dispositivo.'));
    addRecoveryButton();

    if (!database.users.length) {
      showRegister('Crie a primeira conta de acesso. Os dados financeiros existentes serão mantidos.');
    } else {
      showLogin('Entre com sua conta local.');
      const emailField = byId('loginEmail');
      if (emailField && database.users.length === 1) emailField.value = database.users[0].email;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
