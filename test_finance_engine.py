import pytest
import json
import finance_engine

def test_calculate_missing_argument_json():
    # Test missing argument_json (uses default "null")
    result = finance_engine.calculate("self_test", "{}")
    data = json.loads(result)
    assert data["engine"] == "python"

def test_calculate_invalid_state_json():
    # Test invalid json for state
    result = finance_engine.calculate("self_test", "{invalid}", "{}")
    data = json.loads(result)
    assert data["engine"] == "python"
    assert data["accounts"] == 0

def test_calculate_invalid_argument_json():
    # Test invalid json for argument
    result = finance_engine.calculate("self_test", "{}", "{invalid}")
    data = json.loads(result)
    assert data["engine"] == "python"

def test_calculate_none_inputs():
    # Test None values for state_json and argument_json
    result = finance_engine.calculate("self_test", None, None)
    data = json.loads(result)
    assert data["engine"] == "python"
    assert data["accounts"] == 0

def test_calculate_non_dict_state_json():
    # Test valid JSON but not a dict for state
    result = finance_engine.calculate("self_test", "[]", "{}")
    data = json.loads(result)
    assert data["engine"] == "python"
    assert data["accounts"] == 0

def test_calculate_non_dict_argument_json():
    # Test valid JSON but not a dict for argument
    result = finance_engine.calculate("self_test", "{}", "[]")
    data = json.loads(result)
    assert data["engine"] == "python"

def test_calculate_empty_string_inputs():
    # Test empty string inputs (should default to {} and "null" because of 'or')
    result = finance_engine.calculate("self_test", "", "")
    data = json.loads(result)
    assert data["engine"] == "python"
    assert data["accounts"] == 0
