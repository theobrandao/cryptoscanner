# Risk Engine (`lib/engines/risk.ts`)

Contratos lineares USDⓈ-M. Testes com valores conhecidos em `tests/unit/risk.test.ts`.

| Cálculo | Fórmula |
|---|---|
| Quantidade | `(conta × risco%) ÷ (|entrada − stop| + taxa × (entrada + stop))` |
| Notional / margem | `qty × entrada` / `notional ÷ alavancagem` |
| R-múltiplo | `lado × (saída − entrada) ÷ |entrada − stop|` |
| Liquidação (Binance, uma posição) | `LP = (WB + cum − s·Q·EP) ÷ (Q·MMR − s·Q)`, s = +1 long / −1 short; isolated `WB = Q·EP/L`, cross `WB = saldo` |
| Preço médio | `(Q₁·P₁ + Q₂·P₂) ÷ (Q₁ + Q₂)`; margem somada; alavancagem efetiva = notional ÷ margem |
| Stress test | P&L, % da margem, % da conta, razão de margem `Q·P·MMR ÷ (margem + P&L)`, distância da liquidação |
| Stops | estrutural = swing de invalidação ∓ 0,1 ATR; volatilidade = swing ∓ 1 ATR; curto = swing interno ∓ 0,1 ATR |
| EV | `P(win)·ganho médio(R) − P(loss)·perda média(R)` |

Exemplo verificado: long 10×, MMR 0,5%, entrada 100 → liquidação `100 × 0,9 ÷ 0,995 = 90,4523`.
Para o valor exato da corretora, informe MMR e `cum` da faixa (bracket) de manutenção da sua posição.
