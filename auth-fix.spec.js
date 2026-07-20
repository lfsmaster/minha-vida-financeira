/**
 * @jest-environment jsdom
 */

const fs = require('fs');

describe('auth-fix.js', () => {
  let readDatabase;

  beforeAll(() => {
    // Read the source file
    const sourceCode = fs.readFileSync('auth-fix.js', 'utf8');

    // Create a modified version that exports the internal functions for testing
    // Remove the IIFE wrapper
    const modifiedCode = sourceCode
      .replace(/^\(function \(\) \{/m, '')
      .replace(/\}\)\(\);$/m, '')
      .replace(/'use strict';/m, '')
      + '\nmodule.exports = { readDatabase };';

    // Write a temporary file
    fs.writeFileSync('auth-fix.test-helper.js', modifiedCode);
  });

  afterAll(() => {
    // Clean up
    if (fs.existsSync('auth-fix.test-helper.js')) {
      fs.unlinkSync('auth-fix.test-helper.js');
    }
  });

  beforeEach(() => {
    // Clear modules to ensure fresh execution
    jest.resetModules();

    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock
    });

    // Mock prompt
    window.prompt = jest.fn();

    // Load the module
    const authFix = require('./auth-fix.test-helper.js');
    readDatabase = authFix.readDatabase;
  });

  describe('readDatabase', () => {
    it('should initialize empty state when localStorage is empty', () => {
      window.localStorage.getItem.mockReturnValue(null);

      const db = readDatabase();

      expect(db.version).toBe(3);
      expect(db.users).toEqual([]);
      expect(db.settings).toEqual({});
      expect(db.accounts).toEqual([]);
      expect(db.transactions).toEqual([]);
      expect(db.cards).toEqual([]);
      expect(db.cardPurchases).toEqual([]);
      expect(db.budgets).toEqual([]);
      expect(db.goals).toEqual([]);
      expect(db.debts).toEqual([]);
      expect(db.investments).toEqual([]);
      expect(db.assets).toEqual([]);
      expect(db.meta).toEqual({});
    });

    it('should initialize empty state when localStorage returns empty object', () => {
      window.localStorage.getItem.mockReturnValue('{}');

      const db = readDatabase();

      expect(db.version).toBe(3);
      expect(db.users).toEqual([]);
      expect(db.settings).toEqual({});
      expect(db.accounts).toEqual([]);
      expect(db.transactions).toEqual([]);
      expect(db.cards).toEqual([]);
      expect(db.cardPurchases).toEqual([]);
      expect(db.budgets).toEqual([]);
      expect(db.goals).toEqual([]);
      expect(db.debts).toEqual([]);
      expect(db.investments).toEqual([]);
      expect(db.assets).toEqual([]);
      expect(db.meta).toEqual({});
    });

    it('should fallback missing arrays to empty arrays when reading invalid DB data', () => {
      window.localStorage.getItem.mockReturnValue(JSON.stringify({
        version: 3,
        users: null,
        settings: 'not an object',
        accounts: {},
        transactions: 123,
        cards: 'string',
        cardPurchases: null,
        budgets: undefined,
        goals: null,
        debts: null,
        investments: null,
        assets: null,
        meta: null
      }));

      const db = readDatabase();

      expect(db.version).toBe(3);
      expect(db.users).toEqual([]);
      expect(db.settings).toEqual({});
      expect(db.accounts).toEqual([]);
      expect(db.transactions).toEqual([]);
      expect(db.cards).toEqual([]);
      expect(db.cardPurchases).toEqual([]);
      expect(db.budgets).toEqual([]);
      expect(db.goals).toEqual([]);
      expect(db.debts).toEqual([]);
      expect(db.investments).toEqual([]);
      expect(db.assets).toEqual([]);
      expect(db.meta).toEqual({});
    });

    it('should fallback gracefully when JSON parsing fails', () => {
      window.localStorage.getItem.mockReturnValue('invalid-json');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const db = readDatabase();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Não foi possível ler'), expect.any(SyntaxError));
      expect(db.version).toBe(3);
      expect(db.users).toEqual([]);
      expect(db.settings).toEqual({});
      expect(db.accounts).toEqual([]);

      consoleSpy.mockRestore();
    });
  });
});
