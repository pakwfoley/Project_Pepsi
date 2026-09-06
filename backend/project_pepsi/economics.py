from dataclasses import dataclass

from .contracts import TradeEconomicsInput


@dataclass(frozen=True)
class TradeEconomics:
    expected_alpha: int
    maximum_cash_add: int
    meets_minimum_alpha: bool


def calculate_trade_economics(value: TradeEconomicsInput) -> TradeEconomics:
    fixed_costs = value.transaction_cost + value.risk_penalty + value.transaction_friction
    alpha = value.received_qlv - value.given_qlv - value.cash_added - fixed_costs
    ceiling = max(0, value.received_qlv - value.given_qlv - fixed_costs - value.minimum_alpha)
    return TradeEconomics(alpha, ceiling, alpha >= value.minimum_alpha)
