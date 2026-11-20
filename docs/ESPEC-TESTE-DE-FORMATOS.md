# Adendo à especificação · Teste de formatos (decidido em 20/11/2026)

Objetivo: no começo, o cliente cresce testando formatos até achar o vencedor dele.
A plataforma instrui e operacionaliza esse teste.

## Decisões

- Cada roteiro vem com **5 ganchos alternativos**. Nada de roteiros completos extras.
- Os **3 ângulos** da mesma história entram só como ideias de uma linha, para os próximos testes.
- Quem decide que o cliente achou o **formato vencedor** é o admin (painel, campo `crescimento`).
- Regras que a plataforma ensina e aplica:
  1. Mudar **1 variável por vez** (gancho, formato visual, ângulo ou duração).
  2. **1 assunto** por conteúdo.
  3. Objetivo de crescer a base: **máximo 1min30**. Conteúdos mais longos em menor quantidade.
  4. Se nenhum gancho performar: mudar a estrutura **só no ponto em que a visualização caiu**.
  5. Quem posta com constância **reaproveita a cada 3 meses** o que funcionou, com gancho novo.
  6. Testar com **Reels de teste** (aparecem primeiro para quem não segue).

## Já feito (junto da Fase 1)

- `clientes/{uid}.crescimento = { fase: "testes" | "vencedor_definido", vencedor: { formato, formatoVisual, angulo, tipoGancho, observacao } | null, definidoEm }`.
  Escrito só pelo admin (`adminAtualizarCliente`); o cliente só lê.
- Painel admin: seção "Fase de crescimento" no editar cliente e selo da fase no cartão.
- Área do cliente: guia "Como crescer no começo" com o passo a passo e as regras.
- `functions/ia/catalogos.js`: catálogos da metodologia + tipos de gancho, regras de teste e limites.

## Muda nas próximas fases

### Fase 3 (geração)
- Saída do roteiro ganha:
  ```json
  "ganchos": [ { "n": 1, "tipo": "situacao_especifica", "fala": "...", "textoTela": "...", "visual": "..." } ],
  "angulosParaTestar": [ { "angulo": "mito_industria", "ideia": "uma linha" } ]
  ```
  5 ganchos, um de cada tipo de `TIPOS_GANCHO` sempre que couber. O gancho 1 é o do roteiro.
  Reels e série: abertura falada de 3s. Carrossel: texto da capa. Post único: headline. Stories: sem pacote.
- Todos os 5 ganchos passam pela trava.
- Prompt recebe as `REGRAS_TESTE` e a fase do cliente. Com vencedor definido, o prompt prioriza
  formato/visual/ângulo/tipo de gancho vencedores.
- Duração: reels de **P1 ou P2** acima de 90s refaz pedindo corte (antes era só P2).

### Fase 4 (editor)
- Bloco "Teste de ganchos" com os 5 ganchos, cada um com copiar e regerar.
- Checklist operacional de gravação e publicação (o mesmo do guia).

### Fase 5 (métricas e diagnóstico)
- Ao marcar como postado: o cliente informa quais ganchos publicou como Reels de teste.
- Métricas por versão (gancho): visualizações e retenção nos 3s. A plataforma aponta o gancho vencedor.
- Campo novo em reels: **segundo em que a visualização caiu** (lido no gráfico de retenção do Instagram).
- Novas regras de diagnóstico:
  - Nenhum gancho acima da referência: orientar mudança de estrutura no segundo da queda.
  - Mais de uma variável mudou desde o último teste do mesmo tema: avisar que o resultado não é conclusivo.
  - Duração acima de 90s com objetivo de crescer: apontar como causa provável.
- Relatório para o admin: ranking por formato, formato visual, ângulo e tipo de gancho, para apoiar a decisão do vencedor.

### Fase 6 (lembretes)
- Reaproveitamento: posts com achado "funcionou", postados há 90 dias ou mais, viram sugestão
  "Hora de reaproveitar" (notificação + painel), só para quem postou com constância no período.
