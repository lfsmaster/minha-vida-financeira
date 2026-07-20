import time
import json
import random
from finance_engine import _reserve_amount, _goal_current, _investment_current, _items, _text, _normalize, _amount, _kind, _is_paid

def generate_state(num_goals, num_investments, num_transactions):
    state = {
        "goals": [],
        "investments": [],
        "transactions": []
    }
    for i in range(num_goals):
        state["goals"].append({
            "id": f"goal_{i}",
            "name": f"Goal {i} reserva",
            "baseAmount": 100
        })
    for i in range(num_investments):
        state["investments"].append({
            "id": f"inv_{i}",
            "name": f"Investment {i}",
            "type": "reserva",
            "baseAmount": 200
        })
    for i in range(num_transactions):
        state["transactions"].append({
            "amount": 10,
            "kind": "allocation",
            "targetType": "goal" if i % 2 == 0 else "investment",
            "targetId": f"goal_{i % num_goals}" if i % 2 == 0 else f"inv_{i % num_investments}",
            "status": "paid"
        })
    return state

state = generate_state(100, 100, 10000)

def _reserve_amount_optimized(state):
    reserve_goal_ids = set()
    reserve_investment_ids = set()
    total = 0.0

    for goal in _items(state, "goals"):
        if "reserva" in _normalize(f"{goal.get('name', '')} {goal.get('category', '')}") or "emergencia" in _normalize(f"{goal.get('name', '')} {goal.get('category', '')}"):
            goal_id = _text(goal.get("id"))
            reserve_goal_ids.add(goal_id)
            total += _amount(goal.get("baseAmount", goal.get("current", goal.get("saved", goal.get("accumulated", 0)))))

    for investment in _items(state, "investments"):
        if bool(investment.get("emergencyReserve")) or "reserva" in _normalize(f"{investment.get('name', '')} {investment.get('type', '')}") or "emergencia" in _normalize(f"{investment.get('name', '')} {investment.get('type', '')}"):
            investment_id = _text(investment.get("id"))
            reserve_investment_ids.add(investment_id)
            total += _amount(investment.get("baseAmount", investment.get("current", investment.get("currentValue", investment.get("value", investment.get("balance", investment.get("amount", 0)))))))

    for transaction in _items(state, "transactions"):
        if _kind(transaction) == "allocation" and _is_paid(transaction):
            target_type = _normalize(transaction.get("targetType"))
            target_id = _text(transaction.get("targetId"))
            if target_type == "goal" and target_id in reserve_goal_ids:
                total += _amount(transaction.get("amount"))
            elif target_type == "investment" and target_id in reserve_investment_ids:
                total += _amount(transaction.get("amount"))

    return total

print("Checking correctness:")
print(f"Original: {_reserve_amount(state)}")
print(f"Optimized: {_reserve_amount_optimized(state)}")

start = time.perf_counter()
for _ in range(10):
    _reserve_amount(state)
end = time.perf_counter()
print(f"Original Time: {end - start:.5f}s")

start = time.perf_counter()
for _ in range(10):
    _reserve_amount_optimized(state)
end = time.perf_counter()
print(f"Optimized Time: {end - start:.5f}s")
