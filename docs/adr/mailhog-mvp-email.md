# ADR: MailHog como destino de e-mails transacionais no MVP

**Status:** Aceito
**Data:** 29/10/2026

## Contexto

O fluxo de aprovação de orçamento envia ao cliente um e-mail com links únicos de aprovar e recusar quando a Ordem de Serviço passa para "aguardando aprovação". O envio é feito por SMTP, atrás da porta `EmailSender`, com o adaptador `SmtpEmailSender` (Nodemailer).

O MVP será usado apenas em **demonstração**: não há clientes reais recebendo mensagens. O que se precisa é executar e mostrar o fluxo completo (envio do link, abertura da página de aprovação, decisão) e validá-lo em testes automatizados, sem depender de conta, credencial ou serviço externo.

## Alternativas consideradas

### 1. MailHog (servidor SMTP de captura)

**Prós**

- Zero custo e nenhuma conta ou credencial externa.
- Um único serviço no Docker Compose (SMTP na porta 1025, interface web na 8025).
- Já integrado: está no Compose do banco (`infra/postgres`), incluído pelo Compose completo da raiz, e é usado pelo teste de integração E2E.
- Fala SMTP padrão: a aplicação não conhece o MailHog, só `SMTP_HOST` e `SMTP_PORT`.
- Permite inspecionar na interface web o e-mail e o link de aprovação durante a demo.

**Contras**

- Não entrega nada ao destinatário real.
- Não valida entregabilidade (SPF, DKIM, reputação, bounce).
- Mensagens ficam em memória e se perdem ao reiniciar o container.

### 2. Outro servidor de captura (Mailpit, MailCatcher)

**Prós**

- Mesma proposta do MailHog: captura local, sem custo e sem conta externa.

**Contras**

- Sem ganho funcional que justifique trocar agora, já que o MailHog está integrado aos Composes e ao teste E2E.
- Migrar significaria alterar infraestrutura e testes sem benefício para a demo.

### 3. Provedor de e-mail real (SES, SendGrid, Mailgun, Resend)

**Prós**

- Entrega real, métricas de envio e tratamento de bounce.

**Contras**

- Exige conta, credenciais, domínio verificado e possível custo.
- Torna demo e testes dependentes de rede e de serviço externo.
- Desproporcional para um MVP sem destinatários reais.

### 4. Ethereal (caixa de teste online)

**Prós**

- Sem instalação local.

**Contras**

- Depende de rede e de serviço externo, o que enfraquece testes e demo.

## Decisão

Adotar o **MailHog como servidor SMTP do MVP**, provisionado em `infra/postgres/docker-compose.yml` e incluído pelo `docker-compose.yml` da raiz, onde a API aponta para ele com `SMTP_HOST=mailhog` e `SMTP_PORT=1025`.

A decisão vale para o **destino do SMTP**, não para o código de envio. A aplicação continua dependendo apenas da porta `EmailSender`, e o `SmtpEmailSender` é configurado por variáveis de ambiente:

- `SMTP_HOST`, `SMTP_PORT` e `SMTP_FROM` (obrigatórias; localmente `localhost`, `1025` e `oficina@localhost`).
- `SMTP_USER`, `SMTP_PASS` e `SMTP_SECURE=true` (opcionais, para um provedor SMTP real).
- `FRONTEND_URL`, base dos links de aprovação.

### Regras

1. Nenhum código de domínio ou de aplicação referencia o MailHog: ele é só um valor de `SMTP_HOST`/`SMTP_PORT`.
2. O MailHog é restrito a desenvolvimento, testes e demonstração.
3. A configuração recusa `FRONTEND_URL` em `http` fora de `localhost`, o que impede enviar links de aprovação sem criptografia em ambiente real.

## Consequências

**Positivas**

- Demo e testes sem conta, credencial ou custo.
- Ambiente completo sobe com um único `docker compose up`, já com o MailHog.
- O teste E2E valida o envio contra um SMTP real, não contra um mock.
- A troca para um provedor real é uma mudança de configuração, sem alterar o código.

**Negativas / riscos aceitos**

- Nenhum e-mail chega a um destinatário real; o link de aprovação é lido na interface web do MailHog.
- Não há validação de entregabilidade nem tratamento de bounce.
- As mensagens se perdem ao reiniciar o container, pois o Compose não define volume para o MailHog.

## Gatilhos para revisar esta decisão

- Primeiro uso com clientes reais.
- Necessidade de rastrear entrega, reenviar mensagens ou tratar bounce.
- Exigência de mensagens persistentes entre reinícios do ambiente de demo.

Nesses casos, avaliar um provedor SMTP/API (SES, SendGrid, Mailgun, Resend), mantendo a porta `EmailSender` e trocando apenas a configuração ou o adaptador.
