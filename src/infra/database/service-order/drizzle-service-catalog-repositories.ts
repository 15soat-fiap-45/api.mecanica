import { asc, eq } from 'drizzle-orm';
import { Service } from '../../../service-order/domain/catalog/service.js';
import type { ServiceId } from '../../../service-order/domain/catalog/service-id.js';
import type { ServiceRepository } from '../../../service-order/domain/catalog/service.repository.js';
import { ServiceType } from '../../../service-order/domain/catalog/service-type.js';
import type { ServiceTypeId } from '../../../service-order/domain/catalog/service-type-id.js';
import type { ServiceTypeRepository } from '../../../service-order/domain/catalog/service-type.repository.js';
import { ServiceTypeAlreadyExistsError } from '../../../service-order/application/use-cases/service-type-use-cases.js';
import { db } from '../connection.js';
import { isUniqueConstraintViolation } from '../registry/registry-persistence-errors.js';
import { servico, tipoServico } from '../schema.js';

const idOf = (id: { value: string } | string) =>
    typeof id === 'string' ? id : id.value;

function serviceTypeFromRow(row: typeof tipoServico.$inferSelect): ServiceType {
    return ServiceType.create({ id: row.id, name: row.nome });
}

function serviceFromRow(row: typeof servico.$inferSelect): Service {
    return Service.create({
        id: row.id,
        name: row.nome,
        description: row.descricao,
        priceCents: row.valor,
        serviceTypeId: row.tipoServicoId,
    });
}

function serviceToRow(service: Service): typeof servico.$inferInsert {
    return {
        id: service.id.value,
        nome: service.name,
        descricao: service.description,
        valor: service.priceCents,
        tipoServicoId: service.serviceTypeId.value,
    };
}

export class DrizzleServiceTypeRepository implements ServiceTypeRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(serviceType: ServiceType): Promise<void> {
        try {
            await this.database
                .insert(tipoServico)
                .values({ id: serviceType.id.value, nome: serviceType.name });
        } catch (error) {
            // Corrida entre dois cadastros com o mesmo nome.
            if (isUniqueConstraintViolation(error))
                throw new ServiceTypeAlreadyExistsError();
            throw error;
        }
    }

    async update(serviceType: ServiceType): Promise<void> {
        try {
            await this.database
                .update(tipoServico)
                .set({ nome: serviceType.name })
                .where(eq(tipoServico.id, serviceType.id.value));
        } catch (error) {
            if (isUniqueConstraintViolation(error))
                throw new ServiceTypeAlreadyExistsError();
            throw error;
        }
    }

    async delete(id: ServiceTypeId | string): Promise<void> {
        await this.database
            .delete(tipoServico)
            .where(eq(tipoServico.id, idOf(id)));
    }

    async findById(id: ServiceTypeId | string): Promise<ServiceType | null> {
        const [row] = await this.database
            .select()
            .from(tipoServico)
            .where(eq(tipoServico.id, idOf(id)))
            .limit(1);
        return row ? serviceTypeFromRow(row) : null;
    }

    async findByName(name: string): Promise<ServiceType | null> {
        const [row] = await this.database
            .select()
            .from(tipoServico)
            .where(eq(tipoServico.nome, name))
            .limit(1);
        return row ? serviceTypeFromRow(row) : null;
    }

    async findAll(): Promise<ServiceType[]> {
        const rows = await this.database
            .select()
            .from(tipoServico)
            .orderBy(asc(tipoServico.nome));
        return rows.map(serviceTypeFromRow);
    }
}

export class DrizzleServiceRepository implements ServiceRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(service: Service): Promise<void> {
        await this.database.insert(servico).values(serviceToRow(service));
    }

    async update(service: Service): Promise<void> {
        await this.database
            .update(servico)
            .set(serviceToRow(service))
            .where(eq(servico.id, service.id.value));
    }

    async delete(id: ServiceId | string): Promise<void> {
        await this.database.delete(servico).where(eq(servico.id, idOf(id)));
    }

    async findById(id: ServiceId | string): Promise<Service | null> {
        const [row] = await this.database
            .select()
            .from(servico)
            .where(eq(servico.id, idOf(id)))
            .limit(1);
        return row ? serviceFromRow(row) : null;
    }

    async findAll(
        filter: { serviceTypeId?: string | undefined } = {},
    ): Promise<Service[]> {
        const query = this.database.select().from(servico);
        const rows = await (
            filter.serviceTypeId
                ? query.where(eq(servico.tipoServicoId, filter.serviceTypeId))
                : query
        ).orderBy(asc(servico.nome));
        return rows.map(serviceFromRow);
    }

    async existsWithServiceType(
        serviceTypeId: ServiceTypeId | string,
    ): Promise<boolean> {
        const rows = await this.database
            .select({ id: servico.id })
            .from(servico)
            .where(eq(servico.tipoServicoId, idOf(serviceTypeId)))
            .limit(1);
        return rows.length > 0;
    }
}
