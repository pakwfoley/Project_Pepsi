from project_pepsi.contracts import TradeEconomicsInput
from project_pepsi.economics import calculate_trade_economics


def test_trade_alpha_and_ceiling_are_deterministic():
    result = calculate_trade_economics(TradeEconomicsInput(received_qlv=3050, given_qlv=2450, cash_added=200, transaction_cost=50, risk_penalty=75, transaction_friction=25, minimum_alpha=200))
    assert result.expected_alpha == 250
    assert result.maximum_cash_add == 250
    assert result.meets_minimum_alpha is True
