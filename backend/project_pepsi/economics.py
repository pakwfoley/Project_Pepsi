from dataclasses import dataclass

from .contracts import ComparableValuationInput, TradeEconomicsInput


@dataclass(frozen=True)
class TradeEconomics:
    expected_alpha: int
    maximum_cash_add: int
    meets_minimum_alpha: bool


@dataclass(frozen=True)
class ComparableValuation:
    comparable_median: int
    quick_liquidation_value: int
    maximum_purchase_price: int
    expected_purchase_alpha: int
    methodology: str


def calculate_trade_economics(value: TradeEconomicsInput) -> TradeEconomics:
    fixed_costs = value.transaction_cost + value.risk_penalty + value.transaction_friction
    alpha = value.received_qlv - value.given_qlv - value.cash_added - fixed_costs
    ceiling = max(0, value.received_qlv - value.given_qlv - fixed_costs - value.minimum_alpha)
    return TradeEconomics(alpha, ceiling, alpha >= value.minimum_alpha)


def calculate_comparable_valuation(value: ComparableValuationInput) -> ComparableValuation:
    """Apply an inspectable liquidity haircut to three human-supplied comparables."""
    median = sorted((value.dealer_ask, value.private_ask, value.clearing_estimate))[1]
    qlv = round((median * (100 - value.qlv_haircut_percent) / 100) / 25) * 25
    maximum_purchase = max(0, qlv - value.transaction_cost - value.risk_penalty - value.minimum_alpha)
    alpha = qlv - value.asking_price - value.transaction_cost - value.risk_penalty
    return ComparableValuation(
        comparable_median=median,
        quick_liquidation_value=qlv,
        maximum_purchase_price=maximum_purchase,
        expected_purchase_alpha=alpha,
        methodology="median_of_three_human_comparables_minus_liquidity_haircut_rounded_to_25",
    )
