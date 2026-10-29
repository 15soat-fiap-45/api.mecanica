import type { FastifyInstance } from 'fastify';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { StockUseCases } from '../../../composition-root.js';

const registerPartBody = z
    .object({
        id: z.string().min(1).optional(),
        description: z.string().trim().min(1).max(200),
        partCode: z.string().trim().min(1).max(50),
        quantity: z.number().int().min(0).optional(),
        unitOfMeasure: z.enum([
            'UNIT',
            'PAIR',
            'SET',
            'LITER',
            'KILOGRAM',
            'METER',
        ]),
    })
    .meta({
        examples: [
            {
                description: 'Pastilha de freio dianteira',
                partCode: 'PAST-FREIO-01',
                quantity: 10,
                unitOfMeasure: 'UNIT',
            },
        ],
    });

const stockEntryBody = z
    .object({
        partCode: z.string().trim().min(1).max(50),
        quantity: z.number().int().positive(),
    })
    .meta({
        examples: [
            {
                partCode: 'PAST-FREIO-01',
                quantity: 5,
            },
        ],
    });

const reservationBody = z
    .object({
        serviceOrderId: z.string().min(1).max(100),
        partCode: z.string().trim().min(1).max(50),
        quantity: z.number().int().positive(),
    })
    .meta({
        examples: [
            {
                serviceOrderId: 'os-2026-0001',
                partCode: 'PAST-FREIO-01',
                quantity: 3,
            },
        ],
    });

const serviceOrderParams = z
    .object({
        serviceOrderId: z.string().min(1).max(100),
    })
    .meta({
        examples: [{ serviceOrderId: 'os-2026-0001' }],
    });

const partSupplyResponse = z
    .object({
        id: z.string(),
        description: z.string(),
        partCode: z.string(),
        quantity: z.number(),
        unitOfMeasure: z.string(),
    })
    .meta({
        examples: [
            {
                id: '07409d36-8a70-40a6-817c-264103d7e98c',
                description: 'Pastilha de freio dianteira',
                partCode: 'PAST-FREIO-01',
                quantity: 10,
                unitOfMeasure: 'UNIT',
            },
        ],
    });

const stockEntryResponse = z
    .object({
        id: z.string(),
        partCode: z.string(),
        quantity: z.number(),
    })
    .meta({
        examples: [
            {
                id: '07409d36-8a70-40a6-817c-264103d7e98c',
                partCode: 'PAST-FREIO-01',
                quantity: 15,
            },
        ],
    });

const reservationResponse = z
    .object({
        id: z.string(),
        partSupplyId: z.string(),
        partCode: z.string(),
        quantity: z.number(),
        status: z.string(),
        availableQuantity: z.number(),
    })
    .meta({
        examples: [
            {
                id: '5742ee03-dce8-4297-aa6f-b2c2091f8960',
                partSupplyId: '07409d36-8a70-40a6-817c-264103d7e98c',
                partCode: 'PAST-FREIO-01',
                quantity: 3,
                status: 'PENDING',
                availableQuantity: 7,
            },
        ],
    });

const cancellationResponse = z
    .object({
        serviceOrderId: z.string(),
        cancelledItems: z.array(
            z.object({
                reservationId: z.string(),
                partSupplyId: z.string(),
                quantity: z.number(),
                status: z.string(),
            }),
        ),
    })
    .meta({
        examples: [
            {
                serviceOrderId: 'os-2026-0001',
                cancelledItems: [
                    {
                        reservationId:
                            '5742ee03-dce8-4297-aa6f-b2c2091f8960',
                        partSupplyId:
                            '07409d36-8a70-40a6-817c-264103d7e98c',
                        quantity: 3,
                        status: 'CANCELLED',
                    },
                ],
            },
        ],
    });

const writeOffResponse = z
    .object({
        serviceOrderId: z.string(),
        writtenOffItems: z.array(
            z.object({
                reservationId: z.string(),
                partSupplyId: z.string(),
                quantity: z.number(),
                status: z.string(),
            }),
        ),
    })
    .meta({
        examples: [
            {
                serviceOrderId: 'os-2026-0001',
                writtenOffItems: [
                    {
                        reservationId:
                            '5742ee03-dce8-4297-aa6f-b2c2091f8960',
                        partSupplyId:
                            '07409d36-8a70-40a6-817c-264103d7e98c',
                        quantity: 3,
                        status: 'CONSUMED',
                    },
                ],
            },
        ],
    });

export function registerStockRoutes(
    app: FastifyInstance,
    useCases: StockUseCases,
): void {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        '/stock/parts',
        {
            schema: {
                tags: ['Stock'],
                summary: 'Register a part or supply',
                description:
                    'Creates a part/supply and its initial stock balance.',
                body: registerPartBody,
                response: { 201: partSupplyResponse },
            },
        },
        async (request, reply) => {
            const result = await useCases.registerPartSupply.execute(
                request.body,
            );
            return reply.code(201).send(result);
        },
    );

    typedApp.post(
        '/stock/entries',
        {
            schema: {
                tags: ['Stock'],
                summary: 'Register a stock entry',
                description: 'Adds quantity to an existing part/supply.',
                body: stockEntryBody,
                response: { 200: stockEntryResponse },
            },
        },
        async (request) =>
            useCases.registerStockEntry.execute(request.body),
    );

    typedApp.post(
        '/stock/reservations',
        {
            schema: {
                tags: ['Stock'],
                summary: 'Reserve a supply',
                description:
                    'Reserves available quantity for a service order.',
                body: reservationBody,
                response: { 201: reservationResponse },
            },
        },
        async (request, reply) => {
            const result = await useCases.reserveSupply.execute(request.body);
            return reply.code(201).send(result);
        },
    );

    typedApp.post(
        '/stock/reservations/:serviceOrderId/cancel',
        {
            schema: {
                tags: ['Stock'],
                summary: 'Cancel service order reservations',
                params: serviceOrderParams,
                response: { 200: cancellationResponse },
            },
        },
        async (request) =>
            useCases.cancelReservation.execute(request.params),
    );

    typedApp.post(
        '/stock/write-offs/:serviceOrderId',
        {
            schema: {
                tags: ['Stock'],
                summary: 'Write off reserved supplies',
                params: serviceOrderParams,
                response: { 200: writeOffResponse },
            },
        },
        async (request) => useCases.writeOffStock.execute(request.params),
    );
}
