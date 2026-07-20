"""Motor central de cálculos financeiros executado no navegador via Pyodide."""

from __future__ import annotations

import json
import math
import unicodedata
from datetime import date
from typing import Any, Dict, Iterable, List, Mapping

ESSENTIAL_CATEGORIES = {
    "alimentacao",
    "moradia",
    "transporte",
    "saude",
    "educacao",
    "dividas",
}


def _number(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def _amount(value: Any) -> float:
    return abs(_number(value))


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _normalize(value: Any) -> str:
    normalized = unicodedata.normalize("NFD", _text(value).lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _items(state: Mapping[str, Any], key: str) -> List[Dict[str, Any]]:
    value = state.get(key, [])
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _month_key(value: Any) -> str:
    return _text(value)[:7]


def _is_paid(transaction: Mapping[str, Any]) -> bool:
    status = _normalize(transaction.get("status"))
    return not status or status in {
        "paid", "pago", "paga", "received", "recebido", "recebida",
        "realized", "realizado", "realizada", "completed", "concluido", "concluida",
    }


def _kind(transaction: Mapping[str, Any]) -> str:
    return _normalize(transaction.get("kind") or transaction.get("type"))


def _movement(transaction: Mapping[str, Any], account_id: str, include_pending: bool = False) -> float:
    if not include_pending and not _is_paid(transaction):
        return 0.0
    kind = _kind(transaction)
    amount = _amount(transaction.get("amount", transaction.get("value")))
    account_id = _text(account_id)
    if kind == "income" and _text(transaction.get("accountId")) == account_id:
        return amount
    if kind in {"expense", "debt_payment"} and _text(transaction.get("accountId")) == account_id:
        return -amount
    if kind == "allocation" and _text(transaction.get("fromAccountId")) == account_id:
        return -amount
    if kind == "transfer":
        movement = 0.0
        if _text(transaction.get("fromAccountId")) == account_id:
            movement -= amount
        if _text(transaction.get("toAccountId")) == account_id:
            movement += amount
        return movement
    return 0.0


def _account_balance(state: Mapping[str, Any], account_id: str, include_pending: bool = False, account: Any = None) -> float:
    if account is None:
        account = next((item for item in _items(state, "accounts") if _text(item.get("id")) == _text(account_id)), None)
    if not account:
        return 0.0
    initial = _number(account.get("initial", account.get("initialBalance", account.get("openingBalance", account.get("balanceInitial", 0)))))
    return initial + sum(_movement(transaction, _text(account.get("id")), include_pending) for transaction in _items(state, "transactions"))


def _balances(state: Mapping[str, Any], include_pending: bool = False) -> Dict[str, float]:
    return {_text(account.get("id")): _account_balance(state, _text(account.get("id")), include_pending, account) for account in _items(state, "accounts")}


def _total_available(state: Mapping[str, Any]) -> float:
    return sum(_balances(state, False).values())


def _card_open_total(state: Mapping[str, Any], card_id: str) -> float:
    return sum(_amount(purchase.get("amount", purchase.get("value"))) for purchase in _items(state, "cardPurchases") if _text(purchase.get("cardId")) == _text(card_id) and _normalize(purchase.get("status")) != "paid")


def _all_open_cards(state: Mapping[str, Any]) -> float:
    return sum(_amount(purchase.get("amount", purchase.get("value"))) for purchase in _items(state, "cardPurchases") if _normalize(purchase.get("status")) != "paid")


def _projected_available(state: Mapping[str, Any]) -> float:
    projected = _total_available(state)
    for transaction in _items(state, "transactions"):
        if _is_paid(transaction):
            continue
        kind = _kind(transaction)
        amount = _amount(transaction.get("amount", transaction.get("value")))
        if kind == "income":
            projected += amount
        elif kind in {"expense", "debt_payment", "allocation"}:
            projected -= amount
    return projected - _all_open_cards(state)


def _goal_current(state: Mapping[str, Any], goal_id: str) -> float:
    goal = next((item for item in _items(state, "goals") if _text(item.get("id")) == _text(goal_id)), None)
    base = _amount((goal or {}).get("baseAmount", (goal or {}).get("current", (goal or {}).get("saved", (goal or {}).get("accumulated", 0)))))
    contributions = sum(_amount(transaction.get("amount")) for transaction in _items(state, "transactions") if _kind(transaction) == "allocation" and _normalize(transaction.get("targetType")) == "goal" and _text(transaction.get("targetId")) == _text(goal_id) and _is_paid(transaction))
    return base + contributions


def _investment_current(state: Mapping[str, Any], investment_id: str) -> float:
    investment = next((item for item in _items(state, "investments") if _text(item.get("id")) == _text(investment_id)), None)
    base = _amount((investment or {}).get("baseAmount", (investment or {}).get("current", (investment or {}).get("currentValue", (investment or {}).get("value", (investment or {}).get("balance", (investment or {}).get("amount", 0)))))))
    contributions = sum(_amount(transaction.get("amount")) for transaction in _items(state, "transactions") if _kind(transaction) == "allocation" and _normalize(transaction.get("targetType")) == "investment" and _text(transaction.get("targetId")) == _text(investment_id) and _is_paid(transaction))
    return base + contributions


def _debt_balance(state: Mapping[str, Any], debt_id: str) -> float:
    debt = next((item for item in _items(state, "debts") if _text(item.get("id")) == _text(debt_id)), None)
    if not debt:
        return 0.0
    original = _amount(debt.get("originalBalance", debt.get("remaining", debt.get("balance", debt.get("outstanding", debt.get("amount", 0))))))
    paid = sum(_amount(transaction.get("amount")) for transaction in _items(state, "transactions") if _kind(transaction) == "debt_payment" and _text(transaction.get("debtId")) == _text(debt_id) and _is_paid(transaction))
    return max(0.0, original - paid)


def _month_summary(state: Mapping[str, Any], month: str) -> Dict[str, float]:
    summary = {"income": 0.0, "cashExpenses": 0.0, "spending": 0.0, "savings": 0.0, "pendingIncome": 0.0, "pendingExpense": 0.0}
    for transaction in _items(state, "transactions"):
        if _month_key(transaction.get("date")) != month:
            continue
        kind = _kind(transaction)
        amount = _amount(transaction.get("amount", transaction.get("value")))
        paid = _is_paid(transaction)
        if kind == "income":
            summary["income" if paid else "pendingIncome"] += amount
        elif kind == "expense":
            summary["cashExpenses" if paid else "pendingExpense"] += amount
            if not bool(transaction.get("excludeFromBudget")):
                summary["spending"] += amount
        elif kind == "debt_payment" and paid:
            summary["cashExpenses"] += amount
            summary["spending"] += amount
        elif kind == "allocation" and paid:
            summary["savings"] += amount
    for purchase in _items(state, "cardPurchases"):
        if _month_key(purchase.get("date")) == month:
            summary["spending"] += _amount(purchase.get("amount", purchase.get("value")))
    summary["cashResult"] = summary["income"] - summary["cashExpenses"] - summary["savings"]
    summary["budgetResult"] = summary["income"] - summary["spending"]
    return summary


def _category_spending(state: Mapping[str, Any], month: str) -> Dict[str, float]:
    result: Dict[str, float] = {}
    def add(category: Any, value: Any) -> None:
        name = _text(category) or "Outros"
        result[name] = result.get(name, 0.0) + _amount(value)
    for transaction in _items(state, "transactions"):
        if _month_key(transaction.get("date")) != month or not _is_paid(transaction):
            continue
        kind = _kind(transaction)
        if kind == "expense" and not bool(transaction.get("excludeFromBudget")):
            add(transaction.get("category"), transaction.get("amount"))
        elif kind == "debt_payment":
            add("Dívidas", transaction.get("amount"))
    for purchase in _items(state, "cardPurchases"):
        if _month_key(purchase.get("date")) == month:
            add(purchase.get("category"), purchase.get("amount"))
    return result


def _net_worth(state: Mapping[str, Any]) -> Dict[str, float]:
    cash = _total_available(state)
    goals = sum(_goal_current(state, _text(goal.get("id"))) for goal in _items(state, "goals"))
    investments = sum(_investment_current(state, _text(investment.get("id"))) for investment in _items(state, "investments"))
    assets = sum(_amount(asset.get("value", asset.get("amount"))) for asset in _items(state, "assets"))
    debts = sum(_debt_balance(state, _text(debt.get("id"))) for debt in _items(state, "debts"))
    liquid = cash + goals + investments - debts
    return {"cash": cash, "goals": goals, "investments": investments, "assets": assets, "debts": debts, "liquid": liquid, "total": liquid + assets}


def _essential_spending(state: Mapping[str, Any], month: str) -> float:
    categories = _category_spending(state, month)
    return sum(value for category, value in categories.items() if _normalize(category) in ESSENTIAL_CATEGORIES)


def _previous_months(month: str, count: int = 3) -> Iterable[str]:
    try:
        year, month_number = (int(part) for part in month.split("-", 1))
    except (TypeError, ValueError):
        today = date.today()
        year, month_number = today.year, today.month
    for offset in range(count):
        value = year * 12 + (month_number - 1) - offset
        yield f"{value // 12:04d}-{value % 12 + 1:02d}"


def _reserve_amount(state: Mapping[str, Any]) -> float:
    goal_reserve = sum(_goal_current(state, _text(goal.get("id"))) for goal in _items(state, "goals") if "reserva" in _normalize(f"{goal.get('name', '')} {goal.get('category', '')}") or "emergencia" in _normalize(f"{goal.get('name', '')} {goal.get('category', '')}"))
    investment_reserve = sum(_investment_current(state, _text(investment.get("id"))) for investment in _items(state, "investments") if bool(investment.get("emergencyReserve")) or "reserva" in _normalize(f"{investment.get('name', '')} {investment.get('type', '')}") or "emergencia" in _normalize(f"{investment.get('name', '')} {investment.get('type', '')}"))
    return goal_reserve + investment_reserve


def _health(state: Mapping[str, Any], month: str) -> Dict[str, Any]:
    summary = _month_summary(state, month)
    worth = _net_worth(state)
    essential_values = [value for key in _previous_months(month, 3) if (value := _essential_spending(state, key)) > 0]
    average_essential = sum(essential_values) / len(essential_values) if essential_values else 0.0
    reserve = _reserve_amount(state)
    reserve_months = reserve / average_essential if average_essential > 0 else 0.0
    debt_payments = sum(_amount(transaction.get("amount")) for transaction in _items(state, "transactions") if _month_key(transaction.get("date")) == month and _kind(transaction) == "debt_payment" and _is_paid(transaction))
    debt_ratio = debt_payments / summary["income"] * 100 if summary["income"] > 0 else (100.0 if worth["debts"] > 0 else 0.0)
    if worth["cash"] < 0 or summary["budgetResult"] < 0 or debt_ratio > 50:
        label = "Em dificuldade"
    elif reserve_months < 3 or debt_ratio > 30:
        label = "Em equilíbrio / instável"
    else:
        label = "Financeiramente saudável"
    return {"label": label, "reserve": reserve, "reserveMonths": reserve_months, "averageEssential": average_essential, "debtRatio": debt_ratio, "summary": summary, "worth": worth}


def calculate(operation: str, state_json: str, argument_json: str = "null") -> str:
    """Executa uma operação e devolve JSON para a camada JavaScript."""
    try:
        state = json.loads(state_json or "{}")
        argument = json.loads(argument_json or "null")
        if not isinstance(state, dict):
            state = {}
    except (TypeError, ValueError, json.JSONDecodeError):
        state, argument = {}, None
    options = argument if isinstance(argument, dict) else {}
    operation = _text(operation)
    if operation == "account_balance":
        result: Any = _account_balance(state, options.get("accountId", ""), bool(options.get("includePending")))
    elif operation == "balances":
        result = _balances(state, bool(options.get("includePending")))
    elif operation == "total_available":
        result = _total_available(state)
    elif operation == "projected_available":
        result = _projected_available(state)
    elif operation == "card_open_total":
        result = _card_open_total(state, options.get("cardId", ""))
    elif operation == "goal_current":
        result = _goal_current(state, options.get("goalId", ""))
    elif operation == "investment_current":
        result = _investment_current(state, options.get("investmentId", ""))
    elif operation == "debt_balance":
        result = _debt_balance(state, options.get("debtId", ""))
    elif operation == "month_summary":
        result = _month_summary(state, _text(options.get("month")))
    elif operation == "category_spending":
        result = _category_spending(state, _text(options.get("month")))
    elif operation == "net_worth":
        result = _net_worth(state)
    elif operation == "health":
        result = _health(state, _text(options.get("month")))
    elif operation == "self_test":
        result = {"engine": "python", "version": 1, "accounts": len(_items(state, "accounts")), "transactions": len(_items(state, "transactions")), "totalAvailable": _total_available(state)}
    else:
        raise ValueError(f"Operação de cálculo desconhecida: {operation}")
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))
