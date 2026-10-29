# Quick Start - PlantUML

Abra um arquivo `.puml` no VS Code com uma extensão PlantUML e use o preview.

Ordem sugerida:

1. `c4-context.puml`
2. `c4-containers.puml`
3. `c4-components.puml`
4. `database-er.puml`
5. `deployment.puml`
6. fluxos em `flows/`

Os fluxos HTTP detalhados atualmente incluem o cadastro protegido de cliente, com JWT e permissão `CLIENTE_EDITAR`, e os fluxos de Auth (`POST /users` e `POST /auth/login`). O diagrama de ordem de serviço representa as rotas HTTP implementadas, incluindo autenticação, aprovação por token e transições de status.

Para exportar com a CLI PlantUML:

```bash
plantuml -tpng docs/plantuml/*.puml docs/plantuml/flows/*.puml
```

Ao alterar rotas, composição, schema Drizzle, Event Bus ou estados de domínio, revise os diagramas relacionados.
