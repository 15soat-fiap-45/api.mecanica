# Plano de ação — finalização do contexto `registry`

## Objetivo

Concluir o contexto de cadastro da oficina, cobrindo clientes e veículos do domínio até a API HTTP, sem acoplar o domínio ao Drizzle ou ao Fastify. A implementação deve preservar os agregados, objetos de valor, eventos e interfaces de repositório já existentes.

## Situação atual

### Já disponível

- Agregados `Customer` e `Vehicle`.
- Identidades `CustomerId`/`CpfCnpj` e `VehicleId`.
- Objetos de valor e testes para CPF/CNPJ, e-mail, telefone e placa.
- Eventos `registry.customer-registered` e `registry.vehicle-registered`.
- Interfaces `CustomerRepository` e `VehicleRepository`.
- Casos de uso testados para:
    - registrar cliente;
    - buscar cliente por CPF/CNPJ;
    - registrar veículo;
    - buscar veículo por placa.

### Ainda pendente

- ~~Escolher e consolidar o fluxo de aplicação de cliente.~~ Concluído: `RegisterCustomer` é o fluxo oficial.
- Implementar repositórios concretos.
- Revisar o schema/configuração Drizzle já existentes e criar migrações.
- Conectar persistência ao PostgreSQL.
- Criar composição de dependências do `registry`.
- Criar rotas, schemas HTTP, tratamento de erros e documentação Fastify.
- Integrar o contexto ao `composition-root.ts` e ao bootstrap da aplicação.
- Executar testes de integração e validar o fluxo completo.

## Decisões que devem ser tomadas primeiro

### 1. Consolidar o caso de uso de cliente

Existem dois fluxos com responsabilidades sobrepostas:

- `src/registry/application/use-cases/register-customer.ts`
- `src/registry/application/customer/services/create-customer.ts`

Usar `RegisterCustomer` como fluxo oficial, pois ele já possui retorno tipado, publicação opcional do evento e testes associados. Avaliar a remoção do serviço duplicado ou transformá-lo em uma fachada compatível, evitando dois contratos para a mesma operação.

Durante a consolidação:

- manter um único `CustomerAlreadyExistsError`;
- padronizar o nome dos campos (`cpfCnpj`, `name`, `email`, `tel`);
- garantir que o evento seja publicado somente depois do `save`;
- decidir se `EventBus` será obrigatório no caso de uso quando a composição final estiver pronta;
- atualizar os testes e referências antes de criar os adaptadores HTTP.

### 2. Definir o contrato de identidade do veículo

O contrato adotado usa `VehicleId` como identidade técnica, `plate` como coluna própria e única, e `customerId` como associação obrigatória ao cliente. No banco, esses campos são mapeados para `veiculo_id`, `placa` e `cliente_id`.

- [x] manter `VehicleId` como chave primária técnica e `plate` como coluna única;
- [x] exigir `customerId` no agregado e validar a existência do cliente antes do cadastro.

A decisão está registrada no mapeamento e coberta por testes. O schema/migração ainda precisa ser aplicado ao banco.

## Fases de implementação

### Fase 1 — fechar o domínio e a aplicação

- [ ] Revisar regras e mensagens dos value objects e garantir que os limites sejam explícitos:
    - CPF/CNPJ válido e normalizado;
    - e-mail normalizado;
    - telefone normalizado;
    - placa nos formatos aceitos;
    - campos obrigatórios e limites de texto;
    - ano do veículo dentro de uma faixa válida.
- [ ] Verificar se `Customer` e `Vehicle` precisam de operações de atualização. Se sim, adicionar métodos no agregado, eventos correspondentes e casos de uso; não alterar propriedades diretamente no controller.
- [x] Consolidar `RegisterCustomer` e remover a duplicidade de `CreateCustomer`.
- [ ] Padronizar exceções de domínio e aplicação, incluindo códigos/nomes que possam ser traduzidos para HTTP.
- [ ] Adicionar testes para entradas inválidas, normalização, duplicidade, publicação de evento e falha de persistência.
- [ ] Confirmar que os eventos são consumidos pelo `EventBus` sem importar classes de infraestrutura.

