# 🚀 Quick Start - PlantUML Diagrams

## ⚡ 30 segundos de setup

### 1️⃣ Instalar extensão no VSCode
```
VSCode → Extensions → procurar "PlantUML" (jjlive.plantuml)
```

### 2️⃣ Abrir um diagrama
```bash
code docs/plantuml/c4-context.puml
```

### 3️⃣ Ver preview
```
Pressione: Alt + D
```

✨ **Pronto!** O diagrama aparece ao lado do código.

---

## 📂 Estrutura (10s de leitura)

```
plantuml/
├── c4-context.puml          👈 Comece aqui! Visão geral
├── c4-containers.puml       👈 Depois: componentes principais
├── c4-components.puml       👈 Depois: arquitetura interna
├── database-er.puml         👈 Depois: banco de dados
├── deployment.puml          👈 Depois: infraestrutura
└── flows/
    ├── client-registration.puml    👈 Fluxo: registrar cliente
    ├── service-order.puml          👈 Fluxo: criar ordem
    └── states.puml                 👈 Máquinas de estado
```

---

## 🎯 Qual diagrama usar?

| Pergunta | Diagrama |
|----------|----------|
| Como funciona o sistema? | **C4 Context** |
| Quais são os componentes? | **C4 Containers** |
| Como é estruturada a API? | **C4 Components** |
| Como é o banco de dados? | **Database E-R** |
| Como fazer deploy? | **Deployment** |
| Como registra um cliente? | **Fluxo: Client Registration** |
| Como cria uma ordem? | **Fluxo: Service Order** |
| Quais são os estados? | **Fluxo: States** |

---

## 💡 Dicas Rápidas

### Navegar nos diagrama
- **Zoom**: Scroll do mouse
- **Pan**: Click + arrastar
- **Abrir em browser**: Right-click → Open in Browser

### Editar um diagrama
1. Abra o arquivo `.puml`
2. Faça a mudança
3. Salve (Ctrl+S)
4. Preview atualiza automaticamente ✨

### Exportar para PNG/SVG
```bash
# Uma vez
npm install -D @planttext/plantuml-cli

# Depois
npx plantuml -tpng docs/plantuml/*.puml
```

---

## 📖 Documentos Relacionados

- [README.md](README.md) - Documentação completa
- [DIAGRAMS_INDEX.md](DIAGRAMS_INDEX.md) - Índice visual detalhado
- [Proposta Mermaid/PlantUML](../PROPOSTA_NOTION.md) - Contexto estratégico

---

## ❓ FAQ Rápido

**P: Por que PlantUML e não Mermaid?**  
R: PlantUML tem melhor suporte para C4 diagrams e é mais expressivo para arquitetura.

**P: Posso editar os diagramas?**  
R: Sim! São arquivos de texto. Edite no VSCode, o preview atualiza automaticamente.

**P: Preciso instalar PlantUML no meu PC?**  
R: Não! A extensão do VSCode trata disso. Só instale a CLI se quiser exportar.

**P: Como contribuir?**  
R: Edite o `.puml` → Faça commit → Crie PR → Revisor aprova.

**P: Vai ficar desatualizado?**  
R: Só se ninguém atualizar 😄 Adicione no checklist de PR: "Diagrama atualizado?"

---

## 📞 Suporte

Não conseguiu visualizar?
1. Verificar se extensão PlantUML está instalada
2. Recarregar VSCode (Ctrl+Shift+P → Developer: Reload Window)
3. Verificar se o arquivo `.puml` tem sintaxe válida

---

**Pronto!** Navegue pelos diagramas e explore a arquitetura. 🎉
