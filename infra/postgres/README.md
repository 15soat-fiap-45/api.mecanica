# Banco PostgreSQL — Oficina Mecânica

Ambiente Docker para executar o banco de dados PostgreSQL do sistema de oficina mecânica.

## Requisitos

- WSL 2 com Ubuntu
- Docker Engine instalado no WSL
- Docker Compose plugin

## Configuração inicial

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Edite o arquivo `.env`:

```bash
nano .env
```

3. Defina uma senha segura em `POSTGRES_PASSWORD`.

4. Inicie o banco:

```bash
docker compose up -d
```

## Inicialização do schema

Na primeira execução, com o volume de dados vazio, o Docker executa automaticamente:

```text
init/01-schema.sql
```

Esse script cria o modelo relacional da oficina.

Importante: os scripts em `/docker-entrypoint-initdb.d/` são executados apenas na primeira inicialização do PostgreSQL. Alterações posteriores no script não serão aplicadas automaticamente em um banco já criado.

## Conexão

String de conexão:

```text
postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:<POSTGRES_PORT>/<POSTGRES_DB>
```

## Drizzle ORM

O projeto usa `drizzle-orm` com o driver `pg`. A conexão da aplicação está
disponível em `src/infra/database/connection.ts`:

```ts
import { db } from './infra/database/connection.js';
```

O arquivo `.env` desta pasta é carregado automaticamente durante o
desenvolvimento. Também é possível definir `DATABASE_URL`, que tem prioridade
sobre as variáveis individuais do PostgreSQL.

Depois de iniciar o banco, os comandos disponíveis na raiz do projeto são:

```bash
# Gerar uma migração a partir do schema TypeScript
npm run db:generate

# Aplicar migrações versionadas
npm run db:migrate

# Sincronizar o schema diretamente (recomendado apenas no desenvolvimento)
npm run db:push

# Abrir o Drizzle Studio
npm run db:studio
```

O schema inicial do Drizzle está em `src/infra/database/schema.ts`. As tabelas
adicionais do modelo relacional devem ser incluídas nesse arquivo antes de
gerar novas migrações. O script `init/01-schema.sql` continua responsável por
provisionar o banco em instalações novas via Docker.

Exemplo:

```text
postgresql://oficina:minha_senha@localhost:5432/oficina
```

## Comandos

```bash
# Iniciar o banco
docker compose up -d

# Acompanhar os logs
docker compose logs -f postgres

# Verificar o status
docker compose ps

# Acessar o psql
docker compose exec postgres psql -U oficina -d oficina

# Parar o container preservando os dados
docker compose down

# Parar e remover o volume, apagando todos os dados
docker compose down -v

# Recriar o banco do zero com o schema atual
docker compose down -v
docker compose up -d
```

## Análise de código com SonarQube

O projeto possui a configuração em `sonar-project.properties` na raiz do
repositório. A forma recomendada de executar o SonarQube e o SonarScanner é
usando containers Docker.

### Iniciar o SonarQube

Na raiz do projeto, inicie o SonarQube com Docker Compose:

```bash
cd infra/sonarqube
docker compose up -d
```

O Compose cria a rede `sonar-network` e mantém os dados do SonarQube em
volumes Docker persistentes. Para acompanhar a inicialização:

```bash
docker compose logs -f sonarqube
```

Aguarde o serviço ficar disponível:

```bash
until curl -fsS http://localhost:9000/api/system/status | grep -q '"status":"UP"'; do
  sleep 5
done
```

Abra `http://localhost:9000`, faça login e gere um token em:

```text
My Account > Security > Generate Tokens
```

O token deve ser mantido fora do repositório.

### Gerar a cobertura

Volte para a raiz do projeto:

```bash
cd ../..
npm install
npm run test:coverage
```

Esse comando gera `coverage/lcov.info`, que é o relatório consumido pelo
SonarQube.

### Executar o SonarScanner via Docker

Gere um token em `My Account > Security > Generate Tokens` e defina-o somente
na sessão atual do terminal. Substitua o valor de exemplo pelo token real:

```bash
export SONAR_TOKEN="cole-seu-token-real-aqui"
```

Valide que a variável está preenchida sem exibir o token:

```bash
if [ -n "$SONAR_TOKEN" ]; then
  echo "SONAR_TOKEN configurado"
else
  echo "SONAR_TOKEN não configurado"
fi
```

Execute o scanner montando a raiz do projeto no container:

```bash
docker run --rm \
  --network sonar-network \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$PWD:/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dsonar.host.url=http://sonarqube:9000
```

O token é fornecido pela variável `SONAR_TOKEN`. Não use também
`-Dsonar.token="$SONAR_TOKEN"`, pois isso informa a mesma propriedade duas
vezes e pode causar um aviso de sobrescrita.

Ao concluir, consulte o resultado em:

```text
http://localhost:9000/dashboard?id=api-mecanica
```

Para acompanhar os logs do SonarQube:

```bash
cd infra/sonarqube
docker compose logs -f sonarqube
```

Para parar o SonarQube sem remover o container:

```bash
docker compose stop
```

Para parar e remover o container, preservando os dados:

```bash
docker compose down
```

Para remover também os dados persistidos:

```bash
docker compose down -v
```

O `sonar-project.properties` define `http://localhost:9000` para execução
local do scanner. No scanner Docker, essa URL é sobrescrita por
`http://sonarqube:9000`, pois `localhost` dentro do container aponta para o
próprio scanner. A configuração do serviço está em
`infra/sonarqube/docker-compose.yml`.

## Estrutura

```text
postgres/
├── docker-compose.yml
├── .env.example
├── README.md
└── init/
    └── 01-schema.sql
```

## Evolução do schema

Para alterações futuras no banco, utilize migrações versionadas em vez de editar apenas o `01-schema.sql`.

Exemplo:

```text
migrations/
├── 000001_create_initial_schema.up.sql
├── 000001_create_initial_schema.down.sql
├── 000002_add_avaliacao_os.up.sql
└── 000002_add_avaliacao_os.down.sql
```

Assim, o script de inicialização provisiona bancos novos e as migrações mantêm bancos existentes atualizados.