**Saída esperada:** o contexto funciona completamente com repositórios fake/in-memory e sem Fastify ou banco.

### Fase 2 — preparar o modelo de persistência

- [ ] Criar a configuração do Drizzle e do `drizzle-kit` em uma pasta de infraestrutura, separada do domínio.
- [ ] Definir o schema Drizzle para `cliente` e `veiculo`, alinhado ao PostgreSQL de `infra/postgres/init/01-schema.sql`.
- [ ] Resolver diferenças de tipo antes da migração:
    - CPF/CNPJ e placa como `varchar`;
    - telefone: decidir entre `varchar` e o `numeric(11)` atual; recomenda-se `varchar` para preservar zeros e evitar perda de formatação;
    - ano como inteiro;
    - colunas obrigatórias e limites de tamanho;
    - unicidade de CPF/CNPJ e placa;
    - relacionamento veículo → cliente.
- [ ] Definir se o schema inicial SQL será a fonte de verdade ou se será substituído por migrações do Drizzle. Não manter duas definições divergentes sem um procedimento de sincronização.
- [ ] Criar migrações versionadas e um comando documentado para executá-las.
- [ ] Criar a conexão PostgreSQL usando configuração por ambiente, sem credenciais no repositório.
- [x] Definir `customerId` no agregado e mapear para `cliente_id`; a associação agora é obrigatória.

**Saída esperada:** o banco local sobe com um schema reproduzível e o Drizzle consegue ler/escrever clientes e veículos.

### Fase 3 — implementar repositórios Drizzle

- [ ] Criar `DrizzleCustomerRepository` implementando `CustomerRepository`.
- [ ] Criar `DrizzleVehicleRepository` implementando `VehicleRepository`.
- [ ] Implementar `save` com insert e, se o domínio passar a suportar atualização, update protegido por versão/conflito.
- [ ] Implementar buscas por CPF/CNPJ, ID e placa.
- [ ] Normalizar os valores antes das consultas ou garantir que os objetos de valor já entreguem a representação persistível.
- [ ] Criar mappers explícitos:
    - linha do banco → agregado;
    - agregado → linha do banco.
- [ ] Reidratar sempre os value objects (`CpfCnpj`, `Email`, `Telephone`, `Plate`) ao ler do banco.
- [ ] Converter corretamente `null`, strings numéricas, datas e tipos retornados pelo PostgreSQL.
- [ ] Traduzir violação de chave única para exceção de aplicação/domain apropriada, sem depender apenas da verificação prévia do caso de uso.
- [ ] Adicionar testes dos repositórios com PostgreSQL real ou container de teste; os testes unitários dos casos de uso continuam usando fakes.

**Saída esperada:** os casos de uso existentes funcionam com PostgreSQL, preservando os contratos das interfaces.

### Fase 4 — composição do contexto

- [ ] Criar uma função de composição específica, por exemplo `registryCompositionRoot`, que receba:
    - `CustomerRepository`;
    - `VehicleRepository`;
    - `EventBus`.
- [ ] Instanciar nela os casos de uso oficiais de cliente e veículo.
- [ ] Expor somente os casos de uso necessários para a camada HTTP.
- [ ] Conectar essa composição ao `src/composition-root.ts` sem instanciar Drizzle dentro dos agregados ou casos de uso.
- [ ] Definir o ciclo de vida da conexão com o banco e o encerramento gracioso da aplicação.
- [ ] Garantir que falhas de inicialização de banco não deixem o servidor em estado parcialmente funcional.

**Saída esperada:** existe uma única composição de dependências e a aplicação pode trocar o banco por fakes em testes.

### Fase 5 — camada HTTP com Fastify

Esta fase deve começar somente depois que os contratos de aplicação e os repositórios estiverem definidos.

