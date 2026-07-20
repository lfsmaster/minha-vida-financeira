const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function setupTestEnvironment() {
    let dispatchedEvents = [];
    let pageSet = null;
    let metadataPersisted = null;

    // Default state
    let mockState = {
        accounts: [],
        transactions: []
    };

    const App = {
        BatchImport: {
            refreshDuplicates: () => {},
            persistMetadata: (metadata) => { metadataPersisted = metadata; },
            readRules: () => ({ salaryPayers: [] })
        },
        Core: {
            dispatch: (event, payload) => {
                dispatchedEvents.push({ event, payload });
            }
        },
        money: { format: () => {} },
        esc: (x) => x,
        dateBR: (x) => x,
        state: () => mockState,
        accountOptions: () => '',
        categoryOptions: () => '',
        toast: () => {},
        importBatches: [],
        importPreview: [],
        importFileName: '',
        setPage: (page) => {
            pageSet = page;
        },
        renderers: {
            transactions: () => {}
        },
        handleAction: (action, id) => {}
    };

    const mockWindow = { MVFApp: App };

    const mockDocument = {
        createElement: () => ({ style: {}, appendChild: () => {} }),
        head: { appendChild: () => {} },
        getElementById: () => null,
        addEventListener: () => {}
    };

    const globalContext = {
        window: mockWindow,
        document: mockDocument,
        prompt: () => {},
        console: console
    };

    vm.createContext(globalContext);

    let code = fs.readFileSync('import-batch-ui.js', 'utf8');

    // Instead of completely stripping the IIFE which caused a syntax error due to `if(!App)return;`
    // We just export the confirmImport function onto globalThis or App from within the IIFE.
    // Let's replace `function confirmImport(){` with `globalThis.confirmImport = function confirmImport(){`
    // Alternatively, expose it via App.
    code = code.replace(/function confirmImport\(\)\{/, 'globalThis.confirmImport = function confirmImport(){');

    vm.runInContext(code, globalContext);

    return {
        App,
        globalContext,
        getEvents: () => dispatchedEvents,
        getPage: () => pageSet,
        getMetadata: () => metadataPersisted,
        setMockState: (newState) => { mockState = newState; }
    };
}

test('confirmImport tests', async (t) => {
    await t.test('throws error when no valid accounts exist', () => {
        const { App, globalContext, setMockState } = setupTestEnvironment();

        setMockState({
            accounts: [
                { id: 'valid_account_1', name: 'Conta 1' }
            ]
        });

        App.importBatches = [
            {
                name: 'test_batch_1.csv',
                accountId: 'invalid_account_999',
                extension: 'csv',
                items: [
                    { selected: true, duplicateExisting: false, duplicateBatch: false, amount: 100 }
                ]
            }
        ];

        assert.throws(
            () => globalContext.confirmImport(),
            {
                name: 'Error',
                message: 'Selecione uma conta válida para test_batch_1.csv.'
            }
        );
    });

    await t.test('successful import with valid accounts', () => {
        const { App, globalContext, getEvents, getPage, getMetadata, setMockState } = setupTestEnvironment();

        setMockState({
            accounts: [
                { id: 'valid_account_1', name: 'Conta 1' }
            ]
        });

        App.importBatches = [
            {
                name: 'test_batch_1.csv',
                accountId: 'valid_account_1',
                extension: 'csv',
                items: [
                    { selected: true, duplicateExisting: false, duplicateBatch: false, amount: 100, date: '2023-01-01', description: 'Test', category: 'General', externalId: 'ext1' },
                    { selected: false, duplicateExisting: false, duplicateBatch: false, amount: 200 } // ignored
                ]
            }
        ];

        globalContext.confirmImport();

        assert.strictEqual(getEvents().length, 1, 'Should dispatch 1 import event');
        assert.strictEqual(getEvents()[0].event, 'IMPORT_TRANSACTIONS');
        // Parse/stringify to handle VM context objects vs normal Node objects
        assert.deepStrictEqual(JSON.parse(JSON.stringify(getEvents()[0].payload.items)), [{
            date: '2023-01-01', description: 'Test', amount: 100, category: 'General', externalId: 'ext1'
        }]);
        assert.strictEqual(getPage(), 'dashboard');
        assert.strictEqual(App.importBatches.length, 0);
        assert.ok(getMetadata(), 'Should persist metadata');
    });

    await t.test('throws error when no items are selected (no imported items)', () => {
        const { App, globalContext, setMockState } = setupTestEnvironment();

        setMockState({
            accounts: [
                { id: 'valid_account_1', name: 'Conta 1' }
            ]
        });

        App.importBatches = [
            {
                name: 'test_batch_1.csv',
                accountId: 'valid_account_1',
                extension: 'csv',
                items: [
                    { selected: false, duplicateExisting: false, duplicateBatch: false, amount: 100 }
                ]
            }
        ];

        assert.throws(
            () => globalContext.confirmImport(),
            {
                name: 'Error',
                message: 'Nenhum lançamento novo foi selecionado.'
            }
        );
    });
});
