# Quick Start - PlantUML

Abra um arquivo `.puml` no VS Code com uma extensão PlantUML e use o preview.

Ordem sugerida:

1. `c4-context.puml`
2. `c4-containers.puml`
3. `c4-components.puml`
4. `database-er.puml`
5. `deployment.puml`
6. fluxos em `flows/`

O cadastro de cliente é o único fluxo HTTP detalhado atualmente. O diagrama de ordem de serviço representa somente os casos de uso e handlers internos, pois ainda não existem rotas HTTP para esse contexto.

Para exportar com a CLI PlantUML:

```bash
plantuml -tpng docs/plantuml/c4-context.puml
plantuml -tpng docs/plantuml/**/*.puml
```

Ao alterar rotas, composição, schema Drizzle, Event Bus ou estados de domínio, revise os diagramas relacionados.
