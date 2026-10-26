# agent-harness

*[Read in English](README.md)*

Harness para agentes de IA de código e funcionalidades com LLM, pensado para
produção.

Fazer um modelo responder é fácil. Fazer ele se comportar dentro de um código
e de um produto reais é o trabalho de engenharia: que contexto recebe, que
ações pode executar, como a saída é conferida e o que acontece quando erra.
Este repositório é uma referência funcional e testada dessa camada.

## O que tem aqui

| Área | Onde | O que mostra |
|---|---|---|
| Regras do projeto | [`CLAUDE.md`](CLAUDE.md) | Instruções curtas, sempre carregadas; detalhes ficam nas skills |
| Hooks | [`.claude/hooks/`](.claude/hooks) | `guard-bash` bloqueia comandos destrutivos ou que vazam segredos, `protect-files` mantém o agente longe de `.env`, lockfiles e `dist/`, e um hook pós-edição roda o type checker e devolve os erros |
| Subagentes | [`.claude/agents/`](.claude/agents) | `code-reviewer`, `test-writer` e `integration-researcher` independentes, cada um com ferramentas e contexto próprios |
| Skills | [`.claude/skills/`](.claude/skills) | Procedimentos carregados sob demanda: saída estruturada, nova integração nativa, ciclo de revisão |
| Permissões | [`.claude/settings.json`](.claude/settings.json) | Ferramentas de leitura liberadas, escrita em estado compartilhado sempre pergunta, segredos negados |
| Servidor MCP | [`src/mcp/`](src/mcp) | Ferramentas de funil de leads com schemas de entrada e saída, `structuredContent`, marcação de somente leitura e triagem de prompt injection |
| Saída estruturada | [`src/structured/`](src/structured) | Schema Zod → JSON Schema → resultado tipado e validado, com um turno curto de correção em caso de erro |
| Guardrails | [`src/guardrails/`](src/guardrails) | Mascaramento de dados pessoais, triagem de prompt injection, isolamento de conteúdo não confiável, allowlist de ações e política de aprovação |
| Integrações nativas | [`src/integrations/`](src/integrations) | Cliente HTTP com rate limit (token bucket), retentativas com backoff e jitter, `Retry-After`, timeouts, cache com TTL e chaves de idempotência |
| Agente agendado | [`.github/workflows/scheduled-agent.yml`](.github/workflows/scheduled-agent.yml) | O mesmo harness rodando sem supervisão toda semana, com o relatório em uma issue |

Arquitetura e o porquê de cada decisão: [`docs/architecture.md`](docs/architecture.md).

## Como rodar

```bash
npm install
npm run test        # 57 testes, sem rede
npm run example     # mensagem recebida -> decisão tipada, offline com modelo simulado
npm run mcp:dev     # sobe o servidor MCP via stdio
```

Com `ANTHROPIC_API_KEY` e `HARNESS_MODEL` definidos (veja `.env.example`), o
exemplo chama o modelo real pelo mesmo caminho de código.

Ao abrir a pasta no Claude Code o harness já está ativo: os hooks rodam em
cada chamada de ferramenta, o servidor MCP `leads` fica disponível e as skills
e subagentes aparecem na lista.

## Princípios

- **Garantir, não pedir.** Regras importantes ficam em hooks e permissões, não
  só no prompt.
- **Contexto base pequeno.** As instruções fixas são curtas; procedimentos
  entram como skills quando necessário.
- **Revisão independente.** O agente que escreveu a mudança não a aprova.
- **Schema em toda fronteira.** Saída do modelo e respostas de APIs externas
  são validadas onde entram no sistema.
- **O modelo propõe, o código decide.** Efeitos colaterais passam por uma
  política.
- **Testes determinísticos.** Tempo, aleatoriedade, `fetch` e o modelo são
  injetados; a suíte roda offline em cerca de um segundo.

## Autor

Leandro Silva Ferreira Junior · [LinkedIn](https://www.linkedin.com/in/leandrosfj)

Somente dados fictícios. Licença MIT.
