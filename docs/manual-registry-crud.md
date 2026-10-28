# Teste manual do CRUD do Registry

Este roteiro valida manualmente autenticação, permissão `CLIENTE_EDITAR` e as operações de clientes e veículos.

## 1. Preparar o ambiente

Na raiz do projeto:

```powershell
npm.cmd install
Copy-Item infra/postgres/.env.example infra/postgres/.env
```

Edite `infra/postgres/.env` e acrescente valores locais para a aplicação:

```text
INITIAL_MANAGER_PASSWORD=TempPass123
JWT_SECRET=uma-chave-local-com-pelo-menos-32-bytes
```

Não use essas credenciais em produção nem as versione.

## 2. Subir o PostgreSQL e aplicar o schema

```powershell
Set-Location infra/postgres
docker compose up -d
docker compose ps
Set-Location ../..
npm.cmd run db:migrate
```

Confirme a API do banco:

```powershell
npm.cmd run db:test
```

## 3. Iniciar a API

Em um terminal separado, na raiz:

```powershell
npm.cmd run dev
```

Em outro terminal, verifique:

```powershell
curl.exe http://localhost:3000/health
```

Resultado esperado: `status` igual a `ok` e `database` igual a `up`.

## 4. Criar o token do gerente

Na primeira execução, o seed cria `admin@admin.com` como gerente pendente.

```powershell
$baseUrl = 'http://localhost:3000'
$json = @{
    email = 'admin@admin.com'
    temporaryPassword = 'TempPass123'
    newPassword = 'NewPass123'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/first-access" `
    -ContentType 'application/json' -Body $json
```

Faça login:

```powershell
$json = @{
    email = 'admin@admin.com'
    password = 'NewPass123'
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/login" `
    -ContentType 'application/json' -Body $json
$managerToken = $login.token
$managerHeaders = @{ Authorization = "Bearer $managerToken" }
```

Se o usuário já tiver feito o primeiro acesso, execute somente o login. O limite de autenticação é de 5 requisições por minuto por IP e rota.

## 5. Validar permissão de atendente e gerente

O gerente pode pré-cadastrar um atendente:

```powershell
$json = @{
    email = 'atendente@example.com'
    role = 'ATENDENTE'
} | ConvertTo-Json

$preRegistered = Invoke-RestMethod -Method Post -Uri "$baseUrl/users" `
    -Headers $managerHeaders -ContentType 'application/json' -Body $json
$temporaryPassword = $preRegistered.temporaryPassword
```

Ative o atendente e faça login:

```powershell
$json = @{
    email = 'atendente@example.com'
    temporaryPassword = $temporaryPassword
    newPassword = 'Atendente123'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/first-access" `
    -ContentType 'application/json' -Body $json

$json = @{
    email = 'atendente@example.com'
    password = 'Atendente123'
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/login" `
    -ContentType 'application/json' -Body $json
$attendantToken = $login.token
$attendantHeaders = @{ Authorization = "Bearer $attendantToken" }
```

Tanto `$managerHeaders` quanto `$attendantHeaders` devem acessar o Registry. Sem token, a resposta esperada é `401`; com um usuário sem `CLIENTE_EDITAR`, a resposta esperada é `403`.

## 6. Criar e consultar um cliente

```powershell
$customerDocument = '52998224725'
$json = @{
    cpfCnpj = $customerDocument
    name = 'João da Silva'
    email = 'joao.silva@example.com'
    tel = '11987654321'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$baseUrl/customers" `
    -Headers $attendantHeaders -ContentType 'application/json' -Body $json

Invoke-RestMethod -Method Get -Uri "$baseUrl/customers/$customerDocument" `
    -Headers $attendantHeaders
```

Resultado esperado: criação `201` e consulta `200`.

## 7. Editar e excluir um cliente

O CPF/CNPJ identifica o cliente e não é alterado:

```powershell
$json = @{
    name = 'Maria Oliveira'
    email = 'maria.oliveira@example.com'
    tel = '11999998888'
} | ConvertTo-Json

Invoke-RestMethod -Method Patch -Uri "$baseUrl/customers/$customerDocument" `
    -Headers $attendantHeaders -ContentType 'application/json' -Body $json
```

Para excluir um cliente sem veículos vinculados:

```powershell
Invoke-WebRequest -Method Delete -Uri "$baseUrl/customers/$customerDocument" `
    -Headers $attendantHeaders
```

Resultado esperado: `200` no PATCH e `204 No Content` no DELETE.

## 8. Criar e consultar um veículo

Use um ID explícito para facilitar os próximos comandos:

```powershell
$vehicleId = 'vehicle-manual-001'
$json = @{
    id = $vehicleId
    customerId = $customerDocument
    model = 'Civic'
    year = 2022
    brand = 'Honda'
    color = 'Preto'
    plate = 'ABC-1234'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$baseUrl/vehicles" `
    -Headers $attendantHeaders -ContentType 'application/json' -Body $json

Invoke-RestMethod -Method Get -Uri "$baseUrl/vehicles/ABC-1234" `
    -Headers $attendantHeaders
```

Resultado esperado: criação `201` e consulta `200`.

## 9. Editar e excluir um veículo

O ID e o cliente do veículo não são alterados no PATCH:

```powershell
$json = @{
    model = 'Civic Touring'
    year = 2023
    brand = 'Honda'
    color = 'Prata'
    plate = 'ABC-1234'
} | ConvertTo-Json

Invoke-RestMethod -Method Patch -Uri "$baseUrl/vehicles/$vehicleId" `
    -Headers $attendantHeaders -ContentType 'application/json' -Body $json

Invoke-WebRequest -Method Delete -Uri "$baseUrl/vehicles/$vehicleId" `
    -Headers $attendantHeaders
```

Resultado esperado: `200` no PATCH e `204 No Content` no DELETE.

## 10. Validar o conflito de exclusão de cliente

Crie novamente um cliente e um veículo vinculado a ele. Tente excluir o cliente antes do veículo:

```powershell
Invoke-WebRequest -Method Delete -Uri "$baseUrl/customers/$customerDocument" `
    -Headers $attendantHeaders
```

Resultado esperado: `409 Conflict` com:

```json
{
    "error": "CustomerHasVehiclesError",
    "message": "Cannot delete customer while vehicles are linked to it."
}
```

Depois exclua o veículo e, em seguida, o cliente. A exclusão do cliente deve retornar `204`.

## 11. Conferir o Swagger

Abra no navegador:

- `http://localhost:3000/docs`
- `http://localhost:3000/docs/json`

No grupo `Registry`, confirme as rotas de clientes e veículos, os exemplos de body/response e a autenticação exigida. As rotas protegidas devem ser chamadas com `Authorization: Bearer <token>`.

## 12. Encerrar o ambiente

Pare a API com `Ctrl+C`. Para parar os containers sem remover os dados:

```powershell
Set-Location infra/postgres
docker compose down
```

Para apagar também o volume local do banco, somente se os dados de teste puderem ser perdidos:

```powershell
docker compose down -v
```
