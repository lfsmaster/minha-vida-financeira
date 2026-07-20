(function () {
  'use strict';

  const Core = window.MVFClock;
  if (!Core) return;

  const SESSION_KEY = 'mvf_clock_session';
  const normalizeEmail = value => String(value == null ? '' : value).trim().toLowerCase();

  Core.session = function () {
    return normalizeEmail(localStorage.getItem(SESSION_KEY));
  };

  Core.logout = function () {
    localStorage.removeItem(SESSION_KEY);
    return true;
  };

  Core.login = function (email, password) {
    const normalizedEmail = normalizeEmail(email);
    const suppliedPassword = String(password == null ? '' : password).trim();
    const state = typeof Core.getState === 'function' ? Core.getState() : null;
    const users = state && Array.isArray(state.users) ? state.users : [];
    const user = users.find(item => normalizeEmail(item && item.email) === normalizedEmail);

    if (!user || String(user.password == null ? '' : user.password).trim() !== suppliedPassword) {
      return false;
    }

    localStorage.setItem(SESSION_KEY, normalizedEmail);
    return true;
  };
})();
