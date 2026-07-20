(function () {
  'use strict';

  const VERSION = '8';
  const PYODIDE_VERSION = '314.0.2';
  const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  const APPLICATION_SCRIPTS = [
    `auth-core-patch.js?v=${VERSION}`,
    `clock-ui.js?v=${VERSION}`,
    `clock-pages-main.js?v=${VERSION}`,
    `clock-pages-plan.js?v=${VERSION}`,
    `clock-pages-tools.js?v=${VERSION}`,
    `clock-actions.js?v=${VERSION}`,
    `import-batch-core.js?v=${VERSION}`,
    `import-batch-ui.js?v=${VERSION}`,
    `import-batch-compat.js?v=${VERSION}`,
    `auth-fix.js?v=${VERSION}`
  ];

  const boot = document.getElementById('pythonBoot');
  const bootTitle = document.getElementById('pythonBootTitle');
  const bootDetail = document.getElementById('pythonBootDetail');

  function setBoot(title, detail, failed = false) {
    if (bootTitle) bootTitle.textContent = title;
    if (bootDetail) bootDetail.textContent = detail;
    if (boot) boot.dataset.state = failed ? 'error' : 'loading';
  }

  function setEngineStatus(text, state) {
    const node = document.getElementById('calculationEngineStatus');
    if (!node) return;
    node.textContent = text;
    node.dataset.state = state;
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${source}.`));
      document.body.appendChild(script);
    });
  }

  async function loadApplication() {
    for (const source of APPLICATION_SCRIPTS) {
      await loadScript(source);
    }
    window.MVFApp?.render?.();
    window.MVFApp?.renderApp?.();
  }

  function installPythonCalculations(pyodide, engine) {
    const Core = window.MVFClock;
    if (!Core) throw new Error('O núcleo financeiro não foi carregado.');

    const call = (operation, argument = null) => {
      const stateJson = JSON.stringify(Core.getState());
      const argumentJson = JSON.stringify(argument);
      const response = engine.calculate(operation, stateJson, argumentJson);
      return JSON.parse(String(response));
    };

    Core.accountBalance = (account, includePending = false) => Number(call('account_balance', {
      accountId: account?.id || account,
      includePending: Boolean(includePending)
    })) || 0;
    Core.balances = (includePending = false) => new Map(Object.entries(call('balances', { includePending: Boolean(includePending) })));
    Core.totalAvailable = () => Number(call('total_available')) || 0;
    Core.projectedAvailable = () => Number(call('projected_available')) || 0;
    Core.cardOpenTotal = cardId => Number(call('card_open_total', { cardId })) || 0;
    Core.goalCurrent = goalId => Number(call('goal_current', { goalId })) || 0;
    Core.investmentCurrent = investmentId => Number(call('investment_current', { investmentId })) || 0;
    Core.debtBalance = debtId => Number(call('debt_balance', { debtId })) || 0;
    Core.monthSummary = month => call('month_summary', { month });
    Core.categorySpending = month => new Map(Object.entries(call('category_spending', { month })));
    Core.netWorth = () => call('net_worth');
    Core.health = month => call('health', { month });
    Core.calculationEngine = 'python-pyodide';
    Core.calculationEngineVersion = 1;

    const selfTest = call('self_test');
    window.MVFPythonEngine = {
      ready: true,
      runtime: 'Pyodide',
      pythonVersion: pyodide.runPython('import sys; sys.version.split()[0]'),
      pyodideVersion: PYODIDE_VERSION,
      selfTest,
      calculate: call
    };
  }

  async function initialize() {
    try {
      setBoot('Inicializando o motor Python', 'Carregando o interpretador no navegador…');
      if (typeof window.loadPyodide !== 'function') throw new Error('A biblioteca Pyodide não foi carregada.');

      const pyodide = await window.loadPyodide({ indexURL: PYODIDE_BASE });
      setBoot('Inicializando o motor Python', 'Carregando as regras de cálculo financeiro…');

      const response = await fetch(`finance_engine.py?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('O arquivo finance_engine.py não foi encontrado.');
      const source = await response.text();
      pyodide.FS.writeFile('/home/pyodide/finance_engine.py', source, { encoding: 'utf8' });
      pyodide.runPython("import sys\nif '/home/pyodide' not in sys.path: sys.path.insert(0, '/home/pyodide')\nimport finance_engine");
      const engine = pyodide.pyimport('finance_engine');

      installPythonCalculations(pyodide, engine);
      setBoot('Motor Python pronto', 'Abrindo o sistema integrado…');
      await loadApplication();
      setEngineStatus('motor Python ativo', 'ok');
      if (boot) boot.remove();
    } catch (error) {
      console.error('Falha ao inicializar o motor Python.', error);
      window.MVFPythonEngine = { ready: false, error: error.message || String(error) };
      setBoot('Não foi possível iniciar o Python', 'Verifique sua conexão e recarregue a página. Os cálculos não foram iniciados para evitar valores inconsistentes.', true);
      setEngineStatus('motor Python indisponível', 'error');
      const retry = document.getElementById('pythonBootRetry');
      if (retry) retry.hidden = false;
    }
  }

  initialize();
})();
