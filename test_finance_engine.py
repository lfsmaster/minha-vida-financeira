import pytest
from finance_engine import _total_available, _projected_available

def test_total_available_empty_state():
    assert _total_available({}) == 0.0

def test_total_available_with_balances():
    state = {
        "accounts": [
            {"id": "acc1", "initialBalance": 100.0},
            {"id": "acc2", "initialBalance": 250.5}
        ],
        "transactions": []
    }
    assert _total_available(state) == 350.5

def test_total_available_with_transactions():
    state = {
        "accounts": [
            {"id": "acc1", "initialBalance": 100.0},
            {"id": "acc2", "initialBalance": 200.0}
        ],
        "transactions": [
            # Paid income to acc1 -> +50
            {"id": "t1", "accountId": "acc1", "amount": 50.0, "kind": "income", "status": "paid"},
            # Pending income to acc2 -> ignored (since include_pending is False for _total_available)
            {"id": "t2", "accountId": "acc2", "amount": 100.0, "kind": "income", "status": "pending"},
            # Paid expense from acc2 -> -30
            {"id": "t3", "accountId": "acc2", "amount": 30.0, "kind": "expense", "status": "paid"},
            # Transfer from acc1 to acc2 -> acc1: -20, acc2: +20
            {"id": "t4", "fromAccountId": "acc1", "toAccountId": "acc2", "amount": 20.0, "kind": "transfer", "status": "paid"}
        ]
    }
    # acc1: 100 + 50 - 20 = 130
    # acc2: 200 - 30 + 20 = 190
    # Total = 320
    assert _total_available(state) == 320.0

def test_projected_available():
    state = {
        "accounts": [
            {"id": "acc1", "initialBalance": 100.0}
        ],
        "transactions": [
            # Pending income -> +50 in projection
            {"id": "t1", "accountId": "acc1", "amount": 50.0, "kind": "income", "status": "pending"},
            # Pending expense -> -20 in projection
            {"id": "t2", "accountId": "acc1", "amount": 20.0, "kind": "expense", "status": "pending"},
            # Paid income -> already in _total_available, ignored in projection loop
            {"id": "t3", "accountId": "acc1", "amount": 200.0, "kind": "income", "status": "paid"}
        ],
        "cardPurchases": [
            # Unpaid card purchase -> -30 in projection
            {"id": "c1", "amount": 30.0, "status": "pending"},
            # Paid card purchase -> ignored
            {"id": "c2", "amount": 100.0, "status": "paid"}
        ]
    }
    # _total_available:
    # acc1 initial: 100.0
    # acc1 paid income: +200.0
    # Total available: 300.0
    #
    # Projection:
    # Pending income: +50.0
    # Pending expense: -20.0
    # Open card purchases: -30.0
    # Projected: 300 + 50 - 20 - 30 = 300
    assert _total_available(state) == 300.0
    assert _projected_available(state) == 300.0