- [x] Criar `src/index.ts`/bootstrap, já existente; falta integrá-lo à composição do `registry`.
- [ ] Configurar Fastify e o type provider Zod.
- [ ] Criar módulos de rotas do `registry`, mantendo controllers/handlers finos.
- [ ] Implementar endpoints mínimos:

    | Método | Rota                  | Caso de uso                  |
    | ------ | --------------------- | ---------------------------- |
    | `POST` | `/customers`          | registrar cliente            |
    | `GET`  | `/customers/:cpfCnpj` | buscar cliente por documento |
    | `POST` | `/vehicles`           | registrar veículo            |
    | `GET`  | `/vehicles/:plate`    | buscar veículo por placa     |

- [ ] Definir schemas Zod para body, parâmetros e respostas.
- [ ] Retornar status HTTP consistentes:
    - `201` para criação;
    - `200` para consulta;
    - `400` para entrada inválida;
    - `404` para entidade inexistente;
    - `409` para duplicidade;
    - `500` somente para falhas inesperadas.
- [ ] Criar um error handler único que traduza exceções conhecidas sem vazar stack trace ou detalhes do banco.
- [ ] Adicionar Swagger/OpenAPI com exemplos de payload e respostas.
- [ ] Adicionar testes HTTP usando `fastify.inject`, sem abrir uma porta real.
- [ ] Validar que a rota não contenha regra de domínio duplicada.

**Saída esperada:** os quatro fluxos do `registry` podem ser usados por HTTP com validação e documentação.

### Fase 6 — integração e qualidade

