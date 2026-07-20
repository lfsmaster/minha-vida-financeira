(function () {
  'use strict';

  const KEY = 'mvf_complete_v2';
  const FRAME_ID = 'appFrame';
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const percent = value => `${Math.round(Number(value) || 0)}%`;
  const uid = () => `${Date.now()}${Math.random().toString(36).slice(2)}`;
  const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numeric = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  let updateTimer = null;
  let pendingOpen = false;
  let lastSignature = '';

  const essentialCategories = ['moradia', 'alimentacao', 'transporte', 'saude', 'educacao', 'dividas'];
  const desireCategories = ['lazer', 'compras', 'assinaturas'];

  function readData() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
      return {
        ...stored,
        accounts: Array.isArray(stored.accounts) ? stored.accounts : [],
        transactions: Array.isArray(stored.transactions) ? stored.transactions : [],
        goals: Array.isArray(stored.goals) ? stored.goals : [],
        debts: Array.isArray(stored.debts) ? stored.debts : [],
        investments: Array.isArray(stored.investments) ? stored.investments : [],
        assets: Array.isArray(stored.assets) ? stored.assets : [],
        settings: stored.settings && typeof stored.settings === 'object' ? stored.settings : {}
      };
    } catch (error) {
      console.error('Erro ao ler a base financeira.', error);
      return { accounts: [], transactions: [], goals: [], debts: [], investments: [], assets: [], settings: {} };
    }
  }

  function saveData(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(data) }));
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

  function accountBalances(data) {
    if (window.MVFBalance && typeof window.MVFBalance.calculate === 'function') {
      try { return window.MVFBalance.calculate(data); } catch (error) {}
    }
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
        if (balances.has(accountId)) balances.set(accountId, balances.get(accountId) + amount);
      } else if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
        const accountId = String(transaction.accountId ?? transaction.account ?? '');
        if (balances.has(accountId)) balances.set(accountId, balances.get(accountId) - amount);
      } else if (['transfer', 'transferencia'].includes(type)) {
        const from = String(transaction.fromAccountId ?? transaction.sourceAccountId ?? transaction.accountFromId ?? transaction.originAccountId ?? transaction.accountId ?? '');
        const to = String(transaction.toAccountId ?? transaction.destinationAccountId ?? transaction.accountToId ?? transaction.targetAccountId ?? '');
        if (balances.has(from)) balances.set(from, balances.get(from) - amount);
        if (balances.has(to)) balances.set(to, balances.get(to) + amount);
      }
    });

    return { balances, totalBalance: Array.from(balances.values()).reduce((sum, value) => sum + value, 0) };
  }

  function monthKey(date) {
    return String(date || '').slice(0, 7);
  }

  function currentMonth(documentRef) {
    const field = documentRef.getElementById('monthFilter');
    return field && /^\d{4}-\d{2}$/.test(field.value) ? field.value : new Date().toISOString().slice(0, 7);
  }

  function transactionCategory(transaction) {
    return normalize(transaction.category || transaction.group || transaction.classification || 'outros');
  }

  function monthSummary(data, month) {
    const summary = { income: 0, expense: 0, pendingIncome: 0, pendingExpense: 0, essential: 0, desires: 0, other: 0, debtPayments: 0 };
    data.transactions.forEach(transaction => {
      if (monthKey(transaction.date) !== month) return;
      const type = typeOf(transaction);
      const amount = amountOf(transaction);
      const settled = isSettled(transaction);
      const category = transactionCategory(transaction);
      if (['income', 'receita', 'entrada', 'credit', 'credito'].includes(type)) {
        if (settled) summary.income += amount; else summary.pendingIncome += amount;
      }
      if (['expense', 'despesa', 'saida', 'debit', 'debito'].includes(type)) {
        if (settled) {
          summary.expense += amount;
          if (essentialCategories.includes(category)) summary.essential += amount;
          else if (desireCategories.includes(category)) summary.desires += amount;
          else summary.other += amount;
          if (category === 'dividas' || /parcela|emprestimo|financiamento|cartao/.test(normalize(transaction.description))) summary.debtPayments += amount;
        } else summary.pendingExpense += amount;
      }
    });
    summary.result = summary.income - summary.expense;
    summary.projectedResult = summary.income + summary.pendingIncome - summary.expense - summary.pendingExpense;
    return summary;
  }

  function averageEssentialExpenses(data, referenceMonth) {
    const [year, month] = referenceMonth.split('-').map(Number);
    const values = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const date = new Date(year, month - 1 - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const value = monthSummary(data, key).essential;
      if (value > 0) values.push(value);
    }
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function goalValue(goal) {
    return numeric(goal.current ?? goal.saved ?? goal.accumulated ?? goal.value ?? goal.balance);
  }

  function investmentValue(investment) {
    return numeric(investment.current ?? investment.currentValue ?? investment.value ?? investment.balance ?? investment.amount);
  }

  function reserveAmount(data) {
    const goalReserve = data.goals.filter(goal => /reserva|emergencia/.test(normalize(`${goal.name} ${goal.category} ${goal.description}`))).reduce((sum, goal) => sum + goalValue(goal), 0);
    const investmentReserve = data.investments.filter(item => /reserva|emergencia/.test(normalize(`${item.name} ${item.type} ${item.category} ${item.description}`)) || item.emergencyReserve === true).reduce((sum, item) => sum + investmentValue(item), 0);
    return goalReserve + investmentReserve;
  }

  function debtBalance(debt) {
    const direct = debt.remaining ?? debt.balance ?? debt.outstanding ?? debt.current ?? debt.currentBalance;
    if (direct !== undefined) return Math.max(0, numeric(direct));
    const total = numeric(debt.total ?? debt.amount ?? debt.original ?? debt.originalAmount);
    const paid = numeric(debt.paid ?? debt.paidAmount ?? debt.amortized);
    return Math.max(0, total - paid);
  }

  function debtsTotal(data) {
    return data.debts.reduce((sum, debt) => sum + debtBalance(debt), 0);
  }

  function educationSettings(data) {
    const current = data.settings.education && typeof data.settings.education === 'object' ? data.settings.education : {};
    return {
      emergencyMonths: Math.max(1, numeric(current.emergencyMonths) || 6),
      firstPayPercent: Math.max(1, numeric(current.firstPayPercent) || 10)
    };
  }

  function healthStatus(metrics) {
    if (metrics.totalBalance < 0 || metrics.month.result < 0 || metrics.debtRatio > 50) {
      return { key: 'difficulty', title: 'Em dificuldade', message: 'O orçamento ou o saldo exige atenção imediata.', color: '#d64553' };
    }
    if (metrics.reserveMonths < 3 || metrics.debtRatio > 30) {
      return { key: 'unstable', title: 'Em equilíbrio / instável', message: 'As contas estão controladas, mas a proteção financeira ainda é limitada.', color: '#b77900' };
    }
    return { key: 'healthy', title: 'Financeiramente saudável', message: 'Você paga as contas, mantém reserva e pode avançar nos seus projetos.', color: '#16875f' };
  }

  function calculate(data, month) {
    const settings = educationSettings(data);
    const balances = accountBalances(data);
    const monthData = monthSummary(data, month);
    const averageEssential = averageEssentialExpenses(data, month) || monthData.essential;
    const reserve = reserveAmount(data);
    const targetReserve = averageEssential * settings.emergencyMonths;
    const debtTotal = debtsTotal(data);
    const debtRatio = monthData.income > 0 ? (monthData.debtPayments / monthData.income) * 100 : (debtTotal > 0 ? 100 : 0);
    const reserveMonths = averageEssential > 0 ? reserve / averageEssential : 0;
    const savingsRate = monthData.income > 0 ? Math.max(-100, (monthData.result / monthData.income) * 100) : 0;
    const firstPay = monthData.income * settings.firstPayPercent / 100;
    const metrics = { settings, balances, month: monthData, averageEssential, reserve, targetReserve, debtTotal, debtRatio, reserveMonths, savingsRate, firstPay, totalBalance: balances.totalBalance };
    metrics.health = healthStatus(metrics);
    return metrics;
  }

  function injectStyles(documentRef) {
    if (documentRef.getElementById('educationFinancialStyles')) return;
    const style = documentRef.createElement('style');
    style.id = 'educationFinancialStyles';
    style.textContent = `
      .eduHero{border-radius:20px;padding:20px;background:linear-gradient(135deg,#0b683f,#16875f);color:white;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}.eduHero h2{margin:0 0 6px}.eduHero p{margin:0;color:#d9f5e8}.eduBadge{padding:9px 13px;border-radius:999px;background:rgba(255,255,255,.16);font-weight:900;white-space:nowrap}.eduGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px}.eduCard{background:var(--panel,#fff);border:1px solid var(--line,#e4e9f1);border-radius:17px;padding:16px}.eduCard small{color:var(--muted,#68758b)}.eduValue{font-size:22px;font-weight:900;margin-top:7px}.eduTwo{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.eduBar{height:10px;background:var(--panel2,#eef2f7);border-radius:99px;overflow:hidden;margin:9px 0}.eduBar i{display:block;height:100%;background:#16875f}.eduList{display:grid;gap:8px}.eduItem{border:1px solid var(--line,#e4e9f1);border-radius:12px;padding:11px}.eduControls{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.eduControls label{font-size:12px;font-weight:800}.eduControls select{display:block;margin-top:5px;padding:9px;border:1px solid var(--line,#e4e9f1);border-radius:9px;background:var(--panel,#fff);color:var(--ink,#172033)}.eduStatusCard{margin-top:12px;border-left:5px solid #16875f}.eduHelp{font-size:12px;color:var(--muted,#68758b);line-height:1.5}.eduDashboard{margin-top:12px;border-left:5px solid #16875f}.eduDashboard strong{font-size:16px}.eduDashboard p{margin:5px 0 0;color:var(--muted,#68758b)}
      @media(max-width:1050px){.eduGrid{grid-template-columns:1fr 1fr}.eduTwo{grid-template-columns:1fr}}@media(max-width:650px){.eduHero{grid-template-columns:1fr}.eduGrid{grid-template-columns:1fr}}
    `;
    documentRef.head.appendChild(style);
  }

  function ensurePage(documentRef) {
    injectStyles(documentRef);
    let section = documentRef.getElementById('page-financial-health');
    if (!section) {
      section = documentRef.createElement('section');
      section.id = 'page-financial-health';
      section.className = 'page';
      const reports = documentRef.getElementById('page-reports');
      if (reports && reports.parentNode) reports.parentNode.insertBefore(section, reports);
      else documentRef.querySelector('main')?.appendChild(section);
    }

    const nav = documentRef.getElementById('nav');
    if (nav && !documentRef.getElementById('financialHealthNav')) {
      const button = documentRef.createElement('button');
      button.id = 'financialHealthNav';
      button.type = 'button';
      button.textContent = 'Saúde financeira';
      const reportsButton = Array.from(nav.querySelectorAll('button')).find(item => item.dataset.page === 'reports');
      if (reportsButton) nav.insertBefore(button, reportsButton); else nav.appendChild(button);
      button.addEventListener('click', () => openHealthPage());
    }

    return section;
  }

  function renderDashboardSummary(documentRef, metrics) {
    const dashboard = documentRef.getElementById('page-dashboard');
    if (!dashboard) return;
    let card = documentRef.getElementById('financialHealthDashboard');
    if (!card) {
      card = documentRef.createElement('div');
      card.id = 'financialHealthDashboard';
      card.className = 'card eduDashboard';
      const metricsGrid = dashboard.querySelector('.metrics');
      if (metricsGrid) metricsGrid.insertAdjacentElement('afterend', card); else dashboard.prepend(card);
      card.addEventListener('click', openHealthPage);
      card.style.cursor = 'pointer';
    }
    card.style.borderLeftColor = metrics.health.color;
    card.innerHTML = `<strong>Saúde financeira: ${metrics.health.title}</strong><p>${metrics.health.message} Resultado do mês: ${money.format(metrics.month.result)} · Reserva: ${metrics.reserveMonths.toFixed(1)} mês(es).</p>`;
  }

  function renderPage(documentRef, data, metrics) {
    const section = ensurePage(documentRef);
    const budgetTitle = metrics.month.result > 0 ? 'Superavitário' : metrics.month.result < 0 ? 'Deficitário' : 'Neutro';
    const budgetColor = metrics.month.result > 0 ? '#16875f' : metrics.month.result < 0 ? '#d64553' : '#b77900';
    const reserveProgress = metrics.targetReserve > 0 ? Math.min(100, metrics.reserve / metrics.targetReserve * 100) : 0;
    const essentialShare = metrics.month.expense > 0 ? metrics.month.essential / metrics.month.expense * 100 : 0;
    const desireShare = metrics.month.expense > 0 ? metrics.month.desires / metrics.month.expense * 100 : 0;
    const recommendations = [];
    if (metrics.month.result < 0) recommendations.push('Revise despesas e busque tornar o orçamento superavitário.');
    if (metrics.reserveMonths < 3) recommendations.push('Priorize a reserva de emergência antes de assumir novas despesas não essenciais.');
    if (metrics.debtRatio > 30) recommendations.push('O comprometimento da renda com dívidas está elevado; priorize a quitação das mais caras.');
    if (desireShare > 30) recommendations.push('Os desejos representam uma parcela relevante das despesas; avalie compras adiáveis.');
    if (!recommendations.length) recommendations.push('Mantenha o registro frequente, acompanhe o orçamento e revise seus projetos periodicamente.');

    section.innerHTML = `
      <div class="eduHero"><div><h2>Saúde e cidadania financeira</h2><p>Planejamento, registro, agrupamento e avaliação das suas decisões financeiras.</p></div><div class="eduBadge" style="background:${metrics.health.color}">${metrics.health.title}</div></div>
      <div class="eduGrid">
        <div class="eduCard"><small>Situação do orçamento</small><div class="eduValue" style="color:${budgetColor}">${budgetTitle}</div><div class="eduHelp">Receitas ${money.format(metrics.month.income)} · Despesas ${money.format(metrics.month.expense)}</div></div>
        <div class="eduCard"><small>Taxa de poupança</small><div class="eduValue">${percent(metrics.savingsRate)}</div><div class="eduHelp">Resultado realizado dividido pela receita do mês.</div></div>
        <div class="eduCard"><small>Reserva de emergência</small><div class="eduValue">${metrics.reserveMonths.toFixed(1)} mês(es)</div><div class="eduHelp">${money.format(metrics.reserve)} acumulados.</div></div>
        <div class="eduCard"><small>Comprometimento com dívidas</small><div class="eduValue">${percent(metrics.debtRatio)}</div><div class="eduHelp">Saldo devedor cadastrado: ${money.format(metrics.debtTotal)}.</div></div>
      </div>
      <div class="eduTwo">
        <div class="eduCard"><h3>Reserva e proteção</h3><div class="eduHelp">Meta calculada com base na média das despesas essenciais dos últimos meses.</div><div class="eduBar"><i style="width:${reserveProgress}%"></i></div><strong>${money.format(metrics.reserve)} de ${money.format(metrics.targetReserve)}</strong><div class="eduControls" style="margin-top:14px"><label>Meses de proteção<select id="eduEmergencyMonths"><option value="3">3 meses</option><option value="6">6 meses</option><option value="9">9 meses</option><option value="12">12 meses</option></select></label><button class="btn primary" id="eduCreateReserve" type="button">Criar meta de reserva</button></div></div>
        <div class="eduCard"><h3>Pagar-se primeiro</h3><p class="eduHelp">Separe uma parcela da receita assim que ela entrar, antes do consumo.</p><div class="eduValue">${money.format(metrics.firstPay)} por mês</div><div class="eduControls"><label>Percentual da renda<select id="eduFirstPay"><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option></select></label></div></div>
      </div>
      <div class="eduTwo">
        <div class="eduCard"><h3>Necessidades e desejos</h3><div class="eduItem"><strong>Necessidades: ${money.format(metrics.month.essential)}</strong><div class="eduHelp">${percent(essentialShare)} das despesas — moradia, alimentação, transporte, saúde, educação e dívidas.</div></div><div class="eduItem" style="margin-top:8px"><strong>Desejos: ${money.format(metrics.month.desires)}</strong><div class="eduHelp">${percent(desireShare)} das despesas — lazer, compras e assinaturas.</div></div></div>
        <div class="eduCard"><h3>Orientações do mês</h3><div class="eduList">${recommendations.map(text => `<div class="eduItem">${text}</div>`).join('')}</div></div>
      </div>
      <div class="eduCard eduStatusCard" style="border-left-color:${metrics.health.color}"><h3>${metrics.health.title}</h3><p>${metrics.health.message}</p><div class="eduHelp">Saldo total calculado: ${money.format(metrics.totalBalance)} · Resultado projetado do mês: ${money.format(metrics.month.projectedResult)}.</div></div>
    `;

    const emergency = section.querySelector('#eduEmergencyMonths');
    const firstPay = section.querySelector('#eduFirstPay');
    emergency.value = String(metrics.settings.emergencyMonths);
    firstPay.value = String(metrics.settings.firstPayPercent);

    emergency.onchange = () => updateEducationSetting('emergencyMonths', Number(emergency.value));
    firstPay.onchange = () => updateEducationSetting('firstPayPercent', Number(firstPay.value));
    section.querySelector('#eduCreateReserve').onclick = createReserveGoal;
  }

  function updateEducationSetting(key, value) {
    const data = readData();
    data.settings = data.settings || {};
    data.settings.education = { ...(data.settings.education || {}), [key]: value };
    saveData(data);
    scheduleUpdate();
  }

  function createReserveGoal() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame || !frame.contentDocument) return;
    const data = readData();
    const metrics = calculate(data, currentMonth(frame.contentDocument));
    const existing = data.goals.find(goal => /reserva|emergencia/.test(normalize(`${goal.name} ${goal.category}`)));
    if (existing) {
      existing.target = metrics.targetReserve || existing.target || 0;
      existing.monthlyContribution = metrics.firstPay;
    } else {
      data.goals.push({ id: uid(), name: 'Reserva de emergência', target: metrics.targetReserve, current: 0, date: '', category: 'Proteção financeira', monthlyContribution: metrics.firstPay, createdAt: new Date().toISOString() });
    }
    saveData(data);
    alert(existing ? 'A meta de reserva foi atualizada.' : 'A meta Reserva de emergência foi criada.');
    scheduleUpdate();
  }

  function openHealthPage() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    let isIndex = false;
    try { isIndex = frame.contentWindow.location.pathname.endsWith('/index.html') || frame.contentWindow.location.pathname.endsWith('/minha-vida-financeira/'); } catch (error) {}
    if (!isIndex) {
      pendingOpen = true;
      frame.src = `index.html?section=financial-health&refresh=${Date.now()}`;
      return;
    }
    const documentRef = frame.contentDocument;
    ensurePage(documentRef);
    documentRef.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    documentRef.getElementById('page-financial-health')?.classList.add('active');
    documentRef.querySelectorAll('#nav button').forEach(button => button.classList.remove('active'));
    documentRef.getElementById('financialHealthNav')?.classList.add('active');
    const title = documentRef.getElementById('pageTitle');
    if (title) title.textContent = 'Saúde financeira';
    renderAll();
  }

  function renderAll() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame || !frame.contentDocument) return;
    let pathname = '';
    try { pathname = frame.contentWindow.location.pathname; } catch (error) { return; }
    if (!pathname.endsWith('/index.html') && !pathname.endsWith('/minha-vida-financeira/')) return;
    const documentRef = frame.contentDocument;
    const data = readData();
    const signature = JSON.stringify({ accounts: data.accounts, transactions: data.transactions, goals: data.goals, debts: data.debts, investments: data.investments, education: data.settings.education, month: currentMonth(documentRef) });
    const metrics = calculate(data, currentMonth(documentRef));
    ensurePage(documentRef);
    renderPage(documentRef, data, metrics);
    renderDashboardSummary(documentRef, metrics);
    lastSignature = signature;
  }

  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(renderAll, 100);
  }

  function watch() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    frame.addEventListener('load', () => {
      scheduleUpdate();
      setTimeout(scheduleUpdate, 350);
      if (pendingOpen || new URL(frame.src, location.href).searchParams.get('section') === 'financial-health') {
        pendingOpen = false;
        setTimeout(openHealthPage, 450);
      }
      try {
        frame.contentDocument.addEventListener('click', scheduleUpdate, true);
        frame.contentDocument.addEventListener('submit', scheduleUpdate, true);
        frame.contentDocument.addEventListener('change', scheduleUpdate, true);
      } catch (error) {}
    });
    window.addEventListener('storage', event => { if (event.key === KEY) scheduleUpdate(); });
    setInterval(() => {
      const data = readData();
      const signature = JSON.stringify({ accounts: data.accounts, transactions: data.transactions, goals: data.goals, debts: data.debts, investments: data.investments, education: data.settings.education });
      if (!lastSignature || !lastSignature.includes(signature.slice(0, Math.min(80, signature.length)))) scheduleUpdate();
    }, 1200);
  }

  window.MVFEducation = { open: openHealthPage, update: renderAll, calculate };
  watch();
  scheduleUpdate();
})();