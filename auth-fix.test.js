/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('Auth Fix - Unknown User Login', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="authMessage"></div>
      <form id="loginForm">
        <input id="loginEmail" value="unknown@example.com" />
        <input id="loginPassword" value="password" />
      </form>
    `;

    // Reset LocalStorage
    Storage.prototype.getItem = jest.fn(() => JSON.stringify({
      users: [] // Empty users array means user is not found
    }));
    Storage.prototype.setItem = jest.fn();

    // Avoid Location replacement issues by just assigning window.location properties if possible,
    // actually JSDOM doesn't allow changing window.location directly unless we use jsdom.reconfigure
    // But since `auth-fix.js` uses `location.replace` and `location.pathname`, let's just
    // redefine the `location` behavior via a mock, since it errors when we do Object.defineProperty on window
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('gracefully handles unknown user login by setting error message', () => {
    // Setup a dummy DOM for location
    // We don't overwrite location directly, we let it be
    // JSDOM has an issue with window.location when `replace()` is called, but in our case,
    // since the user is not found, `login()` returns early and never reaches `location.replace()`.

    // Load the script
    const scriptCode = fs.readFileSync(path.resolve(__dirname, 'auth-fix.js'), 'utf8');

    // Execute script in current JSDOM environment
    eval(scriptCode);

    // Trigger DOMContentLoaded manually if it didn't run
    const event = document.createEvent('Event');
    event.initEvent('DOMContentLoaded', true, true);
    document.dispatchEvent(event);

    // Simulate login form submit
    const loginForm = document.getElementById('loginForm');

    const submitEvent = new Event('submit', { cancelable: true });
    submitEvent.stopImmediatePropagation = jest.fn();

    loginForm.dispatchEvent(submitEvent);

    // The script should call `login('unknown@example.com', 'password')`
    // And since the user is not found, it should set the message
    const messageNode = document.getElementById('authMessage');

    expect(messageNode.textContent).toBe('E-mail não encontrado. Use “Criar conta local” para cadastrar o acesso sem apagar seus dados.');
    expect(messageNode.style.color).toBe('rgb(214, 69, 83)'); // '#d64553' gets converted to rgb
  });
});
