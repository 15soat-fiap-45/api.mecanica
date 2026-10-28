# Quick Start - PlantUML

Abra um arquivo `.puml` no VS Code com uma extensão PlantUML e use o preview.

Ordem sugerida:

1. `c4-context.puml`
2. `c4-containers.puml`
3. `c4-components.puml`
4. `database-er.puml`
5. `deployment.puml`
6. fluxos em `flows/`

Os fluxos HTTP detalhados incluem cadastro de cliente, Auth e Service Order. Para acompanhar as atualizações da OS, abra os quatro arquivos `c4-service-order-*.puml` e `flows/service-order.puml`. Eles mostram a edição de `description` durante a avaliação (`PENDING`), sua persistência na OS e o envio do orçamento para aprovação.

Para exportar com a CLI PlantUML:

```bash
plantuml -tpng docs/plantuml/*.puml docs/plantuml/flows/*.puml
```

Ao alterar rotas, composição, schema Drizzle, Event Bus ou estados de domínio, revise os diagramas relacionados.
