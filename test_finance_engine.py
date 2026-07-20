import pytest
from finance_engine import _account_balance

def test_account_balance_no_account():
    # Test when the account is not found in the state
    state = {
        "accounts": [
            {"id": "acc1", "initial": 100.0}
        ],
        "transactions": []
    }
    assert _account_balance(state, "acc2") == 0.0

def test_account_balance_initial_balance_variations():
    # Test different initial balance properties
    state = {
        "accounts": [
            {"id": "acc1", "initial": 100.0},
            {"id": "acc2", "initialBalance": 200.0},
            {"id": "acc3", "openingBalance": 300.0},
            {"id": "acc4", "balanceInitial": 400.0},
            {"id": "acc5"} # No initial balance, should default to 0
        ],
        "transactions": []
    }
    assert _account_balance(state, "acc1") == 100.0
    assert _account_balance(state, "acc2") == 200.0
    assert _account_balance(state, "acc3") == 300.0
    assert _account_balance(state, "acc4") == 400.0
    assert _account_balance(state, "acc5") == 0.0

def test_account_balance_transactions():
    # Test how different kinds of transactions affect the balance
    state = {
        "accounts": [
            {"id": "acc1", "initial": 1000.0},
            {"id": "acc2", "initial": 500.0}
        ],
        "transactions": [
            # Income
            {"accountId": "acc1", "kind": "income", "amount": 500.0, "status": "paid"},
            # Expense
            {"accountId": "acc1", "kind": "expense", "amount": 200.0, "status": "paid"},
            # Debt payment
            {"accountId": "acc1", "kind": "debt_payment", "amount": 100.0, "status": "paid"},
            # Allocation
            {"fromAccountId": "acc1", "kind": "allocation", "amount": 150.0, "status": "paid"},
            # Transfer out
            {"fromAccountId": "acc1", "toAccountId": "acc2", "kind": "transfer", "amount": 300.0, "status": "paid"}
        ]
    }

    # acc1: 1000 + 500 - 200 - 100 - 150 - 300 = 750
    assert _account_balance(state, "acc1") == 750.0

    # acc2: 500 + 300 = 800
    assert _account_balance(state, "acc2") == 800.0

def test_account_balance_pending_transactions():
    # Test with pending transactions
    state = {
        "accounts": [
            {"id": "acc1", "initial": 1000.0}
        ],
        "transactions": [
            # Paid Income
            {"accountId": "acc1", "kind": "income", "amount": 500.0, "status": "paid"},
            # Pending Expense
            {"accountId": "acc1", "kind": "expense", "amount": 200.0, "status": "pending"}
        ]
    }

    # include_pending=False: 1000 + 500 = 1500
    assert _account_balance(state, "acc1", include_pending=False) == 1500.0

    # include_pending=True: 1000 + 500 - 200 = 1300
    assert _account_balance(state, "acc1", include_pending=True) == 1300.0

def test_account_balance_invalid_values():
    state = {
        "accounts": [
            {"id": "acc1", "initial": "invalid"},
            {"id": "acc2", "initial": None},
        ],
        "transactions": [
            {"accountId": "acc1", "kind": "income", "amount": "invalid", "status": "paid"},
            {"accountId": "acc2", "kind": "income", "amount": None, "status": "paid"}
        ]
    }
    assert _account_balance(state, "acc1") == 0.0
    assert _account_balance(state, "acc2") == 0.0
