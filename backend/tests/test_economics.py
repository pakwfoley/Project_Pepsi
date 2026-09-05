from project_pepsi.contracts import ComparableValuationInput, TradeEconomicsInput
from project_pepsi.economics import calculate_comparable_valuation, calculate_trade_economics


def test_trade_alpha_and_ceiling_are_deterministic():
    result = calculate_trade_economics(TradeEconomicsInput(received_qlv=3050, given_qlv=2450, cash_added=200, transaction_cost=50, risk_penalty=75, transaction_friction=25, minimum_alpha=200))
    assert result.expected_alpha == 250
    assert result.maximum_cash_add == 250
    assert result.meets_minimum_alpha is True


def test_comparable_valuation_is_deterministic_and_conservative():
    result = calculate_comparable_valuation(ComparableValuationInput(
        dealer_ask=3200, private_ask=3000, clearing_estimate=2900,
        qlv_haircut_percent=10, asking_price=2500,
        transaction_cost=50, risk_penalty=75, minimum_alpha=200,
    ))
    assert result.comparable_median == 3000
    assert result.quick_liquidation_value == 2700
    assert result.maximum_purchase_price == 2375
    assert result.expected_purchase_alpha == 75