- [ ] Adicionar testes de integração dos fluxos completos: HTTP → caso de uso → repositório Drizzle → PostgreSQL.
- [ ] Testar duplicidade real por constraint do banco e concorrência básica.
- [ ] Testar veículo associado a cliente inexistente, caso o contrato de cadastro passe a exigir essa associação.
- [ ] Testar publicação dos eventos após persistência bem-sucedida.
- [ ] Confirmar que eventos não são publicados quando a persistência falha.
- [ ] Executar:

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
npm run test:coverage
```

- [ ] Atualizar `CLAUDE.md` se forem criadas novas convenções de infraestrutura, rotas ou migrações.
- [ ] Atualizar o README da infraestrutura com os comandos finais de banco e aplicação.

## Ordem recomendada de entrega

1. Consolidar aplicação e decisões de contrato.
2. Completar testes de domínio/casos de uso.
3. Configurar Drizzle, schema e migrações.
4. Implementar repositórios PostgreSQL.
5. Integrar composição e EventBus.
6. Configurar Fastify e bootstrap.
7. Criar rotas, schemas e error handler.
8. Adicionar testes HTTP e de integração.
9. Executar validações finais e atualizar documentação.

## Critérios de conclusão

O contexto `registry` estará concluído quando:

- os quatro casos de uso funcionarem com PostgreSQL;
- clientes e veículos forem reidratados com seus value objects;
- CPF/CNPJ e placa tiverem unicidade garantida no banco;
- eventos forem publicados somente após persistência;
- as quatro rotas estiverem documentadas e cobertas por testes HTTP;
- erros de validação, inexistência e duplicidade tiverem respostas HTTP estáveis;
- Drizzle e Fastify estiverem isolados da camada de domínio;
- typecheck, testes, lint, formatação e build passarem.

## Riscos e cuidados

- Não conectar Fastify diretamente aos agregados; os handlers devem chamar casos de uso.
- Não considerar a checagem `find` + `save` suficiente para unicidade; a constraint do PostgreSQL é a proteção definitiva.
- Não persistir value objects como objetos JavaScript nem expor detalhes internos do Drizzle.
- Não alterar silenciosamente `infra/postgres/init/01-schema.sql`; qualquer mudança de contrato deve ter migração e decisão documentada.
- Evitar implementar atualização, autenticação ou associação completa de veículo a cliente sem confirmar o escopo funcional do desafio.

## Registro de implementação

### Decisões adotadas

- `RegisterCustomer` é o único fluxo oficial para cadastro de clientes.
- `VehicleId` é uma identidade técnica, gerada como UUID por padrão.
- `plate` é um objeto de valor e uma coluna própria, normalizada e única.
- `customerId` é obrigatório no agregado `Vehicle` e é persistido como `cliente_id`.
- O código de domínio e aplicação permanece em inglês.
- Os nomes físicos legados do PostgreSQL permanecem em português para não quebrar o contrato SQL existente; os mappers fazem essa tradução.
- O SQL inicial é o baseline de criação do banco local. Migrações Drizzle serão usadas para alterações posteriores.

### Alterações realizadas

- Remoção dos contratos duplicados de `CreateCustomer`.
- Inclusão de testes para persistência antes do evento e para falha de persistência sem publicação de evento.
- Inclusão de `customerId` no agregado, evento, caso de uso e consulta de veículo.
- Criação de mappers explícitos entre agregados e linhas do banco.
- Criação de `DrizzleCustomerRepository` e `DrizzleVehicleRepository`.
- Criação de `registryCompositionRoot` com os quatro casos de uso oficiais.
- Integração do `registryCompositionRoot` ao `compositionRoot` principal.
- Criação de `InMemoryEventBus` para composição local e testes.
- Criação das quatro rotas HTTP do `registry` com validação Zod.
- Configuração de Swagger/OpenAPI em `/docs`.
- Criação de error handler centralizado para validação, inexistência, duplicidade e falhas inesperadas.
- Bootstrap atualizado para conectar Fastify aos repositórios Drizzle do `registry`.
- `veiculo_id` alterado para `VARCHAR(36)` e `placa` adicionada como `VARCHAR(7) UNIQUE`.
- Telefone alterado de numérico para `VARCHAR(11)`, preservando a representação normalizada.
- E-mail, telefone, ano, marca e cor tornaram-se obrigatórios na persistência.
- `ano` passou a `INTEGER`.
- `version` foi adicionada a cliente e veículo para preservar a preparação para concorrência otimista.
- `servico_id` do schema Drizzle foi alinhado ao comportamento `BIGSERIAL` do PostgreSQL.

### Validações realizadas

Os seguintes comandos passaram depois das alterações:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Resultado registrado: 70 arquivos de teste e 642 testes aprovados.

### Como recriar o ambiente local

1. Garantir que o Docker Desktop esteja instalado e em execução.
2. Criar `infra/postgres/.env` a partir de `infra/postgres/.env.example`.
3. Configurar as credenciais locais no arquivo `.env`.
4. Como o banco atual não possui dados, recriar o volume para aplicar o SQL inicial atualizado:

```powershell
docker compose --env-file infra\postgres\.env -f infra\postgres\docker-compose.yml down -v
docker compose --env-file infra\postgres\.env -f infra\postgres\docker-compose.yml up -d
```

5. Verificar a conexão:

```powershell
npm.cmd run db:test
```

6. Reexecutar as validações de qualidade:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

### Estratégia de migrações

O banco foi inicialmente criado pelo `infra/postgres/init/01-schema.sql`. Esse script só é executado quando o volume é criado pela primeira vez. Por isso, a migração Drizzle inicial gerada para criar as mesmas tabelas não deve ser aplicada sobre esse banco.

Para o ambiente atual:

- o SQL inicial cria o baseline do banco;
- o volume pode ser recriado enquanto não houver dados;
- `db:migrate` não deve ser executado com a migração inicial duplicada;
- alterações futuras devem ser representadas por migrações incrementais, sem editar apenas o SQL inicial.

Antes de aplicar qualquer migração futura, confirmar se ela é incremental e se não tenta recriar tabelas existentes.

### Validação HTTP manual

- A API foi iniciada com `npm.cmd run dev`.
- O endpoint `/health` foi acessado com sucesso.
- A documentação Swagger foi acessada no navegador em `/docs`.
- A validação dos cadastros de cliente e veículo deve confirmar os fluxos `POST` e `GET`, além dos retornos `400`, `404` e `409`.
