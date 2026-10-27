import { randomUUID, createHash } from 'node:crypto';
import { expect, it } from 'vitest';

it.skipIf(!process.env.TEST_DATABASE_URL || !process.env.TEST_MAILHOG_URL)(
    'persists an approval token and delivers a one-use link through real PostgreSQL and SMTP',
    async () => {
        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        const [
            { buildApp },
            { db },
            { approvalRequests, budgets, serviceOrders },
            { DrizzleCustomerRepository },
            { DrizzleVehicleRepository },
            { DrizzleServiceOrderRepository },
            { DrizzleBudgetRepository },
            { DrizzleServiceCatalog },
            { DrizzleApprovalRequestRepository },
            { RegistryVehicleContactLookup },
            { TokenActorResolver },
            { registryCompositionRoot },
            { serviceOrderCompositionRoot },
            { InMemoryEventBus },
            { SmtpEmailSender },
            { eq, sql },
        ] = await Promise.all([
            import('../../../app.js'),
            import('../../../infra/database/connection.js'),
            import('../../../infra/database/schema.js'),
            import('../../../infra/database/registry/drizzle-customer-repository.js'),
            import('../../../infra/database/registry/drizzle-vehicle-repository.js'),
            import('../../../infra/database/service-order/drizzle-service-order-repository.js'),
            import('../../../infra/database/service-order/drizzle-budget-repository.js'),
            import('../../../infra/database/service-order/drizzle-service-catalog.js'),
            import('../../../infra/database/service-order/drizzle-approval-request-repository.js'),
            import('../../../infra/registry-vehicle-contact-lookup.js'),
            import('../../../infra/token-actor-resolver.js'),
            import('../../../registry/composition-root.js'),
            import('../../composition-root.js'),
            import('../../../shared/application/in-memory-event-bus.js'),
            import('../email/smtp-email-sender.js'),
            import('drizzle-orm'),
        ]);
        const failures: string[] = [];
        const bus = new InMemoryEventBus({
            error: (context) => failures.push(String(context.error)),
        });
        const customers = new DrizzleCustomerRepository();
        const vehicles = new DrizzleVehicleRepository();
        const registry = registryCompositionRoot(bus, {
            customerRepository: customers,
            vehicleRepository: vehicles,
        });
        const serviceOrder = serviceOrderCompositionRoot(bus, {
            serviceOrderRepository: new DrizzleServiceOrderRepository(),
            budgetRepository: new DrizzleBudgetRepository(),
            serviceCatalog: new DrizzleServiceCatalog(),
            approvalRequestRepository: new DrizzleApprovalRequestRepository(),
            vehicleContacts: new RegistryVehicleContactLookup(
                vehicles,
                customers,
            ),
            actorResolver: new TokenActorResolver({
                verify: async (token) =>
                    token === 'jwt-mecanico' ? 'mecanico@oficina.com' : null,
            }),
            emailSender: new SmtpEmailSender({
                host: '127.0.0.1',
                port: Number(process.env.TEST_SMTP_PORT),
                from: 'oficina@localhost',
            }),
            frontendUrl: 'http://localhost:3000',
            approvalTokenTtlMinutes: 15,
        });
        const app = buildApp({ serviceOrder });
        const email = `approval-${randomUUID()}@example.test`;
        const mailhog = process.env.TEST_MAILHOG_URL!;
        const delivered = async (count: number) => {
            for (let attempt = 0; attempt < 30; attempt++) {
                const response = await fetch(`${mailhog}/api/v2/messages`);
                expect(response.ok).toBe(true);
                const body = (await response.json()) as {
                    items: {
                        To: { Mailbox: string; Domain: string }[];
                        Content: { Body: string };
                    }[];
                };
                const messages = body.items.filter((item) =>
                    item.To.some(
                        (to) => `${to.Mailbox}@${to.Domain}` === email,
                    ),
                );
                if (messages.length >= count) return messages[0]!.Content.Body;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error('SMTP message did not reach MailHog');
        };
        const randomCpf = () => {
            const digits = Array.from(
                { length: 9 },
                (_, i) => Math.floor(Math.random() * 9) + (i === 0 ? 1 : 0),
            );
            for (const len of [9, 10]) {
                const sum = digits.reduce(
                    (acc, d, i) => acc + d * (len + 1 - i),
                    0,
                );
                const rest = (sum * 10) % 11;
                digits.push(rest === 10 ? 0 : rest);
            }
            return digits.join('');
        };
        const randomPlate = () => {
            const letters = () =>
                String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const digit = () => Math.floor(Math.random() * 10);
            return `${letters()}${letters()}${letters()}${digit()}${letters()}${digit()}${digit()}`;
        };
        try {
            const customer = await registry.registerCustomer.execute({
                cpfCnpj: process.env.TEST_CUSTOMER_CPF ?? randomCpf(),
                name: '<Ana>',
                email,
                tel: '11987654321',
            });
            const vehicle = await registry.registerVehicle.execute({
                customerId: customer.cpfCnpj,
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Preto',
                plate: process.env.TEST_VEHICLE_PLATE ?? randomPlate(),
            });
            const mechanicHeaders = { authorization: 'Bearer jwt-mecanico' };
            const created = await app.inject({
                method: 'POST',
                url: '/service-orders',
                headers: mechanicHeaders,
                payload: { description: 'Freios', vehicleId: vehicle.id },
            });
            expect(created.statusCode).toBe(201);
            const orderId = created.json().id as string;
            await expect(
                serviceOrder.serviceCatalog.create({
                    title: 'Inválido',
                    description: null,
                    valueCents: 100,
                    partIds: [999999999],
                }),
            ).rejects.toThrow();
            const firstPart = await db.execute<{ item_id: string }>(
                sql`INSERT INTO peca_insumo (nome, valor) VALUES ('Peça A', 100) RETURNING item_id`,
            );
            const secondPart = await db.execute<{ item_id: string }>(
                sql`INSERT INTO peca_insumo (nome, valor) VALUES ('Peça B', 200) RETURNING item_id`,
            );
            const partIds = [
                Number(firstPart.rows[0]!.item_id),
                Number(secondPart.rows[0]!.item_id),
            ];
            for (const [title, valueCents] of [
                ['Diagnóstico', 4000],
                ['Reparo', 8345],
            ] as const) {
                const service = await serviceOrder.serviceCatalog.create({
                    title,
                    description: null,
                    valueCents,
                    partIds: title === 'Reparo' ? partIds : [],
                });
                await serviceOrder.serviceCatalog.assign(orderId, service.id);
            }
            const assignedServices =
                await serviceOrder.serviceCatalog.forOrder(orderId);
            expect(assignedServices).toHaveLength(2);
            expect(assignedServices[1]?.partIds).toEqual(partIds);

            const awaiting = await app.inject({
                method: 'POST',
                url: `/service-orders/${orderId}/awaiting-approval`,
                headers: mechanicHeaders,
            });
            expect(awaiting.statusCode).toBe(200);
            const [quotedBudget] = await db
                .select()
                .from(budgets)
                .where(eq(budgets.serviceOrderId, orderId));
            expect(quotedBudget?.totalCents).toBe(12345);
            const budgetId = quotedBudget!.id;
            const firstMail = await delivered(1);
            const token = firstMail
                .replace(/=\r?\n/g, '')
                .match(/orcamento\/([A-Za-z0-9_-]{43})/)?.[1];
            expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
            const [persisted] = await db
                .select()
                .from(approvalRequests)
                .where(
                    eq(
                        approvalRequests.tokenHash,
                        createHash('sha256').update(token!).digest('hex'),
                    ),
                );
            expect(persisted?.tokenHash).toBe(
                createHash('sha256').update(token!).digest('hex'),
            );
            expect(JSON.stringify(persisted)).not.toContain(token);
            expect(persisted?.sentAt).not.toBeNull();

            await serviceOrder.resendBudgetApproval.execute({
                serviceOrderId: orderId,
                budgetId,
            });
            const secondMail = await delivered(2);
            const currentToken = secondMail
                .replace(/=\r?\n/g, '')
                .match(/orcamento\/([A-Za-z0-9_-]{43})/)?.[1];
            expect(currentToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
            expect(currentToken).not.toBe(token);
            const revoked = await app.inject({
                method: 'POST',
                url: '/budget-approvals/decide',
                payload: { token, decision: 'approved' },
            });
            expect(revoked.statusCode).toBe(400);

            const approved = await app.inject({
                method: 'POST',
                url: '/budget-approvals/decide',
                payload: { token: currentToken, decision: 'approved' },
            });
            expect(approved.statusCode).toBe(200);
            expect(approved.json()).toEqual({
                status: 'decided',
                decision: 'approved',
            });
            const [savedBudget] = await db
                .select()
                .from(budgets)
                .where(eq(budgets.id, budgetId));
            expect(savedBudget?.status).toBe('APPROVED');
            const [savedOrder] = await db
                .select()
                .from(serviceOrders)
                .where(eq(serviceOrders.id, orderId));
            expect(savedOrder?.status).toBe('APPROVED');
            const secondClick = await app.inject({
                method: 'POST',
                url: '/budget-approvals/decide',
                payload: { token: currentToken, decision: 'approved' },
            });
            expect(secondClick.json()).toEqual({
                status: 'already_decided',
                decision: 'approved',
            });
            const createQuotedOrder = async () => {
                const response = await app.inject({
                    method: 'POST',
                    url: '/service-orders',
                    headers: mechanicHeaders,
                    payload: { description: 'Reparo', vehicleId: vehicle.id },
                });
                expect(response.statusCode).toBe(201);
                const id = response.json().id as string;
                await serviceOrder.serviceCatalog.assign(
                    id,
                    assignedServices[0]!.id,
                );
                const waiting = await app.inject({
                    method: 'POST',
                    url: `/service-orders/${id}/awaiting-approval`,
                    headers: mechanicHeaders,
                });
                expect(waiting.statusCode).toBe(200);
                return id;
            };
            const rejectedOrderId = await createQuotedOrder();
            const rejectedMail = await delivered(3);
            const rejectedToken = rejectedMail
                .replace(/=\r?\n/g, '')
                .match(/orcamento\/([A-Za-z0-9_-]{43})/)?.[1];
            expect(
                (
                    await app.inject({
                        method: 'POST',
                        url: '/budget-approvals/decide',
                        payload: { token: rejectedToken, decision: 'rejected' },
                    })
                ).statusCode,
            ).toBe(200);
            const [rejectedOrder] = await db
                .select()
                .from(serviceOrders)
                .where(eq(serviceOrders.id, rejectedOrderId));
            expect(rejectedOrder?.status).toBe('REJECTED');

            const cancelledOrderId = await createQuotedOrder();
            await delivered(4);
            const cancelResponse = await app.inject({
                method: 'POST',
                url: `/service-orders/${cancelledOrderId}/cancel`,
                headers: mechanicHeaders,
            });
            expect(cancelResponse.statusCode).toBe(200);
            const [cancelledReq] = await db
                .select()
                .from(approvalRequests)
                .where(eq(approvalRequests.orderId, cancelledOrderId));
            expect(cancelledReq?.revokedAt).not.toBeNull();

            const past = new Date(Date.now() - 60_000);
            const createdAt = new Date(Date.now() - 120_000);
            for (let i = 0; i < 100; i++) {
                const cid = randomUUID();
                const bid = randomUUID();
                await db.insert(serviceOrders).values({
                    id: cid,
                    description: 'Cancelada em lote',
                    vehicleId: vehicle.id,
                    status: 'CANCELLED',
                    version: 2,
                });
                await db.insert(budgets).values({
                    id: bid,
                    serviceOrderId: cid,
                    totalCents: 1000,
                    status: 'PENDING',
                    version: 1,
                });
                await db.insert(approvalRequests).values({
                    id: randomUUID(),
                    orderId: cid,
                    budgetId: bid,
                    budgetVersion: '1',
                    tokenHash: createHash('sha256')
                        .update(`${cid}-${i}`)
                        .digest('hex'),
                    expiresAt: past,
                    createdAt,
                });
            }

            const expiredOrderId = await createQuotedOrder();
            const expiredMail = await delivered(5);
            const expiredToken = expiredMail
                .replace(/=\r?\n/g, '')
                .match(/orcamento\/([A-Za-z0-9_-]{43})/)?.[1];
            await db
                .update(approvalRequests)
                .set({
                    expiresAt: new Date(Date.now() - 1000),
                })
                .where(
                    eq(
                        approvalRequests.tokenHash,
                        createHash('sha256')
                            .update(expiredToken!)
                            .digest('hex'),
                    ),
                );
            expect(
                await new DrizzleApprovalRequestRepository().expirePending(
                    new Date(),
                ),
            ).toBe(1);
            const [expiredOrder] = await db
                .select()
                .from(serviceOrders)
                .where(eq(serviceOrders.id, expiredOrderId));
            expect(expiredOrder?.status).toBe('REJECTED');
            expect(
                (
                    await app.inject({
                        method: 'POST',
                        url: '/budget-approvals/decide',
                        payload: { token: expiredToken, decision: 'approved' },
                    })
                ).statusCode,
            ).toBe(400);

            for (const [path, expectedStatus] of [
                ['start', 'IN_PROGRESS'],
                ['finish', 'COMPLETED'],
                ['deliver', 'DELIVERED'],
            ]) {
                const response = await app.inject({
                    method: 'POST',
                    url: `/service-orders/${orderId}/${path}`,
                    headers: mechanicHeaders,
                });
                expect(response.statusCode).toBe(200);
                expect(response.json().status).toBe(expectedStatus);
            }
            expect(await delivered(6)).toContain('pronto para retirada');
            const historyResponse = await app.inject({
                method: 'GET',
                url: `/service-orders/${orderId}/history`,
                headers: mechanicHeaders,
            });
            expect(historyResponse.statusCode).toBe(200);
            expect(
                historyResponse
                    .json()
                    .history.map(
                        (entry: {
                            status: string;
                            valueCents: number | null;
                            changedBy: string | null;
                        }) => ({
                            status: entry.status,
                            valueCents: entry.valueCents,
                            changedBy: entry.changedBy,
                        }),
                    ),
            ).toEqual([
                {
                    status: 'PENDING',
                    valueCents: null,
                    changedBy: 'mecanico@oficina.com',
                },
                {
                    status: 'AWAITING_APPROVAL',
                    valueCents: 12345,
                    changedBy: 'mecanico@oficina.com',
                },
                { status: 'APPROVED', valueCents: 12345, changedBy: null },
                {
                    status: 'IN_PROGRESS',
                    valueCents: 12345,
                    changedBy: 'mecanico@oficina.com',
                },
                {
                    status: 'COMPLETED',
                    valueCents: 12345,
                    changedBy: 'mecanico@oficina.com',
                },
                {
                    status: 'DELIVERED',
                    valueCents: 12345,
                    changedBy: 'mecanico@oficina.com',
                },
            ]);
            for (const rejectedId of [rejectedOrderId, expiredOrderId]) {
                const rejectedHistory = await app.inject({
                    method: 'GET',
                    url: `/service-orders/${rejectedId}/history`,
                    headers: mechanicHeaders,
                });
                expect(rejectedHistory.statusCode).toBe(200);
                expect(
                    rejectedHistory
                        .json()
                        .history.map(
                            (entry: {
                                status: string;
                                valueCents: number | null;
                                changedBy: string | null;
                            }) => ({
                                status: entry.status,
                                valueCents: entry.valueCents,
                                changedBy: entry.changedBy,
                            }),
                        ),
                ).toEqual([
                    {
                        status: 'PENDING',
                        valueCents: null,
                        changedBy: 'mecanico@oficina.com',
                    },
                    {
                        status: 'AWAITING_APPROVAL',
                        valueCents: 4000,
                        changedBy: 'mecanico@oficina.com',
                    },
                    { status: 'REJECTED', valueCents: 4000, changedBy: null },
                ]);
            }
            expect(failures).toEqual([]);
        } finally {
            await app.close();
        }
    },
);
