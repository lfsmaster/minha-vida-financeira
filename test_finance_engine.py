import unittest
from typing import Any, Mapping
from finance_engine import _movement

class TestMovement(unittest.TestCase):
    def test_income(self):
        transaction = {"kind": "income", "amount": 150.0, "accountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction, "acc1"), 150.0)

    def test_expense_and_debt_payment(self):
        transaction_expense = {"kind": "expense", "amount": 50.0, "accountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction_expense, "acc1"), -50.0)

        transaction_debt = {"kind": "debt_payment", "amount": 75.0, "accountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction_debt, "acc1"), -75.0)

    def test_allocation(self):
        transaction = {"kind": "allocation", "amount": 100.0, "fromAccountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction, "acc1"), -100.0)

    def test_transfer(self):
        transaction = {"kind": "transfer", "amount": 200.0, "fromAccountId": "acc1", "toAccountId": "acc2", "status": "paid"}
        # From account
        self.assertEqual(_movement(transaction, "acc1"), -200.0)
        # To account
        self.assertEqual(_movement(transaction, "acc2"), 200.0)
        # Same account (transfer to self)
        transaction_self = {"kind": "transfer", "amount": 200.0, "fromAccountId": "acc1", "toAccountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction_self, "acc1"), 0.0)

    def test_unrelated_accounts(self):
        transaction_income = {"kind": "income", "amount": 150.0, "accountId": "acc2", "status": "paid"}
        self.assertEqual(_movement(transaction_income, "acc1"), 0.0)

        transaction_expense = {"kind": "expense", "amount": 50.0, "accountId": "acc2", "status": "paid"}
        self.assertEqual(_movement(transaction_expense, "acc1"), 0.0)

        transaction_transfer = {"kind": "transfer", "amount": 200.0, "fromAccountId": "acc2", "toAccountId": "acc3", "status": "paid"}
        self.assertEqual(_movement(transaction_transfer, "acc1"), 0.0)

    def test_pending_transactions(self):
        transaction = {"kind": "income", "amount": 150.0, "accountId": "acc1", "status": "pending"}
        # Should be 0 when include_pending is False
        self.assertEqual(_movement(transaction, "acc1", include_pending=False), 0.0)
        # Should return amount when include_pending is True
        self.assertEqual(_movement(transaction, "acc1", include_pending=True), 150.0)

    def test_unknown_kind(self):
        transaction = {"kind": "unknown_kind", "amount": 100.0, "accountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction, "acc1"), 0.0)

    def test_missing_or_alternative_fields(self):
        # Alternative amount key 'value'
        transaction_val = {"kind": "income", "value": 250.0, "accountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction_val, "acc1"), 250.0)

        # Alternative kind key 'type'
        transaction_type = {"type": "expense", "amount": 40.0, "accountId": "acc1", "status": "paid"}
        self.assertEqual(_movement(transaction_type, "acc1"), -40.0)

if __name__ == "__main__":
    unittest.main()
